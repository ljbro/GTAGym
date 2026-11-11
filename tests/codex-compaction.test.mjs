import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {spawn} from 'node:child_process';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {gunzipSync} from 'node:zlib';
import {COMPACTION_PREFIX,GAME_TOOL,isCompactionRequest,prepareRequest,codexConfig,codexEnvironment} from '../scripts/codex-eval/policy.mjs';
import {startGateway} from '../scripts/codex-eval/gateway.mjs';
import {modelSettings,providerWire} from '../scripts/codex-eval/providers.mjs';
import {responseStream} from '../scripts/codex-eval/chat-adapter.mjs';
import {startGameBridge} from '../scripts/codex-eval/game-bridge.mjs';
import {customCatalog} from '../scripts/codex-eval/catalog.mjs';
import {codexArguments} from '../scripts/codex-eval/run.mjs';

const model='deepseek-flash';
const tool={type:'function',name:GAME_TOOL,parameters:{type:'object',properties:{}}};
const compactText=COMPACTION_PREFIX+' Create a handoff summary for another LLM that will resume the task.';
const history=[
 {type:'message',role:'user',content:[{type:'input_text',text:'play the game use game_step'},{type:'input_image',image_url:'data:image/png;base64,fixture'}]},
 {type:'function_call',name:'game_step',namespace:'mcp__game',call_id:'call_1',arguments:'{"request_id":"a","action":{"keys":[]}}'},
 {type:'function_call_output',call_id:'call_1',output:[{type:'input_image',image_url:'data:image/png;base64,next'}]},
];
const compact=(extra={})=>({model,tools:[],tool_choice:'auto',stream:true,input:[...history,{type:'message',role:'user',content:[{type:'input_text',text:compactText}]}],...extra});
const result=(output,status='completed')=>({id:'resp_fixture',object:'response',model,status,output,usage:{input_tokens:10,output_tokens:2,total_tokens:12}});
const message=text=>({type:'message',id:'msg_fixture',role:'assistant',status:'completed',content:[{type:'output_text',text,annotations:[]}]});
const call=(name=GAME_TOOL)=>({type:'function_call',id:'fc_fixture',call_id:'call_fixture',name,arguments:'{}',status:'completed'});

test('native summary mode preserves all history, canonicalizes only legal past calls and grants zero tools',()=>{
 const body=compact(),before=JSON.stringify(body),p=prepareRequest(body,model);
 assert(isCompactionRequest(body));assert.equal(p.mode,'compaction');assert.equal(p.target,null);
 assert.deepEqual(p.wire.tools,[]);assert.equal(p.wire.tool_choice,'none');assert.equal(p.wire.parallel_tool_calls,false);
 assert.equal(p.wire.max_output_tokens,32768);assert.deepEqual(p.audit.tools,[]);assert.equal(p.audit.mode,'compaction');assert.equal(p.audit.images,2);
 assert.equal(p.wire.input.length,body.input.length);assert.equal(p.wire.input[1].name,GAME_TOOL);assert(!('namespace'in p.wire.input[1]));
 assert.deepEqual(p.wire.input.at(-1),body.input.at(-1));assert.equal(JSON.stringify(body),before,'The archived native input must remain unchanged');
 assert.equal(prepareRequest({model,tools:[tool],input:[]},model).mode,'action');
});
test('empty or forged catalogs and forbidden historical invocations do not bypass the game-only allowlist',()=>{
 for(const body of [compact({input:[]}),compact({input:[{role:'user',content:'Play the game.'}]}),
  compact({input:[{role:'user',content:compactText},{role:'assistant',content:'not a native compaction request'}]}),
  compact({tools:[{type:'function',name:'exec'}]}),compact({tools:undefined}),
  compact({input:[{role:'user',content:[{type:'input_text',text:compactText},{type:'input_image',image_url:'data:image/png;base64,no'}]}]})]){
  assert(!isCompactionRequest(body));assert.throws(()=>prepareRequest(body,model),/Only game_step/);
 }
 for(const bad of [{type:'function_call',name:'exec'},{type:'function_call',name:'game_step'},
  {type:'function_call',name:GAME_TOOL,namespace:'shell'},{type:'custom_tool_call',name:'apply_patch'},{type:'web_search_call'}]){
  const b=compact();b.input.splice(1,0,bad);assert.throws(()=>prepareRequest(b,model),/Forbidden/);
 }
 assert.throws(()=>prepareRequest(compact({model:'another-model'}),model),/Unexpected model/);
 for(const tool_choice of ['required',{type:'function',name:GAME_TOOL}])assert.throws(()=>prepareRequest(compact({tool_choice}),model),/Forbidden compaction tool choice/);
});

