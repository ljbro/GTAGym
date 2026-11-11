import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {annotationTurns,nativeBends} from '../src/native-annotation-route.ts';
import {routeBarrier,nativeBarrierBlocked,nativeBarrierVehicleBlocked} from '../src/native-task-barrier.ts';
import {CityCollision,stepCar} from '../src/driving.ts';
import {driveCarRoute} from '../../tests/car-route-driver.ts';
import {NavigationPolicePursuit} from '../src/offmap-navigation-police.ts';
import {NATIVE_DRIVE_ASSIGNMENTS,nativeDriveFootprintClear} from '../src/native-drive-vehicle-spec.ts';
import type {V2} from '../src/city-types.ts';
const root=new URL('../../',import.meta.url),read=(path:string)=>JSON.parse(fs.readFileSync(new URL(path,root),'utf8'));
const routes=[...read('native-city/src/native-police-escape-routes.json'),...read('native-city/src/native-manual-routes.json'),...read('native-city/src/native-escape-routes.json'),...read('native-city/src/native-vehicle-escape-routes.json'),...read('native-city/src/native-convertible-escape-routes.json'),...read('native-city/src/native-van-chase-routes.json'),...read('native-city/src/native-pickup-chase-routes.json'),...read('native-city/src/native-motorcycle-routes.json'),...read('native-city/src/native-coastal-chase-routes.json')],graph=read('city/navigation.json'),city=read('city/city.json'),collision=new CityCollision(city);
for(const route of routes){
 if(route.category==='escape')test(`${route.id}: continuous car steering clears the city and evades actual pursuers`,()=>{
  const points=route.path.points as V2[],a=points[0],b=points[1],state={x:a[0],z:a[1],yaw:Math.atan2(b[0]-a[0],b[1]-a[1]),speed:0,steer:0,distance:0};
  const police=new NavigationPolicePursuit({player:{spawn:{position:[a[0],0,-a[1]],yaw:-state.yaw}},navigation:{path:points.map(p=>[p[0],0,-p[1]]),mode:'drive',category:'escape',indoors:false}} as any,20);
  const result=driveCarRoute(points,state,(input,dt)=>{
   stepCar(state,input,dt);
   assert(!collision.blocked(state.x+Math.sin(state.yaw)*1.45,state.z+Math.cos(state.yaw)*1.45),'car nose hit building/water');
   const kind=NATIVE_DRIVE_ASSIGNMENTS[route.id]?.kind;if(kind)assert(nativeDriveFootprintClear(state.x,state.z,state.yaw,kind,(x,z)=>collision.blocked(x,z)),'full task vehicle footprint collided');
   police.step(dt,{x:state.x,y:0,z:-state.z},-state.yaw,state.speed,p=>collision.blocked(p.x,-p.z),()=>0);
   if(!police.units.length)police.ensureMinimum(2);
   assert.equal(police.capturedBy,null,'route should be escapable with ordinary vehicle physics');
  },route.path.testDriveProfile);
  assert(result.complete);assert(result.maxStep<(route.path.testDriveProfile?.cruiseSpeed??26)*.025+.01);assert(result.maxOffset<16);assert.equal(result.visited.length,points.length-2);assert(police.spawned>=2);
 });
}
test('c01-n19 barrier precedes third drawn node and leaves a driveable bypass',()=>{
 const route=routes.find((r:any)=>r.id==='c01-n19'),b=routeBarrier(route.path.points,route.path.turns[1].distance-22);
 assert.equal(route.source.turns[1].sourceIndex,2);
 assert.equal(nativeBarrierBlocked([b],b.x,b.z),true);
 const right:V2=[Math.cos(b.yaw),-Math.sin(b.yaw)];
 // Barrier is 1.3 m left of centre; bypass is 1.7 m right of centre.
 const bypass:V2=[b.x+right[0]*3,b.z+right[1]*3];
 assert.equal(nativeBarrierBlocked([b],...bypass),false);assert.equal(collision.blocked(...bypass),false);
 assert.equal(nativeBarrierVehicleBlocked([b],...bypass,b.yaw),false);
 assert.equal(nativeBarrierVehicleBlocked([b],b.x-Math.sin(b.yaw)*2.8,b.z-Math.cos(b.yaw)*2.8,b.yaw),true);
 assert.equal(nativeBarrierVehicleBlocked([b],b.x-Math.sin(b.yaw)*3.2,b.z-Math.cos(b.yaw)*3.2,b.yaw),false);
 assert.equal(nativeBarrierBlocked([],b.x,b.z),false);
});
test('c01-n20 ends beside an existing residential footprint, not inside it',()=>{
 const route=routes.find((r:any)=>r.id==='c01-n20'),residential=route.path.residential;
 const building=city.buildings.find((b:any)=>b.id===residential.id);
 assert.equal(building.style,'residential');assert.deepEqual(building.rings,residential.rings);
 assert.ok(residential.distance>=5&&residential.distance<=24);
 assert.equal(collision.blocked(...route.path.points.at(-1) as V2),false);
 assert.deepEqual(route.expectedTurns,['right','right','right','left']);
});
