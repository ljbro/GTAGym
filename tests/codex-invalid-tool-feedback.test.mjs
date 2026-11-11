import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {spawn} from 'node:child_process';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {startGateway} from '../scripts/codex-eval/gateway.mjs';
import {startGameBridge} from '../scripts/codex-eval/game-bridge.mjs';
import {GAME_TOOL,INVALID_GAME_TOOL_MESSAGE,COMPACTION_PREFIX,isInvalidGameTool,isFeedbackEligibleTool,codexConfig,codexEnvironment} from '../scripts/codex-eval/policy.mjs';
import {responseStream} from '../scripts/codex-eval/chat-adapter.mjs';
import {customCatalog} from '../scripts/codex-eval/catalog.mjs';
import {codexArguments} from '../scripts/codex-eval/run.mjs';
import {modelSettings} from '../scripts/codex-eval/providers.mjs';

const functionItem=(name,n=1)=>({type:'function_call',id:'fc_'+n,call_id:'call_'+n,name,
 arguments:JSON.stringify({request_id:'original-'+n,action:{keys:[{key:'w',duration_seconds:1}]}}),status:'completed'});
const response=output=>({id:'response_test',object:'response',status:'completed',output,usage:{input_tokens:10,output_tokens:2,total_tokens:12}});
const body={model:'deepseek-flash',input:[],tools:[{type:'function',name:GAME_TOOL}],stream:false};
async function call(g,overrides={}){return fetch(g.url+'/v1/responses',{method:'POST',headers:{authorization:'Bearer '+g.token},body:JSON.stringify({...body,...overrides})});}

test('only function names containing game_step qualify for error feedback, never exec, custom tools or unknown namespaces',()=>{
 for(const name of ['game_step','game__game_step','mcp_game_step'])assert(isInvalidGameTool(functionItem(name)));
 for(const item of [functionItem(GAME_TOOL),functionItem('exec'),functionItem('Bash'),{...functionItem('game_step'),namespace:'exec'},
  {...functionItem('game_step'),type:'custom_tool_call'},functionItem('game_step\nexec')])assert(!isInvalidGameTool(item));
});

test('DeepSeek permits opaque invalid function names only for error feedback',()=>{
 for(const item of [functionItem('exec_command'),functionItem('Bash'),functionItem(''),functionItem('orient1</｜｜DSML｜｜ parameter>\n<｜｜DSML｜｜ parameter name='),{...functionItem(GAME_TOOL),namespace:'functions'}]){
  assert(isFeedbackEligibleTool(item,{allFunctionNames:true}));
  assert(!isFeedbackEligibleTool(item));
 }
 assert(!isFeedbackEligibleTool(functionItem(GAME_TOOL),{allFunctionNames:true}));
 assert(!isFeedbackEligibleTool({...functionItem('exec'),type:'custom_tool_call'},{allFunctionNames:true}));
});

for(const stream of [false,true])test('buffered '+(stream?'SSE':'JSON')+' response routes all calls to non-executable error receipts, counts usage and limits feedback to three',async()=>{
 const directory=await fs.mkdtemp(path.join(os.tmpdir(),'gta-invalid-tool-'));let registered=0,violations=0,mode='invalid';
 const g=await startGateway({model:body.model,baseURL:'https://not-used.test',key:'private',output:path.join(directory,'api'),
  onInvalidGameTool:message=>{assert.equal(message,INVALID_GAME_TOOL_MESSAGE);return {request_id:'invalid_tool_'+String(++registered).padStart(32,'0'),action:{__invalid_tool:true}};},
  onViolation:()=>violations++,fetcher:async()=>{
   const r=response(mode==='invalid'?[functionItem('exec_command'),functionItem(GAME_TOOL,2)]:[functionItem(GAME_TOOL)]);
   return stream?new Response(responseStream(r,{}),{headers:{'content-type':'text/event-stream'}}):Response.json(r);
  }});
 try{
  for(let i=0;i<3;i++){
   const r=await call(g);assert.equal(r.status,200);const v=await r.json();
   assert(v.output.every(i=>i.name===GAME_TOOL&&JSON.parse(i.arguments).action.__invalid_tool));
   assert(!JSON.stringify(v).includes('original-'));assert(!JSON.stringify(v).includes('"duration_seconds"'));
  }
  const rejected=await call(g);assert.equal(rejected.status,502);await rejected.text();assert.equal(registered,6);assert.equal(violations,1);
  // A valid named call resets the consecutive counter; it is not forced to fail.
  mode='valid';assert.equal((await call(g)).status,200);
  mode='invalid';assert.equal((await call(g)).status,200);
  await new Promise(r=>setTimeout(r,5));assert.equal(g.calls.filter(c=>c.invalidToolFeedback).length,4);
  assert.equal(g.usage().input_tokens,60);assert.equal(g.usage().output_tokens,12);
 }finally{await g.close();await fs.rm(directory,{recursive:true,force:true});}
});

