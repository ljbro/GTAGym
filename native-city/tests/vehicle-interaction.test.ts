import test from 'node:test';import assert from 'node:assert/strict';
import {createVehicleInteraction,stepVehicleInteraction,sampleVehicleInteraction} from '../src/vehicle-interaction.ts';
import {attachNativeVehicleDoors,clipDoorPolygon} from '../src/native-vehicle-doors.ts';
import {NullEngine,Scene,MeshBuilder,TransformNode,Vector3,Matrix} from '@babylonjs/core';
import {prepareTrafficDoorTemplates} from '../src/traffic-door-templates.ts';
const car={x:0,y:0,z:0,yaw:0},door={...car,x:1.9},from={...door,z:-2};
test('traffic door templates are prepared once in closed body coordinates',()=>{
 const engine=new NullEngine(),scene=new Scene(engine);
 try{
  const body=MeshBuilder.CreateBox('paint',{width:2.1,height:1.5,depth:4.9},scene);body.bakeTransformIntoVertices(Matrix.Translation(0,.75,0));body.sideOrientation=0;
  const templates=prepareTrafficDoorTemplates([body],scene),doors=templates.filter(m=>m.metadata?.trafficDoor);
  assert.equal(doors.length,2);assert(body.isDisposed());
  for(const m of templates){
   assert.equal(m.parent,null);assert(!m.isEnabled());assert.equal(m.sideOrientation,0);
   const p=m.getVerticesData('position')!;
   for(let i=0;i<p.length;i+=3){assert(Math.abs(p[i])<=1.051);assert(p[i+1]>=-.001&&p[i+1]<=1.501);assert(Math.abs(p[i+2])<=2.451);}
  }
 }finally{scene.dispose();engine.dispose();}
});
test('entry always finishes at its deadline regardless of approach distance',()=>{
 for(let mm=1;mm<=2700;mm++){
  const v=createVehicleInteraction('enter',car,{...door,x:door.x+mm/1000},door);
  const deadline=v.approachSeconds+2.6;
  v.elapsed=deadline-.005;
  assert(!sampleVehicleInteraction(v).complete,'must not finish before the deadline');
  const p=stepVehicleInteraction(v,1/60);
  assert.equal(v.elapsed,deadline);
  assert(p.complete,`entry stuck at approach distance ${mm/1000}`);
  assert.equal(p.doorOpen,0);
  assert(stepVehicleInteraction(v,0).complete,'terminal state is stable while paused');
 }
});
test('approach/open/pass/close is simulation-driven and commits only after closing',()=>{
 const v=createVehicleInteraction('enter',car,from,door);
 assert.equal(sampleVehicleInteraction(v).phase,'approach');
 const frozen=structuredClone(v);stepVehicleInteraction(v,0);assert.deepEqual(v,frozen);
 v.elapsed=v.approachSeconds+.2;let p=sampleVehicleInteraction(v);assert.equal(p.phase,'opening');assert(p.visible&&p.doorOpen>0&&!p.complete);
 v.elapsed=v.approachSeconds+1.1;p=sampleVehicleInteraction(v);assert.equal(p.phase,'passing');assert.equal(p.doorOpen,1);assert(p.seated>0);
 v.elapsed=v.approachSeconds+2.3;p=sampleVehicleInteraction(v);assert.equal(p.phase,'closing');assert(!p.visible&&!p.complete);
 for(let i=0;i<30;i++)stepVehicleInteraction(v,1/60);p=sampleVehicleInteraction(v);assert(p.complete);assert.equal(p.doorOpen,0);
});
test('exiting starts hidden and finishes standing at the chosen safe door',()=>{
 const v=createVehicleInteraction('exit',car,from,door);assert(!sampleVehicleInteraction(v).visible);
 for(let i=0;i<170;i++)stepVehicleInteraction(v,1/60);const p=sampleVehicleInteraction(v);assert(p.complete&&p.visible);assert.equal(p.seated,0);assert.equal(p.pose.x,door.x);assert.equal(p.pose.z,door.z);
});
test('entry opens before shifting weight, steps one foot at a time, then faces forward inside',()=>{
 const v=createVehicleInteraction('enter',car,door,door);
 v.elapsed=.5;const opening=sampleVehicleInteraction(v);assert.equal(opening.seated,0);assert.equal(opening.pose.x,door.x);
 v.elapsed=1;const stepping=sampleVehicleInteraction(v);
 assert(stepping.frame.leftFoot.y>stepping.frame.rightFoot.y+.1);assert(stepping.frame.sink>0);assert(stepping.frame.lean>.3);
 assert(stepping.frame.leftFoot.x<stepping.frame.rightFoot.x,'outside foot stays planted while inside foot crosses sill');
 v.elapsed=2;const seated=sampleVehicleInteraction(v);assert.equal(seated.seated,1);assert(seated.visible);assert(Math.abs(seated.pose.yaw-car.yaw)<1e-8);
 assert(seated.frame.leftFoot.x<1&&seated.frame.rightFoot.x<1);
});
test('both sides and rotated cars have continuous finite contacts and mirrored entry',()=>{
 for(const yaw of [0,1.3,-2.5])for(const side of [-1,1]){
  const c={x:14,y:2,z:-8,yaw},d={...c,x:c.x+Math.cos(yaw)*side*1.9,z:c.z-Math.sin(yaw)*side*1.9};
  const v=createVehicleInteraction('enter',c,d,d);let previous=sampleVehicleInteraction(v);
  for(let i=1;i<=260;i++){
   v.elapsed=i/100;const p=sampleVehicleInteraction(v);
   for(const key of ['leftFoot','rightFoot','leftHand','rightHand'] as const){
    const a=p.frame[key],b=previous.frame[key];assert(Object.values(a).every(Number.isFinite));assert(Math.hypot(a.x-b.x,a.y-b.y,a.z-b.z)<.1);
   }
   assert(Math.hypot(p.pose.x-previous.pose.x,p.pose.z-previous.pose.z)<.05);previous=p;
  }
 }
});
test('polygon clipping keeps interpolated attributes on both sides of seam',()=>{
 const {inside,outside}=clipDoorPolygon([[-1,0,0,0],[1,0,0,1],[0,1,0,.5]],0,0,1);
 assert(inside.every(v=>v[0]>=0));assert(outside.every(v=>v[0]<=0));
 assert(inside.some(v=>v[0]===0&&v[1]===0&&v[3]===.5));
});
test('animated panels replace body surface without mutating shared ambient geometry',()=>{
 const engine=new NullEngine(),scene=new Scene(engine);
 try{
  const root=new TransformNode('car',scene),body=MeshBuilder.CreateBox('car_paint',{width:2.1,height:1.5,depth:4.9},scene);body.parent=root;body.position.y=.75;
  body.sideOrientation=0;
  const shared=body.clone('ambient')!,positions=Array.from(shared.getVerticesData('position')!);
  const doors=attachNativeVehicleDoors(root,[body],{width:2.1,height:1.65,seatZ:.3});
  assert(doors.available);assert(!body.isEnabled());assert(doors.meshes.length>=3);
  assert(doors.meshes.every(m=>m.sideOrientation===body.sideOrientation),'preserve glTF winding convention after splitting');
  assert.deepEqual(Array.from(shared.getVerticesData('position')!),positions);assert(shared.isEnabled());
  const panel=doors.meshes.find(m=>m.name.endsWith('-entry-2'))!,before=panel.computeWorldMatrix(true).clone();doors.update(1,1);
  const after=panel.computeWorldMatrix(true);assert(!after.equals(before));doors.update(1,0);assert(panel.computeWorldMatrix(true).equals(before));
  assert(Vector3.Distance(panel.getBoundingInfo().boundingBox.minimumWorld,panel.getBoundingInfo().boundingBox.maximumWorld)>0);
 }finally{scene.dispose();engine.dispose();}
});
