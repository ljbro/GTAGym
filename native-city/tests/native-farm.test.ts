import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import {createHash} from 'node:crypto';
import {farmRoadGrid,farmPoint,farmBlocked,FARM_TERRAIN_GRID,FARM_ROAD_OFFSET} from '../src/native-farm-layout.ts';
import {annotationTurns,nativeBends} from '../src/native-annotation-route.ts';
import {CityCollision,stepCar,manualSteeringInput} from '../src/driving.ts';
import {NavigationPolicePursuit} from '../src/offmap-navigation-police.ts';
import {driveCarRoute} from '../../tests/car-route-driver.ts';
import {nativeDriveFootprintClear,NATIVE_DRIVE_ASSIGNMENTS} from '../src/native-drive-vehicle-spec.ts';
import type {V2} from '../src/city-types.ts';
import {VertexData} from '@babylonjs/core';
const read=(p:string)=>fs.readFileSync(new URL('../../'+p,import.meta.url),'utf8');
const [route]=JSON.parse(read('native-city/src/native-farm-escape-routes.json')),points=route.path.points as V2[],city=new CityCollision(JSON.parse(read('city/city.json')));
test('road is one connected shared grid draped at every vertex, not separate elevated slabs',()=>{
 const height=(x:number,z:number)=>Math.sin(x*.01)+Math.cos(z*.01),grid=farmRoadGrid(points,height);
 for(let i=0;i<grid.positions.length;i+=3)assert(Math.abs(grid.positions[i+1]-height(grid.positions[i],grid.positions[i+2])-FARM_ROAD_OFFSET)<1e-9);
 const seen=new Set<number>([0]),adj=new Map<number,Set<number>>();for(let i=0;i<grid.indices.length;i+=3)for(let j=0;j<3;j++){const a=grid.indices[i+j],b=grid.indices[i+(j+1)%3];if(!adj.has(a))adj.set(a,new Set());if(!adj.has(b))adj.set(b,new Set());adj.get(a)!.add(b);adj.get(b)!.add(a);}
 for(const a of seen)for(const b of adj.get(a)??[])seen.add(b);assert.equal(seen.size,grid.positions.length/3);
 assert(grid.indices.length>=(grid.rows-1)*grid.across*6);
 const normals:number[]=[];VertexData.ComputeNormals(grid.positions,grid.indices,normals);for(let i=1;i<normals.length;i+=3)assert(normals[i]>.99,'road top must face upward in Babylon, not be culled from the driving camera');
});
test('dirt road conforms between vertices to native terrain triangles, not just sampled points',()=>{
 const {x0,z0,step}=FARM_TERRAIN_GRID;
 for(const file of ['manifest.json','near-manifest.json']){const manifest=JSON.parse(read('city/mountain-relief/'+file));assert.equal(manifest.grid.x0,x0);assert.equal(manifest.grid.z0,z0);assert.equal(manifest.grid.step%step,0);assert(manifest.surfaceOffset<FARM_ROAD_OFFSET);}
 const at=(x:number,z:number)=>Math.sin(x*.7)*3+Math.cos(z*.9)*2;
 const height=(x:number,z:number)=>{const gx=(x-x0)/step,gz=(z-z0)/step,ix=Math.floor(gx),iz=Math.floor(gz),u=gx-ix,v=gz-iz,a=at(ix,iz),b=at(ix+1,iz),c=at(ix+1,iz+1),d=at(ix,iz+1);return u+v<=1?a+(b-a)*u+(d-a)*v:c+(d-c)*(1-u)+(b-c)*(1-v);};
 const g=farmRoadGrid(points,height);
 for(let i=0;i<g.indices.length;i+=3){const triangle=g.indices.slice(i,i+3).map(n=>g.positions.slice(n*3,n*3+3));for(const weights of [[1/3,1/3,1/3],[.1,.2,.7],[.6,.3,.1]]){const p=[0,1,2].map(axis=>triangle.reduce((n,v,k)=>n+v[axis]*weights[k],0));assert(Math.abs(p[1]-height(p[0],p[2])-FARM_ROAD_OFFSET)<1e-7,'road interior must stay precisely above native ground');}}
});
test('farm buildings are solid and outside the complete escape corridor',()=>{
 assert(farmBlocked(route,...farmPoint(route,0,0)));assert(farmBlocked(route,...farmPoint(route,9,4)));assert(farmBlocked(route,...farmPoint(route,-8.3,3)));
 for(let i=1;i<points.length;i++){const a=points[i-1],b=points[i],n=Math.ceil(Math.hypot(b[0]-a[0],b[1]-a[1]));for(let k=0;k<=n;k++){const x=a[0]+(b[0]-a[0])*k/n,z=a[1]+(b[1]-a[1])*k/n;assert(!farmBlocked(route,x,z));}}
});
test('ATV actually drives the SVG route and escapes, while stationary start is capturable',()=>{
 const [a,b]=points,yaw=Math.atan2(b[0]-a[0],b[1]-a[1]);
 const makePolice=()=>new NavigationPolicePursuit({player:{spawn:{position:[a[0],0,-a[1]],yaw:-yaw}},navigation:{path:points.map(p=>[p[0],0,-p[1]]),mode:'drive',category:'escape',indoors:false}} as any,20);
 const blocked=(x:number,z:number)=>city.blocked(x,z)||farmBlocked(route,x,z),state={x:a[0],z:a[1],yaw,speed:0,steer:0,distance:0},police=makePolice();
 const tick=(p:NavigationPolicePursuit,dt:number,s:typeof state)=>{p.step(dt,{x:s.x,y:0,z:-s.z},-s.yaw,s.speed,q=>blocked(q.x,-q.z),()=>0);if(!p.units.length)p.ensureMinimum(2);};
 const driven=driveCarRoute(points,state,(input,dt)=>{const before={...state},limit=manualSteeringInput(1,state.speed);stepCar(state,{...input,steer:Math.max(-limit,Math.min(limit,input.steer))},dt);const count=Math.ceil(Math.hypot(state.x-before.x,state.z-before.z)/.3);for(let k=1;k<=count;k++)assert(nativeDriveFootprintClear(before.x+(state.x-before.x)*k/count,before.z+(state.z-before.z)*k/count,before.yaw+(state.yaw-before.yaw)*k/count,'atv',blocked));tick(police,dt,state);assert.equal(police.capturedBy,null);},route.path.testDriveProfile);
 assert(driven.complete);assert(driven.maxOffset<7);assert(police.spawned>=2);
 const stationary=makePolice();for(let i=0;i<1200&&!stationary.capturedBy;i++)tick(stationary,.05,{...state,x:a[0],z:a[1],yaw,speed:0});assert(stationary.capturedBy);
});
