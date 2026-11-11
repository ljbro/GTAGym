import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {parse,execute,description,smokeAction,LIMITS} from '../scripts/server-eval/actions.mjs';
import {KEYS} from '../scripts/server-eval/protocol.mjs';
const key=(key,duration_seconds=.1)=>({key,duration_seconds});
const decode=value=>parse(JSON.stringify(value));

test('parallel inputs normalize aliases and use the longest duration, not the sum',()=>{
 const a=decode({keys:[key('W',1),key('Space'),key('Ctrl',.9)],mouse:{move:{dx:120,dy:30}}});
 assert.deepEqual(a.keys.map(k=>k.key),['w','Space','Control']);
 assert.equal(a.frames,60);assert.equal(a.requestedSeconds,1);assert.deepEqual(a.mouse,{move:{dx:120,dy:30}});
 assert.equal(decode({keys:KEYS.map(k=>key(k,1))}).frames,60);
 assert.equal(LIMITS.maxSeconds,1);
 assert.match(description,/Plain Text JSON/i);
});
test('instant mouse-only rounds have zero duration; only keys define time',()=>{
 assert.equal(decode(smokeAction(1)).frames,6);
 assert.equal(decode({keys:[],mouse:{move:{dx:-640,dy:360}}}).frames,0);
 const a=decode({keys:[key('w',.5)],mouse:{move:{dx:639,dy:-359}}});
 assert.equal(a.frames,30);assert(!Object.hasOwn(a,'duration_seconds'));
 assert.equal(decode({keys:[]}).frames,0);
 for(const duration_seconds of [0,1,2,3,null])assert.throws(()=>decode({keys:[key('w',1)],duration_seconds}),/unknown field duration_seconds/);
});
test('independent durations round up to 60 Hz within a one-second round',()=>{
 const a=decode({keys:[key('w',.001),key('a',.02)]});
 assert.deepEqual(a.keys.map(k=>k.frames),[1,2]);assert.equal(a.frames,2);
 assert.equal(decode({keys:[key('w',.501),key('a',.499)]}).frames,31);
 assert.equal(decode({keys:[key('w',.99999)]}).frames,60);
 for(const d of [0,-1,1.0000001,1.001,2,5,'1',null]){
  assert.throws(()=>decode({keys:[key('w',d)]}),/must be in \(0,1\]/);
  assert.throws(()=>decode({keys:[],mouse:{move:{dx:-640,dy:360},duration_seconds:d}}),/unknown field duration_seconds/);
 }
});
test('relative mouse bounds are symmetric, finite, and rejected without clipping',()=>{
 for(const move of [{dx:641,dy:0},{dx:-641,dy:0},{dx:0,dy:361},{dx:0,dy:-361},{dx:640.01,dy:0},{dx:0,dy:-360.01},{dx:1e9,dy:1e9}]){
  assert.throws(()=>decode({keys:[key('w',.2)],mouse:{move}}),/outside displacement range/);
 }
 for(const move of [{dx:0,dy:0},{dx:640,dy:360},{dx:-640,dy:-360},{dx:-639.9,dy:359.9}]){
  assert.deepEqual(decode({keys:[],mouse:{move}}).mouse.move,move);
 }
 for(const move of [null,{},[],{dx:0},{dx:'0',dy:0},{dx:Infinity,dy:0},{dx:0,dy:NaN},{dx:0,dy:0,x:0}])assert.throws(()=>decode({keys:[],mouse:{move}}));
 assert.throws(()=>decode({keys:[],mouse:{move_to:{x:700,y:340}}}),/unknown field move_to/);
});
test('reject old sequences, malformed envelopes, prose and oversized replies',()=>{
 for(const raw of ['',null,'null','[]','{}','{"actions":[{"keys":["w"],"duration_seconds":1}]}','{"keys":["w"],"duration_seconds":1}','{"keys":[],"duration_seconds":1} trailing',' '.repeat(16385),'{"keys":[],"duration_seconds":1e999}'])assert.throws(()=>parse(raw));
});
test('accept one whole-reply JSON code fence without relaxing action validation',()=>{
 const raw='{"keys":[{"key":"w","duration_seconds":1}],"mouse":{"move":{"dx":-640,"dy":360}}}';
 for(const tag of ['json','JSON',''])for(const newline of ['\n','\r\n']){
  assert.deepEqual(parse(' \n```'+tag+newline+raw+newline+'```\n '),parse(raw));
 }
 for(const bad of [
  'Here is the action:\n```json\n'+raw+'\n```',
  '```json\n'+raw+'\n```\nExplanation',
  '```json\n'+raw+'\n```\n```json\n'+raw+'\n```',
  '```javascript\n'+raw+'\n```',
  '```json\n'+raw, '```json\n'+raw+'\n``',
  '```json\n'+raw+'\n'+raw+'\n```',
  '```json\n'+raw+' '.repeat(16384)+'\n```',
 ])assert.throws(()=>parse(bad));
 assert.throws(()=>parse('```json\n{"keys":[{"key":"Escape","duration_seconds":1}]}\n```'),/Invalid keys/);
 assert.throws(()=>parse('```json\n{"keys":[],"duration_seconds":1}\n```'),/unknown field/);
 assert.throws(()=>parse('```json\n{"keys":[{"key":"w","duration_seconds":6}]}\n```'),/must be in/);
});
test('reject unknown fields, duplicate aliases, invalid mouse and unsupported keys',()=>{
 const base={keys:[key('w')]};
 for(const bad of [
  {...base,buttons:['left']},{...base,start_seconds:0},{keys:[{...key('w'),start_seconds:0}]},
  {keys:null},{keys:[null]},{keys:[{}]},{keys:[key(5)]},{keys:[key('w'),key('W')]},{keys:[key('Ctrl'),key('Control')]},
  ...['Escape','r','5','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].map(k=>({keys:[key(k)]})),
  ...[null,{dx:1,dy:0},{dx:1,duration_seconds:1},{dx:641,dy:0,duration_seconds:1},{dx:'1',dy:0,duration_seconds:1},{dx:0,dy:0,duration_seconds:1,x:0},{dx:0,dy:0,duration_seconds:0}].map(mouse=>({...base,mouse})),
  ...[null,{},[],{x:0},{x:'0',y:0},{x:-1,y:0},{x:0,y:-1},{x:0,y:0,z:0}].map(move_to=>({...base,mouse:{move_to}})),
 ])assert.throws(()=>decode(bad));
 assert.throws(()=>parse('{"keys":[],"mouse":{"dx":1e999,"dy":0,"duration_seconds":1}}'));
 for(const k of ['ArrowUp','ArrowDown','ArrowLeft','ArrowRight'])assert(!description.includes(k));
});
test('executor splits only at key deadlines and sends one instant move before the sequence',async()=>{
 let chunks;const signal=new AbortController().signal,onFrame=()=>{};
 const env={async stepSequence(inputs,options){chunks=inputs;assert.equal(options.signal,signal);assert.equal(options.onFrame,onFrame);assert.equal(options.preserveKeys,true);assert.deepEqual(options.moveBy,{dx:120,dy:30});return {advanced:60};}};
 const result=await execute(env,decode({keys:[key('w',1),key('Space',.1)],mouse:{move:{dx:120,dy:30}}}),onFrame,{signal});
 assert.deepEqual(chunks.map(c=>c.frames),[6,54]);
 assert.deepEqual(chunks.map(c=>c.keys),[['w','Space'],['w']]);
 assert(chunks.every(c=>!Object.hasOwn(c,'mouse')));
 assert.equal(result.executedSeconds,1);assert.equal(result.requestedSeconds,1);
});
test('mouse-only execution has no keyboard chunks; independent deadlines stay bounded',async()=>{
 let chunks;const env={async stepSequence(inputs){chunks=inputs;return {advanced:inputs.reduce((n,c)=>n+c.frames,0)};}};
 await execute(env,decode({keys:[key('w',.1),key('a',1)],mouse:{move:{dx:510,dy:0}}}));
 assert.deepEqual(chunks.map(c=>c.frames),[6,54]);
 assert.deepEqual(chunks.map(c=>c.keys),[['w','a'],['a']]);
 const result=await execute(env,decode({keys:[],mouse:{move:{dx:510,dy:0}}}));
 assert.deepEqual(chunks,[]);assert.equal(result.executedSeconds,0);assert.equal(result.scheduledSeconds,0);
 await execute(env,decode({keys:KEYS.map((k,i)=>key(k,(i+1)/60))}));
 assert.equal(chunks.length,KEYS.length);assert.equal(chunks[0].keys.length,KEYS.length);
});
test('invalid later input or cancellation never executes any prefix',async()=>{
 let called=false;const env={stepSequence(){called=true;}};
 await assert.rejects(execute(env,{keys:[key('w')],duration_seconds:1}),/unknown field duration_seconds/);assert(!called);
 for(const bad of [{keys:[key('w')],mouse:null},{keys:[key('w')],mouse:{buttons:['left']}},{keys:[{...key('w'),delay:0}]}]){
  await assert.rejects(execute(env,bad));assert(!called);
 }
 for(const k of ['Escape','ArrowUp','ArrowDown','ArrowLeft','ArrowRight']){
  await assert.rejects(execute(env,{keys:[key('w'),key(k)]}),/Invalid keys/);assert(!called);
 }
 const controller=new AbortController();controller.abort(Error('stop'));
 await assert.rejects(execute(env,decode({keys:[key('w')]}),null,{signal:controller.signal}),/stop/);assert(!called);
});
test('execution independently rejects overlong keys and mouse without clipping',async()=>{
 let calls=0,releases=0;
 const env={stepSequence(){calls++;},releaseInputs(){releases++;}};
 await assert.rejects(execute(env,{keys:[key('w',1.01)]}),/must be in \(0,1\]/);
 await assert.rejects(execute(env,{keys:[key('w',.1)],mouse:{move:{dx:-640,dy:360},duration_seconds:1}}),/unknown field duration_seconds/);
 await assert.rejects(execute(env,{keys:[key('w',.2)],mouse:{move:{dx:0,dy:-361}}}),/outside displacement range/);
 assert.equal(calls,0);assert.equal(releases,3);
});
test('all Markdown protocol examples parse, and documented keys match the whitelist',()=>{
 const md=readFileSync(new URL('../scripts/server-eval/system-prompt.md',import.meta.url),'utf8');
 const examples=[...md.matchAll(/\`\`\`json\n([\s\S]*?)\n\`\`\`/g)];assert(examples.length>=1);
 for(const example of examples)parse(example[1]);
 for(const k of KEYS)assert(md.includes('\`'+k+'\`'),k);
 assert(!/ArrowUp|ArrowDown|ArrowLeft|ArrowRight/.test(md));
});
