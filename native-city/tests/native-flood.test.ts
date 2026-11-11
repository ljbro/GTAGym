import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import {createHash} from 'node:crypto';
import {floodLayout} from '../src/native-flood-layout.ts';import {annotationTurns,nativeBends} from '../src/native-annotation-route.ts';
import {CityCollision,stepCar,manualSteeringInput} from '../src/driving.ts';import {nativeDriveFootprintClear} from '../src/native-drive-vehicle-spec.ts';
import {NavigationPolicePursuit} from '../src/offmap-navigation-police.ts';import {driveCarRoute} from '../../tests/car-route-driver.ts';
const read=(p:string)=>fs.readFileSync(new URL('../../'+p,import.meta.url),'utf8'),[route]=JSON.parse(read('native-city/src/native-flood-escape-routes.json')),layout=floodLayout(route);
test('constructed floor is scoped to the closed channel; banks remain solid',()=>{
 for(let d=0;d<route.path.length;d++){const p=layout.pointAt(d);assert.equal(layout.floorAt(p.x,p.z),.18);assert(!layout.blocked(p.x,p.z));}
 const a=route.path.points[0],b=route.path.points[1],dx=b[0]-a[0],dz=b[1]-a[1],length=Math.hypot(dx,dz),x=a[0]+dx*.5,z=a[1]+dz*.5;
 assert(layout.blocked(x+dz/length*18,z-dx/length*18));assert.equal(layout.floorAt(x+dz/length*18,z-dx/length*18),null);assert.equal(layout.floorAt(0,0),null);
});
test('truck escapes using keyboard-limited steering and full body sweep; staying still is capturable',()=>{
 const city=new CityCollision(JSON.parse(read('city/city.json'))),points=route.path.points,[a,b]=points,yaw=Math.atan2(b[0]-a[0],b[1]-a[1]),blocked=(x:number,z:number)=>layout.blocked(x,z)||(layout.floorAt(x,z)===null&&city.blocked(x,z));
 const make=()=>new NavigationPolicePursuit({player:{spawn:{position:[a[0],.18,-a[1]],yaw:-yaw}},navigation:{path:points.map((p:number[])=>[p[0],.18,-p[1]]),mode:'drive',category:'escape',indoors:false}} as any,20);
 const state={x:a[0],z:a[1],yaw,speed:0,steer:0,distance:0},pursuit=make(),tick=(p:NavigationPolicePursuit,s:typeof state,dt:number)=>{p.step(dt,{x:s.x,y:.18,z:-s.z},-s.yaw,s.speed,q=>blocked(q.x,-q.z),()=>.18);if(!p.units.length)p.ensureMinimum(2);};
 const result=driveCarRoute(points,state,(input,dt)=>{const old={...state},limit=manualSteeringInput(1,state.speed);stepCar(state,{...input,steer:Math.max(-limit,Math.min(limit,input.steer))},dt);const n=Math.ceil(Math.hypot(state.x-old.x,state.z-old.z)/.3);for(let i=0;i<=n;i++){const t=n?i/n:0;assert(nativeDriveFootprintClear(old.x+(state.x-old.x)*t,old.z+(state.z-old.z)*t,old.yaw+(state.yaw-old.yaw)*t,'box-truck',blocked));}tick(pursuit,state,dt);assert(!pursuit.capturedBy);},route.path.testDriveProfile);
 assert(result.complete);assert(result.maxOffset<5);assert(pursuit.spawned>=2);const stationary=make();for(let i=0;i<1200&&!stationary.capturedBy;i++)tick(stationary,{...state,x:a[0],z:a[1],yaw,speed:0},.05);assert(stationary.capturedBy);
});
