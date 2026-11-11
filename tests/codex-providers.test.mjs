import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {modelSettings,providerEndpoint} from '../scripts/codex-eval/providers.mjs';
import {chatRequest,chatCompletion,chatResponse,reasoningEnvelope} from '../scripts/codex-eval/chat-adapter.mjs';
import {parseCli,codexArguments} from '../scripts/codex-eval/run.mjs';
import {GAME_TOOL,codexConfig,codexEnvironment} from '../scripts/codex-eval/policy.mjs';
import {customCatalog} from '../scripts/codex-eval/catalog.mjs';
import {startGateway} from '../scripts/codex-eval/gateway.mjs';
import {startGameBridge} from '../scripts/codex-eval/game-bridge.mjs';

const imageURL='data:image/png;base64,fixture';
const tool={type:'function',name:GAME_TOOL,parameters:{type:'object',properties:{}}};
const initial={role:'user',content:[{type:'input_image',image_url:imageURL}]};
test('provider settings preserve exact model IDs, correct defaults and vendor endpoints',()=>{
 for(const [model,family,api,effort]of [['Qwen3.8-27B','qwen','responses','xhigh'],['kimi-k3','kimi','responses','max'],['glm-5.3-flash','glm','chat-completions','max'],['deepseek-flash','deepseek','responses','max'],['gpt-6.1-sol','gpt','responses','high'],['gpt-6-astra','gpt','responses','high']]){
  const value=modelSettings({model});assert.deepEqual([value.model,value.family,value.api,value.effort],[model,family,api,effort]);
  const options=parseCli(['--task','c01-n04','--model',model,'--base-url','https://test.invalid/v1']);assert.equal(options.effort,effort);assert.equal(options.api,api);
 }
 assert.equal(providerEndpoint('https://open.bigmodel.cn/api/coding/paas/v4','chat-completions'),'https://open.bigmodel.cn/api/coding/paas/v4/chat/completions');
 assert.equal(providerEndpoint('https://api.kimi.com/coding/v1/','responses'),'https://api.kimi.com/coding/v1/responses');
 assert.equal(providerEndpoint('https://api.deepseek.com','responses'),'https://api.deepseek.com/v1/responses');
 assert.equal(providerEndpoint('http://127.0.0.1:8080/v1/responses','models'),'http://127.0.0.1:8080/v1/models');
 assert.throws(()=>providerEndpoint('https://user:pass@test.invalid','responses'),/Invalid/);
 assert.throws(()=>modelSettings({model:'unknown-model'}),/Unsupported/);
 assert.throws(()=>modelSettings({model:'glm-5.3-flash',effort:'xhigh'}),/Unsupported/);
 assert.throws(()=>modelSettings({model:'kimi-k3',contextWindow:NaN}),/Invalid/);
 assert.throws(()=>parseCli(['--task','c01-n04','--model','gpt-6.1-sol','--base-url','https://test.invalid','--Bash','yes']),/Unknown/);
 for(const model of ['gpt-6.1-sol','gpt-6-astra']){
  assert.equal(modelSettings({model,effort:'xhigh'}).effort,'xhigh');
  assert.equal(parseCli(['--task','c01-n04','--model',model,'--base-url','https://test.invalid','--effort','xhigh']).effort,'xhigh');
 }
});
test('Chat bridge keeps parallel tool replies together, returns every image and replays original reasoning',()=>{
 const envelope=reasoningEnvelope(),settings=modelSettings({model:'glm-5.3-flash'});
 const converted=chatResponse({choices:[{message:{reasoning_content:'Original reasoning.',content:null,tool_calls:[{id:'a',type:'function',function:{name:GAME_TOOL,arguments:'{}'}}]},finish_reason:'tool_calls'}]},envelope,settings.model);
 const reasoning=converted.output[0];assert(reasoning.encrypted_content);assert(!reasoning.encrypted_content.includes('Original reasoning'));
 const request=chatRequest({model:settings.model,tools:[tool],max_output_tokens:32768,input:[initial,reasoning,
  {type:'function_call',call_id:'a',name:GAME_TOOL,arguments:'{}'},
  {type:'function_call',call_id:'b',name:GAME_TOOL,arguments:'{}'},
  {type:'function_call_output',call_id:'a',output:[{type:'input_text',text:'a result'},{type:'input_image',image_url:imageURL}]},
  {type:'function_call_output',call_id:'b',output:[{type:'input_text',text:'b result'},{type:'input_image',image_url:imageURL}]},
 ]},settings,envelope);
 assert.deepEqual(request.messages.map(m=>m.role),['user','assistant','tool','tool','user']);
 assert.equal(request.messages[1].reasoning_content,'Original reasoning.');assert.equal(request.messages[1].tool_calls.length,2);assert.equal(request.messages.at(-1).content.length,2);
 assert.equal(request.reasoning_effort,'max');assert.equal(request.thinking.type,'enabled');assert.equal(request.max_tokens,32768);
 const bad={...reasoning,encrypted_content:reasoning.encrypted_content.slice(0,-8)+'garbage'};
 assert.throws(()=>chatRequest({tools:[tool],input:[bad]},settings,envelope),/Invalid provider reasoning/);
 assert.throws(()=>chatRequest({tools:[tool],input:[{type:'compaction',encrypted_content:'opaque'}]},settings,envelope),/Unsupported/);
});
test('Chat stream assembles fragmented function names/arguments and refuses truncated or forbidden results',()=>{
 const events=[{choices:[{index:0,delta:{reasoning_content:'thinking',tool_calls:[{index:0,id:'a',type:'function',function:{name:'mcp__game__',arguments:'{'}}]}}]},
  {choices:[{index:0,delta:{tool_calls:[{index:0,function:{name:'game_step',arguments:'}'}}]},finish_reason:'tool_calls'}],usage:{prompt_tokens:100,completion_tokens:10,prompt_cache_hit_tokens:20}},
 ];
 const buffer=Buffer.from(events.map(v=>'data: '+JSON.stringify(v)+'\r\n\r\n').join('')+'data: [DONE]\r\n\r\n');
 const completion=chatCompletion(buffer,true);assert.equal(completion.choices[0].message.tool_calls[0].function.name,GAME_TOOL);
 const response=chatResponse(completion,reasoningEnvelope(),'glm-5.3-flash');assert.equal(response.output.at(-1).arguments,'{}');assert.equal(response.usage.input_tokens_details.cached_tokens,20);
 assert.throws(()=>chatCompletion(buffer.subarray(0,buffer.length-20),true),/Incomplete|JSON/);
 completion.choices[0].message.tool_calls.push({id:'bad',type:'function',function:{name:'Bash',arguments:'echo cheat'}});
 assert.throws(()=>chatResponse(completion,reasoningEnvelope(),'glm-5.3-flash'),/Forbidden/);
 assert.throws(()=>chatResponse({choices:[{message:{content:'',reasoning_content:'only reasoning'},finish_reason:'stop'}]},reasoningEnvelope(),'glm-5.3-flash'),/Empty/);
});

