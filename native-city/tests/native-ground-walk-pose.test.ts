import test from 'node:test';
import assert from 'node:assert/strict';
import {NullEngine,Scene,TransformNode,Vector3,Matrix} from '@babylonjs/core';
import {createGroundWalkPose,RELAXED_WALK,relaxedArmAngles} from '../src/native-ground-walk-pose.ts';

for(const mirrored of [false,true])for(const yaw of [0,1.4])test(`relaxed walk is local to gait and preserves feet; mirror=${mirrored}, yaw=${yaw}`,()=>{
 const engine=new NullEngine(),scene=new Scene(engine),anchor=new TransformNode('anchor',scene);
 anchor.rotation.y=yaw;anchor.scaling.setAll(.92);
 const rig=new TransformNode('rig',scene);rig.parent=anchor;rig.scaling.x=mirrored?-1:1;
 const nodes:TransformNode[]=[];
 function node(name:string,parent:TransformNode,p:number[]){const n=new TransformNode(name,scene);n.parent=parent;n.position.copyFromFloats(...p as [number,number,number]);nodes.push(n);return n;}
 const pelvis=node('pelvis',rig,[0,1,0]),spine=node('spine_01',pelvis,[0,.1,0]),neck=node('neck_01',spine,[0,.45,.12]);
 const feet=[node('foot_l',pelvis,[-.1,-.95,.1]),node('foot_r',pelvis,[.1,-.95,-.1])];
 for(const s of ['l','r']){const sign=s==='l'?-1:1,upper=node('upperarm_'+s,spine,[sign*.2,.4,.08]);const lower=node('lowerarm_'+s,upper,[sign*.03,-.27,sign*.06]);node('hand_'+s,lower,[0,-.2,.1]);}
 const pose=createGroundWalkPose(scene,anchor,nodes);pose.setEnabled(true);pose.setGait(1);
 const originals=nodes.map(n=>({position:n.computeWorldMatrix(true).getTranslation().clone(),q:n.rotationQuaternion,euler:n.rotation.clone()}));
 const localDirection=(a:TransformNode,b:TransformNode)=>Vector3.TransformNormal(b.computeWorldMatrix(true).getTranslation().subtract(a.computeWorldMatrix(true).getTranslation()),Matrix.Invert(anchor.computeWorldMatrix(true))).normalize();
 const authored=Object.fromEntries(['l','r'].map(s=>{const d=localDirection(nodes.find(n=>n.name==='upperarm_'+s)!,nodes.find(n=>n.name==='lowerarm_'+s)!);return [s,Math.atan2(d.z,-d.y)];}));
 for(let i=0;i<80;i++){
  scene.onAfterAnimationsObservable.notifyObservers(scene);
  const stats=pose.stats(),s=stats.sample!;assert(stats.ready);assert(s.before>s.after);assert(Math.abs(s.after-(s.before-(s.before-RELAXED_WALK.torsoPitch)*RELAXED_WALK.torsoCorrection))<1e-6);
  for(const s of ['l','r']){const a=nodes.find(n=>n.name==='upperarm_'+s)!,b=nodes.find(n=>n.name==='lowerarm_'+s)!,c=nodes.find(n=>n.name==='hand_'+s)!;const upper=localDirection(a,b),lower=localDirection(b,c),target=relaxedArmAngles(authored[s],0);assert(Math.abs(Math.atan2(upper.z,-upper.y)-target.upper)<1e-5);assert(Math.abs(Math.atan2(lower.z,-lower.y)-Math.atan2(upper.z,-upper.y)-target.flex)<1e-5);}
  for(const n of [pelvis,...feet])assert(n.computeWorldMatrix(true).getTranslation().equalsWithEpsilon(originals[nodes.indexOf(n)].position));
  scene.onBeforeAnimationsObservable.notifyObservers(scene);
  nodes.forEach((n,i)=>{assert.equal(n.rotationQuaternion,originals[i].q);assert(n.rotation.equalsWithEpsilon(originals[i].euler));assert(n.computeWorldMatrix(true).getTranslation().equalsWithEpsilon(originals[i].position));});
 }
 // Pure running changes only arms, not spine or foot contacts.
 pose.setGait(0,1);scene.onAfterAnimationsObservable.notifyObservers(scene);
 assert(Math.abs(pose.stats().sample!.before-pose.stats().sample!.after)<1e-6);
 for(const s of ['l','r']){const a=nodes.find(n=>n.name==='upperarm_'+s)!,b=nodes.find(n=>n.name==='lowerarm_'+s)!,c=nodes.find(n=>n.name==='hand_'+s)!;const upper=localDirection(a,b),lower=localDirection(b,c),target=relaxedArmAngles(authored[s],1);assert(Math.abs(Math.atan2(upper.z,-upper.y)-target.upper)<1e-5);assert(Math.abs(Math.atan2(lower.z,-lower.y)-Math.atan2(upper.z,-upper.y)-target.flex)<1e-5);}
 for(const n of [pelvis,...feet])assert(n.computeWorldMatrix(true).getTranslation().equalsWithEpsilon(originals[nodes.indexOf(n)].position));
 scene.onBeforeAnimationsObservable.notifyObservers(scene);
 // Partial walk/run blending is weaker; idle receives no gait correction.
 pose.setGait(.5);scene.onAfterAnimationsObservable.notifyObservers(scene);assert(pose.stats().sample!.after>RELAXED_WALK.torsoPitch);
 pose.setEnabled(false);nodes.forEach((n,i)=>assert(n.computeWorldMatrix(true).getTranslation().equalsWithEpsilon(originals[i].position)));
 pose.setEnabled(true);pose.setGait(0);scene.onAfterAnimationsObservable.notifyObservers(scene);assert.equal(pose.stats().sample,null);
 pose.dispose();pose.dispose();scene.dispose();engine.dispose();
});
test('elbow opens on backswing and walk/run targets blend continuously',()=>{
 for(const run of [0,.25,.5,.75,1]){
  const back=relaxedArmAngles(-.48,run),front=relaxedArmAngles(.48,run);assert(front.flex>back.flex);assert(front.upper>back.upper);
  for(let swing=-.5;swing<.5;swing+=.01){const a=relaxedArmAngles(swing,run),b=relaxedArmAngles(swing+.01,run);assert(Math.abs(a.flex-b.flex)<.01);assert(Math.abs(a.upper-b.upper)<.01);}
 }
});
test('unknown skeleton is left untouched',()=>{
 const engine=new NullEngine(),scene=new Scene(engine),anchor=new TransformNode('anchor',scene),pose=createGroundWalkPose(scene,anchor,[]);
 pose.setEnabled(true);pose.setGait(1);scene.onAfterAnimationsObservable.notifyObservers(scene);assert.equal(pose.stats().ready,false);assert.equal(pose.stats().sample,null);pose.dispose();scene.dispose();engine.dispose();
});
