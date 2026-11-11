import test from 'node:test';
import assert from 'node:assert/strict';
import {targetCameraPosition} from '../src/native-target-camera.ts';
const body={id:{},x:0,y:0,z:-5,yaw:0,width:2.25,length:5.4,height:2.5,kind:'car' as const};
test('camera accepts accessor-backed vectors and lifts above an obstructing van',()=>{
 class Eye{get x(){return 0;}get y(){return 2;}get z(){return -8;}}
 const e=targetCameraPosition(new Eye(),{x:0,y:1.2,z:0},body);
 assert(Object.values(e).every(Number.isFinite));assert(e.y>2);assert.equal(e.x,0);assert.equal(e.z,-8);
 const second=targetCameraPosition(e,{x:0,y:1.2,z:0},body);assert.deepEqual(second,e);
});
test('an unobstructed camera is unchanged',()=>{
 const e={x:8,y:3,z:0};assert.deepEqual(targetCameraPosition(e,{x:0,y:1.2,z:0},body),e);
});
