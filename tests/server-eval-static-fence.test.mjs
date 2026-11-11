import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createRequire} from 'node:module';
import {execFileSync} from 'node:child_process';
import {runEpisode} from '../scripts/server-eval/episode.mjs';
import {validatedPolicyReply} from '../scripts/server-eval/policy-retry.mjs';
import * as adapter from '../scripts/server-eval/actions.mjs';
import {staticTurn,COMPOSITE_PROTOCOL} from '../tasks/gui-turn.mjs';
import {ShootingEnvironment} from '../tasks/engines/shooting-engine.mjs';
import {createSniperEnvironment as SniperEnvironment} from '../tasks/engines/photo-sniper-engine.mjs';
const sharp=createRequire(import.meta.url)('sharp');
const base=new URL('../tasks/',import.meta.url);
const catalog=JSON.parse(await fs.readFile(new URL('catalog.json',base))).filter(row=>row.kind!=='native');
const raw=JSON.stringify({keys:[],mouse:{move:{dx:13,dy:-10}}});

class StaticFixture {
 constructor(row,cfg,image){
  this.row=row;this.image=image;this.frames=0;this.errors=[];this.failedResources=[];this.isStatic=true;this.counts=[];
  this.engine=row.kind==='shooting'?new ShootingEnvironment(cfg.task,cfg.gold):new SniperEnvironment(cfg);
  this.engine.reset({seed:1234});
  const stage=cfg.task?.stages[0];
  this.mapping={kind:row.kind,cursor:{x:640,y:360},width:1280,height:720,sourceWidth:stage?.width??1280,sourceHeight:stage?.height??720};
 }
 async open(){return {renderer:'test-fixture'};}
 async reset(){}
 async state(){const o=this.engine.observe(),result=o.result??this.engine.result;return {elapsed:0,complete:!!result?.reward,failed:o.done&&!result?.reward,actor:null,staticTask:{kind:this.row.kind,steps:this.frames}};}
 async observe(){return this.image;}
 async assertFrozen(){return true;}
 async close(){}
 async releaseInputs(){}
 async staticTrace(){return {...(this.row.kind==='sniper'?this.engine.trace():this.engine.exportTrace()),action_protocol:COMPOSITE_PROTOCOL,turn_action_counts:[...this.counts]};}
 async stepStatic(action){
  const mapped=staticTurn(action,this.mapping);
  for(const atom of mapped.actions)this.engine.step(atom);
  this.mapping.cursor=mapped.cursor;this.frames++;this.counts.push(mapped.actions.length);
  return {advanced:1,state:await this.state(),heldKeys:[],executedSeconds:0};
 }
}
for(const kind of ['shooting','sniper'])for(const validLast of [true,false]){
 test(`${kind}: three format attempts share one frozen observation (${validLast?'recover':'exhaust'})`,async t=>{
  const output=await fs.mkdtemp(path.join(os.tmpdir(),'gta-static-format-'));t.after(()=>fs.rm(output,{recursive:true}));
  const row=catalog.find(r=>r.kind===kind),cfg=JSON.parse(await fs.readFile(new URL(row.config,base)));
  const image=await sharp({create:{width:128,height:72,channels:3,background:'#336699'}}).png().toBuffer();
  const env=new StaticFixture(row,cfg,image),initial=await env.state(),initialMapping=JSON.stringify(env.mapping);
  let calls=0;const retries=[];
  const replies=['I will aim at the target.','',validLast?'```json\n'+raw+'\n```':'still not JSON'];
  const result=await runEpisode({env,taskId:row.id,system:'fixture',instruction:'fixture',adapter,maxRounds:1,output,name:'episode',policy:async messages=>{
   const saved=JSON.stringify(messages),pictures=messages.flatMap(m=>Array.isArray(m.content)?m.content.filter(p=>p.type==='image_url'):[]);
   const response=await validatedPolicyReply({messages,parse:adapter.parse,maxAttempts:3,language:'en',onRetry:e=>retries.push(e),request:async input=>{
    assert.equal(env.frames,0);assert.deepEqual(await env.state(),initial);assert.equal(JSON.stringify(env.mapping),initialMapping);
    assert.equal(JSON.stringify(messages),saved,'do not mutate episode history');
    assert.deepEqual(input.flatMap(m=>Array.isArray(m.content)?m.content.filter(p=>p.type==='image_url'):[]),pictures);
    assert.equal(pictures.length,1);
    return {raw:replies[calls++],finishReason:'stop'};
   }});
   assert.equal(JSON.stringify(messages),saved);return response;
  }});
  assert.equal(calls,3);assert.equal(retries.length,2);
  assert.equal(result.status,validLast?'round_limit':'error',result.error);
  assert.equal(env.frames,validLast?1:0);
  assert.equal((await env.staticTrace()).actions.length,validLast?1:0);
  const record=JSON.parse(execFileSync('tar',['-xOzf',path.join(output,'episode.tar.gz'),'rounds/000001.json'],{encoding:'utf8'}));
  assert.deepEqual(record.attempts.map(a=>a.raw),replies);
  assert(record.attempts[0].validationError);assert(record.attempts[1].validationError);
  if(validLast){assert.equal(record.reply,replies[2]);assert.equal(record.freezeVerified,true);assert.equal(result.staticEvaluation.steps,1);}
  else{assert(record.attempts[2].validationError);assert.match(result.error,/after 3 format attempts/);}
 });
}
for(const kind of ['shooting','sniper'])for(const scenario of ['plain','json-fence','bare-fence','prose','multiple-blocks','combined']){
 test(`${kind}: ${scenario} passes through episode parser without changing static rules`,async t=>{
  const output=await fs.mkdtemp(path.join(os.tmpdir(),'gta-static-fence-'));t.after(()=>fs.rm(output,{recursive:true}));
  const row=catalog.find(r=>r.kind===kind),cfg=JSON.parse(await fs.readFile(new URL(row.config,base)));
  const image=await sharp({create:{width:128,height:72,channels:3,background:'#336699'}}).png().toBuffer();
  const env=new StaticFixture(row,cfg,image);
  const fence='```json\n'+raw+'\n```';
  const response={plain:raw,'json-fence':fence,'bare-fence':'```\n'+raw+'\n```',prose:'Here is my action:\n'+fence,'multiple-blocks':fence+'\n'+fence,combined:'```json\n'+JSON.stringify({keys:[],mouse:{move:{dx:13,dy:-10},buttons:[{button:'left',event:'down'}]}})+'\n```'}[scenario];
  let calls=0;
  const result=await runEpisode({env,taskId:row.id,system:'fixture',instruction:'fixture',adapter,maxRounds:1,output,name:'episode',policy:async()=>{calls++;return {raw:response};}});
  const accepted=['plain','json-fence','bare-fence','combined'].includes(scenario);
  const expectedStatus=scenario==='combined'?((await env.state()).complete?'success':'task_failure'):accepted?'round_limit':'error';
  assert.equal(calls,1,'no format retry or extra model step');
  assert.equal(result.status,expectedStatus,JSON.stringify({error:result.error,replayError:result.replayError}));
  assert.equal(env.frames,accepted?1:0);
  assert.equal((await env.staticTrace()).actions.length,scenario==='combined'?2:accepted?1:0);
  const record=JSON.parse(execFileSync('tar',['-xOzf',path.join(output,'episode.tar.gz'),'rounds/000001.json'],{encoding:'utf8'}));
  assert.equal(record.reply,response,'archive preserves the exact original reply');
  if(accepted){assert.equal(record.freezeVerified,true);assert.equal(result.staticEvaluation.steps,scenario==='combined'?2:1);if(scenario!=='combined')assert.equal(result.staticEvaluation.reason,'step_limit_without_shot');}
 });
}
