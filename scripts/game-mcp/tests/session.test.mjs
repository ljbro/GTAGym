import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {setTimeout as sleep} from 'node:timers/promises';
import {createRequire} from 'node:module';
import {HostObservations} from '../observation-host.mjs';
import {modelMcpMessage} from '../public-observation.mjs';
import {GameSession} from '../session.mjs';
import {createGameServer,actionSchema,toolResult} from '../tools.mjs';
import {prepareInitialObservation,waitForInitialObservation,initialUserMessage} from '../bootstrap.mjs';
import {Client} from '@modelcontextprotocol/client';
import {InMemoryTransport} from '@modelcontextprotocol/server';

const sharp=createRequire(import.meta.url)('sharp');
const image=await sharp({create:{width:1280,height:720,channels:3,background:'#356a84'}}).jpeg().toBuffer();
async function fixture(t,{maxRounds=4,delay=0,finish=false,failure=false,crash=false,maxCalls=1000,slowStart=0}={}){
 const directory=await fs.mkdtemp(path.join(os.tmpdir(),'gtabench-mcp-test-'));
 const env={frames:0,steps:[],errors:[],failedResources:[],observe:async()=>image,closed:false,close:async()=>{env.closed=true;}};
 const options={taskId:'c01-n04',instruction:'Drive to the destination.',system:'MD rules',language:'en',seed:1234,
  output:path.join(directory,'run'),maxRounds,maxCalls,renderer:'gpu',quality:'low',videoFPS:10,crf:28,url:'http://127.0.0.1:4200/',agentLabel:'test'};
 const runner=async({policy,maxRounds,onEvent,signal,env,contextMode,observationTransform})=>{
  assert.equal(contextMode,'external');
  await sleep(slowStart);
  for(let round=1;round<=maxRounds;round++){
   try{
    if(crash)throw Error('Private error: player.x=-1234 secret.internal http://127.0.0.1:9222');
    const observed=await observationTransform(image,{round,mimeType:'image/jpeg'});
    const response=await policy([{role:'user',content:[{type:'image_url',image_url:{url:'data:image/jpeg;base64,'+observed.toString('base64')}}]}],{round,signal});
    await sleep(delay);const action=JSON.parse(response.raw);env.steps.push(action);
    env.frames+=Math.ceil(60*Math.max(action.wait_seconds??0,...action.keys.map(k=>k.duration_seconds)));
    onEvent({event:'round',round,taskId:options.taskId});
    if(finish||failure)break;
   }catch(error){return {taskId:options.taskId,rounds:env.steps.length,status:signal.aborted?'interrupted':'error',error:error.message,success:false,privatePosition:{x:-1234}};}
  }
  await env.close();return {taskId:options.taskId,rounds:env.steps.length,status:finish?'success':failure?'task_failure':'round_limit',success:finish,actor:{x:-1234},elapsed:1};
 };
 const session=new GameSession(options,{episodeRunner:runner,environmentFactory:async()=>env});
 t.after(async()=>{await session.close('test_end');await fs.rm(directory,{recursive:true,force:true});});
 return {session,env,options};
}
const step=(observation,id='a',action={keys:[{key:'w',duration_seconds:1}]})=>({request_id:id,observation_id:observation.metadata.observation_id,action});

