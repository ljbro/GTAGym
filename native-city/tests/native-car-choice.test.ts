import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {RoadGraph} from '../src/navigation.ts';
import {CityCollision,stepCar,DEFAULT_CAR_PERFORMANCE} from '../src/driving.ts';
import {reviewedNativeRoadRoute} from '../src/native-road-quality.ts';
import {findCarChoiceParking,ECONOMY_PERFORMANCE,SPORTS_PERFORMANCE,CAR_CHOICE_SECONDS} from '../src/native-car-choice.ts';
import {driveCarRoute} from '../../tests/car-route-driver.ts';
const graph=new RoadGraph([],JSON.parse(fs.readFileSync(new URL('../../city/navigation.json',import.meta.url),'utf8')));
const collision=new CityCollision(JSON.parse(fs.readFileSync(new URL('../../city/city.json',import.meta.url),'utf8')));
const original=reviewedNativeRoadRoute(graph,'c01-n04',21)!;
const points=graph.route(original.points[0],original.points.at(-1)!);
const env={roadAt:(x:number,z:number)=>collision.nearest(x,z),blocked:(x:number,z:number)=>collision.blocked(x,z),walkClear:(x:number,z:number)=>!collision.blocked(x,z),heightAt:()=>0,routeLength:(x:number,z:number)=>{const p=graph.route([x,z],points.at(-1)!);return p.slice(1).reduce((sum,b,i)=>sum+Math.hypot(b[0]-p[i][0],b[1]-p[i][1]),0);}};
const layout=findCarChoiceParking(points,env);
test('episode seed swaps vehicle identities without moving the two parking bays',()=>{
 const swapped=findCarChoiceParking(points,env,1);assert.deepEqual(swapped.sports,layout.ordinary);assert.deepEqual(swapped.ordinary,layout.sports);assert.deepEqual(swapped.foot,layout.foot);
});
test('car choice starts on foot with two separate reachable parked cars',()=>{
 assert(Math.hypot(layout.sports.x-layout.ordinary.x,layout.sports.z-layout.ordinary.z)>=6.7);
 const dx=layout.sports.x-layout.ordinary.x,dz=layout.sports.z-layout.ordinary.z;
 assert(Math.abs(dx*Math.sin(layout.footYaw)+dz*Math.cos(layout.footYaw))<1e-8,'neither car is ahead');
 assert.equal(layout.sports.yaw,layout.ordinary.yaw);
 assert(Math.abs(Math.hypot(layout.sports.x-layout.foot[0],layout.sports.z-layout.foot[1])-Math.hypot(layout.ordinary.x-layout.foot[0],layout.ordinary.z-layout.foot[1]))<1e-8,'equal approach distance');
 for(const car of [layout.sports,layout.ordinary])assert(Math.hypot(car.x-layout.foot[0],car.z-layout.foot[1])>20);
 assert.deepEqual(SPORTS_PERFORMANCE,DEFAULT_CAR_PERFORMANCE);
});
test('ordinary-car straight-line lower bound, even after sprinting or stealing traffic, exceeds time limit',()=>{
 assert.equal(CAR_CHOICE_SECONDS,150);
 assert(layout.ordinaryLowerBound>CAR_CHOICE_SECONDS+.1);
 const goal=points.at(-1)!;
 assert((Math.hypot(goal[0]-layout.foot[0],goal[1]-layout.foot[1])-24)/4.2>CAR_CHOICE_SECONDS);
});
test('sports car can drive native road within budget including WALKING and entry, ordinary car cannot',()=>{
 const durations:number[]=[];
 for(const performance of [SPORTS_PERFORMANCE,ECONOMY_PERFORMANCE]){
  const pose=performance===SPORTS_PERFORMANCE?layout.sports:layout.ordinary,state={...pose,distance:0};
  const route=graph.route([state.x,state.z],points.at(-1)!);
  const result=driveCarRoute(route,state,(input,dt)=>{
   stepCar(state,input,dt,1,performance);
   for(const side of [-1.05,1.05])for(const front of [-2.45,2.45]){
    const x=state.x+Math.sin(state.yaw)*front+Math.cos(state.yaw)*side,z=state.z+Math.cos(state.yaw)*front-Math.sin(state.yaw)*side;
    assert(!collision.blocked(x,z),'car footprint must stay clear of buildings/water');
   }
  },{cruiseSpeed:40,finishRadius:24});
  assert(result.complete);durations.push(result.ticks*.025);
 }
 const walking=Math.hypot(layout.sports.x-layout.foot[0],layout.sports.z-layout.foot[1])/1.6;
 assert(durations[0]+walking+3<CAR_CHOICE_SECONDS-15);
 assert(durations[1]>CAR_CHOICE_SECONDS);
});
test('performance changes real acceleration and speed; default car physics unchanged',()=>{
 for(const profile of [SPORTS_PERFORMANCE,ECONOMY_PERFORMANCE]){
  const state={x:0,z:0,yaw:0,speed:0,steer:0,distance:0};
  for(let i=0;i<2400;i++)stepCar(state,{throttle:1,steer:0,handbrake:false},.025,1,profile);
  assert(state.speed<=profile.maxSpeed);assert(state.speed>profile.maxSpeed-.01);
 }
});
