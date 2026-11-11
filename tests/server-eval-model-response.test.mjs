import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {gunzipSync} from 'node:zlib';
import {createRequire} from 'node:module';
import {modelReply,reasoningMetadata,saveModelResponse} from '../scripts/server-eval/model-response.mjs';
import {validatedPolicyReply} from '../scripts/server-eval/policy-retry.mjs';
import {emptyResponseState,retryEmptyResponse} from '../scripts/server-eval/empty-response-retry.mjs';
import {runEpisode} from '../scripts/server-eval/episode.mjs';
import {loadCheckpoint} from '../scripts/server-eval/checkpoint.mjs';
import * as adapter from './fixtures/wait-adapter.mjs';
const sharp=createRequire(import.meta.url)('sharp');
const action='{"action":"wait","duration_seconds":0.1}';
const body=(id='first',content=action,reasoning='Read the purple route, then brake before turning.')=>({
 id,model:'fixture-model',choices:[{message:{role:'assistant',content,reasoning_content:reasoning,
  provider_extension:{retained:true}},finish_reason:'stop'}],usage:{completion_tokens_details:{reasoning_tokens:20}},unknown_provider_field:[1,2,3],
});
const round=(output,name,n=1)=>JSON.parse(execFileSync('tar',['-xOzf',path.join(output,name+'.tar.gz'),`rounds/${String(n).padStart(6,'0')}.json`]));

test('normal response preserves every provider field while final JSON alone remains the action',()=>{
 const input=body(),reply=modelReply(input);
 assert.equal(reply.raw,action);assert.deepEqual(reply.modelResponse,input);
 assert.equal(adapter.parse(reply.raw).action,'wait');
 const meta=reasoningMetadata(input);
 assert.equal(meta.status,'text_returned');assert.equal(meta.textAvailable,true);
 assert.equal(meta.sources[0].path,'choices[0].message.reasoning_content');
 assert(!Object.hasOwn(meta,'text'),'do not duplicate the long reasoning');
});

test('tokens alone are not reasoning text; absent, empty, summaries, opaque, legacy and null are distinct',()=>{
 const noReasoning={choices:[{message:{content:action}}],usage:{completion_tokens_details:{reasoning_tokens:5000}}};
 assert.equal(reasoningMetadata(noReasoning).status,'not_returned');
 assert.equal(reasoningMetadata(body('empty',action,'')).status,'empty');
 assert.equal(reasoningMetadata(undefined).status,'not_recorded');
 assert.equal(reasoningMetadata(null).status,'not_returned');
 assert.equal(reasoningMetadata({choices:[{message:{reasoning_details:[{type:'reasoning.summary',summary:'A short summary.'}]}}]}).status,'summary_only');
 const opaque={output:[{type:'reasoning',summary:[],encrypted_content:'opaque-do-not-decode'}]};
 assert.equal(reasoningMetadata(opaque).status,'opaque_only');assert.equal(reasoningMetadata(opaque).textAvailable,false);
 const responses={output:[{type:'reasoning',summary:[{type:'summary_text',text:'A summary.'}],encrypted_content:'opaque'}]};
 assert.equal(reasoningMetadata(responses).status,'summary_only');
 assert.equal(reasoningMetadata({choices:[{message:{content:[{type:'thinking',thinking:'Provider thinking block.'}]}}]}).status,'text_returned');
});

test('redaction covers reasoning, unknown response fields and retries without mutating the API body',()=>{
 const secret='fixture-secret',input=body('secret',action,`route ${secret}`);input.unknown_provider_field={echo:secret};
 const original=JSON.stringify(input),record={};
 saveModelResponse(record,{...modelReply(input),attempts:[{attempt:1,...modelReply(input)}]},s=>s.replaceAll(secret,'[REDACTED]'));
 assert(!JSON.stringify(record).includes(secret));assert.equal(JSON.stringify(input),original);
 assert.equal(record.attempts[0].modelResponseRef,'modelResponse');assert(!Object.hasOwn(record.attempts[0],'modelResponse'));
 assert.equal(record.modelResponse.choices[0].message.reasoning_content,'route [REDACTED]');
 const nullRecord={};saveModelResponse(nullRecord,modelReply(null));assert.equal(nullRecord.modelResponse,null);
});

class Environment {
 constructor(image){Object.assign(this,{image,frames:0,errors:[],failedResources:[]});}
 async open(){return {build:'fixture-build',executionHost:'server'};}
 async reset(){}
 async state(){return {active:true,complete:false,failed:false,elapsed:this.frames/60,worldTime:this.frames/60,actor:{x:this.frames,z:0}};}
 async observe(){return this.image;}
 async assertFrozen(){return true;}
 async step(input,{onFrame}={}){this.frames+=input.frames;await onFrame?.(this.image,this.frames/60);return {advanced:input.frames,state:await this.state()};}
 async close(){}
}
async function fixture(t){
 const output=await fs.mkdtemp(path.join(os.tmpdir(),'gta-response-recording-'));t.after(()=>fs.rm(output,{recursive:true,force:true}));
 const image=await sharp({create:{width:32,height:32,channels:3,background:'#336699'}}).jpeg().toBuffer();
 return {output,image,taskId:'c01-n04',system:'same system',instruction:'same instruction',adapter,checkpoint:true};
}

