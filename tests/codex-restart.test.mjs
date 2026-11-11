import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {gzipSync} from 'node:zlib';
import {EventEmitter} from 'node:events';
import {classifyEpisode,prepareRestart} from '../scripts/codex-eval/restart.mjs';
import {COMPACTION_PREFIX,GAME_TOOL} from '../scripts/codex-eval/policy.mjs';
import {runBatch} from '../scripts/codex-eval/batch.mjs';

test('selective early-stop retest preserves other results including errors and never schedules unstarted tasks',async t=>{
 const output=await fs.mkdtemp(path.join(os.tmpdir(),'gta-selective-retest-'));t.after(()=>fs.rm(output,{recursive:true,force:true}));
 const tasks=['stopped','success','other-error','unstarted'],results=[];
 for(const [index,status]of ['agent_stopped','completed','evaluation_error'].entries()){
  const report={task:tasks[index],model:'fixture',observationContract:'image-only-host-observation-v1',status,usage:{input_tokens:10},gameResult:{status:index===1?'success':'interrupted',success:index===1,...index===0?{error:'agent_stopped'}:{}}};
  const directory=path.join(output,'episodes',String(index).padStart(4,'0')+'-'+tasks[index]);await fs.mkdir(directory,{recursive:true});await fs.writeFile(path.join(directory,'report.json'),JSON.stringify(report));
  results.push({taskId:tasks[index],index,status:report.gameResult.status,harnessReport:path.relative(output,path.join(directory,'report.json')),success:index===1});
 }
 for(const [name,value]of Object.entries({'config.json':{model:'fixture + Codex',provider:{model:'fixture'},endpoint:'http://127.0.0.1:4290/v1/responses',dispatchOrder:tasks,policy:'codex-native',observationContract:'image-only-host-observation-v1'},'summary.json':{results},'launch.json':{},'prompts.snapshot.json':{system:'frozen',instructions:{}}}))await fs.writeFile(path.join(output,name),JSON.stringify(value));
 const expected={model:'fixture + Codex',endpoint:'http://127.0.0.1:8080/v1/responses'};
 await assert.rejects(prepareRestart({output,tasks,expected,retestEarlyStops:true,onlyTaskIds:['stopped']}),/mismatch: endpoint/);
 const result=await prepareRestart({output,tasks,expected,retestEarlyStops:true,onlyTaskIds:['stopped'],endpointMigration:{from:'http://127.0.0.1:4290/v1/responses',to:expected.endpoint}});
 assert.equal(result.plan.endpointMigration.to,expected.endpoint);
 assert.deepEqual(result.finished.map(e=>e.result.taskId),['success','other-error']);assert.deepEqual(result.plan.pending,['stopped']);assert.equal(result.baselineUsages.length,3);
 const audited=await prepareRestart({output,tasks,expected,retestTaskIds:['success'],endpointMigration:{from:'http://127.0.0.1:4290/v1/responses',to:expected.endpoint}});
 assert.deepEqual(audited.finished.map(e=>e.result.taskId),['stopped']);
 assert.deepEqual(audited.plan.pending,['success','other-error','unstarted']);
 assert.deepEqual(audited.plan.retestTaskIds,['success']);
 await assert.rejects(prepareRestart({output,tasks,expected,retestTaskIds:['unknown']}),/forced retest/);
});

