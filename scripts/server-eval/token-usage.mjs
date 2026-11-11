import fs from 'node:fs/promises';
import path from 'node:path';

const count=value=>Number.isSafeInteger(value)&&value>=0?value:null;
export function normalizeTokenUsage(usage){
 if(!usage||typeof usage!=='object')return null;
 const input=count(usage.input_tokens)??count(usage.prompt_tokens);
 const output=count(usage.output_tokens)??count(usage.completion_tokens);
 const reportedTotal=count(usage.total_tokens);
 if(input===null&&output===null&&reportedTotal===null)return null;
 return {inputTokens:input??0,outputTokens:output??0,totalTokens:reportedTotal??((input??0)+(output??0)),
  reasoningTokens:count(usage.output_tokens_details?.reasoning_tokens)??count(usage.completion_tokens_details?.reasoning_tokens)??0,
  cachedInputTokens:count(usage.input_tokens_details?.cached_tokens)??count(usage.prompt_tokens_details?.cached_tokens)??count(usage.prompt_cache_hit_tokens)??0,
  cacheWriteInputTokens:count(usage.input_tokens_details?.cache_write_tokens)??count(usage.prompt_tokens_details?.cache_write_tokens)??0,
  complete:input!==null&&output!==null};
}
export function emptyTokenTotals(){
 return {requestsStarted:0,responsesReceived:0,failedRequests:0,pendingRequests:0,responsesWithUsage:0,responsesMissingUsage:0,responsesPartialUsage:0,
  inputTokens:0,outputTokens:0,totalTokens:0,reasoningTokens:0,cachedInputTokens:0,cacheWriteInputTokens:0};
}
export function addTokenTotals(target,source){
 for(const field of Object.keys(emptyTokenTotals()))target[field]+=source[field]??0;
 return target;
}

/** Count each HTTP request once at receipt, before format/empty-response handling.
 * Never sum the repeated response copies in attempts, checkpoints or replay.
 * Failed requests have unknown billing; missing usage is explicitly visible. */
export class TokenUsageLedger {
 constructor(output,{model,policy='model'}={}){
  this.file=path.join(output,'token-usage.json');this.model=model;this.policy=policy;
  this.startedAt=new Date().toISOString();this.running=true;this.totals=emptyTokenTotals();this.byTask=new Map();this.writes=Promise.resolve();
 }
 begin(taskId,round){
  if(!this.running)throw Error('Token ledger is closed');
  if(!this.byTask.has(taskId))this.byTask.set(taskId,emptyTokenTotals());
  const ticket={taskId,round,settled:false,ledger:this};
  for(const stats of [this.totals,this.byTask.get(taskId)]){stats.requestsStarted++;stats.pendingRequests++;}
  return ticket;
 }
 settle(ticket){
  if(ticket.ledger!==this||ticket.settled)throw Error('Request usage was already settled or belongs to another ledger');
  ticket.settled=true;
  const stats=[this.totals,this.byTask.get(ticket.taskId)];
  for(const entry of stats)entry.pendingRequests--;
  return stats;
 }
 async response(ticket,body){
  const usage=normalizeTokenUsage(body?.usage);
  for(const stats of this.settle(ticket)){
   stats.responsesReceived++;
   if(!usage){stats.responsesMissingUsage++;continue;}
   stats.responsesWithUsage++;if(!usage.complete)stats.responsesPartialUsage++;
   for(const [key,value] of Object.entries(usage))if(key!=='complete')stats[key]+=value;
  }
  await this.flush();
 }
 async failure(ticket){
  for(const stats of this.settle(ticket))stats.failedRequests++;
  await this.flush();
 }
 snapshot(){
  return {version:1,model:this.model,policy:this.policy,running:this.running,startedAt:this.startedAt,updatedAt:new Date().toISOString(),
   scope:'new-api-requests-in-this-process; replayed/reused responses and connectivity preflight excluded',source:'provider-reported-usage',
   note:'Output includes provider-reported reasoning tokens. Reasoning and cache are subsets, not extra tokens to add. Failed requests may have unreported upstream charges.',
   totals:{...this.totals},byTask:Object.fromEntries([...this.byTask].map(([id,stats])=>[id,{...stats}]))};
 }
 flush(){
  const snapshot=JSON.stringify(this.snapshot(),null,2);
  this.writes=this.writes.then(async()=>{
   const temporary=this.file+'.tmp';await fs.writeFile(temporary,snapshot);await fs.rename(temporary,this.file);
  });
  return this.writes;
 }
 async finish(){this.running=false;await this.flush();}
}
