import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {createRequire} from 'node:module';
const sharp=createRequire(import.meta.url)('sharp');
import {ModelContext} from '../scripts/server-eval/context.mjs';
import * as adapter from './fixtures/wait-adapter.mjs';
import * as parallelAdapter from '../scripts/server-eval/actions.mjs';
import {runEpisode,frozenEqual} from '../scripts/server-eval/episode.mjs';
import {validatedPolicyReply} from '../scripts/server-eval/policy-retry.mjs';

test('current image counts toward 10; drop 5 whole pairs at 11,16,21; preserve prompts',()=>{
 const context=new ModelContext('shared','task-specific');
 for(let round=1;round<=26;round++){
  const removed=context.observe({round,gameSeconds:round,image:Buffer.from('img'+round)});
  if([11,16,21,26].includes(round))assert.deepEqual(removed,Array.from({length:5},(_,i)=>round-10+i));
  else assert.deepEqual(removed,[]);
  const messages=context.messages();assert.deepEqual(messages[0],{role:'system',content:'shared'});
  assert.equal(messages[1].content[0].text,'task-specific');
  assert.equal(messages[1].content[1].image_url.url,`data:image/jpeg;base64,${Buffer.from('img'+context.rounds[0]).toString('base64')}`);
  const images=messages.filter(m=>Array.isArray(m.content));assert(images.length<=10);assert.equal(images.length,context.rounds.length);
  assert.equal(messages.filter(m=>m.role==='assistant').length,images.length-1);
  assert.equal(messages.at(-1).content.at(-1).image_url.url,`data:image/jpeg;base64,${Buffer.from('img'+round).toString('base64')}`);
  assert.deepEqual(messages.filter(m=>m.role==='user').flatMap(m=>m.content.filter(p=>p.type==='text')),[{type:'text',text:'task-specific'}]);
  assert.equal(messages.filter(m=>m.role==='user'&&!Array.isArray(m.content)).length,0);
  assert.deepEqual(context.messages(),messages,'building messages must not duplicate instruction');
  if(round===11)assert.deepEqual(context.rounds,[6,7,8,9,10,11]);
  context.reply('action'+round);
 }
 assert(!JSON.stringify(context.messages()).includes('action16"'));
});
test('all task modes omit round and time metadata from observations',()=>{
 for(const staticOriginal of [false,true]){
  const context=new ModelContext('shared','instruction',{staticOriginal});
  for(let round=1;round<=12;round++){
   context.observe({round,gameSeconds:round*0.5,image:Buffer.from('frame')});
   const users=context.messages().filter(m=>m.role==='user');
   assert.deepEqual(users[0].content.map(p=>p.type),['text','image_url']);
   for(const user of users.slice(1))assert.deepEqual(user.content.map(p=>p.type),['image_url']);
   context.reply('{}');
  }
 }
});
test('variable-duration placeholder is bounded, not fixed; fixed60 rounds upward only',async()=>{
 for(const invalid of [{action:'teleport',duration_seconds:1},{action:'wait',duration_seconds:0},{action:'wait',duration_seconds:31},{action:'wait',duration_seconds:'1'},{action:'wait',duration_seconds:1,keys:['w']}])assert.throws(()=>adapter.parse(JSON.stringify(invalid)));
 const calls=[],env={step:async(a)=>{calls.push(a.frames);return {advanced:a.frames,state:{active:true}};}};
 const action=adapter.parse('{"action":"wait","duration_seconds":4.25}');
 const result=await adapter.execute(env,action);assert.deepEqual(calls,[120,120,15]);assert.equal(result.executedSeconds,4.25);
 assert.equal(adapter.parse('{"action":"wait","duration_seconds":0.001}').frames,1);
});
test('freeze guard includes simulation, animation and actor',()=>{
 const s={elapsed:1,worldTime:9,animationTime:100,actor:{x:3}};assert(frozenEqual(s,{...s}));
 for(const key of ['elapsed','worldTime','animationTime','actor'])assert(!frozenEqual(s,{...s,[key]:123}));
});