async function evidence(dir,{error,call,compaction=false,usage={input_tokens:10,output_tokens:2}}){
 await fs.mkdir(path.join(dir,'api'),{recursive:true});
 await fs.writeFile(path.join(dir,'api/audit.jsonl'),JSON.stringify({id:1,path:'/v1/responses',usage,...error?{error,securityViolation:true}:{}})+'\n');
 if(compaction)await fs.writeFile(path.join(dir,'api/000001-native-request.json.gz'),gzipSync(JSON.stringify({tools:[],input:[{role:'user',content:COMPACTION_PREFIX+' summarize'}]})));
 if(call)await fs.writeFile(path.join(dir,'api/000001-response.json.gz'),gzipSync(JSON.stringify({output:[{type:'function_call',name:call,arguments:'{"secret":"not-for-log"}'}]})));
}
test('distinguishes old compaction rejection, actual exec, and wrong game name without leaking arguments',async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'gta-codex-evidence-'));
 try{
  for(const [name,options,kind,subtype]of [
   ['compact',{error:'Only game_step must be available exactly once',compaction:true},'adapter_compaction_error'],
   ['exec',{error:'Forbidden tool invocation',call:'exec'},'tool_violation','unauthorized_tool'],
   ['alias',{error:'Forbidden tool invocation',call:'game__game_step'},'tool_violation','unknown_game_tool_name'],
   ['bad-catalog',{error:'Only game_step must be available exactly once'},'infrastructure_error'],
  ]){
   const episode=path.join(dir,name);await evidence(episode,options);const r=await classifyEpisode(episode,{status:'evaluation_error'});
   assert.equal(r.kind,kind);if(subtype){assert.equal(r.evidence[0].subtype,subtype);assert.equal(r.executed,false);}
   assert(!JSON.stringify(r).includes('secret'));
  }
  assert.equal((await classifyEpisode(path.join(dir,'none'),{status:'agent_stopped',gameResult:{error:'agent_stopped'}})).kind,'terminal');
  assert.equal((await classifyEpisode(path.join(dir,'none'),{status:'evaluation_error',error:'Harness interrupted'})).kind,'retryable_error');
 }finally{await fs.rm(dir,{recursive:true,force:true});}
});

