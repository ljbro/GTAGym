// Trusted host restart bookkeeping. Never passed to the model as a tool.
import fs from 'node:fs/promises';
import path from 'node:path';
import {gunzipSync} from 'node:zlib';
import {randomUUID} from 'node:crypto';
import {GAME_TOOL,isCompactionRequest} from './policy.mjs';
import {sseEvents} from './chat-adapter.mjs';
import {OBSERVATION_CONTRACT} from '../game-mcp/public-observation.mjs';

const read=file=>fs.readFile(file,'utf8').then(JSON.parse);
const safePath=(base,relative)=>{
 const file=path.resolve(base,relative);
 if(!file.startsWith(path.resolve(base)+path.sep))throw Error('Restart artifact escapes batch directory');
 return file;
};
export async function batchProcessAlive(pid){
 if(!Number.isInteger(pid)||pid<=0)return false;
 try{
  const [args,state]=await Promise.all([fs.readFile('/proc/'+pid+'/cmdline','utf8'),fs.readFile('/proc/'+pid+'/stat','utf8')]);
  return state.slice(state.lastIndexOf(')')+2).split(' ')[0]!=='Z'&&args.split('\0').some(x=>/scripts\/codex-eval\/batch\.mjs$/.test(x));
 }catch(e){if(['ENOENT','ESRCH'].includes(e.code))return false;throw e;}
}
async function audit(directory){
 try{return (await fs.readFile(path.join(directory,'api/audit.jsonl'),'utf8')).split('\n').filter(Boolean).map(JSON.parse);}
 catch(e){if(e.code==='ENOENT')return [];throw e;}
}
async function compressed(file){return gunzipSync(await fs.readFile(file)).toString('utf8');}
function outputCalls(value){
 const items=[value.item,...(value.output??[]),...(value.response?.output??[])].filter(Boolean);
 return items.filter(i=>typeof i.type==='string'&&i.type.endsWith('_call')).map(i=>({type:i.type,...i.name?{name:i.name}:{},...i.namespace?{namespace:i.namespace}:{}}));
}
export async function classifyEpisode(directory,report){
 const records=await audit(directory),violations=records.filter(r=>r.securityViolation);
 if(violations.length){
  const evidence=[];
  for(const record of violations){
   const prefix=path.join(directory,'api',String(record.id).padStart(6,'0'));
   if(/Only game_step/.test(record.error??'')){
    let body;try{body=JSON.parse(await compressed(prefix+'-native-request.json.gz'));}catch{}
    if(body&&isCompactionRequest(body)){evidence.push({requestId:record.id,kind:'adapter_compaction_error'});continue;}
   }
   let calls=record.rejectedTool?[record.rejectedTool]:[];
   // Older gateways did not retain the rejected name in the audit. Inspect
   // the archived RESPONSE, never infer an invocation from prompt/history text.
   if(!calls.length){
    for(const [suffix,sse]of [['-response.sse.gz',true],['-response.json.gz',false],['-completion.json.gz',false]]){
     try{
      const raw=await compressed(prefix+suffix),values=sse?sseEvents(raw):[JSON.parse(raw)];
      calls.push(...values.flatMap(outputCalls));
      for(const v of values)for(const c of v.choices??[])calls.push(...(c.message?.tool_calls??[]).map(t=>({type:t.type==='function'?'function_call':t.type,name:t.function?.name})));
     }catch(e){if(e.code!=='ENOENT')throw e;}
    }
   }
   const rejected=record.mode==='compaction'?calls:calls.filter(c=>c.type!=='function_call'||c.name!==GAME_TOOL||c.namespace);
   if(!rejected.length)return {kind:'infrastructure_error',reason:record.error??'Unresolved tool capability failure',requestId:record.id};
   const unique=[...new Map(rejected.map(c=>[JSON.stringify(c),c])).values()];
   evidence.push({requestId:record.id,kind:'tool_violation',executed:false,calls:unique,
    subtype:unique.every(c=>c.type==='function_call'&&/game.*step/i.test(c.name??''))?'unknown_game_tool_name':'unauthorized_tool'});
  }
  const toolEvidence=evidence.filter(e=>e.kind==='tool_violation');
  if(toolEvidence.length)return {kind:'tool_violation',executed:false,evidence:toolEvidence};
  return {kind:'adapter_compaction_error',evidence};
 }
 if(report.status==='completed'&&['success','task_failure','round_limit'].includes(report.gameResult?.status))return {kind:'terminal'};
 // Voluntary native-agent termination is an ended model attempt, not a host
 // interruption to silently retry. Preserve it, including its original status.
 if(report.status==='agent_stopped'&&report.gameResult?.error==='agent_stopped')return {kind:'terminal',reason:'agent_stopped'};
 return {kind:'retryable_error',reason:report.error??report.status};
}
export function violationResult(result,classification){
 return {...result,originalStatus:result.originalStatus??result.status,status:'tool_violation',success:false,
  failureKind:'tool_violation',toolViolation:classification,deferredRetest:true};
}

