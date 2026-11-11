import test from 'node:test';
import assert from 'node:assert/strict';
import {parse,execute} from '../scripts/server-eval/actions.mjs';
import {ServerEnvironment} from '../scripts/server-eval/environment.mjs';
const decode=input=>parse(JSON.stringify(input));
test('empty mouse is valid, nested edges work, old top-level buttons is rejected',()=>{
 for(const mouse of [{},{buttons:[]}])assert.equal(decode({keys:[],mouse}).frames,0);
 const mouse={buttons:[{button:'right',event:'down'}]};
 assert.deepEqual(decode({keys:[],mouse}).mouse,mouse);
 for(const buttons of [[],[{button:'left',event:'down'}]])assert.throws(()=>decode({keys:[],mouse:{},buttons}),/unknown field buttons/);
 for(const buttons of [null,'left',[{button:'left',event:'down',extra:1}],[{button:'left',event:'down'},{button:'left',event:'up'}]])assert.throws(()=>decode({keys:[],mouse:{buttons}}));
 assert.throws(()=>decode({keys:[],mouse:{move:{dx:-639,dy:359},scroll:{direction:'up',steps:1},buttons:[]}}),/cannot combine/);
});
test('nested buttons reach native executor and no-op has zero frames',async()=>{
 const calls=[],env={stepSequence:async(chunks,options)=>{calls.push({chunks,options});return {advanced:0};}};
 const edge={button:'right',event:'down'};
 await execute(env,decode({keys:[],mouse:{buttons:[edge]}}));
 assert.deepEqual(calls[0].options.buttonEdges,[edge]);assert.equal(calls[0].options.preserveKeys,true);
 const result=await execute(env,decode({keys:[],mouse:{}}));
 assert.deepEqual(calls[1].chunks,[]);assert.equal(result.executedSeconds,0);
 assert(!Object.hasOwn(calls[1].options,'buttonEdges'));
});
test('static executor strips keyboard/time but preserves mouse operations',async()=>{
 let seen;const env={isStatic:true,stepStatic:async a=>{seen=a;return {advanced:0};}};
 const mouse={move:{dx:60,dy:20},buttons:[{button:'right',event:'down'}]};
 await execute(env,decode({keys:[{key:'Shift',duration_seconds:1}],mouse}));
 assert.deepEqual(seen.keys,[]);assert.deepEqual(seen.mouse,mouse);
 assert.equal(seen.frames,0);assert.equal(seen.requestedSeconds,0);assert.equal(seen.scheduledSeconds,0);
 await assert.rejects(()=>execute(env,{keys:[],buttons:[]}),/unknown field buttons/);
});
test('native no-op releases keys but keeps held mouse buttons, with no frame advance',async()=>{
 const env=new ServerEnvironment();let renders=0;
 env.ready=true;env.heldKeys.add('w');env.heldButtons.add('right');
 env.state=async()=>({active:true,viewport:{width:1280,height:720}});
 env.page={locator:()=>({focus:async()=>{}}),keyboard:{up:async k=>assert.equal(k,'w')},mouse:{up:async()=>{throw Error('Must not release held mouse button');}}};
 env.render=async()=>{renders++;};
 const result=await execute(env,decode({keys:[],mouse:{}}));
 assert.equal(env.heldKeys.size,0);assert(env.heldButtons.has('right'));
 assert.equal(result.advanced,0);assert.equal(env.frames,0);assert.equal(renders,1);
});
