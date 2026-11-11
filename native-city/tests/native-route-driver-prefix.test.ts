import test from 'node:test';import assert from 'node:assert/strict';
import {driveCarRoute} from '../../tests/car-route-driver.ts';
import {stepCar,type CarState} from '../src/driving.ts';
import type {V2} from '../src/city-types.ts';
test('search rejection prefix covers all driver look-ahead, independent of unread route suffix',()=>{
 const path:V2[]=[[0,0],[0,180],[180,180],[180,360],[360,360],[360,600],[600,600],[600,900]];
 for(const profile of [{},{cruiseSpeed:30,cornerSpeed:7,lookAhead:5,lookSpeed:.18},{cruiseSpeed:32,cornerSpeed:9,lookAhead:6,lookSpeed:.18}]){
  const replay=(points:V2[])=>{
   const state:CarState={x:0,z:0,yaw:0,speed:0,steer:0,distance:0},states:CarState[]=[];let plannedThrough=0;
   assert.throws(()=>driveCarRoute(points,state,(input,dt,trace)=>{stepCar(state,input,dt);states.push({...state});plannedThrough=trace.plannedThrough;if(states.length===600)throw Error('prefix-end');},profile),/prefix-end/);
   return {states,plannedThrough};
  };
  const original=replay(path);assert(original.plannedThrough<path.length-2);
  const changed=path.map((p,i)=>i<=original.plannedThrough?p:[p[0]+700,p[1]-300] as V2),other=replay(changed);
  assert.deepEqual(other.states,original.states,'changing only unread suffix must not repair a deterministic earlier failure');
 }
});