export async function prepareRestart({output,tasks,expected,retestViolations=false,retestEarlyStops=false,retestTaskIds=null,onlyTaskIds=null,endpointMigration=null}){
 const only=onlyTaskIds===null?null:new Set(onlyTaskIds);
 if(only&&(only.size!==onlyTaskIds.length||onlyTaskIds.some(id=>!tasks.includes(id))))throw Error('Invalid selective restart task ids');
 const force=retestTaskIds===null?new Set():new Set(retestTaskIds);
 if(force.size!==(retestTaskIds?.length??0)||[...force].some(id=>!tasks.includes(id)))throw Error('Invalid forced retest task ids');
 const [previous,summary,snapshot,launch]=await Promise.all(['config.json','summary.json','prompts.snapshot.json','launch.json'].map(n=>read(path.join(output,n))));
 for(const pid of new Set([summary.pid,launch.pid]))if(await batchProcessAlive(pid))throw Error('Refusing restart while the old batch process is alive');
 let appliedMigration=null;
 for(const [key,value]of Object.entries(expected))if(JSON.stringify(previous[key])!==JSON.stringify(value)){
  if(key==='endpoint'&&endpointMigration?.from===previous.endpoint&&endpointMigration?.to===value){appliedMigration=endpointMigration;continue;}
  throw Error('Restart configuration mismatch: '+key);
 }
 // Early image-only batches recorded the contract in every episode but not
 // at batch level. Accept a missing batch field ONLY with per-episode proof;
 // an explicitly different contract always fails closed.
 if(previous.observationContract!==undefined&&previous.observationContract!==OBSERVATION_CONTRACT||previous.policy!=='codex-native')throw Error('Cannot reuse a different harness/observation contract');
 const previousTasks=previous.dispatchOrder;
 if(!Array.isArray(previousTasks)||previousTasks.length!==tasks.length||new Set(previousTasks).size!==tasks.length||tasks.some(id=>!previousTasks.includes(id)))throw Error('Restart task catalog mismatch');
 const directories=await fs.readdir(path.join(output,'episodes'),{withFileTypes:true}).catch(e=>{if(e.code==='ENOENT')return [];throw e;});
 const attemptCounts=new Map(),baselineUsages=[];
 for(const item of directories){
  if(!item.isDirectory()&&!item.isSymbolicLink())continue;
  const match=/^(\d{4})-(.+?)(?:-attempt-(\d+))?$/.exec(item.name);if(!match)continue;
  const index=Number(match[1]);if(tasks[index]!==match[2])throw Error('Restart episode index/seed mismatch');
  attemptCounts.set(index,Math.max(attemptCounts.get(index)??0,Number(match[3]??1)));
  const directory=path.join(output,'episodes',item.name),records=await audit(directory);
  if(previous.observationContract===undefined){
   const r=await read(path.join(directory,'report.json'));
   if(r.observationContract!==OBSERVATION_CONTRACT||r.task!==tasks[index]||r.model!==previous.provider?.model)throw Error('Legacy batch lacks per-episode image-only provenance');
  }
  if(records.length)baselineUsages.push(...records.map(r=>r.usage).filter(Boolean));
  else{let r;try{r=await read(path.join(directory,'report.json'));}catch(e){if(e.code!=='ENOENT')throw e;}if(r?.usage)baselineUsages.push(r.usage);}
 }
 const finished=[],classifications=[],seen=new Set();
 for(const result of summary.results??[]){
  if(tasks[result.index]!==result.taskId||seen.has(result.index))throw Error('Restart summary index/seed mismatch or duplicate');seen.add(result.index);
  const reportFile=safePath(output,result.harnessReport),directory=path.dirname(reportFile),report=await read(reportFile);
  if(report.task!==result.taskId||report.model!==expected.model.split(' + Codex')[0]||report.observationContract!==OBSERVATION_CONTRACT)throw Error('Restart episode provenance mismatch');
  const classification=await classifyEpisode(directory,report);
  classifications.push({taskId:result.taskId,index:result.index,harnessReport:result.harnessReport,...classification});
  const earlyStopRetest=retestEarlyStops&&classification.reason==='agent_stopped'&&(!only||only.has(result.taskId));
  if(only&&!only.has(result.taskId)||!force.has(result.taskId)&&!earlyStopRetest&&(classification.kind==='terminal'||classification.kind==='tool_violation'&&!retestViolations)){
   const retained=classification.kind==='tool_violation'?violationResult(result,classification):result;
   finished.push({result:retained,usage:report.usage??{},harnessStatus:report.status,inherited:true});
  }
 }
 const retained=new Set(finished.map(e=>e.result.index)),pending=tasks.map((_,i)=>i).filter(i=>!retained.has(i)&&(!only||only.has(tasks[i])));
 const backup=path.join(output,'restarts',new Date().toISOString().replace(/[:.]/g,'-')+'-'+randomUUID());
 await fs.mkdir(backup,{recursive:true,mode:0o700});
 for(const name of ['config.json','summary.json','selection.json','launch.json','token-usage.json','prompts.snapshot.json','codex-catalog.json','quota-status.json','quota-attempts.json','restart-plan.json','tool-violations.json']){
  try{await fs.copyFile(path.join(output,name),path.join(backup,name));}catch(e){if(e.code!=='ENOENT')throw e;}
 }
 const plan={createdAt:new Date().toISOString(),sourcePid:summary.pid,backup,retestViolations,retestEarlyStops,retestTaskIds,onlyTaskIds,endpointMigration:appliedMigration,contractValidation:previous.observationContract===undefined?'verified-every-episode-report':'batch-and-episode-reports',
  reused:finished.filter(e=>e.result.status!=='tool_violation').map(e=>e.result.taskId),
  deferredViolations:finished.filter(e=>e.result.status==='tool_violation').map(e=>e.result.taskId),
  pending:pending.map(i=>tasks[i]),retry:classifications.filter(c=>!retained.has(c.index)).map(c=>c.taskId),classifications,
  episodePolicy:'Only terminal model attempts reused; '+(retestViolations?'prior tool violations explicitly queued for retest':'violations retained separately without retest')+'; incomplete/adapter errors restart from the initial screenshot with unchanged original indices/seeds.',
  tokenPolicy:'All prior archived API attempts counted once as baseline; new attempts added; retained results not added again.'};
 await fs.writeFile(path.join(output,'restart-plan.json'),JSON.stringify(plan,null,2)+'\n',{mode:0o600});
 let quotaAttempts=[];try{quotaAttempts=await read(path.join(output,'quota-attempts.json'));}catch(e){if(e.code!=='ENOENT')throw e;}
 return {snapshot,finished,attemptCounts,baselineUsages,plan,quotaAttempts};
}
