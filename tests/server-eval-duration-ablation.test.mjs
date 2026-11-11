import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {createActionAdapter,parse as baselineParse} from '../scripts/server-eval/actions.mjs';
import {durationPrompt,DURATION_VARIANTS} from '../scripts/server-eval/duration-ablation.mjs';
import {validatedPolicyReply} from '../scripts/server-eval/policy-retry.mjs';
import {staticRoundLimit} from '../scripts/server-eval/static-budget.mjs';

const key=(key,duration_seconds)=>({key,duration_seconds});
const raw=action=>JSON.stringify(action);
test('variant parsers isolate both duration limits from the one-second baseline',()=>{
 const short=createActionAdapter({maxSeconds:.5}),long=createActionAdapter({maxSeconds:2});
 for(const [adapter,max] of [[short,.5],[long,2]]){
  for(const action of [{keys:[key('w',max)]},{keys:[],wait_seconds:max}])assert.equal(adapter.parse(raw(action)).frames,max*60);
  for(const action of [{keys:[key('w',max+.001)]},{keys:[],wait_seconds:max+.001},{keys:[key('w',.1)],wait_seconds:.1}])assert.throws(()=>adapter.parse(raw(action)));
  for(const value of [0,-1,'0.5',true,null,NaN,Infinity])assert.throws(()=>adapter.parse(raw({keys:[],wait_seconds:value})));
  assert.equal(adapter.parse(raw({keys:[],mouse:{}})).frames,0);
  assert.throws(()=>adapter.parse(raw({keys:[key('w',.1)],maxSeconds:2})));
 }
 assert.throws(()=>baselineParse(raw({keys:[key('w',2)]})));
 assert.equal(baselineParse(raw({keys:[],wait_seconds:1})).frames,60);
 assert.throws(()=>short.parse(raw({keys:[],wait_seconds:1})));
 for(const maxSeconds of [0,.501,5.1,NaN,Infinity])assert.throws(()=>createActionAdapter({maxSeconds}));
});
test('execution rechecks the variant bound before any partial action',async()=>{
 const short=createActionAdapter({maxSeconds:.5});let calls=0,cleanup=0;
 const env={stepSequence:async()=>{calls++;return {advanced:0};},releaseInputs:async()=>{cleanup++;}};
 for(const action of [{keys:[key('w',2)]},{keys:[],wait_seconds:2}])await assert.rejects(short.execute(env,action),/must be in/);
 assert.equal(calls,0);assert.equal(cleanup,2);
});
test('two-second simultaneous inputs expire independently and preserve key continuity',async()=>{
 const long=createActionAdapter({maxSeconds:2});let seen;
 const env={stepSequence:async(chunks,options)=>{seen={chunks,options};return {advanced:120};}};
 const result=await long.execute(env,long.parse(raw({keys:[key('w',2),key('a',.5)],mouse:{move:{dx:20,dy:10}}})));
 assert.deepEqual(seen.chunks,[{keys:['w','a'],frames:30},{keys:['w'],frames:90}]);
 assert.equal(seen.options.preserveKeys,true);assert.deepEqual(seen.options.moveBy,{dx:20,dy:10});assert.equal(result.executedSeconds,2);
 await long.execute(env,long.parse(raw({keys:[],wait_seconds:2})));
 assert.deepEqual(seen.chunks,[{keys:[],frames:120}]);
});
test('static steps still ignore elapsed duration and retain their existing 20-round ceiling',async()=>{
 const long=createActionAdapter({maxSeconds:2});let seen;
 await long.execute({isStatic:true,stepStatic:async a=>{seen=a;return {advanced:0};}},long.parse(raw({keys:[],wait_seconds:2})));
 assert.equal(seen.frames,0);assert.equal(seen.requestedSeconds,0);assert.equal(await staticRoundLimit(),20);
 assert.deepEqual(DURATION_VARIANTS.map(v=>[v.maxSeconds,v.maxRounds]),[[.5,600],[2,300]]);
});
test('frozen-scene format correction uses the selected bound, without adding a model turn',async()=>{
 const short=createActionAdapter({maxSeconds:.5}),calls=[];
 const result=await validatedPolicyReply({messages:[{role:'user',content:'same screenshot'}],parse:short.parse,maxAttempts:3,language:'en',request:async messages=>{
  calls.push(messages);return {raw:raw({keys:[key('w',calls.length===1?1:.5)]})};
 }});
 assert.equal(calls.length,2);assert.match(calls[1].at(-1).content,/0,0.5/);assert.equal(short.parse(result.raw).frames,30);
});
test('prompt variants change only duration rules and examples, and every example is executable',async()=>{
 const original=await fs.readFile(new URL('../scripts/server-eval/system-prompt.en.md',import.meta.url),'utf8');
 for(const max of [.5,2]){
  const prompt=durationPrompt(original,max),adapter=createActionAdapter({maxSeconds:max});
  assert.equal(prompt.slice(0,prompt.indexOf('## Action interface')),original.slice(0,original.indexOf('## Action interface')));
  assert.match(prompt,new RegExp(`at most ${max}, measured`));assert.match(prompt,new RegExp(`at most ${max}, allowed`));
  for(const match of prompt.matchAll(/```json\s*\n([\s\S]*?)\n```/g))adapter.parse(match[1]);
 }
 assert.throws(()=>durationPrompt(original.replace('at most one, measured','template edited'),.5),/template changed/);
});
