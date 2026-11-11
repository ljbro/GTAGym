import path from 'node:path';
import {modelSettings} from './providers.mjs';
import {modelMcpMessage} from '../game-mcp/public-observation.mjs';

export const GAME_TOOL='mcp__game__game_step';
export const INVALID_GAME_TOOL_MESSAGE='invalid tool, only mcp__game__game_step is available';
export function isInvalidGameTool(item){
 return item?.type==='function_call'&&typeof item.name==='string'&&item.name!==GAME_TOOL&&
  item.namespace===undefined&&item.name.length<=128&&/^[a-zA-Z0-9_.-]+$/.test(item.name)&&item.name.includes('game_step');
}
export function isFeedbackEligibleTool(item,{allFunctionNames=false}={}){
 if(!allFunctionNames)return isInvalidGameTool(item);
 // DeepSeek can hallucinate shell/file tool names or malformed DSML names.
 // These are opaque audit data, never a capability to execute. Even namespace
 // mismatches receive an error receipt; only the exact flat wire tool is valid.
 return item?.type==='function_call'&&typeof item.name==='string'&&
  (item.name!==GAME_TOOL||item.namespace!==undefined);
}
export function invalidToolFeedbackPolicy(family){
 return {version:family==='deepseek'?'invalid-function-error-feedback-v2':'game-step-name-error-feedback-v1',
  maxConsecutiveFeedbacks:3,otherTools:family==='deepseek'?'function-calls-error-feedback-no-execution':'block'};
}
export const COMPACTION_PREFIX='You are performing a CONTEXT CHECKPOINT COMPACTION.';
const historyIdentities=[{name:GAME_TOOL},{name:'game_step',namespace:'mcp__game'},{name:GAME_TOOL,namespace:'functions'}];

/** Installed Codex's local compaction is an ordinary Responses request with an
 * empty tool list and a final native summary instruction. Do not accept every
 * empty catalog or search arbitrary earlier messages for a magic substring. */
export function isCompactionRequest(body){
 if(!Array.isArray(body.tools)||body.tools.length!==0||!Array.isArray(body.input))return false;
 const last=body.input.at(-1);
 if(last?.role!=='user'||last.type!==undefined&&last.type!=='message')return false;
 const content=last.content;
 const text=typeof content==='string'?content:Array.isArray(content)&&content.every(p=>['text','input_text'].includes(p.type)&&typeof p.text==='string')?content.map(p=>p.text).join(''):'';
 return text.trimStart().startsWith(COMPACTION_PREFIX);
}

function guardCompactionHistory(item){
 if(item?.type==='function_call'){
  if(!historyIdentities.some(t=>item.name===t.name&&(item.namespace??null)===(t.namespace??null)))throw Error('Forbidden tool invocation in compaction history');
 }else guardItem(item,{name:GAME_TOOL});
}

export function guardCompactionEvent(event){
 // Reject even argument-only invocation events, before forwarding any bytes.
 if(/(?:^|\.)[^.]*_call(?:[._]|$)/.test(event.type??''))throw Error('Forbidden tool invocation during compaction');
 if(['response.failed','response.incomplete','error'].includes(event.type))throw Error('Incomplete compaction response stream');
 for(const item of [event.item,...(event.output??[]),...(event.response?.output??[])].filter(Boolean)){
  if(!['message','reasoning'].includes(item.type))throw Error('Forbidden compaction response item: '+item.type);
  if(item.type==='message'&&(item.role!=='assistant'||!Array.isArray(item.content)||item.content.some(p=>!['output_text','refusal'].includes(p.type))))throw Error('Invalid compaction message');
 }
}