test('only Kimi compaction omits tool_choice, preserving action settings, history, effort and zero tools',()=>{
 const settings=modelSettings({model:'kimi-k3'}),prepared=prepareRequest(compact({model:settings.model}),settings.model);
 const wire=providerWire(prepared.wire,settings,{mode:prepared.mode});
 assert(!Object.hasOwn(wire,'tool_choice'));assert.deepEqual(wire.tools,[]);assert.equal(wire.parallel_tool_calls,false);assert.equal(wire.reasoning.effort,'max');
 assert.deepEqual(wire.input,prepared.wire.input);assert.equal(prepared.wire.tool_choice,'none','Do not mutate the generic policy or archived request');
 assert.equal(providerWire({...prepared.wire,tools:[tool],tool_choice:'auto'},settings,{mode:'action'}).tool_choice,'auto');
 assert.equal(providerWire(prepared.wire,modelSettings({model:'deepseek-flash'}),{mode:'compaction'}).tool_choice,'none');
 assert.throws(()=>providerWire({...prepared.wire,tools:[tool]},settings,{mode:'compaction'}),/zero tools/);
});

for(const [api,fixtureModel]of [['responses','deepseek-flash'],['responses','kimi-k3'],['chat-completions','glm-5.3-flash']])test(fixtureModel+' '+api+': action, summary, action keep the observation binding and full token ledger intact',async()=>{
 const directory=await fs.mkdtemp(path.join(os.tmpdir(),'gta-compaction-gateway-'));let bound=0,requests=0;
 const g=await startGateway({model:fixtureModel,api,baseURL:'https://not-used.test/v1',key:'host-only',output:path.join(directory,'api'),onRequest:()=>bound++,fetcher:async(url,options)=>{
  requests++;const body=JSON.parse(options.body),isSummary=body.tools.length===0;
  assert.equal(body.model,fixtureModel);assert.equal(isSummary,requests===2);
  if(isSummary){if(fixtureModel==='kimi-k3')assert(!Object.hasOwn(body,'tool_choice'));else assert.equal(body.tool_choice,'none');assert.equal(bound,1);}
  else {assert.equal(body.tools.length,1);assert.equal(api==='responses'?body.tools[0].name:body.tools[0].function.name,GAME_TOOL);}
  if(api==='responses')return Response.json({...result([message(isSummary?'Handoff summary.':'Ordinary model reply.')]),model:fixtureModel});
  return Response.json({id:'chat_fixture',model:fixtureModel,choices:[{message:{role:'assistant',content:isSummary?'Handoff summary.':'Ordinary model reply.'},finish_reason:'stop'}],usage:{prompt_tokens:10,completion_tokens:2}});
 }});
 try{
  for(const request of [{model:fixtureModel,tools:[tool],input:[],stream:true},compact({model:fixtureModel}),{model:fixtureModel,tools:[tool],input:[],stream:true}]){
   const r=await fetch(g.url+'/v1/responses',{method:'POST',headers:{authorization:'Bearer '+g.token},body:JSON.stringify(request)});
   assert.equal(r.status,200,await r.clone().text());await r.text();
  }
  await new Promise(r=>setTimeout(r,10));assert.equal(bound,2);assert.deepEqual(g.calls.map(c=>c.mode),['action','compaction','action']);
  assert.deepEqual(g.calls.map(c=>c.tools.length),[1,0,1]);assert.equal(g.usage().input_tokens,30);assert.equal(g.usage().output_tokens,6);
  const saved=JSON.parse(gunzipSync(await fs.readFile(path.join(directory,'api/000002-request.json.gz'))).toString());assert.deepEqual(saved.tools,[]);if(fixtureModel==='kimi-k3')assert(!Object.hasOwn(saved,'tool_choice'));else assert.equal(saved.tool_choice,'none');
 }finally{await g.close();await fs.rm(directory,{recursive:true,force:true});}
});

