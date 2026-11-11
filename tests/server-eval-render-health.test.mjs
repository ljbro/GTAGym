import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {createRequire} from 'node:module';
import {inspectMinimapSpill} from '../scripts/server-eval/render-health.mjs';
import {healthyObservation} from '../scripts/server-eval/render-recovery.mjs';
import {runEpisode} from '../scripts/server-eval/episode.mjs';
import * as adapter from './fixtures/wait-adapter.mjs';
const sharp=createRequire(import.meta.url)('sharp');
const region={left:0,top:0,width:240,height:360},map={x:24,y:160,width:192,height:192};
async function picture({spill=false,green=false,mapGreen=false}={}){
 const data=Buffer.alloc(240*360*3);
 for(let y=0;y<360;y++)for(let x=0;x<240;x++){
  const i=(y*240+x)*3,inMap=x>=24&&x<216&&y>=160&&y<352;
  data[i]=40;data[i+1]=green?120:50;data[i+2]=45;
  if(spill&&y<152||mapGreen&&inMap)data[i+1]=110+x%2*20;
 }
 return sharp(data,{raw:{width:240,height:360,channels:3}}).png().toBuffer();
}
test('green spill outside minimap detected; normal green scenery and map contents are allowed',async()=>{
 const reference=await picture();
 assert.equal((await inspectMinimapSpill(await picture({spill:true}),{reference,region,map})).healthy,false);
 assert.equal((await inspectMinimapSpill(await picture({mapGreen:true}),{reference,region,map})).healthy,true);
 const grass=await picture({green:true});
 assert.equal((await inspectMinimapSpill(grass,{reference:grass,region,map})).healthy,true);
 assert.equal((await inspectMinimapSpill(await sharp(reference).jpeg({quality:80}).toBuffer(),{reference,region,map})).healthy,true);
});
test('single transient anomaly recaptures without browser restart; static is untouched',async()=>{
 let checks=0,captures=0;
 const env={observe:async()=>Buffer.from(String(++captures)),inspectRenderHealth:async()=>({healthy:++checks>1})};
 const image=await healthyObservation({env,recover:()=>assert.fail(),onFault:()=>assert.fail()});
 assert.equal(image.toString(),'2');assert.equal(checks,2);
 env.isStatic=true;await healthyObservation({env});assert.equal(checks,2);
});
test('a terminal dialog is captured without spill detection or replaying the completed task',async()=>{
 for(const complete of [true,false]){
  let captures=0;
  const env={observe:async()=>{captures++;return Buffer.from('terminal dialog');},
   state:async()=>({active:false,complete,failed:!complete}),inspectRenderHealth:()=>assert.fail('terminal overlay is not a compositor failure')};
  assert.equal((await healthyObservation({env,recover:()=>assert.fail(),onFault:()=>assert.fail()})).toString(),'terminal dialog');
  assert.equal(captures,1);
 }
});
class Env{
 constructor(image,{always=false,drift=false}={}){Object.assign(this,{image,always,drift,frames:0,restarts:0,errors:[],failedResources:[]});}
 async open(){return {build:'fixture'};}
 async reset(){}
 async state(){return {taskId:'c06-n02',active:true,complete:false,failed:false,elapsed:this.frames/60,actor:{x:this.frames+(this.drift&&this.restarts?1:0),z:0}};}
 async observe(){return this.image;}
 async inspectRenderHealth(){return {healthy:!this.always&&(this.frames===0||this.restarts>0),kind:'minimap-green-spill'};}
 async restart(){this.restarts++;this.frames=0;return this.open();}
 async assertFrozen(){return true;}
 async close(){}
 async step(action,{onFrame}={}){this.frames+=action.frames;await onFrame?.(this.image,this.frames/60);return {advanced:action.frames,state:await this.state()};}
}
test('restart preserves committed rounds/context and never calls model during replay',async t=>{
 const output=await fs.mkdtemp(path.join(os.tmpdir(),'gta-render-recovery-test-'));t.after(()=>fs.rm(output,{recursive:true}));
 const image=await sharp(await picture()).jpeg().toBuffer(),env=new Env(image);let calls=0;
 const result=await runEpisode({env,taskId:'c06-n02',system:'s',instruction:'i',adapter,output,name:'recovered',maxRounds:3,checkpoint:true,policy:async(messages,{round})=>{
  assert.equal(round,++calls);assert.equal(env.frames,(round-1)*6);
  assert.equal(messages.filter(m=>m.role==='assistant').length,round-1);
  return {raw:'{"action":"wait","duration_seconds":0.1}'};
 }});
 assert.equal(result.status,'round_limit',JSON.stringify(result));assert.equal(result.rounds,3);assert.equal(calls,3);assert.equal(env.restarts,1);assert.equal(env.frames,18);
 const names=execFileSync('tar',['-tzf',path.join(output,result.archive)],{encoding:'utf8'});
 assert.equal(names.split('\n').filter(n=>/^rounds\//.test(n)).length,3);
 assert(names.includes('diagnostics/render-1-first.jpg'));
 assert.equal(result.video.frames,4,'replay must not duplicate video frames');
});
for(const drift of [false,true])test(`persistent faults/drift fail closed (drift=${drift})`,async t=>{
 const output=await fs.mkdtemp(path.join(os.tmpdir(),'gta-render-limit-test-'));t.after(()=>fs.rm(output,{recursive:true}));
 const env=new Env(await sharp(await picture()).jpeg().toBuffer(),{always:!drift,drift});let calls=0;
 const result=await runEpisode({env,taskId:'c06-n02',system:'s',instruction:'i',adapter,output,name:'failed',maxRounds:3,maxRenderRestarts:2,policy:async()=>{calls++;return {raw:'{"action":"wait","duration_seconds":0.1}'};}});
 assert.equal(result.status,'error');assert.equal(result.success,false);assert.equal(calls,drift?1:0);
 assert.equal(env.restarts,drift?1:2);assert.match(result.error,drift?/diverged/:/restart limit/);
});
