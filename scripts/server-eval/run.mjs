import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {ServerEnvironment} from './environment.mjs';
import {IncidentEnvironment,waitForIncident} from './incident-environment.mjs';
import {runEpisode} from './episode.mjs';
import {loadPrompts,composeSystemPrompt} from './prompts.mjs';
import {validatedPolicyReply} from './policy-retry.mjs';
import {retryTransport} from './transport-retry.mjs';
import {loadCheckpoint} from './checkpoint.mjs';
import {modelRequest,modelEndpoint,modelTransport,resumeModelTransport,validateReasoningEffort,resumeReasoningEffort,validateThinking,resumeThinking} from './model-request.mjs';
import {captureModelResponse,guardKimiResponse,isKimiModel,watchKimiStops} from './kimi-response-guard.mjs';
import {emptyModelResponse,emptyResponseState,retryEmptyResponse} from './empty-response-retry.mjs';
import {reuseCompletedPrefix} from './reuse-batch.mjs';
import {modelReply,MODEL_RESPONSE_RECORDING} from './model-response.mjs';
import {TokenUsageLedger} from './token-usage.mjs';
import {readChatStream} from './chat-stream.mjs';

const root=fileURLToPath(new URL('../../',import.meta.url));
const options={url:'http://127.0.0.1:4200/',tasks:'c07-n04',workers:'1','max-rounds':'100',steps:'',seed:'1234',quality:'low',renderer:'auto',policy:'model',model:process.env.GTA_AGENT_MODEL??'kimi-k3',endpoint:process.env.GTA_AGENT_ENDPOINT??'','system-prompt':fileURLToPath(new URL('system-prompt.md',import.meta.url)),prompts:fileURLToPath(new URL('../../tasks/instructions.json',import.meta.url)),adapter:fileURLToPath(new URL('actions.mjs',import.meta.url)),'request-timeout':'180','max-tokens':'2048','video-fps':'10',crf:'28',output:path.join(root,'.cache/server-eval',new Date().toISOString().replace(/[:.]/g,'-'))};
const args=process.argv.slice(2);
options['format-attempts']='3';
options['instruction-mode']='provided';
options['reasoning-effort']='';
options.thinking='';
options.api='auto';
options['reasoning-summary']='auto';
options['empty-response']='retry';
options.stream='off';
Object.assign(options,{'request-attempts':'3','render-restarts':'2','render-fault':'recover',resume:'','resume-round':'','reuse-batch':''});
if(args.includes('--help')){
 console.log('Server-only evaluation. Run in the container; never attaches to a desktop browser.\n'+
 ' --tasks c01-n04,c07-n04 --workers 1 --max-rounds 100\n'+
 ' --renderer auto|gpu|cpu (auto prefers GPU, falls back to SERVER CPU)\n'+
 ' --policy model|smoke --system-prompt path.md --prompts instructions.json --adapter path.mjs\n'+
 ' --instruction-mode provided|none (none uses "play the game"; system Markdown and screenshots unchanged)\n'+
 ' --endpoint URL --model NAME (GTA_AGENT_API_KEY environment variable only)\n'+
 ' --reasoning-effort low|high|xhigh|max (omit to use the API default)\n'+
 ' --thinking enabled|disabled (omit to use the API default)\n'+
 ' --api auto|responses|chat-completions (auto: OpenAI models use Responses; other models keep Chat Completions)\n'+
 ' --reasoning-summary auto|concise|detailed|off (Responses only; defaults to auto for new OpenAI runs)\n'+
 ' Provider-returned reasoning and complete parsed responses are recorded by default in compressed rounds/checkpoints, never added to model history.\n'+
 ' --empty-response retry|stop-kimi (Kimi default: retry empty replies up to 3 attempts, 2s/4s; stop-kimi preserves first-fault diagnostics)\n'+
 ' --request-timeout 180 --max-tokens 2048 --format-attempts 3 --video-fps 10 --crf 28\n'+
 ' --request-attempts 3 (transient network/429/5xx retries on the frozen scene)\n'+
 ' --stream on|off (Chat Completions SSE; archives complete returned reasoning, chunks and usage; default off)\n'+
 ' --render-restarts 2 (0..5; confirmed minimap compositor faults restart and verify action replay)\n'+
 ' --render-fault preserve (1..8 workers; first suspect stops peers/queue and holds its browser/CDP until SIGINT/SIGTERM)\n'+
 ' --resume checkpoint-directory|episode.tar.gz --resume-round N (N is first new inference; default last committed + 1)\n'+
 ' Resume uses one worker, recorded task/seed/prompts/settings, verified action replay; use a NEW --output.\n'+
 ' --reuse-batch FINISHED_DIRECTORY (reuse its exact completed task prefix, including task failures, in a NEW --output; no replay/model calls)\n'+
 ' --url http://127.0.0.1:4200/ --quality low|medium|high --seed 1234 --output DIR\n'+
 ' Default action protocol: prompt-only JSON (instant absolute mouse move, then independent key durations, <=1 simulation second). Smoke is not a model evaluation.\n'+
 ' Adapter exports description, parse(raw), execute(env, action, onFrame).');process.exit(0);
}
for(let i=0;i<args.length;i+=2){const key=args[i]?.replace(/^--/,'');if(!Object.hasOwn(options,key)||!args[i+1])throw Error('Unknown/missing option '+args[i]);options[key]=args[i+1];}
if(options.steps){if(args.includes('--max-rounds'))throw Error('Use --max-rounds OR legacy --steps');options['max-rounds']=options.steps;}
for(const [key,min,max] of [['workers',1,8],['max-rounds',1,100000],['seed',1,4294967295],['request-timeout',1,3600],['max-tokens',1,65536],['video-fps',1,60],['crf',0,51],['format-attempts',1,5],['request-attempts',1,10]]){options[key]=Number(options[key]);if(!Number.isInteger(options[key])||options[key]<min||options[key]>max)throw Error('Invalid '+key);}
if(options['resume-round']&&!options.resume)throw Error('--resume-round requires --resume');
if(options.resume&&options['reuse-batch'])throw Error('--resume and --reuse-batch cannot be combined');
if(!['provided','none'].includes(options['instruction-mode']))throw Error('Invalid instruction-mode');
validateReasoningEffort(options['reasoning-effort']);
validateThinking(options.thinking);
if(!['retry','stop-kimi'].includes(options['empty-response']))throw Error('Invalid empty-response mode');
if(!['on','off'].includes(options.stream))throw Error('Invalid stream mode');
if(options['empty-response']==='stop-kimi'&&!isKimiModel(options.model))throw Error('stop-kimi requires a Kimi model');
if(!['recover','preserve'].includes(options['render-fault']))throw Error('Invalid render-fault');
options['render-restarts']=Number(options['render-restarts']);
if(!Number.isInteger(options['render-restarts'])||options['render-restarts']<0||options['render-restarts']>5)throw Error('Invalid render-restarts');
const resume=options.resume?await loadCheckpoint(options.resume,options['resume-round']?Number(options['resume-round']):undefined):null;
if(resume){
 const c=resume.config;
 if(!args.includes('--stream'))options.stream=c.stream??'off';
 if(!args.includes('--request-timeout')&&c['request-timeout'])options['request-timeout']=c['request-timeout'];
 options['reasoning-effort']=resumeReasoningEffort(c,options['reasoning-effort'],args.includes('--reasoning-effort'));
 options.thinking=resumeThinking(c,options.thinking,args.includes('--thinking'));
 const recordedInstructionMode=c.instructionMode??(c.instruction===''?'none':'provided');
 if(args.includes('--instruction-mode')&&options['instruction-mode']!==recordedInstructionMode)throw Error('Resume instruction mode mismatch');
 options['instruction-mode']=recordedInstructionMode;
 if(!Number.isInteger(c.seed))throw Error('Checkpoint is missing its episode seed');
 for(const [key,value] of Object.entries({tasks:c.taskId,workers:1,seed:c.seed,quality:c.quality??'low',renderer:c.renderer??'gpu','video-fps':c.videoFPS??10,crf:c.crf??28,model:c.model,policy:c.policy??'model'})){
  if(value===undefined)continue;
  if(args.includes('--'+key)&&String(options[key])!==String(value))throw Error('Resume setting mismatch: '+key);
  options[key]=value;
 }
 if(!args.includes('--endpoint')&&c.endpoint)options.endpoint=c.endpoint;
 if(!args.includes('--max-tokens')&&c['max-tokens'])options['max-tokens']=c['max-tokens'];
 if(!args.includes('--max-rounds'))options['max-rounds']=Math.max(c.maxRounds??c['max-rounds']??100,resume.nextRound);
}
const transport=resume?resumeModelTransport(resume.config,{api:options.api,reasoningSummary:options['reasoning-summary'],explicitAPI:args.includes('--api'),explicitSummary:args.includes('--reasoning-summary')}):modelTransport({model:options.model,api:options.api,reasoningSummary:options['reasoning-summary']});
if(!resume&&args.includes('--reasoning-summary')&&options['reasoning-summary']!=='off'&&transport.api!=='responses')throw Error('reasoning-summary requires --api responses');
options.api=transport.api;options['reasoning-summary']=transport.reasoningSummary;
if(options.stream==='on'&&(options.api!=='chat-completions'||isKimiModel(options.model)))throw Error('Streaming currently supports non-Kimi Chat Completions only');
if(60%options['video-fps']!==0)throw Error('video-fps must divide 60');
if(!['auto','gpu','cpu'].includes(options.renderer)||!['model','smoke'].includes(options.policy)||!['low','medium','high'].includes(options.quality))throw Error('Invalid renderer/policy/quality');
const gameURL=new URL(options.url);if(!['http:','https:'].includes(gameURL.protocol)||gameURL.username||gameURL.password)throw Error('Invalid game URL');
const tasks=options.tasks.toLowerCase().split(',');
const staticCatalog=JSON.parse(await fs.readFile(new URL('../../tasks/catalog.json',import.meta.url),'utf8'));
if(tasks.some(id=>!staticCatalog.some(row=>row.id===id)))throw Error('Task is excluded from the current benchmark');
const staticIds=tasks.filter(t=>/^c(?:10|11)-n/.test(t));if(new Set(staticIds).size!==staticIds.length)throw Error('Duplicate static task IDs');
const secret=process.env.GTA_AGENT_API_KEY;
if(options.policy==='model'&&(!secret||!options.endpoint))throw Error('Set GTA_AGENT_ENDPOINT and GTA_AGENT_API_KEY');
const endpoint=options.policy==='model'?modelEndpoint(options.endpoint,options.api):null;
const prompts=resume?{system:resume.config.system,instructions:{[resume.config.taskId]:resume.config.instruction},systemPromptPath:'checkpoint snapshot'}:await loadPrompts({systemPrompt:options['system-prompt'],promptsFile:options.prompts,tasks,instructionMode:options['instruction-mode']});
const {instructions}=prompts;
const language=resume?.config.language??prompts.language??'zh';
const adapter=await import(pathToFileURL(path.resolve(options.adapter)).href);
if(typeof adapter.parse!=='function'||typeof adapter.execute!=='function')throw Error('Invalid action adapter');
// Fail before costly browser launches if video encoding isn't available.
const encoders=execFileSync('ffmpeg',['-hide_banner','-encoders'],{encoding:'utf8',stdio:['ignore','pipe','pipe']});if(!encoders.includes('libx264'))throw Error('ffmpeg with libx264 is required');
const output=path.resolve(options.output);await fs.mkdir(output,{recursive:true});
const hash=async file=>createHash('sha256').update(await fs.readFile(file)).digest('hex');
const harnessHashes=Object.fromEntries(await Promise.all(['run.mjs','chat-stream.mjs','model-request.mjs','model-response.mjs','token-usage.mjs','kimi-response-guard.mjs','empty-response-retry.mjs','environment.mjs','incident-environment.mjs','state-snapshot.mjs','protocol.mjs','advance-frames.mjs','move-relative.mjs','episode.mjs','context.mjs','recording.mjs','prompts.mjs','policy-retry.mjs','checkpoint.mjs','transport-retry.mjs','render-health.mjs','render-recovery.mjs'].map(async n=>[n,await hash(new URL(n,import.meta.url))])));
// Factory-backed adapters depend on the shared parser as well as their wrapper.
harnessHashes['actions.mjs']=await hash(new URL('actions.mjs',import.meta.url));
const staticHashes=Object.fromEntries(await Promise.all(['runtime.mjs','gui-action.mjs','gui-turn.mjs','mouse-move.mjs','scroll-action.mjs','catalog.json','manifest.json','engines/shooting-engine.mjs','engines/sniper-engine.mjs','engines/sniper-renderer.mjs','engines/photo-sniper-engine.mjs','engines/photo-sniper-renderer.mjs'].map(async n=>[n,await hash(new URL('../../tasks/'+n,import.meta.url))])));
if(resume?.config.staticHashes&&JSON.stringify(resume.config.staticHashes)!==JSON.stringify(staticHashes))throw Error('Resume static dataset/executor mismatch');
if(resume){
 if(resume.config.adapterHash&&resume.config.adapterHash!==await hash(options.adapter))throw Error('Resume adapter hash mismatch');
 for(const key of ['environment.mjs','state-snapshot.mjs','protocol.mjs','advance-frames.mjs','move-relative.mjs'])if(resume.config.harnessHashes?.[key]&&resume.config.harnessHashes[key]!==harnessHashes[key])throw Error('Resume executor hash mismatch: '+key);
}
const system=composeSystemPrompt(prompts.system);
const config={protocol:'gui-server-turns-v2',...options,endpoint,system,instructions,systemPromptPath:prompts.systemPromptPath,systemPromptHash:createHash('sha256').update(prompts.system).digest('hex'),adapterHash:await hash(options.adapter),harnessHashes,viewport:[1280,720],gitCommit:execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim(),seedPolicy:'per-browser seeded Math.random; GPU/loading not bit-exact',executionHost:'server',placeholderPrompts:Object.values(instructions).some(v=>v.includes('PLACEHOLDER'))||system.includes('PLACEHOLDER')};
config.actionLimits=adapter.LIMITS??null;
config.language=language;
config.modelResponseRecording=MODEL_RESPONSE_RECORDING;
config.canvas2d='software'; // WebGL renderer is independent; server-side minimap workaround.
config.pageCompositing='software';
await fs.writeFile(path.join(output,'config.json'),JSON.stringify(config,null,2),{flag:'wx'});
const tokenUsage=new TokenUsageLedger(output,{model:options.model,policy:options.policy});
await tokenUsage.flush();
const redact=s=>secret?String(s).split(secret).join('[REDACTED]'):String(s);
const controller=new AbortController();let signalCount=0;
for(const sig of ['SIGINT','SIGTERM'])process.on(sig,()=>{controller.abort(Error(sig));if(++signalCount>1)process.exit(130);});
async function policy(messages,{round,signal,taskId}){
 const original=/^c(?:10|11)-n/.test(taskId);
 if(options.policy==='smoke')return {raw:JSON.stringify(original?{keys:[],mouse:{buttons:[{button:'left',event:'down'}]}}:adapter.smokeAction?.(round)??{keys:[{key:'w',duration_seconds:round%2?.1:.25}]})};
 const emptyState=emptyResponseState(),retryEmpty=isKimiModel(options.model)&&options['empty-response']==='retry';
 const latchEmptyResponse=info=>{
  if(modelIncident)return;
  modelIncident=info;
  for(const [env,abort] of runningWorkers)if(env.taskId!==taskId)abort.abort(Error(`Stopped for empty Kimi response in ${taskId}, round ${round}`));
  console.log(JSON.stringify({event:'empty_response_detected',...info,pendingTasks:tasks.slice(next)}));
 };
 const capturedEmptyResponse=info=>{modelIncident={...modelIncident,...info};console.log(JSON.stringify({event:'empty_response_captured',...info}));};
 const request=input=>{
 const transport=()=>retryTransport(async()=>{
 const requestBody=modelRequest({api:options.api,model:options.model,messages:input,maxTokens:options['max-tokens'],reasoningEffort:options['reasoning-effort'],reasoningSummary:options['reasoning-summary'],thinking:options.thinking});
 if(options.stream==='on')Object.assign(requestBody,{stream:true,stream_options:{include_usage:true}});
 const usageTicket=tokenUsage.begin(taskId,round);
 try{
 const response=await fetch(endpoint,{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+secret},body:JSON.stringify(requestBody),signal:AbortSignal.any([signal,AbortSignal.timeout(options['request-timeout']*1000)])});
 if(!response.ok)throw Error('Model HTTP '+response.status);
 let body;
 let providerResponse;
 if(options['empty-response']==='stop-kimi'||retryEmpty){
  const rawBody=Buffer.from(await response.arrayBuffer());
  try{body=JSON.parse(rawBody.toString('utf8'));}catch(error){if(retryEmpty)throw error;body=null;}
  providerResponse={request:requestBody,response,rawBody,body};
 }else body=options.stream==='on'?await readChatStream(response):await response.json();
 await tokenUsage.response(usageTicket,body);
 if(options['empty-response']==='stop-kimi'){
   try{await guardKimiResponse({root,output,taskId,round,model:options.model,endpoint,...providerResponse,secret,onDetected:latchEmptyResponse,onCaptured:capturedEmptyResponse});}
   catch(error){error.modelResponse=body;throw error;}
 }
 // Empty Kimi final text is retried unchanged outside the transport/format
 // budgets. Other unusable/non-text replies retain their prior handling.
 return {...modelReply(body,{api:options.api}),
  ...(retryEmpty?{emptyReply:emptyModelResponse(body),providerResponse}:{})};
 }catch(error){if(!usageTicket.settled)await tokenUsage.failure(usageTicket);throw error;}
 },{maxAttempts:options['request-attempts'],signal,onRetry:info=>console.log(JSON.stringify({event:'transport_retry',taskId,round,...info,error:redact(info.error)}))});
 if(!retryEmpty)return transport();
 return retryEmptyResponse(transport,{state:emptyState,signal,
  capture:({response,record})=>captureModelResponse({output,taskId,round,model:options.model,endpoint,...response.providerResponse,secret,
   detectedAt:record.receivedAt,attempt:record.responseNumber,kind:record.kind==='empty'?'empty_model_response':'empty_response_retry_result'}),
  onRetry:info=>console.log(JSON.stringify({event:'empty_response_retry',taskId,round,retry:info.retry,maxRetries:info.maxRetries,delayMs:info.delayMs,evidence:info.record.capture?.directory,usage:info.record.usage})),
  onExhausting:()=>latchEmptyResponse({kind:'empty_model_response',taskId,round,model:options.model,runnerPid:process.pid,detectedAt:new Date().toISOString(),retryExhausted:true}),
  onExhausted:({response,record,state,maxAttempts})=>guardKimiResponse({root,output,taskId,round,model:options.model,endpoint,...response.providerResponse,secret,
   capturedIncident:record.capture?{...record.capture,retryExhausted:true,maxAttempts,emptyReplies:state.attempts.filter(a=>a.kind==='empty').length}:undefined,onDetected:latchEmptyResponse,onCaptured:capturedEmptyResponse})});
 };
 // Native and static both correct invalid replies on the same observation.
 // Only the accepted action consumes a game turn; every attempt is archived.
 return validatedPolicyReply({messages,parse:adapter.parse,maxAttempts:options['format-attempts'],signal,language,onRetry:info=>console.log(JSON.stringify({event:'format_retry',taskId,round,...info})),request})
  .then(result=>emptyState.attempts.length?{...result,emptyResponseAttempts:emptyState.attempts}:result,error=>{if(emptyState.attempts.length)error.emptyResponseAttempts=emptyState.attempts;throw error;});
}
const reused=options['reuse-batch']?await reuseCompletedPrefix({source:options['reuse-batch'],output,config,tasks,staticHashes}):[];
const results=[...reused];let next=reused.length,active=0,peakActive=0,heldEnv=null,modelIncident=null;const began=performance.now();
if(reused.length)console.log(JSON.stringify({event:'reused_episodes',count:reused.length,source:options['reuse-batch'],tasks:reused.map(r=>r.taskId)}));
const runningWorkers=new Map();
const stopWatchingKimi=isKimiModel(options.model)?watchKimiStops({root,startedAt:Date.now(),onStop:incident=>{
 modelIncident??={...incident,external:true};
 console.log(JSON.stringify({event:'kimi_group_stop',incidentId:incident.id,taskId:incident.taskId,originPid:incident.runnerPid,directory:incident.directory}));
 controller.abort(Error('Stopped after empty Kimi response in another evaluation: '+incident.directory));
},onError:error=>console.error(JSON.stringify({event:'kimi_stop_watch_error',error:redact(error.message)}))}):()=>{};
function claimIncident({env,taskId,round}){
 if(heldEnv)return;
 heldEnv=env; // Never abort the controller of this browser on an incident.
 const peers=[];
 for(const [other,abort] of runningWorkers){
  if(other===env)continue;
  peers.push(other.id);abort.abort(Error(`Stopped for render incident in ${taskId}, round ${round}`));
 }
 console.log(JSON.stringify({event:'incident_stop_all',taskId,round,stoppedPeers:peers,pendingTasks:tasks.slice(next)}));
}
// Incremental, atomic snapshots let the viewer inspect finished episodes while
// the remaining workers are still running. No partial archive is advertised.
let summaryWrites=Promise.resolve();
function persistSummary(running){
 const summary={protocol:config.protocol,requested:tasks.length,completedEpisodes:results.length,reusedEpisodes:reused.length,newEpisodes:results.length-reused.length,successes:results.filter(r=>r.success).length,errors:results.filter(r=>['error','archive_error','render_anomaly'].includes(r.status)).length,interrupted:controller.signal.aborted,running,haltReason:modelIncident?'empty_model_response':heldEnv?'render_anomaly':null,modelResponseIncident:modelIncident,browserHeld:!!heldEnv?.browser?.isConnected(),pendingTasks:tasks.slice(next),peakActive,wallMs:performance.now()-began,results:[...results].sort((a,b)=>a.index-b.index)};
 summary.tokenUsage=tokenUsage.snapshot();
 summary.staticEvaluation=Object.fromEntries(['shooting','sniper'].map(kind=>{const eligible=staticCatalog.filter(r=>r.kind===kind),attempted=results.filter(r=>eligible.some(e=>e.id===r.taskId)),correct=attempted.filter(r=>r.success&&r.staticEvaluation?.reward===1).length;return [kind,{eligible:eligible.length,attempted:attempted.length,correct,accuracy_eligible:correct/eligible.length,accuracy_attempted:attempted.length?correct/attempted.length:null,missing:eligible.length-attempted.length}];}));
 summaryWrites=summaryWrites.then(async()=>{const file=path.join(output,'summary.json');await fs.writeFile(file+'.tmp',JSON.stringify(summary,null,2));await fs.rename(file+'.tmp',file);}).catch(error=>{if(!heldEnv)throw error;console.error(JSON.stringify({event:'incident_summary_write_failed',error:redact(error.message),browserHeld:true}));});return summaryWrites;
}
await persistSummary(true);
await Promise.all(Array.from({length:Math.min(options.workers,tasks.length-next)},async(_,worker)=>{
 while(!controller.signal.aborted&&!heldEnv&&!modelIncident&&next<tasks.length){
  const index=next++,taskId=tasks[index],name=String(index).padStart(4,'0')+'-'+taskId;
  active++;peakActive=Math.max(peakActive,active);console.log(JSON.stringify({event:'start',worker,taskId,index}));
  const Env=options['render-fault']==='preserve'?IncidentEnvironment:ServerEnvironment;
  const workerAbort=new AbortController();
  const signal=AbortSignal.any([controller.signal,workerAbort.signal]);
  const env=new Env({url:options.url,seed:/^c(?:10|11)-n/.test(taskId)?options.seed:options.seed+index,quality:options.quality,id:name,renderer:options.renderer,videoFPS:options['video-fps'],signal});
  runningWorkers.set(env,workerAbort);
  const abortClose=()=>{if(!env.incidentHeld)void env.close().catch(()=>{});};signal.addEventListener('abort',abortClose,{once:true});
  try{
   const result=await runEpisode({env,taskId,system,instruction:instructions[taskId],adapter,policy,maxRounds:options['max-rounds'],maxRenderRestarts:options['render-restarts'],renderFaultMode:options['render-fault'],onRenderIncident:claimIncident,output,name,videoFPS:options['video-fps'],crf:options.crf,signal,redact,checkpoint:true,resume,metadata:{index,worker,language,thinking:options.thinking,api:options.api,stream:options.stream,'request-timeout':options['request-timeout'],'reasoning-summary':options['reasoning-summary'],'reasoning-effort':options['reasoning-effort'],instructionMode:options["instruction-mode"],seed:env.seed,policy:options.policy,quality:options.quality,renderer:options.renderer,model:options.model,endpoint,adapterHash:config.adapterHash,harnessHashes,staticHashes,'max-tokens':options['max-tokens'],placeholderPrompts:config.placeholderPrompts},onEvent:event=>console.log(JSON.stringify(event))});
   if(env.incidentHeld)heldEnv??=env;
   if(workerAbort.signal.aborted)result.stopReason=workerAbort.signal.reason?.message;
   results.push(result);await persistSummary(true);console.log(JSON.stringify({event:'episode',taskId,status:result.status,archive:result.archive,renderer:result.environment?.renderer,error:result.error}));
  }catch(error){if(env.incidentHeld)heldEnv??=env;else await env.close().catch(()=>{});results.push({index,taskId,status:env.incidentHeld?'render_anomaly':'archive_error',success:false,incident:env.incident,error:redact(error.message)});await persistSummary(true);console.log(JSON.stringify({event:'episode',taskId,status:env.incidentHeld?'render_anomaly':'archive_error',error:redact(error.message)}));}
  finally{signal.removeEventListener('abort',abortClose);runningWorkers.delete(env);active--;}
 }
}));
await tokenUsage.finish();
await persistSummary(false);
if(heldEnv){
 console.log(JSON.stringify({event:'debug_wait',pid:process.pid,output,incident:heldEnv.incident,pendingTasks:tasks.slice(next),message:'No further tasks or model calls. Browser remains on server. SIGINT/SIGTERM explicitly releases it.'}));
 await waitForIncident(heldEnv,controller.signal);
 await persistSummary(false);
}
const summary=JSON.parse(await fs.readFile(path.join(output,'summary.json'),'utf8'));
stopWatchingKimi();
console.log(JSON.stringify({event:'done',output,successes:summary.successes,errors:summary.errors}));
if(summary.errors||summary.interrupted)process.exitCode=1;
