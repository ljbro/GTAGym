import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createRequire} from 'node:module';
import {runEpisode} from '../scripts/server-eval/episode.mjs';
import {loadCheckpoint,verifyReplayState} from '../scripts/server-eval/checkpoint.mjs';
import {retryTransport} from '../scripts/server-eval/transport-retry.mjs';
import * as adapter from './fixtures/wait-adapter.mjs';
const sharp=createRequire(import.meta.url)('sharp');

class Env{
 constructor(image){Object.assign(this,{image,frames:0,errors:[],failedResources:[]});}
 async open(){return {build:'test-build'};}
 async reset(){}
 async state(){return {taskId:'c01-n04',active:true,complete:false,failed:false,elapsed:this.frames/60,worldTime:this.frames/60,actor:{x:this.frames,z:0},mode:'car'};}
 async assertFrozen(){return true;}
 async observe(){return this.image;}
 async step(action,{onFrame}={}){for(let i=0;i<action.frames;i++){this.frames++;if(this.frames%6===0)await onFrame?.(this.image,this.frames/60);}return {advanced:action.frames,state:await this.state()};}
 async close(){}
}
async function fixture(t){
 const output=await fs.mkdtemp(path.join(os.tmpdir(),'checkpoint-test-'));t.after(()=>fs.rm(output,{recursive:true}));
 const image=await sharp({create:{width:32,height:32,channels:3,background:'#336699'}}).jpeg().toBuffer();
 return {output,image,taskId:'c01-n04',system:'s',instruction:'i',adapter,checkpoint:true,maxRounds:14};
}
const reply={raw:'{"action":"wait","duration_seconds":0.1}'};
test('recover at round 12, replay prefix without model calls, restore 10-image pruning; original journal stays intact',async t=>{
 const f=await fixture(t);let calls=0;
 const first=await runEpisode({...f,name:'first',env:new Env(f.image),policy:async(_m,{round})=>{if(round===12)throw Error('fetch failed');return reply;}});
 assert.equal(first.rounds,11);assert.equal(first.status,'error');
 const source=path.join(f.output,'checkpoints/first'),resume=await loadCheckpoint(source);
 assert.equal(resume.nextRound,12);assert.equal(resume.records.length,11);
 const result=await runEpisode({...f,name:'second',env:new Env(f.image),resume,policy:async(messages,{round})=>{
  calls++;assert.equal(round,11+calls);assert.equal(messages.filter(m=>m.role==='assistant').length,round-6);return reply;
 }});
 assert.equal(result.rounds,14);assert.equal(result.status,'round_limit');assert.equal(result.recovery.replayedRounds,11);assert.equal(calls,3);
 assert.equal((await loadCheckpoint(source)).nextRound,12);
 const earlier=await loadCheckpoint(source,5);assert.equal(earlier.records.length,4);
 await assert.rejects(loadCheckpoint(source,13),/between 1 and 12/);
});
test('divergent replay fails before any new model inference',async t=>{
 const f=await fixture(t);await runEpisode({...f,name:'source',maxRounds:2,env:new Env(f.image),policy:async()=>reply});
 const resume=await loadCheckpoint(path.join(f.output,'checkpoints/source')),env=new Env(f.image),step=env.step.bind(env);
 env.step=async(...a)=>{const r=await step(...a);env.frames++;return r;};
 const result=await runEpisode({...f,name:'drift',env,resume,policy:async()=>{throw Error('must not call');}});
 assert.equal(result.status,'error');assert.match(result.error,/Replay diverged/);
});
test('partial action is not a committed recovery boundary',async t=>{
 const f=await fixture(t),env=new Env(f.image),step=env.step.bind(env);let calls=0;
 env.step=async(...args)=>{if(++calls===2){env.frames++;throw Error('browser disconnected mid-action');}return step(...args);};
 const result=await runEpisode({...f,name:'partial',env,policy:async()=>reply});
 assert.equal(result.rounds,1);
 const resume=await loadCheckpoint(path.join(f.output,'checkpoints/partial'));
 assert.equal(resume.nextRound,2);assert.equal(resume.records.length,1);
});
test('network retry advances neither clock nor keys during model thinking',async t=>{
 const f=await fixture(t),env=new Env(f.image);let requests=0;
 const result=await runEpisode({...f,name:'network',maxRounds:1,env,policy:async messages=>retryTransport(async()=>{
  assert.equal(env.frames,0);assert.equal(messages.filter(m=>m.role==='user').length,1);
  if(++requests===1)throw Error('fetch failed');return reply;
 },{delayMs:0})});
 assert.equal(requests,2);assert.equal(result.rounds,1);assert.equal(env.frames,6);
 const source=await loadCheckpoint(path.join(f.output,'checkpoints/network'));
 assert.equal(source.records[0].transportAttempts.length,1);
});
test('legacy finished archive can be imported without extraction and resume selected round',async t=>{
 const f=await fixture(t);await fs.writeFile(path.join(f.output,'config.json'),JSON.stringify({seed:1234}));
 await runEpisode({...f,name:'legacy',checkpoint:false,maxRounds:3,env:new Env(f.image),policy:async()=>reply});
 const resume=await loadCheckpoint(path.join(f.output,'legacy.tar.gz'),3);
 assert.equal(resume.records.length,2);assert.equal(resume.config.seed,1234);assert.equal(resume.config.build,'test-build');
 assert.deepEqual(await resume.getImage(1),f.image);
});
test('replay validation ignores wall clock origin, detects pose and outcome changes',()=>{
 const s={elapsed:1,actor:{x:1,z:2},complete:false,worldTime:123};
 verifyReplayState(s,{...s,worldTime:999},'test');
 assert.throws(()=>verifyReplayState(s,{...s,actor:{x:2,z:2}},'test'),/diverged/);
 assert.throws(()=>verifyReplayState(s,{...s,complete:true},'test'),/diverged/);
});
test('transport retry keeps same request, retries transient errors only, and supports cancellation',async()=>{
 let calls=0;
 const response=await retryTransport(async()=>{if(++calls<3)throw Error('fetch failed');return reply;},{delayMs:0});
 assert.equal(calls,3);assert.equal(response.transportAttempts.length,2);
 calls=0;await assert.rejects(retryTransport(async()=>{calls++;throw Error('Model HTTP 401');},{delayMs:0}),/401/);assert.equal(calls,1);
 const c=new AbortController();await assert.rejects(retryTransport(async()=>{throw Error('terminated');},{signal:c.signal,onRetry:()=>c.abort(Error('stop')),delayMs:0}),/abort|stop/i);
});
test('replay checks persistent absolute mouse and screenshot dimensions',()=>{
 const s={mousePosition:{x:840,y:320},viewport:{width:1280,height:720}};
 verifyReplayState(s,{...s},'cursor');
 assert.throws(()=>verifyReplayState(s,{...s,mousePosition:{x:640,y:360}},'cursor'),/diverged/);
 assert.throws(()=>verifyReplayState(s,{...s,viewport:{width:640,height:360}},'viewport'),/diverged/);
});
test('English checkpoint compares the English action protocol snapshot',async t=>{
 const f=await fixture(t),english={...adapter,descriptionEn:'English protocol fixture'};
 const first=await runEpisode({...f,adapter:english,metadata:{language:'en'},name:'english-source',maxRounds:1,env:new Env(f.image),policy:async()=>reply});
 assert.equal(first.status,'round_limit');
 const resume=await loadCheckpoint(path.join(f.output,'checkpoints/english-source'));
 let calls=0;
 const result=await runEpisode({...f,adapter:english,metadata:{language:'en'},name:'english-resume',maxRounds:2,env:new Env(f.image),resume,policy:async()=>{calls++;return reply;}});
 assert.equal(result.status,'round_limit',result.error);assert.equal(calls,1);
});
