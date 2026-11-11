#!/usr/bin/env node
// Real MCP/Chromium smoke test, not a model evaluation and not a success oracle.
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import {execFileSync} from 'node:child_process';
import {Client} from '@modelcontextprotocol/client';
import {StdioClientTransport} from '@modelcontextprotocol/client/stdio';
import {root} from './config.mjs';
import {renderInstructionImage} from './instruction-image.mjs';
import {waitForInitialObservation,initialUserMessage} from './bootstrap.mjs';
import {toolResult} from './tools.mjs';

const args=process.argv.slice(2),options={tasks:'c01-n04',renderer:'gpu',output:path.join(root,'.cache/mcp-smoke',new Date().toISOString().replace(/[:.]/g,'-'))};
for(let i=0;i<args.length;i+=2){const key=args[i]?.replace(/^--/,'');if(!Object.hasOwn(options,key)||!args[i+1])throw Error('Unknown/missing option '+args[i]);options[key]=args[i+1];}
const output=path.resolve(options.output);await fs.mkdir(output,{recursive:true});
const sharp=createRequire(import.meta.url)('sharp');
const report=[];
for(const taskId of options.tasks.split(',')){
 const directory=path.join(output,taskId),started=performance.now();let stderr='';
 const transport=new StdioClientTransport({command:process.execPath,args:[fileURLToPath(new URL('server.mjs',import.meta.url)),
  '--task',taskId,'--renderer',options.renderer,'--max-rounds','2','--output',directory,'--agent-label','mcp-smoke-no-model'],
  stderr:'pipe',env:{...process.env,HTTP_PROXY:'',HTTPS_PROXY:'',ALL_PROXY:'',http_proxy:'',https_proxy:'',all_proxy:'',NO_PROXY:'*',no_proxy:'*'}});
 transport.stderr.on('data',chunk=>{stderr+=chunk.toString();});
 const client=new Client({name:'gtabench-mcp-smoke',version:'0.1.0'});
 const call=(name,arguments_)=>client.callTool({name,arguments:arguments_},{timeout:600000});
 const screenshot=async result=>{
  const image=result.content.find(c=>c.type==='image');assert(image,'Missing MCP screenshot');
  const metadata=await sharp(Buffer.from(image.data,'base64')).metadata();assert.equal(metadata.width,1280);assert.equal(metadata.height,720);
  return image;
 };
 try{
  console.log(JSON.stringify({event:'smoke_start',taskId}));
  await client.connect(transport);const tools=await client.listTools();assert.deepEqual(tools.tools.map(t=>t.name),['game_step']);
  assert.deepEqual((await client.listResources()).resources.map(r=>r.uri),['game://rules']);
  const initial=await waitForInitialObservation(directory);
  const message=initialUserMessage(initial);assert.equal(message.role,'user');assert.equal(message.content[1].type,'image_url');
  let current=toolResult(initial);assert(!current.isError,JSON.stringify(current));await screenshot(current);
  assert(!Object.hasOwn(current.structuredContent,'instruction'));
  const initialImage=current.content.find(c=>c.type==='image');
  await fs.writeFile(path.join(directory,'smoke-initial.'+(initialImage.mimeType==='image/png'?'png':'jpg')),Buffer.from(initialImage.data,'base64'));
  const repeated=toolResult(await waitForInitialObservation(directory));assert.deepEqual(repeated,current,'Host bootstrap is stable and does not advance the game');
  const bad=await call('game_step',{request_id:'invalid',observation_id:current.structuredContent.observation_id,action:{keys:[],mouse:{move:{dx:0,dy:0},scroll:{direction:'up',steps:1}}}});
  assert(bad.isError);
  const firstAction=taskId.startsWith('c11-')?{keys:[],mouse:{buttons:[{button:'right',event:'down'}]}}:
   taskId.startsWith('c10-')?{keys:[],mouse:{}}:{keys:[{key:'w',duration_seconds:0.1}]};
  const request={request_id:'one',observation_id:current.structuredContent.observation_id,action:firstAction};
  current=await call('game_step',request);assert(!current.isError,JSON.stringify(current));await screenshot(current);
  assert.deepEqual(await call('game_step',request),current,'A duplicate must not consume another action');
  const stale=await call('game_step',{...request,request_id:'stale'});assert(stale.isError);
  assert.equal(stale.structuredContent.observation_id,current.structuredContent.observation_id);
  assert.equal(stale.content.at(-1).data,current.content.at(-1).data);
  const secondAction=taskId.startsWith('c11-')?{keys:[],mouse:{scroll:{direction:'up',steps:1}}}:
   taskId.startsWith('c10-')?{keys:[],mouse:{buttons:[{button:'left',event:'down'}]}}:{keys:[{key:'w',duration_seconds:0.1}]};
  const end=await call('game_step',{request_id:'two',observation_id:current.structuredContent.observation_id,action:secondAction});
  assert(!end.isError,JSON.stringify(end));assert.equal(end.structuredContent.done,true);const image=await screenshot(end);
  await fs.writeFile(path.join(directory,'smoke-final.'+(image.mimeType==='image/png'?'png':'jpg')),Buffer.from(image.data,'base64'));
  const summary=JSON.parse(await fs.readFile(path.join(directory,'summary.json'),'utf8')),result=summary.results[0];
  assert.equal(result.rounds,2);assert.equal(summary.errors,0,JSON.stringify(result));assert.equal(result.environment.executionHost,'server');
  assert.equal(result.environment.canvas2d,'software');assert.equal(result.environment.pageCompositing,'software');
  if(options.renderer==='gpu')assert.equal(result.environment.renderer,'gpu');
  const archive=path.join(directory,result.archive),entries=execFileSync('tar',['-tzf',archive],{encoding:'utf8'});
  const config=JSON.parse(await fs.readFile(path.join(directory,'config.json'),'utf8'));
  assert.equal(config.instructionMode,'initial-image');assert.equal(config.contextManagement,'external-harness');
  const ext=/^c(?:10|11)-n/.test(taskId)?'png':'jpg';
  const recorded=execFileSync('tar',['-xOzf',archive,`observations/000001.${ext}`],{maxBuffer:16*1024*1024});
  assert.deepEqual(recorded,Buffer.from(initialImage.data,'base64'),'archive must contain the delivered, labelled initial screenshot');
  assert.deepEqual(await waitForInitialObservation(directory),initial,'the bootstrap file must not become a live observation channel');
  const rawFinal=Buffer.from(image.data,'base64');
  const preview=await renderInstructionImage(rawFinal,{instruction:config.instructions[taskId],mimeType:image.mimeType});
  assert.notDeepEqual(preview,rawFinal);
  for(const entry of ['episode.mp4','rounds/000001.json','rounds/000002.json','result.json'])assert(entries.split('\n').includes(entry));
  const rounds=[1,2].map(n=>JSON.parse(execFileSync('tar',['-xOzf',archive,`rounds/${String(n).padStart(6,'0')}.json`],{encoding:'utf8',maxBuffer:16*1024*1024})));
  if(!/^c(?:10|11)-n/.test(taskId)){
   assert(Math.abs(result.simulatedSeconds-0.2)<1e-9);assert.deepEqual(rounds[0].transition.heldKeys,['w']);
   assert(Math.abs(rounds[1].before.elapsed-0.1)<1e-8);assert.equal(result.freezeVerified,true);
  }else{assert.equal(result.simulatedSeconds,0);assert(result.staticEvaluation);}
  if(taskId.startsWith('c11-')){
   assert.equal(rounds[0].after.staticTask.scoped,true);assert(rounds[1].after.staticTask.zoom>rounds[0].after.staticTask.zoom);
  }
  report.push({taskId,ok:true,status:result.status,rounds:result.rounds,simulatedSeconds:result.simulatedSeconds,
   renderer:result.environment.gpu?.renderer,canvas2d:result.environment.canvas2d,pageCompositing:result.environment.pageCompositing,
   freezeVerified:result.freezeVerified,archive,wallMs:performance.now()-started});
  console.log(JSON.stringify({event:'smoke_pass',...report.at(-1)}));
 }catch(error){report.push({taskId,ok:false,error:error.message,wallMs:performance.now()-started});console.error(JSON.stringify({event:'smoke_failed',taskId,error:error.message.slice(0,2000)}));}
 finally{await client.close().catch(()=>{});await transport.close().catch(()=>{});await fs.writeFile(path.join(output,taskId+'-server.log'),stderr);await fs.writeFile(path.join(output,'report.json'),JSON.stringify(report,null,2));}
}
if(report.some(r=>!r.ok))process.exitCode=1;