test('resumes same batch with exact seed indices, records blocked calls without stopping, backs up old results and counts every attempt once',async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'gta-codex-restart-')),output=path.join(dir,'batch'),keyFile=path.join(dir,'key'),planFile=path.join(dir,'plan.json');
 const prompts=JSON.parse(await fs.readFile(new URL('../tasks/instructions.json',import.meta.url),'utf8'));
 const tasks=Object.keys(prompts.instructions);
 await fs.writeFile(planFile,JSON.stringify({scope:'all',build:'http://127.0.0.1:4200/assets/fixture.js',categories:[{category:'fixture',available:tasks.length,tasks}]}));await fs.writeFile(keyFile,'private');
 const config={model:'deepseek-flash',baseURL:'https://provider.test',keyFile,planFile,output,workers:1,wallSeconds:7200,toolViolationPolicy:'record-and-continue'};
 let phase=0;const attempts=new Map(),spawned=[];
 const dependencies={fetcher:async url=>String(url).endsWith('/models')?Response.json({data:[{id:config.model}]}):new Response('<script src="/assets/fixture.js"></script>'),spawnTask:(_,args)=>{
  const task=args[args.indexOf('--task')+1],directory=args[args.indexOf('--output')+1],seed=Number(args[args.indexOf('--seed')+1]),index=tasks.indexOf(task);
  assert.equal(args[args.indexOf('--wall-seconds')+1],phase===0?'7200':'0');
  assert.equal(seed,/^c(?:10|11)-n/.test(task)?1234:1234+index);assert(!spawned.includes(directory));spawned.push(directory);
  attempts.set(task,(attempts.get(task)??0)+1);const child=new EventEmitter();child.pid=10000+spawned.length;
  void(async()=>{
   await fs.mkdir(path.join(directory,'game'),{recursive:true});await fs.writeFile(path.join(directory,'game/source.tar.gz'),'fixture-'+spawned.length);
   const mode=phase===0?index:phase===1&&index===4?1:0;
   const error=mode===1||mode===2?'Forbidden tool invocation':mode===3?'Only game_step must be available exactly once':null;
   await evidence(directory,{error,call:mode===1?'exec':mode===2?'game__game_step':null,compaction:mode===3});
   await fs.writeFile(path.join(directory,'report.json'),JSON.stringify({task,model:config.model,observationContract:'image-only-host-observation-v1',status:error?'evaluation_error':'completed',...error?{error}:{},usage:{input_tokens:10,output_tokens:2},gameResult:{taskId:task,status:error?'interrupted':'task_failure',success:false,rounds:3,archive:'source.tar.gz'}}));
   child.emit('exit',error?1:0,null);
  })();return child;
 }};
 try{
  const first=await runBatch(config,dependencies);assert.equal(first.completed,4);assert(first.circuit);
  let summary=JSON.parse(await fs.readFile(path.join(output,'summary.json'),'utf8'));assert.equal(summary.toolViolations,2);assert.equal(summary.errors,1);
  // Production source has exited before restart; test runBatch shares our PID.
  // batchProcessAlive recognizes only real scheduler commands, not this test.
  const reportBefore=await fs.readFile(path.join(output,summary.results[0].harnessReport),'utf8');
  const legacy=JSON.parse(await fs.readFile(path.join(output,'config.json'),'utf8'));delete legacy.observationContract;
  await fs.writeFile(path.join(output,'config.json'),JSON.stringify(legacy));
  phase=1;config.wallSeconds=0;config.retryOrder='pending-first';
  const second=await runBatch({...config,resume:true},dependencies);assert.equal(second.completed,150);assert(!second.circuit);
  summary=JSON.parse(await fs.readFile(path.join(output,'summary.json'),'utf8'));
  assert.equal(JSON.parse(await fs.readFile(path.join(output,'config.json'),'utf8')).wallSeconds,0);
  assert.equal(summary.toolViolations,3);assert.equal(summary.errors,0);assert.equal(summary.reusedEpisodes,1);assert.equal(summary.pendingTasks.length,0);
  assert.equal(summary.usage.input_tokens,1510);assert.equal(summary.usage.output_tokens,302);assert.equal(summary.usage.total_tokens,1812);
  assert.equal(attempts.get(tasks[0]),1);assert.equal(attempts.get(tasks[1]),1);assert.equal(attempts.get(tasks[2]),1);assert.equal(attempts.get(tasks[3]),2);
  const retried=summary.results.find(r=>r.index===3);assert(retried.harnessReport.includes('-attempt-2/'));assert(retried.archive.includes('-attempt-2.tar.gz'));
  // Finish every unstarted task before retrying the previous infrastructure
  // error; original indices/seeds, retained results and token accounting stay intact.
  assert.equal(summary.results.at(-1).index,3);
  assert.equal(JSON.parse(await fs.readFile(path.join(output,'config.json'),'utf8')).retryOrder,'pending-first');
  assert.equal(await fs.readFile(path.join(output,summary.results[0].harnessReport),'utf8'),reportBefore);
  const plan=JSON.parse(await fs.readFile(path.join(output,'restart-plan.json'),'utf8'));assert.equal(plan.deferredViolations.length,2);assert.equal(plan.pending.length,147);assert.equal(plan.contractValidation,'verified-every-episode-report');
  assert.equal(JSON.parse(await fs.readFile(path.join(plan.backup,'summary.json'),'utf8')).errors,1);
  assert.equal((await fs.readdir(output)).filter(n=>n.endsWith('.tar.gz')).length,151);
  // A second no-op restart must neither add token usage nor dispatch a task.
  phase=2;await runBatch({...config,resume:true},dependencies);
  summary=JSON.parse(await fs.readFile(path.join(output,'summary.json'),'utf8'));assert.equal(summary.usage.total_tokens,1812);assert.equal(spawned.length,151);
  await assert.rejects(runBatch({...config,resume:true,seed:999},dependencies),/mismatch: seed/);
  await assert.rejects(runBatch({...config,resume:true,contextWindow:64000},dependencies),/mismatch: provider/);
  // A user-requested retest may requeue the previously deferred violations,
  // but never reruns good model outcomes or changes their original seeds.
  const countBefore=spawned.length;
  await runBatch({...config,resume:true,retestViolations:true},dependencies);
  summary=JSON.parse(await fs.readFile(path.join(output,'summary.json'),'utf8'));
  assert.equal(spawned.length-countBefore,3);assert.equal(summary.toolViolations,0);assert.equal(summary.reusedEpisodes,147);
  assert.equal(summary.usage.total_tokens,1848);assert.equal(summary.results.length,150);
  for(const index of [1,2,4])assert(summary.results.find(r=>r.index===index).harnessReport.includes('-attempt-2/'));
 }finally{await fs.rm(dir,{recursive:true,force:true});}
});