test('non-DeepSeek late exec aborts a mixed response before any error receipt or bytes released',async()=>{
 const directory=await fs.mkdtemp(path.join(os.tmpdir(),'gta-invalid-tool-exec-'));let registered=0,violations=0;
 const g=await startGateway({model:'gpt-6.1-sol',baseURL:'https://not-used.test',key:'private',output:path.join(directory,'api'),
  onInvalidGameTool:()=>{registered++;throw Error('must not register');},onViolation:()=>violations++,
  fetcher:async()=>new Response(responseStream(response([functionItem('game_step'),functionItem('exec',2)]),{}),{headers:{'content-type':'text/event-stream'}})});
 try{const r=await call(g,{model:'gpt-6.1-sol'});assert.equal(r.status,502);assert(!(await r.text()).includes('original-'));assert.equal(registered,0);assert.equal(violations,1);}
 finally{await g.close();await fs.rm(directory,{recursive:true,force:true});}
});

for(const api of ['responses','chat-completions'])for(const bad of ['exec_command','read_file','orient1</｜｜DSML｜｜ parameter>\n<｜｜DSML｜｜ parameter name='])test(`DeepSeek ${api}: ${JSON.stringify(bad)} receives error-only feedback`,async()=>{
 const directory=await fs.mkdtemp(path.join(os.tmpdir(),'gta-invalid-any-'));let registered=0,violations=0;
 const g=await startGateway({model:body.model,api,baseURL:'https://not-used.test',key:'private',output:path.join(directory,'api'),
  onInvalidGameTool:()=>({request_id:'invalid_tool_'+String(++registered).padStart(32,'0'),action:{__invalid_tool:true}}),onViolation:()=>violations++,
  fetcher:async()=>{
   const items=[functionItem(bad),functionItem(GAME_TOOL,2)];
   return Response.json(api==='responses'?response(items):{choices:[{index:0,finish_reason:'tool_calls',message:{role:'assistant',content:null,tool_calls:items.map(i=>({type:'function',id:i.call_id,function:{name:i.name,arguments:i.arguments}}))}}],usage:{prompt_tokens:10,completion_tokens:2}});
  }});
 try{const r=await call(g);assert.equal(r.status,200);const v=await r.json();assert.equal(registered,2);assert.equal(violations,0);
  assert(v.output.every(i=>i.name===GAME_TOOL&&JSON.parse(i.arguments).action.__invalid_tool));
  assert(!JSON.stringify(v).includes('original-'));
  await new Promise(r=>setTimeout(r,5));assert.equal(g.calls[0].invalidToolFeedback.policy,'invalid-function-error-feedback-v2');
  assert.equal(g.calls[0].invalidToolFeedback.invalidCalls[0].name,bad);
 }finally{await g.close();await fs.rm(directory,{recursive:true,force:true});}
});

test('DeepSeek namespace is stripped from feedback; custom/builtin calls remain blocked',async()=>{
 const directory=await fs.mkdtemp(path.join(os.tmpdir(),'gta-invalid-namespace-'));let mode='namespace',registered=0;
 const g=await startGateway({model:body.model,baseURL:'https://not-used.test',key:'private',output:path.join(directory,'api'),
  onInvalidGameTool:()=>({request_id:'invalid_tool_'+String(++registered).padStart(32,'0'),action:{__invalid_tool:true}}),
  fetcher:async()=>Response.json(response([mode==='namespace'?{...functionItem(GAME_TOOL),namespace:'shell'}:{...functionItem('exec'),type:mode}]))});
 try{let r=await call(g);assert.equal(r.status,200);let v=await r.json();assert.equal(v.output[0].namespace,undefined);assert(JSON.parse(v.output[0].arguments).action.__invalid_tool);
  for(mode of ['custom_tool_call','web_search_call']){r=await call(g);assert.equal(r.status,502);await r.text();}
  assert.equal(registered,1);
 }finally{await g.close();await fs.rm(directory,{recursive:true,force:true});}
});

