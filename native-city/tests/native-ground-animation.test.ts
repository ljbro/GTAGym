import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {NullEngine,Scene,TransformNode} from '@babylonjs/core';
import {sampleGroundRotation,usesPickupClimbAnimation,createGroundAnimationGroups,type GroundAnimationAsset} from '../src/native-ground-animation.ts';
import {walkTraversalPose,linkPosition,type WalkLink} from '../src/native-walk-traversal.ts';
const data=JSON.parse(fs.readFileSync(new URL('../../characters/animations/quaternius-ground-v1.json',import.meta.url),'utf8'));
test('CC0 ground clips target unchanged Franklin with closed locomotion loops',()=>{
 assert.equal(data.targetSha256,createHash('sha256').update(fs.readFileSync(new URL('../../characters/offmapbench/franklin.glb',import.meta.url))).digest('hex'));
 assert.deepEqual(Object.keys(data.clips),['Walk_Loop','Sprint_Loop','ClimbUp_1m']);assert.equal(data.bones.length,52);
 for(const [name,clip] of Object.entries(data.clips) as [string,GroundAnimationAsset['clips']['Walk_Loop']][]){
  assert.equal(clip.loop,name!=='ClimbUp_1m');assert.equal(clip.pelvisPositions.length,clip.frames.length);
  if(clip.loop){assert.deepEqual(clip.frames[0],clip.frames.at(-1));assert.deepEqual(clip.pelvisPositions[0],clip.pelvisPositions.at(-1));}
  for(const frame of clip.frames){assert.equal(frame.length,208);for(let i=0;i<208;i+=4)assert(Math.abs(Math.hypot(...frame.slice(i,i+4))-1)<1e-5);}
  for(const p of clip.pelvisPositions)assert(p.every(Number.isFinite));
  for(const bone of ['upperarm_l','upperarm_r','thigh_l','thigh_r']){
   const i=data.bones.indexOf(bone),a=sampleGroundRotation(clip,0,i),b=sampleGroundRotation(clip,.5,i);assert(Math.abs(a.asArray().reduce((sum,v,k)=>sum+v*b.asArray()[k],0))<.99999,`${name}/${bone} must animate`);
  }
 }
});
test('new mantle is restricted to c07-n01 hood and roof ascents',()=>{
 for(const id of ['pickup-hood','pickup-roof','unrelated-wall'])for(const reversed of [false,true]){
  const link:WalkLink={id,kind:'climb',from:{x:0,y:reversed?1.4:0,z:0},to:{x:0,y:reversed?0:1.4,z:2},top:1.4,duration:2,mantleGrip:{x:0,y:1.4,z:1}};
  const p=walkTraversalPose(link,.4,linkPosition(link,.4),0);
  assert.equal(usesPickupClimbAnimation(p),id!=='unrelated-wall'&&!reversed);
 }
 for(const descriptorId of ['ladder:pickup-hood','vault:pickup-roof','jump',null])assert(!usesPickupClimbAnimation({active:true,descriptorId,mantleContact:{ascending:true}}));
 assert(!usesPickupClimbAnimation(null));assert(!usesPickupClimbAnimation({active:false,descriptorId:'climb:pickup-hood',mantleContact:{ascending:true}}));
});
test('retargeted groups animate joints, not actor root displacement, and dispose cleanly',()=>{
 const engine=new NullEngine(),scene=new Scene(engine),nodes=[...data.bones,'root'].map(name=>new TransformNode(name,scene)),groups=createGroundAnimationGroups(scene,nodes,data);
 assert.deepEqual([groups.walk.name,groups.run.name],['Quaternius_Walk_Loop','Quaternius_Sprint_Loop']);
 for(const g of [groups.walk,groups.run])for(const target of g.targetedAnimations){
  if(target.target.name==='root')assert(target.animation.getKeys().every(k=>k.value.equalsWithEpsilon(target.animation.getKeys()[0].value,1e-7)));
  assert(['position','rotationQuaternion'].includes(target.animation.targetProperty));
 }
 groups.dispose();assert.equal(scene.animationGroups.length,0);scene.dispose();engine.dispose();
});
