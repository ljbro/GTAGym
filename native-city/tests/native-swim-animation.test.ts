import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {sampleSwimClip} from '../src/native-swim-pose.ts';
const asset=JSON.parse(fs.readFileSync(new URL('../../characters/animations/quaternius-swim.json',import.meta.url),'utf8'));
test('free authored swim clips target the unchanged Franklin rig',()=>{
 assert.equal(asset.source,'Quaternius Universal Animation Library Standard (CC0)');
 assert.equal(asset.targetSha256,createHash('sha256').update(fs.readFileSync(new URL('../../characters/offmapbench/franklin.glb',import.meta.url))).digest('hex'));
 assert.equal(asset.bones.length,52);assert.equal(new Set(asset.bones).size,52);
 assert.deepEqual(Object.keys(asset.clips),['Swim_Fwd_Loop','Swim_Idle_Loop']);
 for(const clip of Object.values(asset.clips) as {duration:number;frames:number[][]}[]){
  assert(clip.duration>1&&clip.duration<4);assert.equal(clip.frames.length,Math.round(clip.duration*30)+1);
  assert.deepEqual(clip.frames[0],clip.frames.at(-1));
  for(const frame of clip.frames){assert.equal(frame.length,52*4);for(let i=0;i<frame.length;i+=4)assert(Math.abs(Math.hypot(...frame.slice(i,i+4))-1)<1e-5);}
 }
});
test('swim sampling loops seamlessly and keeps authored shoulder, wrist and leg motion',()=>{
 for(const clip of Object.values(asset.clips) as {duration:number;frames:number[][]}[]){
  for(const bone of ['upperarm_l','upperarm_r','hand_l','hand_r','thigh_l','thigh_r']){
   const index=asset.bones.indexOf(bone),a=sampleSwimClip(clip,0,index),b=sampleSwimClip(clip,1,index);
   assert(a.equalsWithEpsilon(b,1e-6));
   if(!bone.startsWith('hand'))assert(clip.frames.some((_,i)=>Math.abs(a.asArray().reduce((sum,v,k)=>sum+v*sampleSwimClip(clip,i/(clip.frames.length-1),index).asArray()[k],0))<.999),bone);
  }
 }
});
