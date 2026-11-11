import test from 'node:test';
import assert from 'node:assert/strict';
import {NullEngine,Scene,TransformNode,Vector3,Matrix} from '@babylonjs/core';
import {createGroundIdlePose,RELAXED_IDLE} from '../src/native-ground-idle-pose.ts';
import {createGroundWalkPose} from '../src/native-ground-walk-pose.ts';

for(const mirror of [false,true])for(const yaw of [0,1.7])test(`idle arms restore and blend without accumulating; mirror=${mirror}, yaw=${yaw}`,()=>{
 const engine=new NullEngine(),scene=new Scene(engine),anchor=new TransformNode('anchor',scene);anchor.rotation.y=yaw;anchor.scaling.setAll(.92);
 const rig=new TransformNode('rig',scene);rig.parent=anchor;rig.scaling.x=mirror?-1:1;
 const nodes:TransformNode[]=[];
 function node(name:string,parent:TransformNode,p:number[]){const n=new TransformNode(name,scene);n.parent=parent;n.position.copyFromFloats(...p as [number,number,number]);nodes.push(n);return n;}
 const pelvis=node('pelvis',rig,[0,1,0]),spine=node('spine_01',pelvis,[0,.1,0]);node('neck_01',spine,[0,.45,.12]);
 node('foot_l',pelvis,[-.1,-.95,0]);node('foot_r',pelvis,[.1,-.95,0]);
 for(const s of ['l','r']){const sign=s==='l'?-1:1,u=node('upperarm_'+s,spine,[sign*.2,.4,.08]),l=node('lowerarm_'+s,u,[sign*.03,-.27,.05]);node('hand_'+s,l,[0,-.22,.12]);}
 const pose=createGroundIdlePose(scene,anchor,nodes),walk=createGroundWalkPose(scene,anchor,nodes);
 const original=nodes.map(n=>({p:n.computeWorldMatrix(true).getTranslation().clone(),q:n.rotationQuaternion,e:n.rotation.clone()}));
 const point=(n:TransformNode)=>n.computeWorldMatrix(true).getTranslation();
 const direction=(a:TransformNode,b:TransformNode)=>Vector3.TransformNormal(point(b).subtract(point(a)),Matrix.Invert(anchor.computeWorldMatrix(true))).normalize();
 pose.setEnabled(true);pose.setGait(0,0);
 for(let i=0;i<100;i++){
  scene.onAfterAnimationsObservable.notifyObservers(scene);
  for(const s of ['l','r']){const u=nodes.find(n=>n.name==='upperarm_'+s)!,l=nodes.find(n=>n.name==='lowerarm_'+s)!,h=nodes.find(n=>n.name==='hand_'+s)!;
   const upper=direction(u,l),lower=direction(l,h);
   assert(Math.abs(Math.atan2(upper.z,-upper.y)-RELAXED_IDLE.upperPitch)<1e-5);
   assert(Math.abs(Math.atan2(lower.z,-lower.y)-RELAXED_IDLE.lowerPitch)<1e-5);
   assert(Math.abs(lower.x)<1e-5);
  }
  scene.onBeforeAnimationsObservable.notifyObservers(scene);
  nodes.forEach((n,j)=>{assert.equal(n.rotationQuaternion,original[j].q);assert(n.rotation.equalsWithEpsilon(original[j].e));assert(point(n).equalsWithEpsilon(original[j].p));});
 }
 // Starting/stopping involves both overlays. Unwind in reverse order so the
 // second overlay cannot restore the first one's pose into the next frame.
 pose.setGait(.5,0);walk.setGait(.5);walk.setEnabled(true);
 let previous:Vector3[]=[];
 for(let i=0;i<100;i++){
  scene.onAfterAnimationsObservable.notifyObservers(scene);
  const current=nodes.map(point);if(i)current.forEach((p,j)=>assert(p.equalsWithEpsilon(previous[j],1e-6)));previous=current;
  scene.onBeforeAnimationsObservable.notifyObservers(scene);
  nodes.forEach((n,j)=>assert(point(n).equalsWithEpsilon(original[j].p)));
 }
 walk.setEnabled(false);pose.setGait(1,0);scene.onAfterAnimationsObservable.notifyObservers(scene);nodes.forEach((n,j)=>assert(point(n).equalsWithEpsilon(original[j].p)));
 pose.setGait(0,1);scene.onAfterAnimationsObservable.notifyObservers(scene);nodes.forEach((n,j)=>assert(point(n).equalsWithEpsilon(original[j].p)));
 pose.setGait(0,0);scene.onAfterAnimationsObservable.notifyObservers(scene);pose.setEnabled(false);nodes.forEach((n,j)=>assert(point(n).equalsWithEpsilon(original[j].p)));
 walk.dispose();pose.dispose();pose.dispose();scene.dispose();engine.dispose();
});
test('idle does not touch an unsupported rig',()=>{
 const engine=new NullEngine(),scene=new Scene(engine),anchor=new TransformNode('anchor',scene),pose=createGroundIdlePose(scene,anchor,[]);
 pose.setEnabled(true);scene.onAfterAnimationsObservable.notifyObservers(scene);assert.equal(pose.stats().ready,false);pose.dispose();scene.dispose();engine.dispose();
});