for(const [model,api]of [['kimi-k3','auto'],['glm-5.3-flash','auto'],['deepseek-flash','auto'],['gpt-6.1-sol','auto'],['gpt-6-astra','auto'],['deepseek-flash','chat-completions'],['gpt-6.1-sol','chat-completions']])test(model+' '+api+': real native Codex uses game_step only and receives successive screenshots',{timeout:45000},async()=>{
 const directory=await fs.mkdtemp(path.join(os.tmpdir(),'gta-codex-provider-test-')),home=path.join(directory,'home'),work=path.join(directory,'work');
 let bridge,gateway,child,calls=0,steps=0,logs='',errors='',failure;
 const settings=modelSettings({model,api}),sharp=createRequire(import.meta.url)('sharp');
 const image=(await sharp({create:{width:1280,height:720,channels:3,background:'#334455'}}).png().toBuffer()).toString('base64');
 try{
  await fs.mkdir(path.join(home,'.codex'),{recursive:true});await fs.mkdir(work);await fs.mkdir(path.join(work,'.git'));
  bridge=await startGameBridge({step:async args=>{assert.equal(args.observation_id,'PRIVATE_SESSION:'+steps);steps++;return {metadata:{observation_id:'PRIVATE_SESSION:'+steps,done:false},image,mimeType:'image/png'};}},
   {schema:{type:'object',properties:{request_id:{type:'string'},observation_id:{type:'string'},action:{type:'object',properties:{keys:{type:'array',items:{type:'string'}}}}},required:['request_id','observation_id','action']},
    imageOnly:true,description:'Execute a game action.',toolResult:s=>({structuredContent:s.metadata,content:[{type:'text',text:JSON.stringify(s.metadata)},{type:'image',data:s.image,mimeType:s.mimeType}]})});
  bridge.initialize({metadata:{observation_id:'PRIVATE_SESSION:0'},image,mimeType:'image/png'});
  gateway=await startGateway({...settings,baseURL:'https://not-used.test/v1',key:'host-only-fixture',output:path.join(directory,'api'),onRequest:()=>bridge.modelRequest(),fetcher:async(url,req)=>{
   calls++;const payload=JSON.parse(req.body),chat=settings.api==='chat-completions',data=chat?payload.messages:payload.input;
   try{
    assert.equal(payload.model,model);assert.equal(payload.tools.length,1);assert.equal(chat?payload.tools[0].function.name:payload.tools[0].name,GAME_TOOL);
    assert.equal(chat?payload.reasoning_effort:payload.reasoning.effort,settings.effort);assert(!JSON.stringify(payload).includes('<skills_instructions>'));
    assert.equal((JSON.stringify(data).match(/data:image\//g)??[]).length,calls);
    assert(!JSON.stringify(payload).includes('observation_id'));assert(!JSON.stringify(payload).includes('PRIVATE_SESSION'));
    if(chat&&calls>1)assert(payload.messages.some(m=>m.role==='assistant'&&m.reasoning_content==='Original chain 1.'),'Missing provider reasoning in actual Codex follow-up');
   }catch(e){failure=e;}
   const call={id:'call_'+calls,type:'function',function:{name:GAME_TOOL,arguments:JSON.stringify({request_id:'probe-'+calls,action:{keys:[]}})}};
   if(chat){
    assert(url.endsWith('/chat/completions'));
    const message=calls<=2?{role:'assistant',content:null,reasoning_content:'Original chain '+calls+'.',tool_calls:[call]}:{role:'assistant',content:'Probe completed.'};
    return Response.json({id:'chat_'+calls,model,choices:[{index:0,message,finish_reason:calls<=2?'tool_calls':'stop'}],usage:{prompt_tokens:10,completion_tokens:5}});
   }
   assert(url.endsWith('/responses'));
   const item=calls<=2?{type:'function_call',id:'fc_'+calls,call_id:call.id,name:GAME_TOOL,arguments:call.function.arguments,status:'completed'}:
    {type:'message',id:'msg_'+calls,role:'assistant',status:'completed',content:[{type:'output_text',text:'Probe completed.',annotations:[]}]};
   const response={id:'resp_'+calls,object:'response',model,status:'completed',output:[item],usage:{input_tokens:10,output_tokens:5,total_tokens:15}};
   // Non-stream native providers are normalized for a streaming Codex client too.
   return Response.json(response);
  }});
  const catalog=path.join(home,'.codex/models.json');await fs.writeFile(catalog,JSON.stringify(await customCatalog(settings)));
  await fs.writeFile(path.join(home,'.codex/config.toml'),codexConfig({...settings,catalog,gateway:gateway.url,socketPath:bridge.socketPath,token:bridge.token,proxy:fileURLToPath(new URL('../scripts/codex-eval/game-proxy.mjs',import.meta.url))}));
  await fs.writeFile(path.join(work,'AGENTS.md'),'Use game_step to play. Objective in the image.');await fs.writeFile(path.join(work,'initial.png'),Buffer.from(image,'base64'));
  child=spawn('codex',codexArguments({workspace:work,image:path.join(work,'initial.png')}),{cwd:work,env:codexEnvironment({home,token:gateway.token}),stdio:['ignore','pipe','pipe']});
  child.stdout.on('data',b=>logs+=b);child.stderr.on('data',b=>errors+=b);
  const timer=setTimeout(()=>child.kill('SIGTERM'),35000);const exit=await new Promise((r,j)=>{child.once('error',j);child.once('exit',r);});clearTimeout(timer);
  assert.equal(exit,0,logs+'\n'+errors);if(failure)throw failure;assert.equal(calls,3,logs+'\n'+errors);assert.equal(steps,2,logs);
  assert.deepEqual(gateway.calls.map(c=>c.images),[1,2,3]);assert(gateway.calls.every(c=>c.tools.length===1&&!c.securityViolation));
  assert.equal(gateway.usage().input_tokens,30);assert.equal(gateway.usage().output_tokens,15);
 }finally{child?.kill('SIGTERM');await gateway?.close();await bridge?.close();await fs.rm(directory,{recursive:true,force:true});}
});

test('Chat adapter blocks forbidden tools before any response reaches native Codex',async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'gta-codex-chat-guard-'));let violations=0;
 const g=await startGateway({model:'glm-5.3-flash',baseURL:'https://unused.test/v4',key:'private',output:path.join(dir,'api'),onViolation:()=>violations++,fetcher:async()=>Response.json({choices:[{message:{tool_calls:[
  {id:'ok',type:'function',function:{name:GAME_TOOL,arguments:'{}'}},
  {id:'bad',type:'function',function:{name:'Bash',arguments:'touch CHEAT'}},
 ]},finish_reason:'tool_calls'}],usage:{prompt_tokens:15,completion_tokens:5}})});
 try{
  const r=await fetch(g.url+'/v1/responses',{method:'POST',headers:{authorization:'Bearer '+g.token},body:JSON.stringify({model:'glm-5.3-flash',tools:[tool],input:[initial],stream:true})});
  assert.equal(r.status,502);assert(!(await r.text()).includes('touch CHEAT'));assert.equal(violations,1);
  assert.equal(g.usage().input_tokens,15,'Billed rejected responses still count');
  assert((await fs.readdir(path.join(dir,'api'))).some(n=>n.endsWith('-response.json.gz')),'Raw rejected response must be retained');
 }finally{await g.close();await fs.rm(dir,{recursive:true,force:true});}
});