for(const api of ['responses','chat-completions'])for(const name of [GAME_TOOL,'exec'])test(api+': even '+name+' is forbidden in a compaction result',async()=>{
 const directory=await fs.mkdtemp(path.join(os.tmpdir(),'gta-compaction-guard-'));let violations=0;
 const g=await startGateway({model:api==='responses'?model:'glm-5.3-flash',api,baseURL:'https://not-used.test/v1',key:'host-only',output:path.join(directory,'api'),onViolation:()=>violations++,fetcher:async()=>{
  if(api==='responses')return new Response(responseStream(result([message('Looks valid first.'),call(name)]),{name}),{headers:{'content-type':'text/event-stream'}});
  return Response.json({choices:[{message:{role:'assistant',content:'Looks valid first.',tool_calls:[{id:'call_bad',type:'function',function:{name,arguments:'{}'}}]},finish_reason:'tool_calls'}],usage:{prompt_tokens:10,completion_tokens:2}});
 }});
 try{
  const r=await fetch(g.url+'/v1/responses',{method:'POST',headers:{authorization:'Bearer '+g.token},body:JSON.stringify(compact({model:api==='responses'?model:'glm-5.3-flash'}))});
  assert.equal(r.status,502);assert(!(await r.text()).includes('Looks valid first.'));assert.equal(violations,1);
 }finally{await g.close();await fs.rm(directory,{recursive:true,force:true});}
});
test('argument-only invocation events and missing/truncated summaries are not forwarded',async()=>{
 for(const [index,providerResponse]of [
  ()=>new Response('event: response.function_call_arguments.delta\ndata: '+JSON.stringify({type:'response.function_call_arguments.delta',delta:'{}'})+'\n\n',{headers:{'content-type':'text/event-stream'}}),
  ()=>Response.json(result([])),()=>Response.json(result([message('partial')],'incomplete')),
  ()=>new Response('event: response.created\ndata: '+JSON.stringify({type:'response.created',response:result([],'in_progress')})+'\n\n',{headers:{'content-type':'text/event-stream'}}),
 ].entries()){
  const directory=await fs.mkdtemp(path.join(os.tmpdir(),'gta-compaction-invalid-'));
  const g=await startGateway({model,baseURL:'https://not-used.test/v1',key:'private',output:path.join(directory,'api'),fetcher:async()=>providerResponse()});
  try{const r=await fetch(g.url+'/v1/responses',{method:'POST',headers:{authorization:'Bearer '+g.token},body:JSON.stringify(compact())});assert.equal(r.status,502,'Invalid fixture '+index);await r.text();}
  finally{await g.close();await fs.rm(directory,{recursive:true,force:true});}
 }
});

