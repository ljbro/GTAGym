import test from 'node:test';
import assert from 'node:assert/strict';
import {parse,execute} from '../scripts/server-eval/actions.mjs';
import {ServerEnvironment} from '../scripts/server-eval/environment.mjs';
const decode=a=>parse(JSON.stringify(a));

test('wait is optional, bounded and rounded up to simulation frames',()=>{
 for(const [seconds,frames] of [[.001,1],[.5,30],[.501,31],[1,60]]){
  const a=decode({keys:[],mouse:{},wait_seconds:seconds});
  assert.equal(a.wait_seconds,seconds);assert.equal(a.frames,frames);
  assert.equal(a.requestedSeconds,seconds);assert.equal(a.scheduledSeconds,frames/60);
 }
 assert.equal(decode({keys:[],mouse:{}}).frames,0);
 for(const wait_seconds of [0,-1,1.001,null,'1',true,{},[]])assert.throws(()=>decode({keys:[],wait_seconds}),/wait_seconds/);
 assert.throws(()=>parse('{"keys":[],"wait_seconds":1e999}'),/wait_seconds/);
 assert.throws(()=>decode({keys:[{key:'w',duration_seconds:.1}],wait_seconds:.5}),/requires keys/);
});

test('native wait releases previous keys before time advances and preserves mouse holds',async()=>{
 const env=new ServerEnvironment();env.heldKeys.add('w');env.heldButtons.add('right');let frameCalls=0;
 env.state=async()=>({active:true,complete:false,failed:false,viewport:{width:1280,height:720}});
 env.page={locator:()=>({focus:async()=>{}}),keyboard:{up:async k=>assert.equal(k,'w')},mouse:{up:async()=>{throw Error('unexpected mouse release');}}};
 env.render=async()=>{};
 env.evaluate=async(fn,{frames,keys})=>{assert.deepEqual(keys,[]);assert.equal(env.heldKeys.size,0);assert(env.heldButtons.has('right'));frameCalls++;return frames;};
 const result=await execute(env,decode({keys:[],wait_seconds:.5}));
 assert.equal(result.advanced,30);assert.equal(result.executedSeconds,.5);assert.equal(env.frames,30);
 assert(frameCalls>0);assert.equal(env.heldKeys.size,0);assert(env.heldButtons.has('right'));
});

test('wait may follow instant mouse input; no artificial key is pressed',async()=>{
 let seen;const env={stepSequence:async(chunks,options)=>{seen={chunks,options};return {advanced:30};}};
 const mouse={move:{dx:160,dy:0},buttons:[{button:'right',event:'up'}]};
 await execute(env,decode({keys:[],mouse,wait_seconds:.5}));
 assert.deepEqual(seen.chunks,[{keys:[],frames:30}]);assert.deepEqual(seen.options.moveBy,mouse.move);
 assert.deepEqual(seen.options.buttonEdges,mouse.buttons);assert.equal(seen.options.preserveKeys,true);
});

test('wait revalidates before execution and supports cancellation/early termination',async()=>{
 let calls=0,releases=0;const env={stepSequence:async()=>{calls++;return {advanced:6};},releaseInputs:async()=>{releases++;}};
 await assert.rejects(execute(env,{keys:[],wait_seconds:2}),/wait_seconds/);
 await assert.rejects(execute(env,{keys:[{key:'w',duration_seconds:.1}],wait_seconds:.5}),/requires keys/);
 const ctrl=new AbortController();ctrl.abort(Error('cancelled'));
 await assert.rejects(execute(env,decode({keys:[],wait_seconds:1}),null,{signal:ctrl.signal}),/cancelled/);
 assert.equal(calls,0);assert.equal(releases,3);
 const result=await execute(env,decode({keys:[],wait_seconds:1}));
 assert.equal(result.executedSeconds,.1);assert.equal(result.requestedSeconds,1);
});

test('static wait advances no simulation frames',async()=>{
 let action;const env={isStatic:true,stepStatic:async a=>{action=a;return {advanced:0};}};
 await execute(env,decode({keys:[],mouse:{},wait_seconds:1}));
 assert.deepEqual(action.keys,[]);assert.deepEqual(action.mouse,{});
 assert.equal(action.frames,0);assert.equal(action.requestedSeconds,0);assert.equal(action.scheduledSeconds,0);
});