test('compaction cannot use the invalid-name feedback channel',async()=>{
 const directory=await fs.mkdtemp(path.join(os.tmpdir(),'gta-invalid-tool-compact-'));let registered=0;
 const g=await startGateway({model:body.model,baseURL:'https://not-used.test',key:'private',output:path.join(directory,'api'),
  onInvalidGameTool:()=>{registered++;},fetcher:async()=>Response.json(response([functionItem('game_step')]))});
 try{
  const r=await fetch(g.url+'/v1/responses',{method:'POST',headers:{authorization:'Bearer '+g.token},body:JSON.stringify({...body,tools:[],input:[{role:'user',content:COMPACTION_PREFIX+' summarize'}]})});
  assert.equal(r.status,502);await r.text();assert.equal(registered,0);
 }finally{await g.close();await fs.rm(directory,{recursive:true,force:true});}
});

for(const kind of ['missing-completed','incomplete','duplicate-call-id'])test(kind+' invalid-name response is not repaired',async()=>{
 const directory=await fs.mkdtemp(path.join(os.tmpdir(),'gta-invalid-tool-incomplete-'));let registered=0;
 const g=await startGateway({model:body.model,baseURL:'https://not-used.test',key:'private',output:path.join(directory,'api'),
  onInvalidGameTool:()=>{registered++;},fetcher:async()=>{
   const r=response([functionItem('game_step')]);
   if(kind==='incomplete')r.status='incomplete';
   if(kind==='duplicate-call-id')r.output.push(functionItem('game_step'));
   if(kind==='missing-completed')return new Response('data: '+JSON.stringify({type:'response.output_item.done',item:r.output[0]})+'\n\n',{headers:{'content-type':'text/event-stream'}});
   return Response.json(r);
  }});
 try{const r=await call(g);assert.equal(r.status,502);await r.text();assert.equal(registered,0);}
 finally{await g.close();await fs.rm(directory,{recursive:true,force:true});}
});

