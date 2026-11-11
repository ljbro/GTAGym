import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import {codexConfig,codexEnvironment,prepareRequest,guardItem,GAME_TOOL,imageToolResult} from '../scripts/codex-eval/policy.mjs';
import {startGateway} from '../scripts/codex-eval/gateway.mjs';
import {startGameBridge} from '../scripts/codex-eval/game-bridge.mjs';
import {customCatalog} from '../scripts/codex-eval/catalog.mjs';
import {codexArguments} from '../scripts/codex-eval/run.mjs';
import {INITIAL_USER_PROMPT} from '../scripts/game-mcp/public-observation.mjs';
test('Codex gateway offers game_step only and blocks all other invocation types',()=>{
 const tools=[{type:'function',name:'shell'},{type:'function',name:GAME_TOOL}];
 const p=prepareRequest({model:'Qwen3.8-27B',tools,input:[]},'Qwen3.8-27B');
 assert.deepEqual(p.wire.tools,[tools[1]]);assert.equal(p.wire.max_output_tokens,32768);
 for(const item of [{type:'function_call',name:'shell'},{type:'custom_tool_call',name:'apply_patch'},{type:'web_search_call'},{type:'tool_search_call'}])assert.throws(()=>guardItem(item,p.target),/Forbidden/);
 guardItem({type:'function_call',name:GAME_TOOL},p.target);
 assert.throws(()=>prepareRequest({model:'gpt-6.1-sol',tools},'Qwen3.8-27B'),/Unexpected model/);
 assert(!Object.hasOwn(codexEnvironment({home:'/tmp/isolated',token:'not-provider-key'}),'ANTHROPIC_API_KEY'));
});
test('real native Codex sends the initial image, uses the ONLY permitted game tool and receives next image',{timeout:45000},async()=>{
 const directory=await fs.mkdtemp(path.join(os.tmpdir(),'gta-codex-probe-')),home=path.join(directory,'home'),work=path.join(directory,'work');
 let bridge,gateway,child,calls=0,steps=0,logs='',errors='',failure;
 const sharp=createRequire(import.meta.url)('sharp');
 const image=(await sharp({create:{width:1280,height:720,channels:3,background:'#334455'}}).png().toBuffer()).toString('base64');
 try{
  await fs.mkdir(path.join(home,'.codex'),{recursive:true});await fs.mkdir(work);await fs.mkdir(path.join(work,'.git'));
  bridge=await startGameBridge({step:async args=>{assert.equal(args.observation_id,'PRIVATE_SESSION:0');steps++;return {metadata:{observation_id:'PRIVATE_SESSION:1',done:false},image,mimeType:'image/png'};}},
   {imageOnly:true,schema:{type:'object',properties:{request_id:{type:'string'},observation_id:{type:'string'},action:{type:'object',properties:{keys:{type:'array',items:{type:'string'}}}}},required:['request_id','observation_id','action']},description:'Execute a game action.',toolResult:s=>({structuredContent:s.metadata,content:[{type:'text',text:JSON.stringify(s.metadata)},{type:'image',data:s.image,mimeType:s.mimeType}]})});
  bridge.initialize({metadata:{observation_id:'PRIVATE_SESSION:0'},image,mimeType:'image/png'});
  gateway=await startGateway({model:'Qwen3.8-27B',baseURL:'https://not-used.test',key:'host-only-fixture',output:path.join(directory,'api'),onRequest:()=>bridge.modelRequest(),fetcher:async(_url,req)=>{
   calls++;const payload=JSON.parse(req.body);try{assert.equal(payload.tools.length,1);assert.equal(payload.tools[0].name,GAME_TOOL);assert(JSON.stringify(payload).includes('data:image/'));assert(!JSON.stringify(payload).includes('<skills_instructions>'));assert(!JSON.stringify(payload).includes('observation_id'));assert(!JSON.stringify(payload).includes('PRIVATE_SESSION'));}catch(e){failure=e;}
   const item=calls===1?{type:'function_call',id:'fc_1',call_id:'call_1',name:GAME_TOOL,arguments:JSON.stringify({request_id:'probe',action:{keys:[]}}),status:'completed'}:
    {type:'message',id:'msg_2',role:'assistant',status:'completed',content:[{type:'output_text',text:'Probe completed.',annotations:[]}]};
   const response={id:'resp_'+calls,object:'response',model:'Qwen3.8-27B',status:'completed',output:[item],usage:{input_tokens:10,output_tokens:5,total_tokens:15}};
   const events=[{type:'response.created',response:{...response,status:'in_progress',output:[]}},{type:'response.output_item.added',output_index:0,item},
    {type:'response.output_item.done',output_index:0,item},{type:'response.completed',response}];
   return new Response(events.map((e,n)=>'event: '+e.type+'\ndata: '+JSON.stringify({...e,sequence_number:n})+'\n\n').join(''),{headers:{'content-type':'text/event-stream'}});
  }});
  const catalog=path.join(home,'.codex/models.json');await fs.writeFile(catalog,JSON.stringify(await customCatalog({model:'Qwen3.8-27B'})));
  await fs.writeFile(path.join(home,'.codex/config.toml'),codexConfig({model:'Qwen3.8-27B',catalog,gateway:gateway.url,socketPath:bridge.socketPath,token:bridge.token,proxy:fileURLToPath(new URL('../scripts/codex-eval/game-proxy.mjs',import.meta.url))}));
  await fs.writeFile(path.join(work,'AGENTS.md'),'Use game_step to play. Objective in the image.');await fs.writeFile(path.join(work,'initial.png'),Buffer.from(image,'base64'));
  const args=codexArguments({workspace:work,image:path.join(work,'initial.png'),metadata:{private:'MUST_NOT_BE_PASSED'}});assert.equal(args.at(-1),INITIAL_USER_PROMPT);
  child=spawn('codex',args,{cwd:work,env:codexEnvironment({home,token:gateway.token}),stdio:['ignore','pipe','pipe']});
  child.stdout.on('data',b=>logs+=b);child.stderr.on('data',b=>errors+=b);
  const timer=setTimeout(()=>child.kill('SIGTERM'),35000);const exit=await new Promise((r,j)=>{child.once('error',j);child.once('exit',r)});clearTimeout(timer);
  console.log('Codex native tool audit:',JSON.stringify(gateway.calls.map(c=>({tools:c.tools,filtered:c.filteredToolTypes,images:c.images,effort:c.effort}))));
  assert.equal(exit,0,logs+'\n'+errors);if(failure){failure.message+='\n'+logs+'\n'+errors;throw failure;}assert.equal(calls,2,logs+'\n'+errors);assert.equal(steps,1);assert.equal(gateway.calls[0].images,1);assert.equal(gateway.calls[1].images,2,'Actual native follow-up must include the NEXT screenshot, not just metadata');
 }finally{child?.kill('SIGTERM');await gateway?.close();await bridge?.close();await fs.rm(directory,{recursive:true,force:true});}
});
test('a late disallowed call in a provider stream never reaches Codex',async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'gta-codex-guard-'));let violations=0;
 const g=await startGateway({model:'Qwen3.8-27B',baseURL:'https://unused.test',key:'private',output:path.join(dir,'api'),onViolation:()=>violations++,fetcher:async()=>new Response([
  {type:'response.output_item.done',item:{type:'function_call',name:GAME_TOOL}},
  {type:'response.output_item.done',item:{type:'function_call',name:'shell',arguments:'touch CHEAT'}}
 ].map(e=>'data: '+JSON.stringify(e)+'\n\n').join(''),{headers:{'content-type':'text/event-stream'}})});
 try{
  const r=await fetch(g.url+'/v1/responses',{method:'POST',headers:{authorization:'Bearer '+g.token},body:JSON.stringify({model:'Qwen3.8-27B',tools:[{type:'function',name:GAME_TOOL}],input:[]})});
  assert.equal(r.status,502);assert(!(await r.text()).includes('touch CHEAT'));assert.equal(violations,1);
 }finally{await g.close();await fs.rm(dir,{recursive:true,force:true});}
});
test('trusted replica affinity is a host transport header, never model input',async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'gta-affinity-'));
 const previous=process.env.GTA_INFERENCE_AFFINITY_KEY;
 process.env.GTA_INFERENCE_AFFINITY_KEY='verified-replica-2';let g;
 try{
  g=await startGateway({model:'Qwen3.8-27B',baseURL:'https://unused.test',key:'host-only',output:path.join(dir,'api'),fetcher:async(_url,req)=>{
   assert.equal(req.headers['x-inspire-inference-key'],'verified-replica-2');
   assert(!req.body.includes('verified-replica-2'));
   return new Response(JSON.stringify({id:'resp_1',object:'response',status:'completed',model:'Qwen3.8-27B',output:[]}));
  }});
  const r=await fetch(g.url+'/v1/responses',{method:'POST',headers:{authorization:'Bearer '+g.token},body:JSON.stringify({model:'Qwen3.8-27B',tools:[{type:'function',name:GAME_TOOL}],input:[]})});
  assert.equal(r.status,200);assert(!(await r.text()).includes('verified-replica-2'));
  assert.equal(g.calls[0].inferenceAffinity,'verified-replica-2');
 }finally{if(previous===undefined)delete process.env.GTA_INFERENCE_AFFINITY_KEY;else process.env.GTA_INFERENCE_AFFINITY_KEY=previous;await g?.close();await fs.rm(dir,{recursive:true,force:true});}
});