test('all reasoning survives history pruning, compressed checkpoints and verified replay, but never enters model history',async t=>{
 const f=await fixture(t);let calls=0;
 const policy=async messages=>{
  calls++;assert(!JSON.stringify(messages).includes('private-provider-reasoning'));
  assert(messages.filter(m=>Array.isArray(m.content)).length<=10);
  for(const message of messages.filter(m=>m.role==='assistant'))assert.equal(message.content,action);
  return validatedPolicyReply({messages,parse:adapter.parse,request:async()=>modelReply(body(String(calls),action,'private-provider-reasoning'))});
 };
 const result=await runEpisode({...f,name:'source',env:new Environment(f.image),maxRounds:12,policy});
 assert.equal(result.status,'round_limit',result.error);assert.equal(calls,12);
 const first=round(f.output,'source');
 assert.equal(first.reasoning.status,'text_returned');assert.equal(first.modelResponse.choices[0].message.reasoning_content,'private-provider-reasoning');
 assert.equal(first.attempts[0].modelResponseRef,'modelResponse');
 assert.deepEqual(round(f.output,'source',11).prunedRounds,[1,2,3,4,5]);
 const checkpoint=JSON.parse(gunzipSync(await fs.readFile(path.join(f.output,'checkpoints/source/000001.json.gz'))));
 assert.equal(checkpoint.phase,'committed');assert.deepEqual(checkpoint.record.modelResponse,first.modelResponse);
 const source=await loadCheckpoint(path.join(f.output,'checkpoints/source'));
 const replayed=await runEpisode({...f,name:'replayed',env:new Environment(f.image),maxRounds:13,resume:source,policy});
 assert.equal(replayed.status,'round_limit',replayed.error);assert.equal(calls,13);assert.equal(replayed.recovery.replayedRounds,12);
 assert.deepEqual(round(f.output,'replayed').modelResponse,first.modelResponse);assert(round(f.output,'replayed').replayed);
 assert.equal(round(f.output,'replayed',13).modelResponse.id,'13');
});

for(const corrected of [true,false])test(`format errors preserve reasoning for every attempt and error checkpoint; corrected=${corrected}`,async t=>{
 const f=await fixture(t);let calls=0;
 const result=await runEpisode({...f,name:'format',env:new Environment(f.image),maxRounds:1,policy:messages=>validatedPolicyReply({
  messages,parse:adapter.parse,request:async()=>modelReply(body(`attempt-${++calls}`,corrected&&calls===3?action:'invalid JSON',`reason-${calls}`)),
 })});
 assert.equal(calls,3);assert.equal(result.status,corrected?'round_limit':'error');
 const r=round(f.output,'format');assert.equal(r.attempts.length,3);
 assert.equal(r.attempts[0].modelResponse.choices[0].message.reasoning_content,'reason-1');
 assert.equal(r.attempts[1].modelResponse.choices[0].message.reasoning_content,'reason-2');
 assert.equal(r.attempts[2].modelResponseRef,'modelResponse');assert.equal(r.modelResponse.id,'attempt-3');
 const journal=JSON.parse(gunzipSync(await fs.readFile(path.join(f.output,'checkpoints/format/000001.json.gz'))));
 assert.equal(journal.phase,corrected?'committed':'error');assert.deepEqual(journal.record.modelResponse,r.modelResponse);
});

test('empty replies retain reasoning-only responses and the eventual accepted response together',async t=>{
 const f=await fixture(t);let calls=0;const state=emptyResponseState();
 const result=await runEpisode({...f,name:'empty',env:new Environment(f.image),maxRounds:1,policy:messages=>validatedPolicyReply({
  messages,parse:adapter.parse,request:()=>retryEmptyResponse(async()=>{
   calls++;const reply=modelReply(body(`empty-${calls}`,calls<3?'':action,`reason-${calls}`));return {...reply,emptyReply:calls<3};
  },{state,wait:async()=>{}}),
 }).then(response=>({...response,emptyResponseAttempts:state.attempts}))});
 assert.equal(result.status,'round_limit',result.error);assert.equal(calls,3);
 const r=round(f.output,'empty');assert.equal(r.emptyResponseAttempts.length,3);
 assert.equal(r.emptyResponseAttempts[0].modelResponse.choices[0].message.content,'');
 assert.equal(r.emptyResponseAttempts[0].modelResponse.choices[0].message.reasoning_content,'reason-1');
 assert.equal(r.emptyResponseAttempts[2].modelResponseRef,'modelResponse');assert.equal(r.modelResponse.id,'empty-3');
});

test('provider text is not fabricated for old checkpoints or providers returning only actions',()=>{
 const old={};saveModelResponse(old,{raw:action});assert.equal(old.reasoning.status,'not_recorded');
 assert(!Object.hasOwn(old,'modelResponse'));
 const newRound={};saveModelResponse(newRound,modelReply({choices:[{message:{content:action}}]}));
 assert.equal(newRound.reasoning.status,'not_returned');assert(!newRound.reasoning.textAvailable);
});
