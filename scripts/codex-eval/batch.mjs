#!/usr/bin/env node
import {realtimeInstructions} from '../server-eval/realtime-policy.mjs';
// Trusted batch scheduler. Each task starts a NEW native harness process.
// Results from ordinary JSON runners are never reused as harness results.
import fs from 'node:fs/promises';
import {openSync,closeSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawn} from 'node:child_process';
import {createHash,randomUUID} from 'node:crypto';
import {selectFullTasks} from '../server-eval/full-selection.mjs';
import {modelSettings,providerEndpoint} from './providers.mjs';
import {KimiQuotaGate,quotaOptions} from './kimi-quota.mjs';
import {OBSERVATION_CONTRACT} from '../game-mcp/public-observation.mjs';
import {prepareRestart,classifyEpisode,violationResult} from './restart.mjs';
import {parseWallSeconds} from './time-limits.mjs';
import {batchVariant} from './batch-variant.mjs';

const root=fileURLToPath(new URL('../../',import.meta.url));
const read=file=>fs.readFile(file,'utf8').then(JSON.parse);
async function atomic(file,value){const tmp=file+'.'+randomUUID()+'.tmp';await fs.writeFile(tmp,JSON.stringify(value,null,2)+'\n',{mode:0o600});await fs.rename(tmp,file);}
const hash=value=>createHash('sha256').update(value).digest('hex');
export function dispatchOrder(plan,tasks,priorityCategories=[]){
 if(!Array.isArray(priorityCategories)||new Set(priorityCategories).size!==priorityCategories.length||priorityCategories.some(c=>!plan.categories.some(row=>row.category===c)))throw Error('Invalid priority categories');
 const priority=priorityCategories.flatMap(c=>plan.categories.find(row=>row.category===c).tasks).filter(id=>tasks.includes(id));
 // Quickly check image-based and native tracks without changing any task's
 // original benchmark index/seed, then cover the rest of the frozen catalog.
 const first=['shooting','sniper','outdoor-road','outdoor-foot'].map(c=>plan.categories.find(x=>x.category===c)?.tasks[0]).filter(Boolean);
 return [...new Set([...priority,...first.filter(id=>tasks.includes(id)),...tasks])].map(id=>tasks.indexOf(id));
}
export function totalUsage(records){
 const total={input_tokens:0,output_tokens:0,cache_read_input_tokens:0,cache_creation_input_tokens:0};
 for(const value of records)for(const k of Object.keys(total))total[k]+=value?.[k]??0;
 if(records.some(r=>Number.isFinite(r?.reasoning_tokens)))total.reasoning_tokens=records.reduce((n,r)=>n+(r?.reasoning_tokens??0),0);
 total.total_tokens=total.input_tokens+total.output_tokens;return total;
}
export function hostEnvironment(source=process.env){
 // This is the trusted renderer/scheduler environment, not the agent's.
 // Keep browser-cache locations while stripping credentials and proxies.
 return {PATH:source.PATH,...Object.fromEntries(['HOME','PLAYWRIGHT_BROWSERS_PATH','XDG_CACHE_HOME'].filter(k=>source[k]!==undefined).map(k=>[k,source[k]])),NO_PROXY:'*',no_proxy:'*',NODE_USE_ENV_PROXY:'0'};
}
export async function runBatch(config,{spawnTask=spawn,fetcher=fetch,quotaGateFactory=options=>new KimiQuotaGate(options)}={}){
 const {model,baseURL,keyFile,planFile,output}=config;
 if(config.harness!==undefined&&config.harness!=='codex')throw Error('Only the Codex harness is supported');
 config={...config,harness:'codex'};
 const harness='codex',harnessLabel='Codex',provider=modelSettings(config);
 const wallSeconds=parseWallSeconds(config.wallSeconds),api=provider.api,apiPath='/v1/responses';
 const effort=provider.effort;
 const workers=config.workers??4;
 const violationPolicy=config.toolViolationPolicy??'stop';
 const retryOrder=config.retryOrder??'errors-first';
 if(!['errors-first','pending-first'].includes(retryOrder))throw Error('Invalid retry order');
 if(!['stop','record-and-continue'].includes(violationPolicy)||config.retestViolations!==undefined&&typeof config.retestViolations!=='boolean')throw Error('Invalid restart/tool violation policy');
 const quotaRecovery=quotaOptions(config.quotaRecovery);
 if(quotaRecovery.enabled&&provider.family!=='kimi')throw Error('Five-hour quota recovery is only enabled for Kimi Codex');
 if(!Number.isInteger(workers)||workers<1||workers>8||![output,planFile,keyFile].every(p=>path.isAbsolute(p??'')))throw Error('Invalid trusted batch configuration');
 providerEndpoint(baseURL,api);await fs.access(keyFile);
 const plan=await read(planFile),language=config.language??'en';
 const prompts=await read(path.join(root,'tasks/instructions.json'));
 if(config.clockMode==='realtime')prompts.instructions=realtimeInstructions(prompts.instructions);
 const fullTasks=selectFullTasks(plan,Object.keys(prompts.instructions));
 const variant=batchVariant(config,fullTasks),{tasks,maxActionSeconds,taskSeedIndices}=variant;
 if(tasks.length!==(config.expectedCount??150))throw Error('Unexpected full catalog size: '+tasks.length);
 if(config.onlyTaskIds!==undefined&&(!config.resume||!Array.isArray(config.onlyTaskIds)||!config.onlyTaskIds.length||new Set(config.onlyTaskIds).size!==config.onlyTaskIds.length||config.onlyTaskIds.some(id=>!tasks.includes(id))))throw Error('Invalid selective restart configuration');
 if(config.retestEarlyStops!==undefined&&typeof config.retestEarlyStops!=='boolean')throw Error('Invalid early-stop retest configuration');
 if(config.retestTaskIds!==undefined&&(!config.resume||!Array.isArray(config.retestTaskIds)||!config.retestTaskIds.length||new Set(config.retestTaskIds).size!==config.retestTaskIds.length||config.retestTaskIds.some(id=>!tasks.includes(id))))throw Error('Invalid forced retest configuration');
 const system=await fs.readFile(path.join(root,'scripts/server-eval',language==='zh'?'system-prompt.md':'system-prompt.en.md'),'utf8');
 const url=config.url??'http://127.0.0.1:4200/',page=await (await fetcher(url,{signal:AbortSignal.timeout(15000)})).text();
 if(!page.includes(new URL(plan.build).pathname))throw Error('Deployed build differs from the frozen task catalog');
 // BigModel does not promise Models discovery; Kimi advertises canonical IDs
 // (e.g. k3), but also accepts exact request aliases (e.g. kimi-k3). Do not
 // rename the requested model or reject an alias verified by a real screenshot
 // and game_step preflight merely because it is absent from that list.
 if(!['glm','kimi'].includes(provider.family)){
  const modelList=await fetcher(providerEndpoint(baseURL,'models'),{headers:{authorization:'Bearer '+(await fs.readFile(keyFile,'utf8')).trim()},signal:AbortSignal.timeout(30000)});
  if(!modelList.ok||!(await modelList.json()).data?.some(m=>m.id===model))throw Error('Requested model is unavailable');
 }
 const frozenFile=path.join(output,'prompts.snapshot.json'),seed=config.seed??1234;
 const identity={model:model+' + '+harnessLabel,build:plan.build,seed,language,url,effort,api,endpoint:providerEndpoint(baseURL,api),
  'max-rounds':config.maxRounds??300,'max-tokens':config.maxTokens??32768,
  systemPromptSha256:hash(system),instructionsSha256:hash(JSON.stringify(prompts.instructions)),
  provider,dispatchOrder:dispatchOrder(plan,tasks,config.priorityCategories).map(i=>tasks[i]),renderer:'gpu',canvas2d:'software',pageCompositing:'software',...variant.identity};
 const restart=config.resume?await prepareRestart({output,tasks,expected:identity,retestViolations:config.retestViolations===true,retestEarlyStops:config.retestEarlyStops===true,retestTaskIds:config.retestTaskIds??null,onlyTaskIds:config.onlyTaskIds??null,endpointMigration:config.resumeEndpointMigration??null}):null;
 if(restart&&(restart.snapshot.system!==system||JSON.stringify(restart.snapshot.instructions)!==JSON.stringify(prompts.instructions)))throw Error('Restart prompt snapshot mismatch');
 await fs.mkdir(path.dirname(output),{recursive:true});if(!restart)await fs.mkdir(output,{mode:0o700});
 await atomic(frozenFile,{system,instructions:prompts.instructions,language});
 const {customCatalog}=await import('./catalog.mjs');
 const catalogFile=path.join(output,'codex-catalog.json');
 await atomic(catalogFile,await customCatalog({...provider,codexBin:config.codexBin??'codex'}));
 const snapshot={...plan,model:model+' + '+harnessLabel,endpoint:providerEndpoint(baseURL,api),api,provider,workers,scope:'all',createdAt:new Date().toISOString(),
  description:(restart?'Resumed':'Fresh')+' full '+harnessLabel+' harness evaluation; game_step only; no JSON-runner result reuse.',contextManagement:'native-harness',instructionMode:'initial-image',observationContract:OBSERVATION_CONTRACT};
 if(config.taskIds){snapshot.categories=plan.categories.map(row=>({...row,tasks:row.tasks.filter(id=>tasks.includes(id))})).filter(row=>row.tasks.length);for(const row of snapshot.categories)row.available=row.tasks.length;snapshot.selectedTasks=tasks;}
 await atomic(path.join(output,'selection.json'),snapshot);
 await atomic(path.join(output,'config.json'),{...snapshot,seed,language,url,'max-rounds':config.maxRounds??300,'max-tokens':config.maxTokens??32768,
  effort,renderer:'gpu',policy:harness+'-native',canvas2d:'software',pageCompositing:'software',quotaRecovery,
  systemPromptSha256:hash(system),instructionsSha256:hash(JSON.stringify(prompts.instructions)),dispatchOrder:dispatchOrder(plan,tasks,config.priorityCategories).map(i=>tasks[i]),
  wallSeconds,requestSeconds:config.requestSeconds??3600,toolViolationPolicy:violationPolicy,retestViolations:config.retestViolations===true,retestEarlyStops:config.retestEarlyStops===true,onlyTaskIds:config.onlyTaskIds??null,retryOrder,...variant.identity,...restart?{restartBackup:restart.plan.backup,resumeEndpointMigration:restart.plan.endpointMigration}:{}});
 const retries=(restart?.plan.retry??[]).map(id=>tasks.indexOf(id)),retrySet=new Set(retries),ordered=dispatchOrder(plan,tasks,config.priorityCategories);
 const scheduled=retryOrder==='pending-first'?[...ordered.filter(i=>!retrySet.has(i)),...retries]:[...retries,...ordered];
 const active=new Map(),finished=restart?.finished??[],retained=new Set(finished.map(e=>e.result.index)),
  queue=[...new Set(scheduled)].filter(i=>!retained.has(i)&&(!config.onlyTaskIds||config.onlyTaskIds.includes(tasks[i]))),attemptCounts=restart?.attemptCounts??new Map(),quotaAttempts=(restart?.quotaAttempts??[]).map(e=>({...e,inherited:true}));
 let draining=false,circuit=false,consecutiveErrors=0,persist=Promise.resolve();
 const quotaGate=quotaRecovery.enabled?quotaGateFactory({config,output,fetcher,onEvent:event=>process.stdout.write(JSON.stringify(event)+'\n')}):null;
 await quotaGate?.save?.();
 const noSecretsEnv=hostEnvironment();
 const terminalStatuses=new Set(['error','archive_error','render_anomaly']);
 const requestDrain=()=>{draining=true;quotaGate?.stop();};process.once('SIGUSR1',requestDrain);process.once('SIGTERM',requestDrain);process.once('SIGINT',requestDrain);
 async function liveUsage(entry){
  try{const lines=(await fs.readFile(path.join(entry.directory,'api/audit.jsonl'),'utf8')).trim().split('\n');return totalUsage(lines.filter(Boolean).flatMap(line=>{try{const r=JSON.parse(line);return r.path===apiPath?[r.usage]:[];}catch{return [];}}));}catch{return {};}
 }
 function save(running=true){
  persist=persist.then(async()=>{
   const activeRows=await Promise.all([...active.values()].map(async e=>({taskId:e.taskId,index:e.index,worker:e.worker,pid:e.child.pid,directory:e.directory,startedAt:e.startedAt,usage:await liveUsage(e)})));
   const results=finished.map(e=>e.result),usage=totalUsage([...(restart?.baselineUsages??[]),...finished.filter(e=>!e.inherited).map(e=>e.usage),...quotaAttempts.filter(e=>!e.inherited).map(e=>e.usage),...activeRows.map(e=>e.usage)]);
   const summary={protocol:harness+'-harness-batch-v1',model,harness,pid:process.pid,requested:tasks.length,completedEpisodes:finished.length,
    running,draining,circuitStopped:circuit,workers,successes:results.filter(r=>r.success).length,
    errors:finished.filter(e=>e.result.status!=='tool_violation'&&(e.harnessStatus==='evaluation_error'||terminalStatuses.has(e.result.status))).length,
    toolViolations:results.filter(r=>r.status==='tool_violation').length,reusedEpisodes:finished.filter(e=>e.inherited&&e.result.status!=='tool_violation').length,
    active:activeRows,usage,results,pendingTasks:queue.map(i=>tasks[i]),quotaRecovery:quotaGate?.state??null,quotaInterruptedAttempts:quotaAttempts.length,updatedAt:new Date().toISOString()};
   await atomic(path.join(output,'summary.json'),summary);await atomic(path.join(output,'token-usage.json'),{model,...usage,completed:finished.length,active:activeRows.length,updatedAt:summary.updatedAt});
   await atomic(path.join(output,'tool-violations.json'),{policy:violationPolicy,executed:false,deferredRetest:true,count:summary.toolViolations,
    results:results.filter(r=>r.status==='tool_violation').map(r=>({taskId:r.taskId,index:r.index,harnessReport:r.harnessReport,...r.toolViolation}))});
  });return persist;
 }
 await save();
 await atomic(path.join(output,'launch.json'),{pid:process.pid,model,workers,requested:tasks.length,startedAt:new Date().toISOString(),output,effort,renderer:'gpu'});
 const interval=setInterval(()=>{void save().catch(e=>{draining=true;process.stderr.write(e.message+'\n');});},15000);interval.unref();
 async function worker(workerId){
  while(queue.length&&!draining){
   await quotaGate?.waitUntilReady();
   if(draining||!queue.length)break;
   const index=queue.shift(),taskId=tasks[index],attempt=(attemptCounts.get(index)??0)+1;attemptCounts.set(index,attempt);
   const suffix=attempt===1?'':'-attempt-'+attempt;
   const directory=path.join(output,'episodes',String(index).padStart(4,'0')+'-'+taskId+suffix);
   await fs.mkdir(path.dirname(directory),{recursive:true});
   const logFile=path.join(output,String(index).padStart(4,'0')+'-'+taskId+suffix+'.log'),fd=openSync(logFile,'wx',0o600);
   const args=['--experimental-transform-types','scripts/codex-eval/run.mjs','--task',taskId,'--model',model,'--base-url',baseURL,
    '--key-file',keyFile,'--effort',effort,'--max-tokens',String(config.maxTokens??32768),'--max-rounds',String(config.maxRounds??300),
    '--wall-seconds',String(wallSeconds),'--request-seconds',String(config.requestSeconds??3600),
    ...config.videoFPS!==undefined?['--video-fps',String(config.videoFPS)]:[],
    '--seed',String(/^c(?:10|11)-n/.test(taskId)?seed:seed+taskSeedIndices[taskId]),'--language',language,'--quality','low','--renderer','gpu','--url',url,
    '--prompt-snapshot',frozenFile,...catalogFile?['--catalog-file',catalogFile]:[],
    '--api',provider.api,'--context-window',String(provider.contextWindow),'--reasoning-summary',provider.reasoningSummary,...config.clockMode==='realtime'?['--clock-mode','realtime']:[],...maxActionSeconds!==1?['--max-action-seconds',String(maxActionSeconds)]:[],...quotaGate?['--quota-recovery','on']:[],...config.codexBin?['--codex-bin',config.codexBin]:[],
    '--output',directory];
   const child=spawnTask(process.execPath,args,{cwd:root,env:noSecretsEnv,stdio:['ignore',fd,fd]});closeSync(fd);
   const exited=new Promise(resolve=>{child.once('error',e=>resolve({error:e.message}));child.once('exit',(code,signal)=>resolve({code,signal}));});
   const entry={index,taskId,directory,child,worker:workerId,startedAt:new Date().toISOString()};active.set(index,entry);await save();
   process.stdout.write(JSON.stringify({event:'task_started',worker:workerId,index,taskId,pid:child.pid,model})+'\n');
   const exit=await exited;
   let report;try{report=await read(path.join(directory,'report.json'));}catch{report={status:'evaluation_error',error:'Missing task report',usage:{}};}
   if(quotaGate&&report.providerLimit?.kind==='kimi-five-hour'){
    await quotaGate.pause(report.providerLimit);
    active.delete(index);queue.unshift(index);
    quotaAttempts.push({index,taskId,attempt,directory,usage:report.usage??{},providerLimit:report.providerLimit});
    await atomic(path.join(output,'quota-attempts.json'),quotaAttempts);await save();
    process.stdout.write(JSON.stringify({event:'task_queued_after_quota',taskId,index,attempt,model})+'\n');continue;
   }
   let result={...(report.gameResult??{}),taskId,index,worker:workerId,success:!!report.gameResult?.success,rounds:report.gameResult?.rounds??0,
    status:report.status==='evaluation_error'?'error':report.gameResult?.status??'error',harnessStatus:report.status,harnessReport:path.relative(output,path.join(directory,'report.json')),
    model:model+' + '+harnessLabel,harness:harness+'-native',usage:report.usage??{},...report.earlyStopPolicy?{earlyStopPolicy:report.earlyStopPolicy,earlyStopFeedbackRounds:report.earlyStopFeedbackRounds,evaluationRounds:report.evaluationRounds}:{},...report.toolNameCorrections?.length?{toolNameCorrections:report.toolNameCorrections}:{},...report.error?{error:report.error}:{}};
   if(violationPolicy==='record-and-continue'&&report.status==='evaluation_error'){
    const classification=await classifyEpisode(directory,report);
    if(classification.kind==='tool_violation')result=violationResult(result,classification);
   }
   if(report.gameResult?.archive){
    const name=String(index).padStart(4,'0')+'-'+taskId+suffix+'.tar.gz';
    await fs.link(path.join(directory,'game',report.gameResult.archive),path.join(output,name));result.archive=name;
   }
   active.delete(index);finished.push({result,usage:report.usage??{},harnessStatus:report.status,exit});
   const recordedViolation=result.status==='tool_violation';
   consecutiveErrors=!recordedViolation&&report.status==='evaluation_error'?consecutiveErrors+1:0;
   if(consecutiveErrors>=3||!recordedViolation&&/tool capability|forbidden|Only game_step/i.test(report.error??'')){circuit=true;draining=true;quotaGate?.stop();}
   await save();process.stdout.write(JSON.stringify({event:'task_finished',worker:workerId,index,taskId,status:result.status,harnessStatus:report.status,completed:finished.length,model})+'\n');
  }
 }
 try{const settled=await Promise.allSettled(Array.from({length:workers},(_,i)=>worker(i).catch(e=>{draining=true;quotaGate?.stop();throw e;})));const failed=settled.find(r=>r.status==='rejected');if(failed)throw failed.reason;}
 finally{draining=true;quotaGate?.stop();clearInterval(interval);await save(false);process.removeListener('SIGUSR1',requestDrain);process.removeListener('SIGTERM',requestDrain);process.removeListener('SIGINT',requestDrain);}
 return {completed:finished.length,requested:tasks.length,output,circuit};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{if(process.argv.length!==3)throw Error('Usage: node scripts/codex-eval/batch.mjs PRIVATE_CONFIG.json');const result=await runBatch(await read(path.resolve(process.argv[2])));console.log(JSON.stringify(result));if(result.circuit)process.exitCode=1;}
 catch(error){process.stderr.write(error.stack+'\n');process.exitCode=1;}
}
