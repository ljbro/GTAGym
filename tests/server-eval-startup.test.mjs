import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {ServerEnvironment} from '../scripts/server-eval/environment.mjs';

function fixture(task,paused=false,dialogReason=''){
 const env=new ServerEnvironment();let disposed=false,focused=false;
 env.evaluate=async()=>'';
 env.page={waitForFunction:async(fn,id)=>{
  const result=vm.runInNewContext(`(${fn.toString()})(${JSON.stringify(id)})`,{
   window:{__SHENCHENGJI_CITY__:{stats:{nativeTask:task},world:{paused}}},
   document:{querySelector:()=>({textContent:dialogReason})},
  });
  assert(result,'fixture must reach a terminal startup condition');
  return {jsonValue:async()=>result,dispose:async()=>{disposed=true;}};
 },locator:()=>({focus:async()=>{focused=true;}})};
 env.render=async()=>{};env.state=async()=>task;
 return {env,disposed:()=>disposed,focused:()=>focused};
}

test('scene preparation failure reports the actual reason, releases handle and never focuses game',async()=>{
 const f=fixture({taskId:'c04-n10',failed:true,active:false,reason:'native terrain intrudes into channel'},true);
 await assert.rejects(f.env.reset('c04-n10'),/Task c04-n10 failed to start: native terrain intrudes into channel/);
 assert(f.disposed());assert(!f.focused());
});
test('unexpected terminal startup and missing failure reason fail immediately',async()=>{
 for(const state of [{failed:true},{complete:true}]){
  const f=fixture({taskId:'c04-n10',active:false,...state},true);
  await assert.rejects(f.env.reset('c04-n10'),/failed to start:/);assert(f.disposed());
 }
});
test('production snapshot without reason uses the result dialog text',async()=>{
 const f=fixture({taskId:'c04-n10',failed:true,active:false},true,"Native terrain intrudes into the channel bed");
 await assert.rejects(f.env.reset('c04-n10'),/failed to start: Native terrain intrudes into the channel bed/i);
});
test('ready task still initializes normally',async()=>{
 const task={taskId:'c04-n10',active:true,failed:false,complete:false};
 const f=fixture(task);assert.equal(await f.env.reset('c04-n10'),task);assert(f.focused());assert(f.disposed());
});