test('trusted hold preserves the exact observation, counters, inputs and original receipt',async t=>{
 const {session,env,options}=await fixture(t,{delay:30});
 env.state=async()=>({elapsed:env.frames/60,worldTime:env.frames/60,animationTime:env.frames,actor:{x:env.frames,z:0},mode:'car',paused:false,replayState:{},mousePosition:{x:640,y:360}});
 env.assertFrozen=async()=>true;env.heldKeys=new Set(['w']);env.heldButtons=new Set(['right']);
 const first=await session.observe(),request=step(first),inFlight=session.step(request),holding=session.hold();
 const result=await inFlight,held=await holding;assert.equal(env.steps.length,1);assert.deepEqual(held.snapshot,result);
 assert.equal(session.held,true);await assert.rejects(session.step(step(result,'b')),e=>e.code==='SESSION_HELD');
 const saved=JSON.parse(await fs.readFile(path.join(options.output,'held-state.json')));
 assert.equal(saved.sessionId,session.id);assert.equal(saved.calls,1);assert.deepEqual(saved.heldKeys,['w']);assert.deepEqual(saved.heldButtons,['right']);
 assert.deepEqual(await session.resumeHeld(),result);assert.equal(session.calls,1);
 assert.deepEqual(await session.step(request),result);assert.equal(env.steps.length,1);assert.equal(session.calls,2);
});
test('a preserved game that drifted is never silently resumed',async t=>{
 const {session,env}=await fixture(t);env.state=async()=>({elapsed:env.frames,actor:{x:env.frames}});env.assertFrozen=async()=>true;
 await session.observe();await session.hold();env.frames++;
 await assert.rejects(session.resumeHeld(),/drifted/);assert.equal(session.held,true);
});
test('preserved key/button state must match before reconnection',async t=>{
 const {session,env}=await fixture(t);env.state=async()=>({elapsed:0,actor:{x:0}});env.assertFrozen=async()=>true;
 env.heldKeys=new Set(['w']);env.heldButtons=new Set(['right']);
 await session.observe();await session.hold();env.heldButtons.clear();
 await assert.rejects(session.resumeHeld(),/inputs drifted/);assert.equal(session.held,true);
});

