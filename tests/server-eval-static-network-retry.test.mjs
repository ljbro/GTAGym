import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {retryTransport} from '../scripts/server-eval/transport-retry.mjs';
import {ModelContext} from '../scripts/server-eval/context.mjs';
import {parse} from '../scripts/server-eval/actions.mjs';
import {modelReply} from '../scripts/server-eval/model-response.mjs';

test('CLI applies network and format retries to both static and native tasks',async()=>{
 const code=await fs.readFile(new URL('../scripts/server-eval/run.mjs',import.meta.url),'utf8');
 assert.match(code,/maxAttempts:options\['request-attempts'\]/);
 assert.doesNotMatch(code,/maxAttempts:original\?1/);
 assert.doesNotMatch(code,/if\(original\)return request\(messages\);/);
 assert.match(code,/return validatedPolicyReply\(/);
 assert.match(code,/maxAttempts:options\['format-attempts'\]/);
 assert.match(code,/modelReply\(body,\{api:options.api\}\)/);
 // Envelope parsing moved into a shared Chat/Responses adapter; final text
 // remains separate from reasoning and invalid non-text still gets corrected.
 for(const content of [undefined,null,[],{},'', 'invalid JSON']){
  const body={choices:[{message:{content,reasoning_content:'not an action'}}]};
  const reply=modelReply(body,{api:'chat-completions'});
  assert.equal(reply.raw,typeof content==='string'?content:'');
  assert.equal(reply.modelResponse,body);
 }
});
for(const kind of ['shooting','sniper'])test(`${kind}: two network failures retry the same PNG/history and execute once`,async()=>{
 const context=new ModelContext('system','instruction',{staticOriginal:true});
 context.observe({round:1,gameSeconds:0,image:Buffer.from('PNG'),mime:'image/png'});
 const messages=context.messages(),saved=JSON.stringify(messages);let requests=0,actions=0;
 const state={steps:0,gameSeconds:0,scoped:kind==='sniper'};
 const response=await retryTransport(async()=>{
  assert.equal(JSON.stringify(messages),saved);assert.deepEqual(context.rounds,[1]);
  assert.equal(state.steps,0);assert.equal(state.gameSeconds,0);assert.equal(state.scoped,kind==='sniper');
  if(++requests<3)throw new TypeError('fetch failed',{cause:{code:'UND_ERR_HEADERS_TIMEOUT'}});
  return {raw:'{"keys":[],"mouse":{"buttons":[{"button":"left","event":"down"}]}}'};
 },{delayMs:0});
 context.reply(response.raw);parse(response.raw);state.steps++;actions++;
 assert.equal(requests,3);assert.equal(actions,1);assert.equal(state.steps,1);
 assert.equal(response.transportAttempts.length,2);
 assert.equal(response.transportAttempts[0].code,'UND_ERR_HEADERS_TIMEOUT');
 assert.equal(context.messages().filter(m=>m.role==='assistant').length,1);
});
test('malformed response is not retried by transport (format layer handles it)',async()=>{
 let requests=0;
 const response=await retryTransport(async()=>{requests++;return {raw:'invalid JSON'};},{delayMs:0});
 assert.throws(()=>parse(response.raw));assert.equal(requests,1);
});
test('three failed attempts preserve diagnostic codes; auth and cancellation do not retry',async()=>{
 let calls=0;
 await assert.rejects(retryTransport(async()=>{calls++;throw new TypeError('fetch failed',{cause:{code:'ECONNRESET'}});},{delayMs:0}),e=>e.transportAttempts.length===3&&e.transportAttempts.every(a=>a.code==='ECONNRESET'));
 assert.equal(calls,3);
 calls=0;await assert.rejects(retryTransport(async()=>{calls++;throw Error('Model HTTP 403');},{delayMs:0}),/403/);assert.equal(calls,1);
 const controller=new AbortController();calls=0;
 await assert.rejects(retryTransport(async()=>{calls++;throw Error('fetch failed');},{delayMs:0,signal:controller.signal,onRetry:()=>controller.abort()}),/abort/i);
 assert.equal(calls,1);
});
