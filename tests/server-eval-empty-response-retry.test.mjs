import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {gunzipSync} from 'node:zlib';
import {createRequire} from 'node:module';
import {emptyModelResponse,emptyResponseState,retryEmptyResponse} from '../scripts/server-eval/empty-response-retry.mjs';
import {validatedPolicyReply} from '../scripts/server-eval/policy-retry.mjs';
import {runEpisode} from '../scripts/server-eval/episode.mjs';
import {loadCheckpoint} from '../scripts/server-eval/checkpoint.mjs';
import * as adapter from './fixtures/wait-adapter.mjs';

const sharp=createRequire(import.meta.url)('sharp');
const valid='{"action":"wait","duration_seconds":0.1}';
const response=(content='',index=1)=>({raw:content,emptyReply:!content.trim(),usage:{prompt_tokens:index,completion_tokens:10*index},finishReason:'stop'});

test('only empty final text in a valid message qualifies; non-text, tools and invalid envelopes do not',()=>{
 for(const content of [undefined,null,'',' \n\t'])assert(emptyModelResponse({choices:[{message:{content,reasoning_content:'thinking'},finish_reason:'stop'}]}));
 for(const content of ['not json',valid,[],{},0,false])assert(!emptyModelResponse({choices:[{message:{content}}]}));
 for(const body of [undefined,null,{}, {choices:[]},{choices:[{}]},{choices:[{message:[]}]},
  {choices:[{message:{content:'',tool_calls:[{type:'function'}]}}]},
  {choices:[{message:{content:'',function_call:{name:'tool'}}}]}])assert(!emptyModelResponse(body));
});

test('two empty replies resend the exact input, wait 2s/4s, and retain empty plus recovered usage',async()=>{
 const messages=[{role:'system',content:'system'},{role:'user',content:[{type:'image_url',image_url:{url:'data:image/jpeg;base64,abc'}}]}];
 const before=JSON.stringify(messages),seen=[],delays=[],captures=[],state=emptyResponseState();
 const result=await retryEmptyResponse(async()=>{seen.push(messages);return response(seen.length<3?'':valid,seen.length);},{state,
  wait:async delay=>delays.push(delay),capture:async({record})=>{captures.push(record.kind);return {directory:'evidence-'+record.responseNumber};}});
 assert.equal(seen.length,3);assert(seen.every(m=>m===messages));assert.equal(JSON.stringify(messages),before);
 assert.deepEqual(delays,[2000,4000]);assert.deepEqual(captures,['empty','empty','nonempty']);assert.equal(state.retries,2);
 assert.equal(result.raw,valid);assert.equal(result.emptyResponseAttempts.length,3);
 assert.deepEqual(result.emptyResponseAttempts.map(a=>a.usage.completion_tokens),[10,20,30]);
 assert.deepEqual(result.emptyResponseAttempts.map(a=>a.capture.directory),['evidence-1','evidence-2','evidence-3']);
});

test('ordinary nonempty responses and transport exceptions never enter the new retry path',async()=>{
 for(const raw of [valid,'nonempty malformed JSON']){
  let calls=0;
  const result=await retryEmptyResponse(async()=>{calls++;return response(raw);},{wait:()=>assert.fail('no wait'),capture:()=>assert.fail('no capture')});
  assert.equal(result.raw,raw);assert.equal(calls,1);assert(!result.emptyResponseAttempts);
 }
 let calls=0;const failure=Error('Model HTTP 503');
 await assert.rejects(retryEmptyResponse(async()=>{calls++;throw failure;},{wait:()=>assert.fail('no wait')}),e=>e===failure);
 assert.equal(calls,1);
});

test('exhaustion latches before final capture and stops only after the third empty reply',async()=>{
 let calls=0;const events=[];
 await assert.rejects(retryEmptyResponse(async()=>{calls++;events.push('request-'+calls);return response('',calls);},{
  wait:async ms=>events.push('wait-'+ms),capture:async({record})=>{events.push('capture-'+calls);return {attempt:record.responseNumber};},
  onExhausting:()=>events.push('latch'),onExhausted:()=>events.push('stop'),
 }),error=>error.name==='EmptyResponseLimitError'&&error.emptyResponseAttempts.length===3);
 assert.equal(calls,3);
 assert.deepEqual(events,['request-1','capture-1','wait-2000','request-2','capture-2','wait-4000','request-3','latch','capture-3','stop']);
});

test('format corrections keep their original budget and never include empty assistant messages',async()=>{
 const messages=[{role:'system',content:'system'},{role:'user',content:'image input'}],state=emptyResponseState(),requests=[],delays=[];
 const raw=['','not json','',valid];
 const result=await validatedPolicyReply({messages,parse:adapter.parse,request:input=>retryEmptyResponse(async()=>{
  requests.push(input);return response(raw[requests.length-1],requests.length);
 },{state,wait:async ms=>delays.push(ms)})});
 assert.equal(requests.length,4);assert.equal(requests[0],requests[1]);assert.equal(requests[2],requests[3]);
 assert(requests.every(input=>!input.some(m=>m.role==='assistant'&&!m.content.trim())));
 assert.deepEqual(requests[0],messages);assert.equal(requests[2].at(-2).content,'not json');
 assert.deepEqual(delays,[2000,4000]);assert.equal(result.attempts.length,2);assert.equal(state.attempts.length,4);
});