export function validateCompactionSummary(response){
 guardCompactionEvent(response);
 if(response.error||response.status!=='completed'||!(response.output??[]).some(item=>item.type==='message'&&item.content.some(p=>p.type==='output_text'&&typeof p.text==='string'&&p.text.trim())))throw Error('Invalid or incomplete compaction summary');
}
export function imageToolResult(result){
 // Removing only structuredContent would still leak duplicate text metadata.
 // Apply the shared image-only projection at the model boundary.
 return modelMcpMessage({result}).result;
}
export const DISABLED_FEATURES=['shell_tool','unified_exec','shell_snapshot','view_image','multi_agent','multi_agent_v2','apps','plugins','remote_plugin','skill_search','skill_mcp_dependency_install','browser_use','browser_use_external','computer_use','image_generation','goals','sleep_tool','hooks','workspace_dependencies','code_mode','code_mode_only','code_mode_host','tool_suggest','default_mode_request_user_input','unbounded_connection_retries','enable_request_compression'];
export function codexEnvironment({home,token,pathValue=process.env.PATH}){
 if(!path.isAbsolute(home)||!token)throw Error('Invalid isolated Codex environment');
 return {PATH:pathValue,HOME:home,CODEX_HOME:path.join(home,'.codex'),TMPDIR:home,OPENAI_API_KEY:token,
  NO_PROXY:'*',no_proxy:'*',NODE_USE_ENV_PROXY:'0',RUST_LOG:'error'};
}
export function codexConfig({model,gateway,socketPath,token,proxy,catalog,effort,timeoutMs=3600000,contextWindow,reasoningSummary='off'}){
 const settings=modelSettings({model,effort,contextWindow,reasoningSummary});({effort,contextWindow}=settings);
 if(new URL(gateway).hostname!=='127.0.0.1')throw Error('Invalid Codex model settings');
 // Use Codex's own generic custom-model instructions, with explicitly verified
 // capabilities. Never rename Qwen to GPT or use another model's instructions.
 return [`model = ${JSON.stringify(model)}`,'model_provider = "evaluation_relay"',`model_reasoning_effort = ${JSON.stringify(effort)}`,...catalog?[`model_catalog_json = ${JSON.stringify(catalog)}`]:[],
  `model_reasoning_summary = ${JSON.stringify(settings.reasoningSummary==='off'?'none':settings.reasoningSummary)}`,`model_context_window = ${contextWindow}`,
  'web_search = "disabled"','approval_policy = "never"','sandbox_mode = "read-only"',
  '[features]',...DISABLED_FEATURES.map(k=>k+' = false'),
  ...catalog?['[skills]',`config = [${['imagegen','openai-docs','skill-creator','skill-installer'].map(name=>'{ path = '+JSON.stringify(path.join(path.dirname(catalog),'skills/.system',name,'SKILL.md'))+', enabled = false }').join(', ')}]`]:[],
  '[analytics]','enabled = false','[feedback]','enabled = false',
  '[agents]','enabled = false','[model_providers.evaluation_relay]','name = "GTAbench guarded game_step-only model relay"',
  `base_url = ${JSON.stringify(gateway+'/v1')}`,'wire_api = "responses"','env_key = "OPENAI_API_KEY"','supports_websockets = false',
  `stream_idle_timeout_ms = ${timeoutMs}`,'request_max_retries = 2','stream_max_retries = 2',
  '[mcp_servers.game]',`command = ${JSON.stringify(process.execPath)}`,`args = [${JSON.stringify(proxy)}]`,
  'required = true','startup_timeout_sec = 120','tool_timeout_sec = 600','enabled_tools = ["game_step"]',
  '[mcp_servers.game.tools.game_step]','approval_mode = "approve"',
  '[mcp_servers.game.env]',`GTA_CODEX_GAME_SOCKET = ${JSON.stringify(socketPath)}`,`GTA_CODEX_GAME_TOKEN = ${JSON.stringify(token)}`,
 ].join('\n')+'\n';
}
function identity(tool,namespace){return {name:tool.name,...namespace?{namespace}:{}};}
export function gameTools(tools){
 if(!Array.isArray(tools))throw Error('Invalid tool catalog');
 const selected=[];
 for(const t of tools){
  if(t.type==='function'&&t.name===GAME_TOOL)selected.push({tool:t,target:identity(t)});
  else if(t.type==='namespace')for(const f of t.tools??[]){
   if(f.type==='function'&&(t.name==='mcp__game'&&f.name==='game_step'||t.name==='functions'&&f.name===GAME_TOOL))selected.push({tool:{...t,tools:[f]},target:identity(f,t.name)});
  }
 }
 if(selected.length!==1)throw Error('Only game_step must be available exactly once');
 return selected[0];
}
export function guardItem(item,target){
 if(!item||typeof item!=='object')return;
 if(item.type==='function_call'){
  if(item.name!==target.name||(item.namespace??null)!==(target.namespace??null))throw Error('Forbidden tool invocation');
 }else if(typeof item.type==='string'&&(item.type.endsWith('_call')||item.type==='custom_tool_call'))throw Error('Forbidden tool invocation: '+item.type);
}
export function prepareRequest(body,model,maxTokens=32768){
 if(body.model!==model)throw Error('Unexpected model selection');
 if(isCompactionRequest(body)){
  if(body.tool_choice!==undefined&&!['auto','none'].includes(body.tool_choice))throw Error('Forbidden compaction tool choice');
  for(const item of body.input)guardCompactionHistory(item);
  const wire={...body,tools:[],tool_choice:'none',parallel_tool_calls:false,input:body.input.map(item=>{
   if(item.type!=='function_call')return item;
   const value={...item,name:GAME_TOOL};delete value.namespace;return value;
  }),max_output_tokens:maxTokens};
  return {mode:'compaction',wire,target:null,audit:{mode:'compaction',tools:[],filteredToolTypes:[],inputItems:body.input.length,images:countImages(body.input),effort:body.reasoning?.effort,maxTokens}};
 }
 const {tool,target}=gameTools(body.tools??[]);
 for(const item of body.input??[])guardItem(item,target);
 // This is a capability gate, not just prompt-level advice. Codex may register
 // plan/resource helpers internally; NONE are offered, and ANY attempted call
 // to them in the provider stream is blocked before Codex receives the stream.
 const filtered=(body.tools??[]).filter(t=>JSON.stringify(t)!==JSON.stringify(tool));
 const functionTool=tool.type==='namespace'?tool.tools[0]:tool;
 const wireTool={...functionTool,name:GAME_TOOL};
 const wire={...body,tools:[wireTool],input:(body.input??[]).map(item=>{
  if(item.type!=='function_call')return item;
  const value={...item,name:GAME_TOOL};delete value.namespace;return value;
 }),max_output_tokens:maxTokens};
 if(body.tool_choice&&typeof body.tool_choice==='object'){
  if(body.tool_choice.type!=='function'||body.tool_choice.name!==target.name)throw Error('Forbidden tool choice');
  wire.tool_choice={type:'function',name:GAME_TOOL};
 }
 return {mode:'action',wire,target,audit:{mode:'action',tools:[target],filteredToolTypes:filtered.map(t=>({type:t.type,name:t.name})),
  inputItems:body.input?.length??0,images:countImages(body.input),effort:body.reasoning?.effort,maxTokens}};
}
export function nativeResponseEvent(event,target){
 const restore=item=>item?.type==='function_call'?{...item,...target}:item;
 if(event.item)event={...event,item:restore(event.item)};
 if(event.response)event={...event,response:{...event.response,output:event.response.output?.map(restore)}};
 if(event.output)event={...event,output:event.output.map(restore)};
 return event;
}
function countImages(v){if(Array.isArray(v))return v.reduce((a,x)=>a+countImages(x),0);if(!v||typeof v!=='object')return 0;return (v.type==='input_image'?1:0)+Object.values(v).reduce((a,x)=>a+countImages(x),0);}
