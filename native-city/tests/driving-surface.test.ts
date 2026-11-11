import test from 'node:test';import assert from 'node:assert/strict';
import {drivingSupportHeight,drivingSurfaceStepClear} from '../src/driving-surface.ts';
test('nearby bridge deck does not lift wheels on the lower shoreline',()=>{
 const floor=(x:number)=>x>=1?9:0;
 assert.equal(drivingSupportHeight(floor,0,0,1.5,0),0);
 assert.equal(drivingSupportHeight(floor,2,0,0,0),9);
 assert(!drivingSurfaceStepClear(floor,{x:0,z:0},{x:2,z:0}));
 assert(!drivingSurfaceStepClear(floor,{x:2,z:0},{x:0,z:0}));
});
test('continuous ramps, shallow banks, and ordinary kerbs remain driveable',()=>{
 for(const slope of [-.25,.15,.4]){const floor=(x:number)=>x*slope;
  assert.equal(drivingSupportHeight(floor,0,0,1.5,0),1.5*slope);
  assert(drivingSurfaceStepClear(floor,{x:0,z:0},{x:6,z:0}));
 }
 assert(drivingSurfaceStepClear(x=>x>1?.16:0,{x:0,z:0},{x:2,z:0}));
});
test('flat support never manufactures pitch and invalid heights cannot become physical steps',()=>{
 assert.equal(drivingSupportHeight(()=>0,0,0,1.5,0),0);
 assert(!drivingSurfaceStepClear(x=>x>.5?NaN:0,{x:0,z:0},{x:1,z:0}));
});