for(const transport of ['responses-json','responses-sse','chat-completions'])test('actual Codex '+transport+': invalid name yields exact tool error in native history, zero actions until corrected, then normal screenshot',{timeout:45000},async()=>{
 const directory=await fs.mkdtemp(path.join(os.tmpdir(),'gta-invalid-tool-cli-')),home=path.join(directory,'home'),work=path.join(directory,'work');
 const settings=modelSettings({model:transport==='chat-completions'?'glm-5.3-flash':'deepseek-flash'});
 let bridge,gateway,child,calls=0,steps=0,failure,stdout='',stderr='';
 const sharp=createRequire(import.meta.url)('sharp');
 const image=(await sharp({create:{width:1280,height:720,channels:3,background:'#334455'}}).png().toBuffer()).toString('base64');
 try{
  await fs.mkdir(path.join(home,'.codex'),{recursive:true});await fs.mkdir(work);await fs.mkdir(path.join(work,'.git'));
  const snapshot=()=>({metadata:{observation_id:'PRIVATE:'+steps,done:false},image,mimeType:'image/png'});
  bridge=await startGameBridge({step:async args=>{
   assert.equal(args.request_id,'original-2');assert.equal(args.observation_id,'PRIVATE:0');steps++;return snapshot();
  }},{imageOnly:true,schema:{type:'object',properties:{request_id:{type:'string'},observation_id:{type:'string'},action:{type:'object'}},required:['request_id','observation_id','action']},
   description:'Play the game.',toolResult:s=>({structuredContent:s.metadata,content:[{type:'image',data:s.image,mimeType:s.mimeType}]})});
  bridge.initialize(snapshot());
  gateway=await startGateway({...settings,baseURL:'https://not-used.test',key:'host-secret',output:path.join(directory,'api'),
   onRequest:()=>bridge.modelRequest(),onInvalidGameTool:message=>bridge.rejectGameTool(message),fetcher:async(_url,options)=>{
    calls++;const sent=JSON.parse(options.body),chat=transport==='chat-completions',history=chat?sent.messages:sent.input;
    try{
     assert.equal(chat?sent.tools[0].function.name:sent.tools[0].name,GAME_TOOL);
     assert(!JSON.stringify(sent).includes('PRIVATE:'));assert(!JSON.stringify(sent).includes('observation_id'));
     assert.equal((JSON.stringify(history).match(/data:image\//g)??[]).length,calls<3?1:2);
     if(calls===2){
      assert.equal(steps,0);assert(JSON.stringify(history).includes(INVALID_GAME_TOOL_MESSAGE));
      if(chat)assert(history.some(m=>m.role==='assistant'&&m.reasoning_content==='Original reasoning 1.'));
      else assert(history.some(i=>i.type==='function_call_output'&&JSON.stringify(i.output).includes(INVALID_GAME_TOOL_MESSAGE)));
     }
     if(calls===3)assert.equal(steps,1);
    }catch(e){failure=e;}
    const item=functionItem(calls===1?(settings.family==='deepseek'?'exec_command':'game__game_step'):GAME_TOOL,calls);
    if(chat)return Response.json({choices:[{index:0,message:calls<=2?{role:'assistant',content:null,reasoning_content:'Original reasoning '+calls+'.',tool_calls:[{type:'function',id:item.call_id,function:{name:item.name,arguments:item.arguments}}]}:{role:'assistant',content:'Done.'},finish_reason:calls<=2?'tool_calls':'stop'}],usage:{prompt_tokens:10,completion_tokens:2}});
    const r={...response(calls<=2?[item]:[{type:'message',id:'final_message',role:'assistant',status:'completed',content:[{type:'output_text',text:'Done.',annotations:[]}]}]),model:settings.model,id:'resp_'+calls};
    return transport==='responses-sse'?new Response(responseStream(r,{}),{headers:{'content-type':'text/event-stream'}}):Response.json(r);
   }});
  const catalog=path.join(home,'.codex/models.json');await fs.writeFile(catalog,JSON.stringify(await customCatalog(settings)));
  await fs.writeFile(path.join(home,'.codex/config.toml'),codexConfig({...settings,catalog,gateway:gateway.url,socketPath:bridge.socketPath,token:bridge.token,proxy:fileURLToPath(new URL('../scripts/codex-eval/game-proxy.mjs',import.meta.url))}));
  await fs.writeFile(path.join(work,'AGENTS.md'),'Use game_step to play the game.');await fs.writeFile(path.join(work,'initial.png'),Buffer.from(image,'base64'));
  child=spawn('codex',codexArguments({workspace:work,image:path.join(work,'initial.png')}),{cwd:work,env:codexEnvironment({home,token:gateway.token}),stdio:['ignore','pipe','pipe']});
  child.stdout.on('data',b=>stdout+=b);child.stderr.on('data',b=>stderr+=b);
  const timer=setTimeout(()=>child.kill('SIGTERM'),35000);const exit=await new Promise((r,j)=>{child.once('error',j);child.once('exit',r);});clearTimeout(timer);
  const diagnostics=(stdout+'\n'+stderr).replace(/"data":"[^"]*"/g,'"data":"[image omitted]"');
  assert.equal(exit,0,diagnostics);if(failure)throw failure;assert.equal(calls,3,diagnostics);assert.equal(steps,1);
  assert.deepEqual(gateway.calls.map(c=>c.images),[1,1,2]);assert.equal(gateway.calls.filter(c=>c.invalidToolFeedback).length,1);assert(gateway.calls.every(c=>!c.securityViolation));
  assert.equal(gateway.usage().input_tokens,30);assert.equal(gateway.usage().output_tokens,6);
 }finally{child?.kill('SIGTERM');await gateway?.close();await bridge?.close();await fs.rm(directory,{recursive:true,force:true});}
});