test('lazy startup and repeated observe return the same paused image, with no hidden telemetry',async t=>{
 const {session,env}=await fixture(t);assert.equal(session.started,false);
 const first=await session.observe();await sleep(20);const again=await session.observe();
 assert.deepEqual(again,first);assert.equal(env.frames,0);assert.equal(first.metadata.instruction,undefined);
 assert.deepEqual(Object.keys(first.metadata).sort(),['done','height','observation_id','outcome','task_id','width']);
 assert.notEqual(first.image,image.toString('base64'),'first image contains the objective overlay');
 assert(!JSON.stringify(first.metadata).includes('Drive to the destination.'));
 assert(!JSON.stringify(first).includes('actor'));assert(!JSON.stringify(first).includes('elapsed'));
});
test('independent durations and relative mouse/buttons pass through without a second protocol',async t=>{
 const {session,env}=await fixture(t);const first=await session.observe();
 const action={keys:[{key:'w',duration_seconds:1},{key:'Space',duration_seconds:0.1}],mouse:{move:{dx:120,dy:30},buttons:[{button:'right',event:'down'}]}};
 const second=await session.step(step(first,'a',action));assert.deepEqual(env.steps,[action]);
 assert.notEqual(second.metadata.observation_id,first.metadata.observation_id);assert.equal(second.metadata.done,false);
 assert.equal(second.image,image.toString('base64'),'later screenshots have no objective overlay');
 assert(!Object.hasOwn(second.metadata,'instruction'));
});
test('invalid actions do not consume an action or advance the simulation',async t=>{
 const {session,env}=await fixture(t);const first=await session.observe();
 for(const action of [{keys:[{key:'w',duration_seconds:2}]},{keys:[],mouse:{move_to:{x:700,y:300}}},{keys:[],mouse:{move:{dx:0,dy:0},scroll:{direction:'up',steps:1}}},{keys:[{key:'w',duration_seconds:1}],wait_seconds:0.5},{keys:[],buttons:[]}]){
  await assert.rejects(session.step(step(first,'bad',action)),e=>e.code==='INVALID_ACTION');
 }
 assert.equal(env.steps.length,0);assert.equal(env.frames,0);assert.deepEqual(await session.observe(),first);
});
test('duplicate request IDs execute once, including during lazy startup and while in flight',async t=>{
 const {session,env}=await fixture(t,{delay:30});const first=await session.observe(),request=step(first);
 const [a,b]=await Promise.all([session.step(request),session.step(request)]);assert.deepEqual(a,b);assert.equal(env.steps.length,1);
 assert.deepEqual(await session.step(request),a);assert.equal(env.steps.length,1);
 await assert.rejects(session.step({...request,action:{keys:[],wait_seconds:0.2}}),e=>e.code==='REQUEST_ID_CONFLICT');
 const after=await session.observe();await session.step(step(after,'b',{keys:[],wait_seconds:0.1}));
 assert.deepEqual(await session.step(request),a,'old request returns its original observation, not another action');
});
test('model actions cannot bootstrap the browser; duplicates after host initialization execute once',async t=>{
 const {session,env}=await fixture(t,{slowStart:30,delay:20});
 const request={request_id:'startup',observation_id:`${session.id}:0`,action:{keys:[],wait_seconds:0.1}};
 await assert.rejects(session.step(request),e=>e.code==='HOST_NOT_READY');assert.equal(session.started,false);
 const booting=session.observe();
 await assert.rejects(session.step(request),e=>e.code==='HOST_NOT_READY');
 await booting;
 const [a,b]=await Promise.all([session.step(request),session.step(request)]);
 assert.deepEqual(a,b);assert.equal(env.steps.length,1);
});
test('receipt persistence failure stops before dispatch and never retries that action',async t=>{
 const {session,env,options}=await fixture(t);const first=await session.observe();
 await fs.rename(path.join(options.output,'receipts'),path.join(options.output,'receipts-moved'));
 const request=step(first,'io-fault');
 await assert.rejects(session.step(request),e=>e.code==='SESSION_ERROR');
 await assert.rejects(session.step(request),e=>e.code==='SESSION_ERROR');
 assert.equal(env.steps.length,0);assert(session.abort.signal.aborted);
});
test('stale images, cross-session images and parallel different actions are rejected',async t=>{
 const {session,env}=await fixture(t,{delay:50});const first=await session.observe();
 await assert.rejects(session.step({...step(first),observation_id:'different-session:0'}),e=>e.code==='STALE_OBSERVATION');
 const inFlight=session.step(step(first));await sleep(5);
 await assert.rejects(session.step(step(first,'other')),e=>e.code==='ACTION_IN_PROGRESS');
 const observed=session.observe(),second=await inFlight;assert.deepEqual(await observed,second);
 await assert.rejects(session.step(step(first,'old')),e=>e.code==='STALE_OBSERVATION');assert.equal(env.steps.length,1);
});
test('wait and mouse-only no-op use the existing payload; step cap returns a durable terminal result',async t=>{
 const {session,env,options}=await fixture(t,{maxRounds:2});const a=await session.observe();
 const b=await session.step(step(a,'wait',{keys:[],wait_seconds:0.5}));assert.equal(env.frames,30);
 const end=await session.step(step(b,'noop',{keys:[],mouse:{}}));assert.equal(env.frames,30);
 assert.equal(end.metadata.done,true);assert.equal(end.metadata.outcome,'round_limit');
 assert.equal(JSON.parse(await fs.readFile(path.join(options.output,'summary.json'))).results[0].rounds,2);
 assert(env.closed);assert.deepEqual(await session.step(step(b,'noop',{keys:[],mouse:{}})),end);
 await assert.rejects(session.step(step(end,'extra')),e=>e.code==='TASK_FINISHED');
});
test('success and failure come only from the evaluator, not agent claims',async t=>{
 for(const failure of [false,true]){
  const {session}=await fixture(t,{finish:!failure,failure});const a=await session.observe();
  const end=await session.step(step(a,'done'));assert.equal(end.metadata.outcome,failure?'failure':'success');assert.equal(end.metadata.done,true);
 }
});
test('internal exceptions are private, with a safe public terminal observation',async t=>{
 const {session,options}=await fixture(t,{crash:true});const end=await session.observe();
 assert.equal(end.metadata.outcome,'evaluation_error');assert(!JSON.stringify(end).includes('-1234'));
 assert(!JSON.stringify(end).includes('9222'));const result=JSON.parse(await fs.readFile(path.join(options.output,'summary.json')));
 assert(result.results[0].error.includes('-1234'));
});
test('disconnect while waiting releases environment and completes without another action',async t=>{
 const {session,env}=await fixture(t);await session.observe();await session.close('client_disconnected');assert(env.closed);
 assert.equal(env.steps.length,0);await assert.rejects(session.observe(),e=>e.code==='SESSION_CLOSED');
});
test('host observation does not consume model tool budget; invalid model calls remain bounded',async t=>{
 const {session,env}=await fixture(t,{maxCalls:2});const first=await session.observe();await session.observe();assert.equal(session.calls,0);
 for(let i=0;i<2;i++)await assert.rejects(session.step(step(first,'bad',{keys:[{key:'w',duration_seconds:2}]})),e=>e.code==='INVALID_ACTION');
 await assert.rejects(session.step(step(first,'limit')),e=>e.code==='TOOL_CALL_LIMIT');await session.close();assert.equal(env.frames,0);
});
test('strict MCP schemas reject extra privileges and malformed action objects',()=>{
 assert(!actionSchema.safeParse({keys:[],evaluate:'window.world'}).success);
 assert(!actionSchema.safeParse({keys:[{key:'w',duration_seconds:1.1}]}).success);
 assert(!actionSchema.safeParse({keys:[],mouse:{move:{dx:641,dy:0}}}).success);
 assert(actionSchema.safeParse({keys:[],mouse:{scroll:{direction:'up',steps:6},buttons:[{button:'right',event:'down'}]}}).success);
});
test('model has only game_step; the host injects the objective image before the first model turn',async t=>{
 const {session,options}=await fixture(t);const server=createGameServer(session);
 const client=new Client({name:'unit-test',version:'1.0.0'});
 const [a,b]=InMemoryTransport.createLinkedPair();
 t.after(async()=>{await client.close();await server.close();});
 await Promise.all([server.connect(a),client.connect(b)]);
 const tools=await client.listTools();assert.deepEqual(tools.tools.map(t=>t.name),['game_step']);
 let unknown;
 try{unknown=await client.callTool({name:'game_observe',arguments:{}});}catch(error){assert(error.message);}
 if(unknown)assert.equal(unknown.isError,true);
 assert.equal(session.started,false,'a hidden/unknown observation tool cannot start the game');
 const resources=await client.listResources();assert.deepEqual(resources.resources.map(r=>r.uri),['game://rules']);
 await assert.rejects(client.readResource({uri:'game://task'}));
 const rules=await client.readResource({uri:'game://rules'});assert(rules.contents[0].text.includes('MD rules'));
 assert(!JSON.stringify(rules).includes('Drive to the destination.'));
 await prepareInitialObservation(session);
 const initial=await waitForInitialObservation(options.output,{timeoutMs:1000});
 const message=initialUserMessage(initial);assert.equal(message.role,'user');assert.equal(message.content[1].type,'image_url');
 assert(!JSON.stringify(message).includes('Drive to the destination.'));
 const current=toolResult(initial);assert(!current.isError);
 assert.equal(current.content[1].type,'image');assert.notEqual(current.content[1].data,image.toString('base64'));
 assert(!JSON.stringify(current.structuredContent).includes('Drive to the destination.'));
 const next=await client.callTool({name:'game_step',arguments:{request_id:'first',observation_id:current.structuredContent.observation_id,action:{keys:[],wait_seconds:0.1}}});
 assert(!next.isError);assert.notEqual(next.structuredContent.observation_id,current.structuredContent.observation_id);
 assert.equal(next.content[1].data,image.toString('base64'));
 const stale=await client.callTool({name:'game_step',arguments:{request_id:'stale',observation_id:current.structuredContent.observation_id,action:{keys:[],mouse:{}}}});
 assert(stale.isError);assert.equal(JSON.parse(stale.content[0].text).code,'STALE_OBSERVATION');
 assert.equal(stale.structuredContent,undefined);assert(stale.content.every(p=>p.type==='text'));
 const invalid=await client.callTool({name:'game_step',arguments:{request_id:'bad',observation_id:next.structuredContent.observation_id,action:{keys:[],mouse:{move:{dx:0,dy:0},scroll:{direction:'up',steps:1}}}}});
 assert(invalid.isError);assert(JSON.parse(invalid.content[0].text).code==='INVALID_ACTION');
 assert.deepEqual(await waitForInitialObservation(options.output),initial,'host bootstrap remains the original first image');
});
test('host bootstrap publishes atomically with owner-only permissions and cannot be overwritten',async t=>{
 const {session,options}=await fixture(t);const first=await prepareInitialObservation(session);
 const file=path.join(options.output,'initial-observation.json');assert.equal((await fs.stat(file)).mode&0o777,0o600);
 assert.deepEqual(await waitForInitialObservation(options.output),first);assert.equal(session.calls,0);
 await assert.rejects(prepareInitialObservation(session),e=>e.code==='EEXIST');
 assert.deepEqual(await waitForInitialObservation(options.output),first);
 assert(!(await fs.readdir(options.output)).some(name=>name.endsWith('.tmp')));
});
test('host bootstrap waiting is cancellable/bounded and does not turn a startup error into model input',async t=>{
 const {session,options}=await fixture(t,{crash:true});
 await assert.rejects(waitForInitialObservation(options.output,{timeoutMs:5}),/Timed out/);
 const abort=new AbortController();abort.abort(Error('cancelled'));
 await assert.rejects(waitForInitialObservation(options.output,{signal:abort.signal}),/cancelled/);
 await prepareInitialObservation(session);
 await assert.rejects(waitForInitialObservation(options.output),/ended during host bootstrap/);
 const snapshot=JSON.parse(await fs.readFile(path.join(options.output,'initial-observation.json'),'utf8'));
 assert.throws(()=>initialUserMessage(snapshot),/ended during host bootstrap/);
 assert(!JSON.stringify(snapshot).includes('-1234'));
});