class FakeEnvironment {
 constructor(image){this.image=image;this.frames=0;this.errors=[];this.failedResources=[];this.closed=false;}
 async open(){return {renderer:'test-fixture',executionHost:'server'};}
 async reset(){}
 async state(){return {active:true,complete:false,failed:false,elapsed:this.frames/60,worldTime:this.frames/60,animationTime:this.frames*1000/60,actor:{x:this.frames,z:0}};}
 async assertFrozen(){return true;}
 async observe(){return this.image;}
 async step(a,{onFrame}={}){for(let i=0;i<a.frames;i++){this.frames++;if(this.frames%6===0)await onFrame?.(this.image,this.frames/60);}return {advanced:a.frames,state:await this.state()};}
 async close(){this.closed=true;}
}
async function fixture(t){const output=await fs.mkdtemp(path.join(os.tmpdir(),'gta-eval-test-'));t.after(()=>fs.rm(output,{recursive:true}));return {output,image:await sharp({create:{width:128,height:72,channels:3,background:'#336699'}}).jpeg().toBuffer()};}
function entry(archive,name){return execFileSync('tar',['-xOzf',archive,name],{maxBuffer:16*1024*1024});}
test('episode omits cursor from model input but preserves it in the archive',async t=>{
 const {output,image}=await fixture(t),env=new FakeEnvironment(image),baseState=env.state.bind(env);let calls=0;
 env.state=async()=>({...await baseState(),mousePosition:{x:640+env.frames,y:360}});
 const result=await runEpisode({env,taskId:'c07-n04',system:'MD only',instruction:'task',metadata:{language:'en'},adapter,maxRounds:2,output,name:'cursor-text',policy:async messages=>{
  calls++;const user=messages.at(-1),text=user.content.filter(p=>p.type==='text').map(p=>p.text);
  assert.deepEqual(text,calls===1?['task']:[]);
  assert.equal(user.content.at(-1).image_url.url,'data:image/jpeg;base64,'+image.toString('base64'));
  return {raw:'{"action":"wait","duration_seconds":0.1}'};
 }});
 assert.equal(result.status,'round_limit',result.error);assert.equal(calls,2);
 const archive=path.join(output,'cursor-text.tar.gz');
 assert.deepEqual(entry(archive,'observations/000001.jpg'),image);
 assert.deepEqual(JSON.parse(entry(archive,'rounds/000002.json')).before.mousePosition,{x:646,y:360});
});
test('12 turns archive all images/replies despite pruning; video H264; bounded temporary storage',async t=>{
 const {output,image}=await fixture(t),env=new FakeEnvironment(image);let calls=0;
 const result=await runEpisode({env,taskId:'c07-n04',system:'shared',instruction:'unique task',adapter,maxRounds:12,output,name:'episode',policy:async messages=>{
  calls++;assert.equal(messages[1].content[0].text,'unique task');
  const expected=calls>10?calls-5:calls;assert.equal(messages.filter(m=>Array.isArray(m.content)).length,expected);
  const before=await env.state();await new Promise(r=>setTimeout(r,10));assert.deepEqual(await env.state(),before);
  return {raw:JSON.stringify({action:'wait',duration_seconds:calls%2?.1:.3}),usage:{total_tokens:2}};
 }});
 assert.equal(calls,12);assert.equal(result.status,'round_limit');assert.equal(result.simulatedSeconds,2.4);assert(env.closed);
 assert.deepEqual(await fs.readdir(output),['episode.tar.gz']);
 const archive=path.join(output,'episode.tar.gz'),names=execFileSync('tar',['-tzf',archive],{encoding:'utf8'}).trim().split('\n');
 assert.equal(names.filter(n=>/^observations\/\d+\.jpg$/.test(n)).length,12);
 assert.equal(names.filter(n=>/^rounds\//.test(n)).length,12);
 const first=JSON.parse(entry(archive,'rounds/000001.json')),eleventh=JSON.parse(entry(archive,'rounds/000011.json'));
 assert.equal(first.reply,'{"action":"wait","duration_seconds":0.1}');assert.deepEqual(eleventh.prunedRounds,[1,2,3,4,5]);assert.deepEqual(eleventh.contextRounds,[6,7,8,9,10,11]);
 const video=entry(archive,'episode.mp4');
 const probe=JSON.parse(execFileSync('ffprobe',['-v','error','-show_streams','-show_format','-of','json','pipe:0'],{input:video,encoding:'utf8'}));
 assert.equal(probe.streams[0].codec_name,'h264');assert.equal(probe.streams[0].pix_fmt,'yuv420p');
 assert.equal(Number(probe.streams[0].nb_frames),25);
 assert.equal(JSON.parse(entry(archive,'result.json')).rounds,12);
});
test('external harness receives only new image observations and owns history; initial overlay is archived',async t=>{
 const {output,image}=await fixture(t),env=new FakeEnvironment(image);
 const labelled=await sharp({create:{width:128,height:72,channels:3,background:'#bdbd43'}}).jpeg().toBuffer();
 let calls=0,transforms=0;
 const result=await runEpisode({env,taskId:'c01-n04',system:'private system',instruction:'private task objective',adapter,
  maxRounds:12,output,name:'external',checkpoint:true,contextMode:'external',
  observationTransform:async(raw,{round,mimeType})=>{transforms++;assert.equal(mimeType,'image/jpeg');return round===1?labelled:raw;},
  policy:async messages=>{
   calls++;assert.equal(messages.length,1);assert.equal(messages[0].role,'user');
   assert.deepEqual(messages[0].content.map(part=>part.type),['image_url']);
   assert.equal(messages[0].content[0].image_url.url,'data:image/jpeg;base64,'+(calls===1?labelled:image).toString('base64'));
   assert(!JSON.stringify(messages).includes('private task objective'));
   return {raw:'{"action":"wait","duration_seconds":0.1}'};
  }});
 assert.equal(result.status,'round_limit',result.error);assert.equal(calls,12);assert.equal(transforms,12);
 const archive=path.join(output,'external.tar.gz');
 assert.deepEqual(entry(archive,'observations/000001.jpg'),labelled);assert.deepEqual(entry(archive,'observations/000002.jpg'),image);
 for(const n of [1,11,12]){
  const record=JSON.parse(entry(archive,`rounds/${String(n).padStart(6,'0')}.json`));
  assert.deepEqual(record.prunedRounds,[]);assert.deepEqual(record.contextRounds,[n]);assert.equal(record.contextManagement,'external-harness');
 }
 assert.equal(JSON.parse(entry(archive,'config.json')).contextMode,'external');
});
test('invalid model action archives original response and final screenshot without executing',async t=>{
 const {output,image}=await fixture(t),env=new FakeEnvironment(image);
 const result=await runEpisode({env,taskId:'c07-n04',system:'s',instruction:'i',adapter,maxRounds:2,output,name:'bad',policy:async()=>({raw:'not json'})});
 assert.equal(result.status,'error');assert.equal(env.frames,0);assert(env.closed);
 assert.equal(JSON.parse(entry(path.join(output,'bad.tar.gz'),'rounds/000001.json')).reply,'not json');
});
test('format correction archives every attempt while the game stays at the same observation',async t=>{
 const {output,image}=await fixture(t),env=new FakeEnvironment(image);let calls=0;
 const raw='{"action":"wait","duration_seconds":0.1}';
 const result=await runEpisode({env,taskId:'c07-n04',system:'s',instruction:'i',adapter,maxRounds:1,output,name:'retry',policy:async messages=>validatedPolicyReply({messages,parse:adapter.parse,request:async()=>{
  assert.equal(env.frames,0);calls++;return {raw:calls===1?'explanation\n'+raw:raw};
 }})});
 assert.equal(result.status,'round_limit');assert.equal(result.rounds,1);assert.equal(env.frames,6);assert.equal(calls,2);
 const record=JSON.parse(entry(path.join(output,'retry.tar.gz'),'rounds/000001.json'));
 assert.equal(record.attempts.length,2);assert(record.attempts[0].validationError);assert.equal(record.attempts[1].raw,raw);assert.equal(record.freezeVerified,true);
});
for(const correctOnThird of [true,false])test(`out-of-bounds mouse gets three frozen attempts; correction succeeds=${correctOnThird}`,async t=>{
 const {output,image}=await fixture(t),env=new FakeEnvironment(image);let calls=0,executions=0;
 const replies=[
  {keys:[{key:'w',duration_seconds:.2}],mouse:{move:{dx:0,dy:-361}}},
  {keys:[{key:'w',duration_seconds:.2}],mouse:{move:{dx:641,dy:0}}},
  {keys:[{key:'w',duration_seconds:.2}],mouse:{move:{dx:0,dy:correctOnThird?-359:-361}}},
 ].map(a=>JSON.stringify(a));
 env.stepSequence=async(inputs,options)=>{
  executions++;assert.equal(calls,3);assert.deepEqual(options.moveBy,{dx:0,dy:-359});
  let advanced=0;for(const input of inputs)advanced+=(await env.step(input,options)).advanced;
  return {advanced,state:await env.state()};
 };
 const result=await runEpisode({env,taskId:'c09-n01',system:'English system',instruction:'Enter the vault',adapter:parallelAdapter,maxRounds:1,output,name:'bounds',policy:async messages=>validatedPolicyReply({
  messages,parse:parallelAdapter.parse,language:'en',request:async current=>{
   assert.equal(env.frames,0);assert.equal(executions,0);
   if(calls){assert.match(current.at(-1).content,/still paused/);assert.match(current.at(-1).content,/-640.*640.*-360.*360/);}
   assert.deepEqual(current.filter(m=>Array.isArray(m.content)),messages.filter(m=>Array.isArray(m.content)));
   return {raw:replies[calls++]};
  },
 })});
 assert.equal(calls,3);assert.equal(executions,correctOnThird?1:0);assert.equal(env.frames,correctOnThird?12:0);
 assert.equal(result.status,correctOnThird?'round_limit':'error');
 if(!correctOnThird)assert.match(result.error,/Invalid action after 3 format attempts/);
 const record=JSON.parse(entry(path.join(output,'bounds.tar.gz'),'rounds/000001.json'));
 assert.equal(record.attempts.length,3);assert.deepEqual(record.attempts.map(a=>a.raw),replies);
 assert.equal(record.attempts.filter(a=>a.validationError).length,correctOnThird?2:3);
});
test('fenced parallel actions execute once per round and retain original replies',async t=>{
 const {output,image}=await fixture(t),env=new FakeEnvironment(image);
 const raw='```json\n{"keys":[{"key":"w","duration_seconds":0.1}]}\n```';let calls=0;
 env.stepSequence=async(inputs,options)=>{let advanced=0;for(const input of inputs)advanced+=(await env.step(input,options)).advanced;return {advanced,state:await env.state()};};
 const result=await runEpisode({env,taskId:'c01-n04',system:'s',instruction:'i',adapter:parallelAdapter,maxRounds:2,output,name:'fenced',policy:async messages=>{
  calls++;if(calls===2)assert.equal(messages.find(m=>m.role==='assistant').content,raw);
  return {raw};
 }});
 assert.equal(calls,2);assert.equal(result.rounds,2);assert.equal(result.status,'round_limit');assert.equal(env.frames,12);
 const record=JSON.parse(entry(path.join(output,'fenced.tar.gz'),'rounds/000001.json'));
 assert.equal(record.reply,raw);assert.equal(record.action.keys[0].key,'w');assert.equal(record.transition.advanced,6);
});
test('inference drift fails closed before actions and retains forensic record',async t=>{
 const {output,image}=await fixture(t),env=new FakeEnvironment(image);
 const result=await runEpisode({env,taskId:'c07-n04',system:'s',instruction:'i',adapter,maxRounds:2,output,name:'drift',policy:async()=>{env.frames++;return {raw:'{"action":"wait","duration_seconds":1}'};}});
 assert.equal(result.status,'error');assert.match(result.error,/drift/);assert.equal(env.frames,1);
});
test('model transport failure still produces readable archive',async t=>{
 const {output,image}=await fixture(t),env=new FakeEnvironment(image);
 const result=await runEpisode({env,taskId:'c07-n04',system:'s',instruction:'i',adapter,maxRounds:2,output,name:'network',policy:async()=>{throw Error('model timeout');}});
 assert.equal(result.status,'error');assert.equal(result.error,'model timeout');
 assert.equal(JSON.parse(entry(path.join(output,'network.tar.gz'),'rounds/000001.json')).error,'model timeout');
});
test('failed browser launch keeps diagnostics, no invented video or game success',async t=>{
 const {output,image}=await fixture(t),env=new FakeEnvironment(image);
 env.open=async()=>{throw Error('WebGL not available');};env.state=async()=>{throw Error('not ready');};
 const result=await runEpisode({env,taskId:'c07-n04',system:'s',instruction:'i',adapter,maxRounds:2,output,name:'launch',policy:async()=>{throw Error('must not call');}});
 assert.equal(result.status,'error');assert.equal(result.video,null);assert.equal(result.rounds,0);assert(env.closed);
 assert.equal(JSON.parse(entry(path.join(output,'launch.tar.gz'),'result.json')).error,'WebGL not available');
});
test('success during a long action stops executor early and bypasses round budget',async t=>{
 const {output,image}=await fixture(t),env=new FakeEnvironment(image),originalState=env.state.bind(env),originalStep=env.step.bind(env);
 env.state=async()=>({...await originalState(),active:env.frames<6,complete:env.frames>=6});
 env.step=(action,options)=>originalStep({...action,frames:Math.min(action.frames,6-env.frames)},options);
 const result=await runEpisode({env,taskId:'c07-n04',system:'s',instruction:'i',adapter,maxRounds:2,output,name:'success',policy:async()=>({raw:'{"action":"wait","duration_seconds":10}'})});
 assert.equal(result.status,'success');assert(result.success);assert.equal(result.rounds,1);assert.equal(result.simulatedSeconds,.1);
});
test('episode cleanup releases a previous-round hold on budget, model error, invalid JSON and cancellation',async t=>{
 for(const scenario of ['budget','model-error','invalid-json','cancel']){
  const {output,image}=await fixture(t),env=new FakeEnvironment(image),controller=new AbortController();
  let held=[],released=0;
  env.releaseInputs=async()=>{held=[];released++;};
  env.stepSequence=async(chunks,options)=>{assert(options.preserveKeys);for(const c of chunks){held=c.keys;await env.step(c,options);}return {advanced:chunks.reduce((sum,c)=>sum+c.frames,0),state:await env.state(),heldKeys:held};};
  const result=await runEpisode({env,taskId:'c07-n04',system:'s',instruction:'i',adapter:parallelAdapter,maxRounds:scenario==='budget'?1:2,output,name:scenario,signal:controller.signal,
   onEvent:()=>{if(scenario==='cancel')controller.abort(Error('stop'));},
   policy:async(_messages,{round})=>{
    if(round===2){assert.deepEqual(held,['w']);if(scenario==='model-error')throw Error('model timeout');return {raw:'invalid JSON'};}
    return {raw:'{"keys":[{"key":"w","duration_seconds":0.1}]}'};
   }});
  assert.equal(result.status,scenario==='budget'?'round_limit':scenario==='cancel'?'interrupted':'error');
  assert.deepEqual(held,[]);assert(released>=1);assert(env.closed);
 }
});
