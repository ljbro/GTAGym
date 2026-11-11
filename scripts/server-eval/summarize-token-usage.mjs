import fs from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {emptyTokenTotals,addTokenTotals} from './token-usage.mjs';

export async function summarizeTokenUsage(runs){
 const totals=emptyTokenTotals(),models=[];
 for(const run of runs){
  let usage,summary;
  try{usage=JSON.parse(await fs.readFile(path.join(run.output,'token-usage.json'),'utf8'));}catch(error){if(error.code!=='ENOENT')throw error;}
  try{summary=JSON.parse(await fs.readFile(path.join(run.output,'summary.json'),'utf8'));}catch(error){if(error.code!=='ENOENT')throw error;}
  if(usage)addTokenTotals(totals,usage.totals);
  models.push({model:run.model,output:run.output,running:summary?.running??usage?.running??null,completedEpisodes:summary?.completedEpisodes??0,
   requested:summary?.requested??run.taskCount??null,errors:summary?.errors??0,usageAvailable:!!usage,usageUpdatedAt:usage?.updatedAt??null,totals:usage?.totals??null});
 }
 return {version:1,updatedAt:new Date().toISOString(),source:'provider-reported usage of new requests, including format/empty retries',totals,models};
}

async function main(){
 const directory=path.resolve(process.argv[2]??'.'),watch=process.argv.includes('--watch');
 do{
  const batch=JSON.parse(await fs.readFile(path.join(directory,'launch.json'),'utf8'));
  if(!Array.isArray(batch.runs)||!batch.runs.length)throw Error('Batch launch.json must contain runs');
  const result=await summarizeTokenUsage(batch.runs);
  let queueActive=false;
  result.queuedModels=[];
  for(const queued of batch.queuedRuns??[]){
   try{
    const state=JSON.parse(await fs.readFile(queued.stateFile,'utf8'));
    result.queuedModels.push({model:queued.model,status:state.status,reason:state.reason,updatedAt:state.updatedAt});
    const pid=state.status==='started'?state.pid:!['failed','cancelled'].includes(state.status)?state.queuePid:null;
    if(pid){try{process.kill(pid,0);queueActive=true;}catch(error){if(error.code!=='ESRCH')throw error;}}
   }catch(error){if(error.code!=='ENOENT')throw error;}
  }
  const target=path.join(directory,'token-usage-summary.json');
  await fs.writeFile(target+'.tmp',JSON.stringify(result,null,2));await fs.rename(target+'.tmp',target);
  const lines=['# Evaluation token usage','',`Updated: ${result.updatedAt}`,'','| Model | Completed | Input | Output | Total | Reasoning (included in output) |','| --- | ---: | ---: | ---: | ---: | ---: |',
   ...result.models.map(m=>`| ${m.model} | ${m.completedEpisodes}/${m.requested??'?'} | ${m.totals?.inputTokens??'?'} | ${m.totals?.outputTokens??'?'} | ${m.totals?.totalTokens??'?'} | ${m.totals?.reasoningTokens??'?'} |`),
   `| All models | ${result.models.reduce((n,m)=>n+m.completedEpisodes,0)} | ${result.totals.inputTokens} | ${result.totals.outputTokens} | ${result.totals.totalTokens} | ${result.totals.reasoningTokens} |`,'',
   'Includes received format-correction and empty-response attempts exactly once. Connectivity checks, reused results and replayed rounds are excluded. Requests without returned usage may have unknown upstream charges.','',
   ...result.queuedModels.map(m=>`Queued model: ${m.model}; status: ${m.status}; ${m.reason??''}`),''];
  await fs.writeFile(path.join(directory,'token-usage-summary.md.tmp'),lines.join('\n'));await fs.rename(path.join(directory,'token-usage-summary.md.tmp'),path.join(directory,'token-usage-summary.md'));
  if(!watch||!queueActive&&batch.runs.every(r=>{try{process.kill(r.pid,0);return false;}catch{return true;}}))break;
  await new Promise(resolve=>setTimeout(resolve,15000));
 }while(true);
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href)await main();