test('exhaustion still stops the queue if final evidence capture fails',async()=>{
 let calls=0,stops=0;
 await assert.rejects(retryEmptyResponse(async()=>{calls++;return response();},{wait:async()=>{},
  capture:async()=>{if(calls===3)throw Error('disk full');return {directory:'saved'};},
  onExhausted:({record})=>{stops++;assert.equal(record.captureError,'disk full');},
 }),error=>error.name==='EmptyResponseLimitError'&&error.emptyResponseAttempts.length===3);
 assert.equal(stops,1);assert.equal(calls,3);
});

test('format correction does not reset the round-wide empty-response retry budget',async()=>{
 const state=emptyResponseState(),raw=['','bad format','','bad format',''];let calls=0,stops=0;
 await assert.rejects(validatedPolicyReply({messages:[],parse:adapter.parse,request:()=>retryEmptyResponse(async()=>response(raw[calls++]),{
  state,wait:async()=>{},onExhausted:()=>stops++,
 })}),error=>error.name==='EmptyResponseLimitError'&&error.emptyResponseAttempts.length===5&&error.attempts.length===2);
 assert.equal(calls,5);assert.equal(state.retries,2);assert.equal(stops,1);
});

test('cancellation during backoff preserves evidence and makes no extra model request',async()=>{
 const controller=new AbortController();let calls=0,stops=0;
 await assert.rejects(retryEmptyResponse(async()=>{calls++;return response();},{signal:controller.signal,
  wait:async()=>{controller.abort(Error('cancelled'));controller.signal.throwIfAborted();},onExhausted:()=>stops++,
 }),error=>error.message==='cancelled'&&error.emptyResponseAttempts.length===1);
 assert.equal(calls,1);assert.equal(stops,0);
});

class Environment {
 constructor(image){Object.assign(this,{image,frames:0,errors:[],failedResources:[],releases:0});}
 async open(){return {renderer:'fixture',executionHost:'server'};}
 async reset(){}
 async state(){return {active:true,complete:false,failed:false,elapsed:this.frames/60,worldTime:this.frames/60,actor:{x:this.frames}};}
 async observe(){return this.image;}
 async assertFrozen(){return true;}
 async step(action,{onFrame}={}){this.frames+=action.frames;await onFrame?.(this.image,this.frames/60);return {advanced:action.frames,state:await this.state()};}
 async releaseInputs(){this.releases++;}
 async close(){}
}
const readRound=archive=>JSON.parse(execFileSync('tar',['-xOzf',archive,'rounds/000001.json']));

for(const recover of [true,false])test(`episode freezes during retries, archives usage and journals evidence; recovery=${recover}`,async t=>{
 const output=await fs.mkdtemp(path.join(os.tmpdir(),'gta-empty-retry-'));t.after(()=>fs.rm(output,{recursive:true,force:true}));
 const image=await sharp({create:{width:128,height:72,channels:3,background:'#336699'}}).jpeg().toBuffer(),env=new Environment(image);let calls=0;
 const policy=async messages=>{
  const state=emptyResponseState();
  try{
   const reply=await validatedPolicyReply({messages,parse:adapter.parse,request:()=>retryEmptyResponse(async()=>{
    assert.equal(env.frames,0);assert.equal(env.releases,0);calls++;return response(recover&&calls===3?valid:'',calls);
   },{state,wait:async()=>{assert.equal(env.frames,0);},capture:async({record})=>({directory:'evidence-'+record.responseNumber})})});
   return {...reply,emptyResponseAttempts:state.attempts};
  }catch(error){error.emptyResponseAttempts=state.attempts;throw error;}
 };
 const result=await runEpisode({env,taskId:'c07-n04',system:'s',instruction:'i',adapter,policy,maxRounds:1,output,name:'original',checkpoint:true});
 assert.equal(calls,3);assert.equal(env.frames,recover?6:0);assert.equal(result.rounds,recover?1:0);assert.equal(result.status,recover?'round_limit':'error');
 const record=readRound(path.join(output,'original.tar.gz'));
 assert.equal(record.emptyResponseAttempts.length,3);assert.deepEqual(record.emptyResponseAttempts.map(a=>a.usage.completion_tokens),[10,20,30]);
 const journal=JSON.parse(gunzipSync(await fs.readFile(path.join(output,'checkpoints/original/000001.json.gz'))));
 assert.equal(journal.phase,recover?'committed':'error');assert.deepEqual(journal.record.emptyResponseAttempts,record.emptyResponseAttempts);
 const source=await loadCheckpoint(path.join(output,'checkpoints/original'));assert.equal(source.records.length,recover?1:0);assert.equal(source.nextRound,recover?2:1);
 if(recover){
  const controller=new AbortController();
  const resumed=await runEpisode({env:new Environment(image),taskId:'c07-n04',system:'s',instruction:'i',adapter,policy:()=>assert.fail('no new inference for committed round'),maxRounds:2,output,name:'replayed',checkpoint:true,
   resume:source,signal:controller.signal,onEvent:event=>{if(event.event==='replay')controller.abort();}});
  // Stop after the verified replay boundary without making a new model request.
  assert.equal(resumed.recovery.replayedRounds,1);
  const replayed=readRound(path.join(output,'replayed.tar.gz'));assert(replayed.replayed);assert.deepEqual(replayed.emptyResponseAttempts,record.emptyResponseAttempts);
 }
});
