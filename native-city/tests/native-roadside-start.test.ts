import test from 'node:test';import assert from 'node:assert/strict';
import {findRoadsideStart,roadsideDeadline,roadsideLayoutSeed,ROADSIDE_START_TASKS,remainingTimeText} from '../src/native-roadside-start.ts';
import {nativeArrival} from '../src/native-task-arrival.ts';
import type {Road,V2} from '../src/city-types.ts';
const road={width:6} as Road;
const env={roadAt:(x:number,z:number)=>({x:0,z,road}),heightAt:()=>0,blocked:()=>false,walkClear:()=>true};
const points:V2[]=[[0,0],[0,1200]];
test('production parking is task-specific and independent of evaluation/session RNG',()=>{
 for(const id of ROADSIDE_START_TASKS){
  const baseline=findRoadsideStart(points,id,roadsideLayoutSeed(id),env);
  for(let session=0;session<10;session++){
   Math.random();assert.deepEqual(findRoadsideStart(points,id,roadsideLayoutSeed(id.toUpperCase()),env),baseline);
  }
 }
 assert.equal(new Set([...ROADSIDE_START_TASKS].map(roadsideLayoutSeed)).size,4);
});
test('only the four requested tasks change',()=>assert.deepEqual([...ROADSIDE_START_TASKS],['c01-n05','c01-n06','c01-n17','c01-n18']));
test('seeded cars distributed along route, none beside player, and geometry fits',()=>{
 const a=findRoadsideStart(points,'c01-n17',42,env);
 assert.equal(a.vehicles.length,5);assert(a.foot[0]>3);
 for(const v of a.vehicles){assert(Math.hypot(v.x-a.foot[0],v.z-a.foot[1])>=50);assert(Math.abs(v.x)+1.1<3);assert(v.group>=0&&v.group<3);}
 assert(a.vehicles[0].distance<=135);
 assert.deepEqual(findRoadsideStart(points,'c01-n17',42,env),a);
 assert.notDeepEqual(findRoadsideStart(points,'c01-n17',43,env).vehicles,a.vehicles);
});
test('blocked shoulder uses other side; invalid placement rejects instead of clipping',()=>{
 assert(findRoadsideStart(points,'c01-n17',42,{...env,walkClear:x=>x<0}).foot[0]<0);
 assert.throws(()=>findRoadsideStart(points,'c01-n17',42,{...env,walkClear:()=>false}),/No walkable/);
 assert.throws(()=>findRoadsideStart(points,'c01-n17',42,{...env,blocked:()=>true}),/Insufficient/);
});
test('requested three and five minute limits',()=>{
 for(const id of ROADSIDE_START_TASKS)assert.equal(roadsideDeadline(id),id==='c01-n06'?300:180);
});
test('walking to the goal never satisfies driving arrival',()=>{
 const input={position:[0,0] as V2,previous:[0,1] as V2,goal:[0,0] as V2,radius:24,mode:'drive' as const,walking:true,grounded:true,heightValid:true,discontinuity:false};
 assert.equal(nativeArrival(input),false);assert.equal(nativeArrival({...input,walking:false}),true);
});
test('timer clamps at zero and rounds up remaining game seconds',()=>{
 assert.equal(remainingTimeText(180,0),'03:00');assert.equal(remainingTimeText(300,0),'05:00');assert.equal(remainingTimeText(180,179.9),'00:01');assert.equal(remainingTimeText(180,181),'00:00');
});
