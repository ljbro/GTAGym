import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {RoadGraph} from '../src/navigation.ts';
import {CityCollision,stepCar} from '../src/driving.ts';
import {nativeBends} from '../src/native-annotation-route.ts';
import {reviewedNativeRoadRoute} from '../src/native-road-quality.ts';
import routes from '../src/native-road-quality-overrides.json' with {type:'json'};
import {driveCarRoute} from '../../tests/car-route-driver.ts';
import {findRoadsideStart} from '../src/native-roadside-start.ts';
import {RUN_SPEED} from '../src/city-walk.ts';
const graph=new RoadGraph([],JSON.parse(fs.readFileSync(new URL('../../city/navigation.json',import.meta.url),'utf8')));
const collision=new CityCollision(JSON.parse(fs.readFileSync(new URL('../../city/city.json',import.meta.url),'utf8')));
test('c01-n17 random roadside layouts stay reachable and even a straight sprint exceeds deadline',()=>{
 const path=reviewedNativeRoadRoute(graph,'c01-n17',3)!,goal=path.points.at(-1)!;
 for(let seed=0;seed<100;seed++){
  const layout=findRoadsideStart(path.points,'c01-n17',seed,{roadAt:(x,z)=>collision.nearest(x,z),blocked:(x,z)=>collision.blocked(x,z),walkClear:(x,z)=>!collision.blocked(x,z),heightAt:()=>0});
  assert(layout.vehicles.length>=3);
  assert((Math.hypot(goal[0]-layout.foot[0],goal[1]-layout.foot[1])-24)/RUN_SPEED>layout.maxDuration);
 }
});
for(const spec of routes){
 test(spec.id+' reviewed count-only route is connected, grounded, loop-free, and has no early arrival',()=>{
  const path=reviewedNativeRoadRoute(graph,spec.id,spec.expectedTurnCount)!;
  assert.equal(nativeBends(path.points).turns.length,spec.expectedTurnCount);
  assert.equal(path.turnDirections.length,spec.expectedTurnCount);assert(path.length>=1000);
  const goal=path.points.at(-1)!,used=new Set<string>();let along=0;
  for(let i=1;i<path.points.length;i++){
   const a=path.points[i-1],b=path.points[i],d=Math.hypot(b[0]-a[0],b[1]-a[1]),key=[a.join(','),b.join(',')].sort().join('|');
   assert(!used.has(key),'no repeated edge');used.add(key);
   for(let k=0,n=Math.max(1,Math.ceil(d/2));k<=n;k++){
    const x=a[0]+(b[0]-a[0])*k/n,z=a[1]+(b[1]-a[1])*k/n,road=collision.nearest(x,z);
    assert(!collision.blocked(x,z),'no static building collision');assert(road&&road.d<road.road.width/2,'continuous native road');
    if(along+d*k/n<path.length-100)assert(Math.hypot(x-goal[0],z-goal[1])>75,'goal separated from earlier corridor');
   }
   along+=d;
  }
  if(spec.id==='c01-n11')assert.deepEqual(goal,spec.originalGoal,'coast endpoint retained');
 });
 test(spec.id+' continuous steering can drive the reviewed route',()=>{
  const {points}=reviewedNativeRoadRoute(graph,spec.id,spec.expectedTurnCount)!;
  const [a,b]=points,state={x:a[0],z:a[1],yaw:Math.atan2(b[0]-a[0],b[1]-a[1]),speed:0,steer:0,distance:0};
  const result=driveCarRoute(points,state,(input,dt)=>{
   stepCar(state,input,dt);
   for(const side of [-1,1])for(const front of [-2,2]){
    const x=state.x+Math.sin(state.yaw)*front+Math.cos(state.yaw)*side,z=state.z+Math.cos(state.yaw)*front-Math.sin(state.yaw)*side;
    assert(!collision.blocked(x,z),'vehicle footprint collided with a building');
   }
  });
  assert(result.complete,'must reach goal without snapping position or yaw');assert(result.maxOffset<16);
 });
}
test('reviewed route rejects a changed reference count and unknown routes fall through',()=>{
 assert.equal(reviewedNativeRoadRoute(graph,'unknown',0),null);
 assert.throws(()=>reviewedNativeRoadRoute(graph,'c01-n05',5),/count changed/);
});