test('host-owned versions preserve real session receipts and stale-image fencing',async t=>{
 const {session,env}=await fixture(t,{maxRounds:5,delay:10});
 const host=new HostObservations();host.initialize(await session.observe());
 const infer=()=>host.modelRequest({type:'api_start',method:'POST',path:'/responses'});
 const call=(id,request_id='request-'+id)=>({jsonrpc:'2.0',id,method:'tools/call',params:{name:'game_step',arguments:{request_id,action:{keys:[],wait_seconds:0.1}}}});
 const finish=async message=>{
  const result=toolResult(await session.step(message.params.arguments));
  return host.response({jsonrpc:'2.0',id:message.id,result});
 };
 infer();const first=host.request(call(1,'first')).forward;
 const duplicate=host.request(call(2,'first')).forward;
 const [one,again]=await Promise.all([finish(first),finish(duplicate)]);
 assert.equal(one.result.content.at(-1).type,'image');assert(again.result.content.every(p=>p.type==='text'));assert.equal(env.steps.length,1);
 assert(host.request(call(3)).reply,'another action in the same inference must be stale');
 infer();await finish(host.request(call(4)).forward);assert.equal(env.steps.length,2);
 const current=host.current.metadata.observation_id;
 const replay=host.request(call(5,'first')).reply;
 assert.equal(JSON.parse(replay.result.content[0].text).code,'ACTION_ALREADY_COMPLETED');assert.equal(env.steps.length,2);
 assert.equal(host.current.metadata.observation_id,current);
 const stale=host.request(call(6));assert(stale.reply);assert(!stale.forward);
 assert(stale.reply.result.content.every(part=>part.type==='text'));
 infer();const next=host.request(call(7)).forward;
 assert.equal(next.params.arguments.observation_id,current);
 assert(!JSON.stringify(modelMcpMessage(replay)).includes('observation_id'));
});

