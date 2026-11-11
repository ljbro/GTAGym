#!/usr/bin/env node
import fs from 'node:fs/promises';
import {createWriteStream} from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {fileURLToPath} from 'node:url';
import {spawn,execFileSync} from 'node:child_process';
import {createGzip,gzip} from 'node:zlib';
import {pipeline} from 'node:stream/promises';
import {createInterface} from 'node:readline';
import {promisify,parseArgs} from 'node:util';
import {loadConfig} from '../game-mcp/config.mjs';
import {GameSession} from '../game-mcp/session.mjs';
import {gameStepSchemas,toolResult} from '../game-mcp/tools.mjs';
import {harnessRules} from '../game-mcp/rules.mjs';
import {startGameBridge} from './game-bridge.mjs';
import {startGateway} from './gateway.mjs';
import {codexConfig,codexEnvironment,GAME_TOOL,invalidToolFeedbackPolicy} from './policy.mjs';
import {customCatalog} from './catalog.mjs';
import {modelSettings,providerEndpoint} from './providers.mjs';
import {parseWallSeconds,startWallTimer,HarnessWallTimeoutError} from './time-limits.mjs';
import {INITIAL_USER_PROMPT,OBSERVATION_CONTRACT,modelGameRules} from '../game-mcp/public-observation.mjs';
const compress=promisify(gzip);
import {EARLY_STOP_FEEDBACK,EARLY_STOP_POLICY} from './early-stop-policy.mjs';
import {cleanupHarness} from './cleanup.mjs';
import {realtimeRules} from '../server-eval/realtime-policy.mjs';
export {EARLY_STOP_FEEDBACK,EARLY_STOP_POLICY};
export const help=`Codex native harness; ONLY game_step is model-callable.

node --experimental-transform-types scripts/codex-eval/run.mjs \\
 --task c01-n04 --model glm-5.3-flash \\
 --base-url https://open.bigmodel.cn/api/coding/paas/v4 \\
 --key-env GTA_GLM_API_KEY --output NEW_PRIVATE_DIRECTORY

--model: exact Qwen / Kimi / GLM / DeepSeek / GPT model ID (never renamed)
--api auto|responses|chat-completions (auto: GLM Chat, others Responses)
--effort: Qwen xhigh|medium|low; GPT high|xhigh|medium|low|max;
          Kimi/GLM/DeepSeek max|high|low (defaults: Qwen xhigh, GPT high, others max)
--base-url URL --key-file PRIVATE_FILE or --key-env GTA_AGENT_API_KEY
--context-window TOKENS (default: Qwen 1000000, GPT 272000, others 128000)
--reasoning-summary off|auto|concise|detailed (GPT only; default auto)
--max-rounds 300 --max-action-seconds 1 --max-tokens 32768 --wall-seconds 0 --request-seconds 3600
--wall-seconds: 0 disables the aggregate wall-clock watchdog (default);
                a positive value of 30–86400 enables an explicit host limit.
--url http://127.0.0.1:4200/ --renderer gpu --language en --seed 1234
--quality low --video-fps 5 --training-dataset BASENAME.json
--codex-bin codex --catalog-file FILE --prompt-snapshot FILE --output NEW_DIRECTORY

Real native Codex context management, no ten-image pruning. Objective in the
initial screenshot only; actual provider requests/responses/reasoning saved.
No shell, filesystem, agents, web or extra MCP tools are offered. Provider key
stays in the trusted host. This is tool isolation, not an OS sandbox.
`;
export function parseCli(argv){
 if(argv.includes('--help'))return {help:true};
 const names=['task','model','base-url','key-env','key-file','max-rounds','max-action-seconds','max-tokens','wall-seconds','request-seconds','url','renderer','language','seed','quality','video-fps','output','codex-bin','training-dataset','effort','prompt-snapshot','catalog-file','api','context-window','reasoning-summary','quota-recovery','clock-mode'];
 const {values:v}=parseArgs({args:argv,strict:true,options:Object.fromEntries(names.map(k=>[k,{type:'string'}]))});
 if(!v.task||!v['base-url'])throw Error('Task, model and provider URL are required');
 const settings=modelSettings({model:v.model,api:v.api,effort:v.effort,contextWindow:v['context-window']===undefined?undefined:Number(v['context-window']),reasoningSummary:v['reasoning-summary']});
 providerEndpoint(v['base-url'],settings.api);
 if(v['key-env']&&v['key-file'])throw Error('Choose key-env or key-file');
 if(!/^[A-Z_][A-Z0-9_]*$/.test(v['key-env']??'GTA_AGENT_API_KEY'))throw Error('Invalid key environment variable');
 if(v['quota-recovery']!==undefined&&!['on','off'].includes(v['quota-recovery']))throw Error('Invalid quota recovery option');
 const numeric={maxRounds:Number(v['max-rounds']??300),maxActionSeconds:Number(v['max-action-seconds']??1),maxTokens:Number(v['max-tokens']??32768),wallSeconds:parseWallSeconds(v['wall-seconds']),requestSeconds:Number(v['request-seconds']??3600)};
 gameStepSchemas(numeric.maxActionSeconds);
 if(v['clock-mode']!==undefined&&!['stepped','realtime'].includes(v['clock-mode']))throw Error('Invalid clock mode');
 for(const [k,min,max]of [['maxRounds',1,100000],['maxTokens',128,65536],['requestSeconds',5,7200]])if(!Number.isSafeInteger(numeric[k])||numeric[k]<min||numeric[k]>max)throw Error('Invalid '+k);
 return {...settings,...numeric,quotaRecovery:v['quota-recovery']==='on',task:v.task,baseURL:v['base-url'],keyEnv:v['key-env']??(settings.family==='qwen'?'GTA_QWEN_API_KEY':'GTA_AGENT_API_KEY'),keyFile:v['key-file'],
  codexBin:v['codex-bin']??'codex',catalogFile:v['catalog-file']?path.resolve(v['catalog-file']):undefined,promptSnapshot:v['prompt-snapshot'],
  output:path.resolve(v.output??fileURLToPath(new URL('../../.cache/codex-eval/'+new Date().toISOString().replace(/[:.]/g,'-')+'-'+v.model.toLowerCase().replaceAll('/','-'),import.meta.url))),
  gameArgs:['--task',v.task,'--max-rounds',String(numeric.maxRounds),'--renderer',v.renderer??'gpu','--video-fps',v['video-fps']??'5',
   ...numeric.maxRounds>300?['--max-calls',String(Math.ceil(numeric.maxRounds/300)*1000)]:[],
   ...v['clock-mode']==='realtime'?['--max-calls','1000000']:[],
   ...['url','language','seed','quality','training-dataset','max-action-seconds','clock-mode'].flatMap(k=>v[k]===undefined?[]:['--'+k,v[k]])]};
}
export function codexArguments({workspace,image,threadId}){
 if(threadId!==undefined&&!/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(threadId))throw Error('Invalid native Codex thread id');
 // Persist the private native session so an early final answer can be resumed
 // with the original history/compaction, rather than starting a fresh agent.
 return ['exec','--json','--strict-config','--ignore-rules','--skip-git-repo-check','--cd',workspace,
  ...threadId?['resume',threadId]:[],'--image',image,'--',threadId?EARLY_STOP_FEEDBACK:INITIAL_USER_PROMPT];
}
export async function run(options,{sessionFactory=settings=>new GameSession(settings),gatewayFactory=startGateway}={}){
 const key=(options.keyFile?await fs.readFile(path.resolve(options.keyFile),'utf8'):process.env[options.keyEnv]??'').trim();
 if(!key)throw Error('Provider key missing');
 const settings=await loadConfig([...options.gameArgs,'--output',path.join(options.output,'game'),'--agent-label',options.model+'+codex']);
 if(options.promptSnapshot){const frozen=JSON.parse(await fs.readFile(path.resolve(options.promptSnapshot),'utf8'));
  if(typeof frozen.system!=='string'||!frozen.system.trim()||typeof frozen.instructions?.[options.task]!=='string'||!frozen.instructions[options.task].trim())throw Error('Invalid frozen prompt snapshot');
  settings.system=frozen.system;settings.instruction=frozen.instructions[options.task];}
 const version=execFileSync(options.codexBin,['--version'],{encoding:'utf8',timeout:30000}).trim();
 await fs.mkdir(path.dirname(options.output),{recursive:true});await fs.mkdir(options.output,{mode:0o700});
 const workspace=await fs.mkdtemp(path.join(os.tmpdir(),'gta-codex-work-')),home=path.join(options.output,'codex-home'),configDir=path.join(home,'.codex');
 await fs.chmod(workspace,0o700);await fs.mkdir(configDir,{recursive:true,mode:0o700});
 const writeJSON=(name,value)=>fs.writeFile(path.join(options.output,name),JSON.stringify(value,null,2)+'\n',{mode:0o600});
 const provider=modelSettings(options);
 const report={model:options.model,task:options.task,effort:options.effort,provider,harness:'codex-native',version,contextManagement:'native-harness',instructionMode:'initial-image',observationContract:OBSERVATION_CONTRACT,
  modelMetadata:provider.family==='gpt'?'Exact installed Codex model catalog':'Installed Codex generic fallback instructions; explicit context cap; screenshot support verified at inference',
  invalidToolFeedbackPolicy:invalidToolFeedbackPolicy(provider.family),
  security:{availableTools:[GAME_TOOL],builtinsOffered:[],requestAllowlist:true,responseGuard:true,isolatedHome:true,providerKeyInChild:false,osSandbox:false},
  runtimeLimits:{maxActionSeconds:settings.maxActionSeconds,wallSeconds:parseWallSeconds(options.wallSeconds),wallClockEnabled:parseWallSeconds(options.wallSeconds)>0,
   requestSeconds:options.requestSeconds,maxRounds:options.maxRounds,gameTimeLimit:'task-defined'},
  earlyStopPolicy:EARLY_STOP_POLICY,earlyStopFeedbackRounds:0,nativeTurns:[],
  startedAt:new Date().toISOString(),status:'starting'};
 const session=sessionFactory(settings),controller=new AbortController();let bridge,gateway,child,stdoutJob,stderrJob,primaryError;
 const alive=()=>child?.pid&&child.exitCode===null&&child.signalCode===null;
 if(settings.clockMode==='realtime')session.onTerminal=snapshot=>{report.stoppedByEvaluator=true;report.evaluatorOutcome=snapshot.metadata.outcome;if(alive())child.kill('SIGTERM');};
 const stop=reason=>{if(!controller.signal.aborted)controller.abort(reason instanceof Error?reason:Error(reason));if(alive())child.kill('SIGTERM');if(session.started)void session.close('host_interrupted').catch(()=>{});};
 const signalStop=()=>stop('Harness interrupted');process.once('SIGINT',signalStop);process.once('SIGTERM',signalStop);
 const timer=startWallTimer(options.wallSeconds,()=>stop(new HarnessWallTimeoutError(options.wallSeconds)));
 try{
  const schemas=gameStepSchemas(settings.maxActionSeconds);
  bridge=await startGameBridge(session,{schema:schemas.gameStepJSONSchema,description:schemas.description,toolResult,imageOnly:true,onTerminal:snapshot=>{
   report.stoppedByEvaluator=true;report.evaluatorOutcome=snapshot.metadata.outcome;
   if(alive())child.kill('SIGTERM');
  }});
  gateway=await gatewayFactory({...provider,baseURL:options.baseURL,key,output:path.join(options.output,'api'),maxTokens:options.maxTokens,timeoutMs:options.requestSeconds*1000,onRequest:()=>bridge.modelRequest(),onResponse:items=>bridge.modelResponse(items),onViolation:e=>stop(e.message),onInvalidGameTool:message=>bridge.rejectGameTool(message),
   onQuota:limit=>{if(options.quotaRecovery){report.providerLimit=limit;stop('Kimi five-hour quota exhausted; task retained for host retry');}}});
  const generatedRules=harnessRules(settings.system,{language:settings.language,maxSeconds:settings.maxActionSeconds});
  const rules=modelGameRules(settings.clockMode==='realtime'?realtimeRules(generatedRules):generatedRules);
  await fs.writeFile(path.join(workspace,'AGENTS.md'),rules,{mode:0o600});await fs.writeFile(path.join(options.output,'rules.md'),rules,{mode:0o600});
  await fs.mkdir(path.join(workspace,'.git')); // Stop parent project discovery at the isolated empty workspace.
  const metadata=options.catalogFile?JSON.parse(await fs.readFile(options.catalogFile,'utf8')):await customCatalog({...provider,codexBin:options.codexBin});
  if(metadata.models?.length!==1||metadata.models[0].slug!==options.model||
   !(typeof metadata.models[0].base_instructions==='string'||metadata.models[0].model_messages&&typeof metadata.models[0].model_messages==='object')||
   !metadata.models[0].input_modalities?.includes('image')||metadata.models[0].context_window!==provider.contextWindow)throw Error('Invalid frozen Codex model capabilities');
  const catalog=path.join(configDir,'models.json');await fs.writeFile(catalog,JSON.stringify(metadata),{mode:0o600});
  const config=codexConfig({model:options.model,catalog,gateway:gateway.url,socketPath:bridge.socketPath,token:bridge.token,
   proxy:fileURLToPath(new URL('./game-proxy.mjs',import.meta.url)),contextWindow:metadata.models[0].context_window,effort:options.effort,reasoningSummary:provider.reasoningSummary,timeoutMs:options.requestSeconds*1000});
  await fs.writeFile(path.join(configDir,'config.toml'),config,{mode:0o600});
  report.status='loading_game';await writeJSON('report.json',report);
  const initial=await session.observe();controller.signal.throwIfAborted();if(initial.metadata.done)throw Error('Game bootstrap failed; inspect private game diagnostics');
  if(settings.clockMode==='realtime'){report.runtimeLimits.clockMode='realtime';report.runtimeLimits.maxRounds=session.effectiveMaxRounds;report.runtimeLimits.roundBudget=session.roundBudget;}
  bridge.initialize(initial);
  await fs.writeFile(path.join(options.output,'initial-observation.json.gz'),await compress(JSON.stringify(initial)),{mode:0o600});
  let snapshot=initial,threadId;
  for(let turn=0;;turn++){
   const image=path.join(workspace,`turn-${turn}.${snapshot.mimeType==='image/png'?'png':'jpg'}`);
   await fs.writeFile(image,Buffer.from(snapshot.image,'base64'),{mode:0o600});
   const args=codexArguments({workspace,image,threadId});
   if(turn===0)await writeJSON('launch.json',{...report,arguments:args,game:{task:settings.taskId,url:settings.url,maxRounds:settings.maxRounds,renderer:settings.renderer},maxTokens:options.maxTokens});
   await fs.appendFile(path.join(options.output,'native-turns.jsonl'),JSON.stringify({turn,threadId,arguments:args,startedAt:new Date().toISOString()})+'\n',{mode:0o600});
   child=spawn(options.codexBin,args,{cwd:workspace,env:codexEnvironment({home,token:gateway.token}),stdio:['ignore','pipe','pipe']});
   const exit=new Promise((resolve,reject)=>{child.once('error',reject);child.once('exit',(code,signal)=>resolve({code,signal}));});
   let observedThread;
   const lines=createInterface({input:child.stdout});
   lines.on('line',line=>{try{const e=JSON.parse(line);if(e.type==='thread.started')observedThread=e.thread_id;}catch{}});
   // Concatenated gzip members retain all native invocations in one complete
   // JSONL stream. The native session files and every provider response remain.
   stdoutJob=pipeline(child.stdout,createGzip(),createWriteStream(path.join(options.output,'codex.jsonl.gz'),{flags:turn?'a':'wx',mode:0o600}));
   stderrJob=pipeline(child.stderr,createWriteStream(path.join(options.output,'codex.stderr.log'),{flags:turn?'a':'wx',mode:0o600}));
   for(const job of [stdoutJob,stderrJob])void job.catch(()=>stop('Harness log capture failed'));
   report.status='running';await writeJSON('report.json',report);
   process.stdout.write(JSON.stringify({event:turn?'harness_continued':'harness_started',model:options.model,version,task:options.task,output:options.output,pid:child.pid,turn})+'\n');
   report.exit=await exit;await Promise.all([stdoutJob,stderrJob]);lines.close();controller.signal.throwIfAborted();
   report.nativeTurns.push({turn,threadId:observedThread,exit:report.exit});
   if(report.exit.code!==0&&!report.stoppedByEvaluator)throw Error('Codex exited unsuccessfully; inspect private CLI/API logs');
   if(session.done)break;
   if(threadId&&observedThread!==threadId)throw Error('Native Codex continuation changed its thread');
   threadId=observedThread;
   if(!threadId)throw Error('Native Codex did not provide a resumable thread id');
   snapshot=await session.feedback(EARLY_STOP_FEEDBACK);
   report.earlyStopFeedbackRounds++;
   await fs.mkdir(path.join(options.output,'early-stop-feedback'),{recursive:true,mode:0o700});
   await fs.writeFile(path.join(options.output,'early-stop-feedback',String(turn+1).padStart(6,'0')+'.json.gz'),await compress(JSON.stringify({message:EARLY_STOP_FEEDBACK,snapshot,threadId})),{mode:0o600});
   await writeJSON('report.json',report);
   if(snapshot.metadata.done){report.stoppedByEvaluator=true;report.evaluatorOutcome=snapshot.metadata.outcome;break;}
   bridge.feedback(snapshot);
  }
  if(!gateway.calls.some(c=>c.status===200&&c.tools?.length===1)&&!session.result?.terminalDuringInference)throw Error('Missing actual provider tool capability confirmation');
  if(gateway.calls.some(c=>c.securityViolation))throw Error('Tool capability audit failed');
  await session.close('harness_completed');
  if(['error','archive_error','render_anomaly'].includes(session.result?.status))throw Error('Game environment failed; inspect private game diagnostics');
  report.status=session.done&&session.result?.status!=='interrupted'?'completed':'agent_stopped';return report;
 }catch(error){primaryError=error;report.status='evaluation_error';report.error=error.message;if(error instanceof HarnessWallTimeoutError)report.errorCode=error.code;throw error;}
 finally{
  clearTimeout(timer);process.removeListener('SIGINT',signalStop);process.removeListener('SIGTERM',signalStop);
  if(alive()){child.kill('SIGTERM');const kill=setTimeout(()=>child.kill('SIGKILL'),5000);kill.unref();await new Promise(r=>child.once('exit',r));clearTimeout(kill);}
  await Promise.allSettled([stdoutJob,stderrJob].filter(Boolean));
  const cleanupErrors=await cleanupHarness({gateway,bridge,session,workspaceCleanup:()=>fs.rm(workspace,{recursive:true,force:true})});
  if(cleanupErrors.length){
   report.cleanupErrors=cleanupErrors.map(({stage,error})=>({stage,error:error.message}));
   if(!primaryError){report.status='evaluation_error';report.error='Harness cleanup failed: '+report.cleanupErrors.map(e=>e.stage+': '+e.error).join('; ');}
  }
  report.usage=gateway?.usage()??{};report.apiRequests=gateway?.calls.length??0;report.gameResult=session.result;report.acceptedActions=session.receipts.size;report.finishedAt=new Date().toISOString();
  report.evaluationRounds=report.gameResult?.rounds??report.acceptedActions+report.earlyStopFeedbackRounds;
  report.toolNameCorrections=(gateway?.calls??[]).filter(c=>c.invalidToolFeedback).map(c=>({requestId:c.id,...c.invalidToolFeedback}));
  await writeJSON('report.json',report);
  process.stdout.write(JSON.stringify({event:'harness_finished',status:report.status,model:options.model,acceptedActions:report.acceptedActions,usage:report.usage,output:options.output})+'\n');
  if(cleanupErrors.length&&!primaryError)throw new AggregateError(cleanupErrors.map(e=>e.error),report.error);
 }
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{const options=parseCli(process.argv.slice(2));if(options.help)console.log(help);else await run(options);}
 catch(error){process.stderr.write(error.message+'\n');process.exitCode=1;}
}
