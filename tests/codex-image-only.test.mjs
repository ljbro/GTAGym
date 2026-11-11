import test from 'node:test';
import assert from 'node:assert/strict';
import net from 'node:net';
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {once} from 'node:events';
import {createInterface} from 'node:readline';
import {createRequire} from 'node:module';
import {startGameBridge} from '../scripts/codex-eval/game-bridge.mjs';
import {gameStepJSONSchema,GAME_STEP_DESCRIPTION,toolResult} from '../scripts/game-mcp/tools.mjs';
import {INITIAL_USER_PROMPT,GAME_MCP_INSTRUCTIONS,OBSERVATION_CONTRACT} from '../scripts/game-mcp/public-observation.mjs';
import {imageToolResult} from '../scripts/codex-eval/policy.mjs';
import {parseCli,run,codexArguments} from '../scripts/codex-eval/run.mjs';
import {responseStream} from '../scripts/codex-eval/chat-adapter.mjs';

const image=Buffer.from('PIXELS').toString('base64');
const snapshot=(n,extra={})=>({metadata:{task_id:'PRIVATE_TASK',observation_id:'PRIVATE:'+n,width:1280,height:720,done:false,outcome:'active',...extra},image,mimeType:'image/png'});
const action={keys:[],wait_seconds:0.1};
async function client(bridge){
 const socket=net.createConnection(bridge.socketPath);await once(socket,'connect');socket.write(JSON.stringify({auth:bridge.token})+'\n');
 const pending=new Map(),received=[],lines=createInterface({input:socket,crlfDelay:Infinity});let id=0;
 const reading=(async()=>{for await(const line of lines){const m=JSON.parse(line);received.push(m);pending.get(m.id)?.(m);pending.delete(m.id);}})();
 return {socket,received,call(method,params){const number=++id;return new Promise(resolve=>{pending.set(number,resolve);socket.write(JSON.stringify({jsonrpc:'2.0',id:number,method,params})+'\n');});},
  async close(){socket.destroy();lines.close();await reading.catch(()=>{});}};
}
test('public bridge offers request_id/action only, hides metadata and binds private versions with safe retries',async()=>{
 const seen=[],receipts=new Map();let n=0;
 const session={step:async args=>{
  seen.push(args);if(receipts.has(args.request_id))return receipts.get(args.request_id);
  assert.equal(args.observation_id,'PRIVATE:'+n);n++;const value=snapshot(n);receipts.set(args.request_id,value);return value;
 }};
 const bridge=await startGameBridge(session,{schema:gameStepJSONSchema,description:GAME_STEP_DESCRIPTION,toolResult,imageOnly:true});let c;
 try{
  bridge.initialize(snapshot(0));bridge.modelRequest();c=await client(bridge);
  assert.equal((await c.call('initialize',{protocolVersion:'2024-11-05'})).result.instructions,GAME_MCP_INSTRUCTIONS);
  const tools=(await c.call('tools/list')).result.tools;assert.deepEqual(Object.keys(tools[0].inputSchema.properties),['request_id','action']);
  assert(!JSON.stringify(tools).includes('observation_id'));assert.deepEqual((await c.call('resources/list')).result,{resources:[]});
  const step=(request_id,operation=action)=>c.call('tools/call',{name:'game_step',arguments:{request_id,action:operation}});
  const first=await step('a');assert.deepEqual(first.result,{content:[{type:'image',data:image,mimeType:'image/png'}]});assert.equal(n,1);
  const stale=await step('b');assert.equal(n,1);assert(stale.result.isError);
  assert.equal(JSON.parse(stale.result.content[0].text).code,'STALE_OBSERVATION');assert(stale.result.content.every(p=>p.type==='text'));
  bridge.modelRequest();await step('b');assert.equal(n,2);assert.equal(seen.at(-1).observation_id,'PRIVATE:1');
  const replay=await step('a');assert.equal(n,2);assert.equal(seen.length,2);
  assert.equal(JSON.parse(replay.result.content[0].text).code,'ACTION_ALREADY_COMPLETED');assert(replay.result.content.every(p=>p.type==='text'));
  const bad=await step('a',{keys:[],wait_seconds:0.2});assert.equal(JSON.parse(bad.result.content[0].text).code,'REQUEST_ID_CONFLICT');
  const denied=await c.call('tools/call',{name:'game_step',arguments:{request_id:'bad',observation_id:'FORGED',action}});assert(denied.result.isError);
  bridge.modelRequest();await step('c');assert.equal(n,3);assert.equal(seen.at(-1).observation_id,'PRIVATE:2','completed retries do not rewind the current observation');
  assert(!JSON.stringify(c.received).includes('PRIVATE'));assert(!JSON.stringify(c.received).includes('outcome'));assert(!JSON.stringify(c.received).includes('task_id'));
 }finally{await c?.close();await bridge.close();}
});
test('terminal outcomes stay on the host and produce no model-facing MCP reply',async()=>{
 let ended;const terminal=new Promise(resolve=>{ended=resolve;});
 const bridge=await startGameBridge({step:async()=>snapshot(1,{done:true,outcome:'success'})},
  {schema:gameStepJSONSchema,description:GAME_STEP_DESCRIPTION,toolResult,imageOnly:true,onTerminal:ended});let c;
 try{
  bridge.initialize(snapshot(0));bridge.modelRequest();c=await client(bridge);
  void c.call('tools/call',{name:'game_step',arguments:{request_id:'last',action}});
  const value=await Promise.race([terminal,new Promise((_,reject)=>setTimeout(()=>reject(Error('Missing host completion')),1000))]);
  assert.equal(value.metadata.outcome,'success');await new Promise(r=>setTimeout(r,20));assert.deepEqual(c.received,[]);
 }finally{await c?.close();await bridge.close();}
});
test('projection and startup helpers do not expose a duplicate metadata text block',()=>{
 assert.deepEqual(imageToolResult(toolResult(snapshot(0))),{content:[{type:'image',data:image,mimeType:'image/png'}]});
 assert.equal(codexArguments({workspace:'/tmp/test',image:'/tmp/test/image.png',metadata:snapshot(0).metadata}).at(-1),INITIAL_USER_PROMPT);
});
test('actual Codex runner stops on evaluator completion without a final model turn',{timeout:45000},async()=>{
 const directory=await fs.mkdtemp(path.join(os.tmpdir(),'gta-image-only-run-'));let requests=0,seen,session;
 const sharp=createRequire(import.meta.url)('sharp');
 const pixels=(await sharp({create:{width:1280,height:720,channels:3,background:'#334455'}}).png().toBuffer()).toString('base64');
 const initial={...snapshot(0),image:pixels};
 const server=http.createServer(async(req,res)=>{
  const parts=[];for await(const p of req)parts.push(p);const payload=JSON.parse(Buffer.concat(parts));requests++;seen=payload;
  const item={type:'function_call',id:'fc_1',call_id:'call_1',name:'mcp__game__game_step',arguments:JSON.stringify({request_id:'final',action}),status:'completed'};
  const response={id:'resp_1',object:'response',model:'Qwen3.8-27B',status:'completed',output:[item],usage:{input_tokens:10,output_tokens:5,total_tokens:15}};
  res.writeHead(200,{'content-type':'text/event-stream'});res.end(responseStream(response,{name:'mcp__game__game_step'}));
 });
 try{
  server.listen(0,'127.0.0.1');await once(server,'listening');const key=path.join(directory,'key');await fs.writeFile(key,'fixture-only');
  const options=parseCli(['--task','c01-n04','--model','Qwen3.8-27B','--base-url','http://127.0.0.1:'+server.address().port,'--key-file',key,'--output',path.join(directory,'episode'),'--wall-seconds','0']);
  const report=await run(options,{sessionFactory:()=>{
   session={done:false,started:true,receipts:new Map(),observe:async()=>initial,close:async()=>{},step:async args=>{
    assert.equal(args.observation_id,'PRIVATE:0');session.receipts.set(args.request_id,args);session.done=true;
    session.result={status:'round_limit',success:false,rounds:1};return {...initial,metadata:{...initial.metadata,done:true,outcome:'round_limit'}};
   }};return session;
  }});
  assert.equal(requests,1);assert.equal(report.status,'completed');assert.equal(report.stoppedByEvaluator,true);assert.equal(report.evaluatorOutcome,'round_limit');
  assert.equal(report.observationContract,OBSERVATION_CONTRACT);assert.equal(report.acceptedActions,1);assert.equal(report.usage.input_tokens,10);
  assert.equal(report.runtimeLimits.wallSeconds,0);assert.equal(report.runtimeLimits.wallClockEnabled,false);
  assert.equal(report.runtimeLimits.requestSeconds,3600);assert.equal(report.runtimeLimits.maxRounds,300);
  assert(!JSON.stringify(seen).includes('PRIVATE'));assert(!JSON.stringify(seen).includes('observation_id'));
  assert(seen.input.some(i=>i.content?.some?.(p=>p.text===INITIAL_USER_PROMPT)));
 }finally{server.closeAllConnections();await new Promise(r=>server.close(r));await fs.rm(directory,{recursive:true,force:true});}
});