test('discarded same-response actions and completed retries do not spend the game round budget',async t=>{
 const {session,env}=await fixture(t,{maxRounds:3});const host=new HostObservations();host.initialize(await session.observe());
 let images=0,id=0;
 const call=(request_id)=>({jsonrpc:'2.0',id:++id,method:'tools/call',params:{name:'game_step',arguments:{request_id,action:{keys:[],wait_seconds:0.1}}}});
 for(let round=0;round<2;round++){
  host.modelRequest({type:'api_start',method:'POST',path:'/responses'});
  const request=call('step-'+round),forward=host.request(request).forward;
  const snapshot=await session.step(forward.params.arguments);
  const reply=modelMcpMessage(host.response({jsonrpc:'2.0',id:forward.id,result:toolResult(snapshot)}));
  images+=reply.result.content.filter(p=>p.type==='image').length;
  for(const extra of [call('extra-'+round),call('step-'+round)]){
   const rejected=host.request(extra);assert(rejected.reply);assert(!rejected.forward);
   assert(rejected.reply.result.content.every(p=>p.type==='text'));
  }
 }
 assert.equal(images,2);assert.equal(session.calls,2);assert.equal(env.steps.length,2);assert(!session.done);
 host.modelRequest({type:'api_start',method:'POST',path:'/responses'});
 const last=host.request(call('final')).forward;const terminal=await session.step(last.params.arguments);
 assert(terminal.metadata.done);assert.equal(session.calls,3);assert.equal(env.steps.length,3);
 assert.equal(session.result.rounds,3);assert.equal(session.result.status,'round_limit');
});
