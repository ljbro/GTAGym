import test from 'node:test';
import assert from 'node:assert/strict';
import {createEbikeImpact,detectEbikeImpact,stepEbikeImpact} from '../src/ebike-impact.ts';
const bike={id:{},kind:'bike' as const,x:0,z:0,y:0,yaw:0,width:.7,length:1.9,height:1.8};
const car={width:2.1,length:4.9,height:1.45},before={x:0,z:-8,yaw:0,speed:16,groundY:0},after={...before,z:8};
test('vehicle sweep knocks moving and parked bikes down; rider is independently ejected',()=>{
 const hit=detectEbikeImpact(before,after,bike,car);assert(hit);
 const fallen=createEbikeImpact(bike,hit,true),parked=createEbikeImpact(bike,hit,false);
 assert(fallen.rider);assert.equal(parked.rider,null);
 for(let i=0;i<100;i++)stepEbikeImpact(fallen,.025,()=>0,()=>false);
 assert(Math.abs(fallen.roll)>1.3);assert(fallen.z>0);
 assert(Math.hypot(fallen.rider.x-fallen.x,fallen.rider.z-fallen.z)>.1);
 assert(Math.hypot(fallen.vx,fallen.vz)<.1);
});
test('different levels and non-contact near misses never knock bikes down',()=>{
 assert.equal(detectEbikeImpact(before,after,{...bike,y:8},car),null);
 assert.equal(detectEbikeImpact({...before,x:4},{...after,x:4},bike,car),null);
});
test('starting slowly against a bike can push it over instead of a speed-threshold deadlock',()=>{
 const a={x:0,z:-3.38,yaw:0,speed:0,groundY:0},b={...a,z:a.z+.0025,speed:.15};
 assert(detectEbikeImpact(a,b,bike,car));
});
test('fall/sliding pauses exactly and does not tunnel through a wall',()=>{
 const hit=detectEbikeImpact(before,after,bike,car)!;const fallen=createEbikeImpact(bike,hit,true),saved=structuredClone(fallen);
 stepEbikeImpact(fallen,0,()=>0,()=>false);assert.deepEqual(fallen,saved);
 for(let i=0;i<100;i++)stepEbikeImpact(fallen,.05,()=>0,(_x,z)=>z>1.5);
 assert(fallen.z<1.5);assert(fallen.rider!.z<1.5);
});
