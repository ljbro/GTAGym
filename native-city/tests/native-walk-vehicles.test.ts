import {test} from 'node:test';import assert from 'node:assert/strict';
import {WALK_VEHICLES,placeWalkVehicle,vehicleBlocks,pointOnWalk} from '../src/native-walk-vehicle-layout.ts';
test('title/annotation vehicle roles do not turn freight wagons into vans',()=>{
 assert.equal(WALK_VEHICLES['c02-n10'][0].model,'motorcycle-green');assert.equal(WALK_VEHICLES['c02-n12'][0].at,0);
 assert.equal(WALK_VEHICLES['c02-n11'][0].model,'van');assert(WALK_VEHICLES['c02-n04'][0].fallen);
 assert.equal(WALK_VEHICLES['c07-n01'][0].model,'pickup');assert.equal(WALK_VEHICLES['c02-n06'],undefined);
});
test('footprint avoids buildings and the complete walking corridor',()=>{
 const route:[number,number][]=[[0,0],[0,100]];
 const p=placeWalkVehicle(route,1,2,5,x=>x>0,()=>0);
 assert(p.x<0);assert(vehicleBlocks(p,p.x,p.z));assert(!vehicleBlocks(p,0,100));
 for(let z=0;z<=100;z+=.25)assert(!vehicleBlocks(p,0,z,.75));
 assert.throws(()=>placeWalkVehicle(route,1,2,5,()=>true,()=>0));
 assert.throws(()=>placeWalkVehicle(route,1,2,5,()=>false,(x,z)=>x+z));
});
test('start and end anchors follow route tangents',()=>{
 assert.deepEqual(pointOnWalk([[0,0],[0,10],[10,10]],0),{x:0,z:0,yaw:0});
 assert.deepEqual(pointOnWalk([[0,0],[0,10],[10,10]],1),{x:10,z:10,yaw:Math.PI/2});
});
test('a gently sloping driveway tilts the car instead of floating its wheels',()=>{
 const p=placeWalkVehicle([[0,0],[0,100]],1,2,5,()=>false,(x,z)=>.03*x+.04*z);
 assert(Math.abs(p.pitch!+Math.atan(.04))<1e-9);assert(Math.abs(p.roll!-Math.atan(.03))<1e-9);
 assert(Math.abs(p.y-(p.x*.03+p.z*.04+.015))<1e-9);
});
