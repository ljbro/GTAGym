// Discover the installed Codex's own GENERIC fallback instructions locally.
// No provider call, downloaded prompt, GPT model alias or base-prompt rewrite.
import fs from 'node:fs/promises';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {bundledCatalog,gatewayCatalog} from './cli-catalog.mjs';
import {codexEnvironment,DISABLED_FEATURES} from './policy.mjs';
import {modelSettings} from './providers.mjs';
export async function customCatalog({model,codexBin='codex',contextWindow,effort}){
 const settings=modelSettings({model,contextWindow,effort}),bundled=await bundledCatalog();contextWindow=settings.contextWindow;
 if(settings.family==='gpt'){
  const native=gatewayCatalog(bundled,model),info=native.models[0];
  if(!info.input_modalities?.includes('image'))throw Error('Installed Codex model does not support screenshots');
  return {models:[{...info,default_reasoning_level:settings.effort,context_window:contextWindow,max_context_window:contextWindow,prefer_websockets:false,
   include_skills_usage_instructions:false,include_apps_usage_instructions:false,include_plugin_usage_instructions:false,
   supports_search_tool:false,supports_reasoning_summary_parameter:true,experimental_supported_tools:[]}]};
 }
 const directory=await fs.mkdtemp(path.join(os.tmpdir(),'gta-codex-metadata-'));let child,instructions,logs='',shape;
 const server=http.createServer(async(req,res)=>{
  const parts=[];for await(const b of req)parts.push(b);const body=JSON.parse(Buffer.concat(parts));
  instructions=body.instructions??(body.input?.[0]?.role==='developer'?body.input[0].content?.filter(c=>c.type==='input_text').map(c=>c.text).join('\n'):undefined);
  shape={keys:Object.keys(body),instructions:body.instructions,input:body.input?.map(i=>({role:i.role,type:i.type,content:i.content?.map(c=>({type:c.type,text:c.text?.slice(0,150)}))}))};
  const response={id:'resp_metadata_probe',object:'response',created_at:1,status:'completed',model,output:[],usage:{input_tokens:0,output_tokens:0,total_tokens:0}};
  res.writeHead(200,{'content-type':'text/event-stream'});res.end('event: response.completed\ndata: '+JSON.stringify({type:'response.completed',response})+'\n\n');
 });
 try{
  server.listen(0,'127.0.0.1');await once(server,'listening');await fs.mkdir(path.join(directory,'.codex'));
  const config=[`model = ${JSON.stringify(model)}`,'model_provider = "local_metadata_probe"','approval_policy = "never"','sandbox_mode = "read-only"',
   '[features]',...DISABLED_FEATURES.map(k=>k+' = false'),'skip_host_skill_discovery = true',
   '[model_providers.local_metadata_probe]','name = "Local metadata probe; never a real provider"',`base_url = "http://127.0.0.1:${server.address().port}/v1"`,
   'wire_api = "responses"','env_key = "OPENAI_API_KEY"','supports_websockets = false','request_max_retries = 0','stream_max_retries = 0'].join('\n');
  await fs.writeFile(path.join(directory,'.codex/config.toml'),config);
  child=spawn(codexBin,['exec','--json','--ephemeral','--strict-config','--ignore-rules','--skip-git-repo-check','--','Local metadata probe only.'],{cwd:directory,env:codexEnvironment({home:directory,token:'local-fixture-only'}),stdio:['ignore','pipe','pipe']});
  for(const stream of [child.stdout,child.stderr])stream.on('data',b=>logs+=b);
  const timer=setTimeout(()=>child.kill('SIGKILL'),15000);const exit=await new Promise((r,j)=>{child.once('error',j);child.once('exit',r);});clearTimeout(timer);
  if(exit!==0||typeof instructions!=='string'||instructions.length<100)throw Error('Cannot obtain installed Codex fallback instructions: '+JSON.stringify(shape)+' '+logs.slice(-1000));
  // Copy the installed schema's structural defaults, NOT another model's
  // instructions. Override provider-verified Qwen capabilities explicitly.
  const template=bundled.models.find(m=>m.slug==='gpt-5.5');if(!template)throw Error('Unsupported Codex metadata schema');
  const info={...template,slug:model,display_name:model,description:'Provider-hosted '+settings.family+' model; screenshot support must pass the live probe',
   model_messages:undefined,base_instructions:instructions,prefer_websockets:false,use_responses_lite:false,
   support_verbosity:false,default_verbosity:null,apply_patch_tool_type:null,web_search_tool_type:'text',input_modalities:['text','image'],
   supports_image_detail_original:false,supports_parallel_tool_calls:true,tool_mode:null,multi_agent_version:null,
   include_skills_usage_instructions:false,include_apps_usage_instructions:false,include_plugin_usage_instructions:false,
   context_window:contextWindow,max_context_window:contextWindow,auto_compact_token_limit:null,
   default_reasoning_level:settings.effort,supported_reasoning_levels:settings.levels.map(effort=>({effort,description:effort})),
   supports_reasoning_summary_parameter:true,supports_reasoning_summaries:true,experimental_supported_tools:[],
   supports_search_tool:false,upgrade:null,minimal_client_version:'0.163.0',available_in_plans:[],service_tiers:[],additional_speed_tiers:[],default_service_tier:null};
  return {models:[info]};
 }finally{child?.kill('SIGTERM');server.closeAllConnections();await new Promise(r=>server.close(r));await fs.rm(directory,{recursive:true,force:true});}
}
