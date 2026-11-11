import test from 'node:test';
import assert from 'node:assert/strict';
import {drivingView,nextDrivingView,nativeDrivingStartCamera} from '../src/native-driving-camera.ts';

test('optional legacy third-person guard rejects cockpit view when explicitly enabled',()=>{
 assert.equal(drivingView(1,true),0);
 assert.equal(drivingView(0,true),0);
 assert.equal(drivingView(2,true),2);
});
test('optional legacy camera guard retains near/far cycling',()=>{
 let view=0;const sequence=[];
 for(let i=0;i<6;i++){view=nextDrivingView(view,true);sequence.push(view);}
 assert.deepEqual(sequence,[2,0,2,0,2,0]);
 assert.equal(nextDrivingView(1,true),0);
});
test('native driving tasks and free exploration allow cockpit switching without the guard',()=>{
 assert.equal(drivingView(1,false),1);
 assert.deepEqual([0,3,2,1].map(v=>nextDrivingView(v,false)),[3,2,1,0]);
});
test('task spawn camera is behind the car and above final deck, at every heading',()=>{
 for(const yaw of [0,Math.PI/2,Math.PI,-2.17])for(const large of [false,true]){
  const p={x:-520,z:-920,yaw},shot=nativeDrivingStartCamera(p,12,large),dx=shot.eye[0]-p.x,dz=shot.eye[2]-p.z;
  assert(Math.abs(Math.hypot(dx,dz)-(large?21:8.6))<1e-8);
  assert(dx*Math.sin(yaw)+dz*Math.cos(yaw)<-8);
  assert(shot.eye[1]>=15.5);assert(shot.target[1]>12);
 }
});