for(const fixtureModel of ['deepseek-flash','glm-5.3-flash','kimi-k3'])test(fixtureModel+': actual Codex automatically compacts and then resumes game_step',{timeout:60000},async()=>{
 const directory=await fs.mkdtemp(path.join(os.tmpdir(),'gta-native-compaction-')),home=path.join(directory,'home'),workspace=path.join(directory,'work');
 const settings=modelSettings({model:fixtureModel,contextWindow:64000});let bridge,gateway,child,steps=0,actions=0,summaries=0,logs='',errors='',failure,timer;
 const sharp=createRequire(import.meta.url)('sharp');
 const image=(await sharp({create:{width:1280,height:720,channels:3,background:'#334455'}}).png().toBuffer()).toString('base64');
 const snapshot=n=>({metadata:{observation_id:'PRIVATE:'+n,done:false},image,mimeType:'image/png'});
 try{
  await fs.mkdir(path.join(home,'.codex'),{recursive:true});await fs.mkdir(workspace);await fs.mkdir(path.join(workspace,'.git'));
  bridge=await startGameBridge({step:async args=>{assert.equal(args.observation_id,'PRIVATE:'+steps);steps++;return snapshot(steps);}},
   {imageOnly:true,schema:{type:'object',properties:{request_id:{type:'string'},observation_id:{type:'string'},action:{type:'object',properties:{keys:{type:'array',items:{type:'string'}}}}},required:['request_id','observation_id','action']},
    description:'Advance the game.',toolResult:s=>({structuredContent:s.metadata,content:[{type:'image',data:s.image,mimeType:s.mimeType}]})});
  bridge.initialize(snapshot(0));
  gateway=await startGateway({...settings,baseURL:'https://not-used.test/v1',key:'fixture',output:path.join(directory,'api'),onRequest:()=>bridge.modelRequest(),fetcher:async(_url,options)=>{
   const body=JSON.parse(options.body),compacting=body.tools.length===0,chat=settings.api==='chat-completions';
   try{
    assert(!JSON.stringify(body).includes('observation_id'));assert(!JSON.stringify(body).includes('PRIVATE:'));
    if(compacting){summaries++;assert.equal(actions,1);assert.equal(steps,1);if(fixtureModel==='kimi-k3')assert(!Object.hasOwn(body,'tool_choice'));else assert.equal(body.tool_choice,'none');assert(JSON.stringify(body).includes(COMPACTION_PREFIX));
     if(chat)assert(body.messages.some(m=>m.reasoning_content==='original reasoning before compaction'));
    }
    else {actions++;assert.equal(body.tools.length,1);if(actions===2){assert.equal(summaries,1);
     if(chat){assert(body.messages.some(m=>JSON.stringify(m.content).includes('One game_step action was performed')));assert(!body.messages.some(m=>m.reasoning_content==='original reasoning before compaction'),'Do not restore reasoning that native Codex compacted away');}
    }}
   }catch(e){failure=e;}
   const summary='The game is in progress. One game_step action was performed. Continue with game_step from the current screenshot, then finish this local probe. No other tools are available.';
   const text=compacting?summary:'Probe completed.';
   const invocation={id:'call_'+actions,type:'function',function:{name:GAME_TOOL,arguments:JSON.stringify({request_id:'probe-'+actions,action:{keys:[]}})}};
   const shouldCall=!compacting&&actions<=2;
   const inputTokens=!compacting&&actions===1?50000:1000;
   if(chat)return Response.json({id:'chat_'+actions+'_'+summaries,model:fixtureModel,choices:[{message:shouldCall?{role:'assistant',content:null,reasoning_content:actions===1?'original reasoning before compaction':'new reasoning after compaction',tool_calls:[invocation]}:{role:'assistant',content:text},finish_reason:shouldCall?'tool_calls':'stop'}],usage:{prompt_tokens:inputTokens,completion_tokens:10}});
   return Response.json({id:'resp_'+actions+'_'+summaries,object:'response',model:fixtureModel,status:'completed',output:shouldCall?[{...call(),id:'fc_'+actions,call_id:invocation.id,arguments:invocation.function.arguments}]:[message(text)],usage:{input_tokens:inputTokens,output_tokens:10,total_tokens:inputTokens+10}});
  }});
  const catalog=path.join(home,'.codex/models.json');await fs.writeFile(catalog,JSON.stringify(await customCatalog(settings)));
  const config=codexConfig({...settings,catalog,gateway:gateway.url,socketPath:bridge.socketPath,token:bridge.token,proxy:fileURLToPath(new URL('../scripts/codex-eval/game-proxy.mjs',import.meta.url))})
   .replace('web_search =','model_auto_compact_token_limit = 20000\nweb_search =');
  await fs.writeFile(path.join(home,'.codex/config.toml'),config);await fs.writeFile(path.join(workspace,'AGENTS.md'),'Use game_step to play the game.');await fs.writeFile(path.join(workspace,'initial.png'),Buffer.from(image,'base64'));
  child=spawn('codex',codexArguments({workspace,image:path.join(workspace,'initial.png')}),{cwd:workspace,env:codexEnvironment({home,token:gateway.token}),stdio:['ignore','pipe','pipe']});
  child.stdout.on('data',b=>logs+=b);child.stderr.on('data',b=>errors+=b);timer=setTimeout(()=>child.kill('SIGTERM'),45000);
  const exit=await new Promise((r,j)=>{child.once('error',j);child.once('exit',r);});clearTimeout(timer);
  assert.equal(exit,0,logs+'\n'+errors);if(failure)throw failure;
  assert.equal(summaries,1,logs+'\n'+errors);assert.equal(steps,2);assert.equal(actions,3);
  assert.deepEqual(gateway.calls.map(c=>c.mode),['action','compaction','action','action']);assert(gateway.calls.every(c=>!c.securityViolation));
  assert.equal(gateway.usage().input_tokens,53000);assert.equal(gateway.usage().output_tokens,40);
 }finally{clearTimeout(timer);if(child?.exitCode===null&&child.signalCode===null){child.kill('SIGTERM');await new Promise(r=>child.once('exit',r));}await gateway?.close();await bridge?.close();await fs.rm(directory,{recursive:true,force:true});}
});
