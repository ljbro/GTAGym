import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {CityCollision,stepCar} from '../src/driving.ts';
import {NativeNpcObjective,npcRules,routePose} from '../src/native-npc-objective.ts';
import {NATIVE_TARGET_VEHICLES,NATIVE_DRIVE_ASSIGNMENTS,nativeDriveFootprintClear} from '../src/native-drive-vehicle-spec.ts';
import {driveCarRoute} from '../../tests/car-route-driver.ts';
import type {V2} from '../src/city-types.ts';
const root=new URL('../../',import.meta.url),read=(p:string)=>JSON.parse(fs.readFileSync(new URL(p,root),'utf8'));
const routes=[...read('native-city/src/native-van-chase-routes.json'),...read('native-city/src/native-pickup-chase-routes.json'),...read('native-city/src/native-coastal-chase-routes.json')],collision=new CityCollision(read('city/city.json'));
for(const route of routes){
 test(`${route.id}: moving target vehicle fits every road segment and both corner headings`,()=>{
  const target=NATIVE_TARGET_VEHICLES[route.id];assert.equal(target,route.id==='c04-n13'?'baller':route.id==='c04-n08'?'convertible':'van');
  const points=route.path.points as V2[];
  for(let i=1;i<points.length;i++){
   const a=points[i-1],b=points[i],length=Math.hypot(b[0]-a[0],b[1]-a[1]),yaw=Math.atan2(b[0]-a[0],b[1]-a[1]);
   for(let k=0,n=Math.ceil(length);k<=n;k++)assert(nativeDriveFootprintClear(a[0]+(b[0]-a[0])*k/n,a[1]+(b[1]-a[1])*k/n,yaw,target,(x,z)=>collision.blocked(x,z)),`segment ${i} sample ${k}`);
  }
 });
 test(`${route.id}: endpoint alone cannot win; wrong mode cannot catch; stationary player loses`,()=>{
  const points=route.path.points as V2[],npc=new NativeNpcObjective(points,npcRules('chase','drive')),goal=points.at(-1)!;
  assert.equal(npc.step(.025,goal,goal,true),null,'static goal is not the chase objective');
  const near=npc.pose.point;assert.equal(npc.step(.025,near,near,false),null,'walking is invalid in a driving chase');
  let outcome:null|'success'|'failure'=null,previous=npc.pose.point;
  for(let i=0;i<Math.ceil(npc.length/(npc.rules.speed*.025))+2&&!outcome;i++){
   outcome=npc.step(.025,points[0],points[0],true);
   assert(Math.hypot(npc.pose.point[0]-previous[0],npc.pose.point[1]-previous[1])<=npc.rules.speed*.025+1e-6);previous=npc.pose.point;
  }
  assert.equal(outcome,'failure');assert(npc.arrived);
 });
}
