import test from 'node:test';
import assert from 'node:assert/strict';
import {NullEngine,Scene,TransformNode,Quaternion,Vector3} from '@babylonjs/core';
import {createGroundPosture} from '../src/native-ground-posture.ts';

for(const mirrored of [false,true])for(const yaw of [0,1.4])test(`pitch correction preserves contacts and restores animation; mirror=${mirrored}, yaw=${yaw}`,()=>{
 const engine=new NullEngine(),scene=new Scene(engine),anchor=new TransformNode('anchor',scene);
 anchor.rotation.y=yaw;anchor.scaling.setAll(.92);
 const rig=new TransformNode('rig',scene);rig.parent=anchor;rig.scaling.x=mirrored?-1:1;
 const neck=new TransformNode('neck_01',scene),head=new TransformNode('head',scene),foot=new TransformNode('foot_l',scene);
 neck.parent=rig;neck.position.y=1.5;head.parent=neck;head.position.y=.12;foot.parent=rig;foot.position.x=.1;
 const pose=createGroundPosture(scene,anchor,[neck,head,foot]);assert(pose.stats().ready);pose.setEnabled(true);pose.setGait(0,1);
 neck.rotationQuaternion=Quaternion.RotationAxis(Vector3.Right(),20*Math.PI/180);
 head.rotationQuaternion=Quaternion.RotationAxis(Vector3.Right(),10*Math.PI/180);
 const original=[neck.rotationQuaternion.clone(),head.rotationQuaternion.clone()];
 const footBefore=foot.computeWorldMatrix(true).getTranslation().clone(),neckBefore=neck.computeWorldMatrix(true).getTranslation().clone();
 for(let i=0;i<80;i++){
  scene.onAfterAnimationsObservable.notifyObservers(scene);
  const s=pose.stats().sample!;assert(Math.abs(s.before-30*Math.PI/180)<1e-6);assert(s.after>0&&s.after<11*Math.PI/180);assert(s.correction<=24*Math.PI/180);
  assert(foot.computeWorldMatrix(true).getTranslation().equalsWithEpsilon(footBefore));assert(neck.computeWorldMatrix(true).getTranslation().equalsWithEpsilon(neckBefore));
  scene.onBeforeAnimationsObservable.notifyObservers(scene);assert(neck.rotationQuaternion!.equalsWithEpsilon(original[0]));assert(head.rotationQuaternion!.equalsWithEpsilon(original[1]));
 }
 scene.onAfterAnimationsObservable.notifyObservers(scene);pose.setEnabled(false);assert(neck.rotationQuaternion!.equalsWithEpsilon(original[0]));assert(head.rotationQuaternion!.equalsWithEpsilon(original[1]));
 scene.onAfterAnimationsObservable.notifyObservers(scene);assert.equal(pose.stats().sample,null);
 pose.setEnabled(true);pose.setGait(0,0);scene.onAfterAnimationsObservable.notifyObservers(scene);assert(neck.rotationQuaternion!.equalsWithEpsilon(original[0]));assert.equal(pose.stats().sample,null);
 pose.dispose();pose.dispose();scene.dispose();engine.dispose();
});
test('missing head rig leaves other avatars unchanged',()=>{
 const engine=new NullEngine(),scene=new Scene(engine),anchor=new TransformNode('anchor',scene);
 const pose=createGroundPosture(scene,anchor,[]);pose.setEnabled(true);pose.setGait(1,0);scene.onAfterAnimationsObservable.notifyObservers(scene);
 assert.equal(pose.stats().ready,false);assert.equal(pose.stats().sample,null);pose.dispose();scene.dispose();engine.dispose();
});