test('actual Codex receives one new image when a response emits two game_step calls',{timeout:45000},async()=>{
 const directory=await fs.mkdtemp(path.join(os.tmpdir(),'gta-codex-extra-action-'));let requests=0,session,n=0;const inputs=[];
 const sharp=createRequire(import.meta.url)('sharp');
 const pixels=(await sharp({create:{width:1280,height:720,channels:3,background:'#334455'}}).png().toBuffer()).toString('base64');
 const view=(n,extra={})=>({...snapshot(n,extra),image:pixels});
 const countImages=value=>Array.isArray(value)?value.reduce((a,x)=>a+countImages(x),0):!value||typeof value!=='object'?0:Number(value.type==='input_image')+Object.values(value).reduce((a,x)=>a+countImages(x),0);
 const server=http.createServer(async(req,res)=>{
  const parts=[];for await(const part of req)parts.push(part);const payload=JSON.parse(Buffer.concat(parts));inputs.push(payload.input);requests++;
  const names=requests===1?['first','discarded']:['final'];
  const output=names.map(name=>({type:'function_call',id:'fc_'+name,call_id:'call_'+name,name:'mcp__game__game_step',arguments:JSON.stringify({request_id:name,action}),status:'completed'}));
  const response={id:'resp_'+requests,object:'response',model:'Qwen3.8-27B',status:'completed',output,usage:{input_tokens:10,output_tokens:5,total_tokens:15}};
  res.writeHead(200,{'content-type':'text/event-stream'});res.end(responseStream(response,{name:'mcp__game__game_step'}));
 });
 try{
  server.listen(0,'127.0.0.1');await once(server,'listening');const key=path.join(directory,'key');await fs.writeFile(key,'fixture-only');
  const options=parseCli(['--task','c01-n04','--model','Qwen3.8-27B','--base-url','http://127.0.0.1:'+server.address().port,'--key-file',key,'--output',path.join(directory,'episode'),'--wall-seconds','30']);
  const report=await run(options,{sessionFactory:()=>{
   session={done:false,started:true,receipts:new Map(),observe:async()=>view(0),close:async()=>{},step:async args=>{
    assert.notEqual(args.request_id,'discarded');assert.equal(args.observation_id,'PRIVATE:'+n);n++;session.receipts.set(args.request_id,true);
    if(n===2){session.done=true;session.result={status:'round_limit',success:false,rounds:2};}
    return view(n,{done:session.done,outcome:session.done?'round_limit':'active'});
   }};return session;
  }});
  assert.equal(requests,2);assert.deepEqual(inputs.map(countImages),[1,2]);
  assert.equal(n,2);assert.equal(report.acceptedActions,2);assert.equal(report.status,'completed');
  const outputs=inputs[1].filter(item=>item.type==='function_call_output');assert.equal(outputs.length,2);
  assert.equal(countImages(outputs),1);assert(JSON.stringify(outputs).includes('EXTRA_ACTION'));
 }finally{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));await fs.rm(directory,{recursive:true,force:true});}
});
