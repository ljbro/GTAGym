import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {nativeRouteStartYaw} from '../src/native-start-heading.ts';
import {CLIMB_START,CLIMB_SITE} from '../src/native-climb-site.ts';
import {NATIVE_FLIGHT_LAUNCH,NATIVE_FLIGHT_TASK} from '../src/native-flight-sites.ts';

test('every travel direction overrides an opposite road-storage heading',()=>{
 for(let i=0;i<32;i++){
  const yaw=i*Math.PI/16,dx=Math.sin(yaw)*20,dz=Math.cos(yaw)*20;
  const actual=nativeRouteStartYaw([[100,-300],[100+dx,-300+dz],[50,40]],yaw+Math.PI);
  assert(Math.cos(actual-yaw)>.999999);
 }
});
test('ignore repeated spawn points, retain the first leg even if goal is behind',()=>{
 assert.equal(nativeRouteStartYaw([[0,0],[0,0],[.001,.001],[0,80],[0,-900]],Math.PI),0);
 assert.equal(nativeRouteStartYaw([[0,0],[-80,0],[100,0]],0),-Math.PI/2);
 assert.equal(nativeRouteStartYaw([],1.2),1.2);
 assert.equal(nativeRouteStartYaw([[0,0],[0,0]],-1),-1);
 assert.equal(nativeRouteStartYaw([[NaN,0]],NaN),0);
});
test('all stored route families have finite aligned spawn headings; water frames already agree',()=>{
 const root=new URL('../src/',import.meta.url);let checked=0,water=0;
 for(const name of fs.readdirSync(root).filter(n=>/^native-.*(?:routes|walks)\.json$/.test(n))){
  const data=JSON.parse(fs.readFileSync(new URL(name,root),'utf8'));
  if(!Array.isArray(data))continue;
  for(const item of data){
   const points=item.path?.points;if(!points?.length)continue;
   const a=points[0],b=points.find((p:number[])=>Math.hypot(p[0]-a[0],p[1]-a[1])>.01);if(!b)continue;
   const yaw=nativeRouteStartYaw(points,Math.PI),dx=b[0]-a[0],dz=b[1]-a[1];
   assert((Math.sin(yaw)*dx+Math.cos(yaw)*dz)/Math.hypot(dx,dz)>.999999,item.id);checked++;
   if(item.path.forward){const f=item.path.forward;assert(Math.cos(yaw-Math.atan2(f[0],f[1]))>.999999,item.id+' water frame');water++;}
  }
 }
 assert(checked>50);assert(water>10);
});
test('special starts still face the climb site and parked aircraft',()=>{
 // These flows intentionally bypass the road start; do not rotate a parked
 // aircraft sideways off its runway or face a walking passenger down a taxiway.
 assert.equal(CLIMB_START.yaw,0);assert(CLIMB_SITE.roofHeight>0);
 const p=NATIVE_FLIGHT_LAUNCH.arrival,q=NATIVE_FLIGHT_TASK.spawn;
 assert(Math.cos(NATIVE_FLIGHT_LAUNCH.yaw-nativeRouteStartYaw([p,[q.x,q.z]]))>.999999);
});
