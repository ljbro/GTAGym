import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {EventEmitter} from 'node:events';
import {kimiFiveHourLimit,KimiQuotaGate} from '../scripts/codex-eval/kimi-quota.mjs';
import {startGateway} from '../scripts/codex-eval/gateway.mjs';
import {GAME_TOOL} from '../scripts/codex-eval/policy.mjs';
import {runBatch} from '../scripts/codex-eval/batch.mjs';

const limited={error:{message:"You've reached your 5-hour usage limit. Your quota will reset when the current 5-hour window ends.",type:'rate_limit_reached_error'}};
test('only an explicit five-hour limit, not generic 429/auth/weekly quota, activates recovery',()=>{
 const now=Date.parse('2026-10-26T01:00:00Z');
 const value=kimiFiveHourLimit({status:429,body:limited,headers:new Headers({'retry-after':'120'}),now});
 assert.equal(value.kind,'kimi-five-hour');assert.equal(value.retryAt,'2026-10-26T01:02:00.000Z');
 assert(kimiFiveHourLimit({status:403,body:limited,now}));
 for(const [status,message]of [[401,'5-hour usage limit'],[429,'Too many concurrent requests'],[429,"You've reached your weekly (7-day) usage limit"],[403,'Subscription expired']])
  assert.equal(kimiFiveHourLimit({status,body:{error:{message}},now}),null);
});
test('four waiters share one scheduled monitor; reject zero quota clues until a real response succeeds',async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'gta-kimi-quota-'));let clock=1000000,requests=0,waits=0;
 await fs.writeFile(path.join(dir,'key'),'host-secret');
 const config={model:'kimi-k3',baseURL:'https://api.kimi.com/coding/v1',api:'responses',effort:'max',keyFile:path.join(dir,'key'),quotaRecovery:{enabled:true,pollSeconds:300}};
 const gate=new KimiQuotaGate({config,output:dir,now:()=>clock,wait:async ms=>{waits++;clock+=ms;},fetcher:async(url,options)=>{
  requests++;assert(url.endsWith('/responses'));const request=JSON.parse(options.body);assert.equal(request.model,'kimi-k3');assert.equal(request.reasoning.effort,'max');assert.equal(request.stream,false);
  return requests===1?Response.json(limited,{status:429}):Response.json({model:'kimi-k3',object:'response',output:[],usage:{input_tokens:4,output_tokens:1}});
 }});
 try{
  await gate.pause(kimiFiveHourLimit({status:429,body:limited,now:clock}));
  await Promise.all(Array.from({length:4},()=>gate.waitUntilReady()));
  assert.equal(requests,2);assert.equal(waits,2);assert.equal(gate.state.recoveries,1);assert.equal(gate.state.status,'ready');assert(!gate.paused);
  const saved=await fs.readFile(path.join(dir,'quota-status.json'),'utf8');assert(!saved.includes('host-secret'));
  assert.equal((await fs.readdir(path.join(dir,'quota-probes'))).filter(f=>f.endsWith('.json.gz')).length,2);
 }finally{gate.stop();await fs.rm(dir,{recursive:true,force:true});}
});
test('authentication and unrelated failures stop automatic recovery instead of looping forever',async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'gta-kimi-blocked-'));await fs.writeFile(path.join(dir,'key'),'secret');
 const gate=new KimiQuotaGate({config:{model:'kimi-k3',baseURL:'https://api.kimi.com/coding/v1',keyFile:path.join(dir,'key'),quotaRecovery:{enabled:true,pollSeconds:1}},output:dir,wait:async()=>{},fetcher:async()=>Response.json({error:{message:'Invalid Authentication'}},{status:401})});
 try{await gate.pause(kimiFiveHourLimit({status:429,body:limited}));await assert.rejects(gate.waitUntilReady(),/not a confirmed/);assert.equal(gate.state.status,'blocked');}
 finally{gate.stop();await fs.rm(dir,{recursive:true,force:true});}
});
test('draining cancels a sleeping quota monitor without launching another paid request',async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'gta-kimi-stop-'));let requests=0;
 const gate=new KimiQuotaGate({config:{model:'kimi-k3',baseURL:'https://api.kimi.com/coding/v1',quotaRecovery:{enabled:true}},output:dir,fetcher:async()=>{requests++;throw Error('unexpected');}});
 try{await gate.pause(kimiFiveHourLimit({status:429,body:limited}));const waiting=gate.waitUntilReady();await new Promise(r=>setTimeout(r,10));gate.stop();await waiting;assert.equal(requests,0);}
 finally{gate.stop();await fs.rm(dir,{recursive:true,force:true});}
});
test('gateway preserves complete quota response and signals the trusted host, not an extra model tool',async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'gta-kimi-gateway-'));let limit;
 const g=await startGateway({model:'kimi-k3',baseURL:'https://provider.test',key:'private',output:path.join(dir,'api'),onQuota:value=>{limit=value;},fetcher:async()=>Response.json(limited,{status:429,headers:{'retry-after':'60'}})});
 try{
  const r=await fetch(g.url+'/v1/responses',{method:'POST',headers:{authorization:'Bearer '+g.token},body:JSON.stringify({model:'kimi-k3',input:[],tools:[{type:'function',name:GAME_TOOL,parameters:{type:'object'}}]})});
  assert.equal(r.status,429);await r.text();assert.equal(limit.kind,'kimi-five-hour');
  await new Promise(r=>setTimeout(r,10));assert.equal(g.calls[0].providerLimit.kind,'kimi-five-hour');
  assert((await fs.readdir(path.join(dir,'api'))).includes('000001-response.json.gz'));
 }finally{await g.close();await fs.rm(dir,{recursive:true,force:true});}
});
test('full scheduler retries only quota-interrupted episodes, preserving task indices, all completed results and billed tokens',async()=>{
 const directory=await fs.mkdtemp(path.join(os.tmpdir(),'gta-kimi-resume-')),output=path.join(directory,'batch'),key=path.join(directory,'key'),planFile=path.join(directory,'plan.json');
 const prompts=JSON.parse(await fs.readFile(new URL('../tasks/instructions.json',import.meta.url),'utf8'));
 const tasks=Object.keys(prompts.instructions);
 await fs.writeFile(planFile,JSON.stringify({scope:'all',build:'http://127.0.0.1:4200/assets/fixture.js',categories:[{category:'fixture',available:tasks.length,tasks}]}));await fs.writeFile(key,'private');
 const attempts=new Map(),directories=new Map();let interruptedTask,paused=false,waits=0;
 const quotaGateFactory=()=>({state:{enabled:true},async pause(){paused=true;},async waitUntilReady(){if(paused){waits++;paused=false;}},stop(){}});
 const spawnTask=(_,args)=>{
  const task=args[args.indexOf('--task')+1],dir=args[args.indexOf('--output')+1],seed=Number(args[args.indexOf('--seed')+1]);
  assert(args.includes('--quota-recovery'));assert.equal(seed,/^c(?:10|11)-n/.test(task)?1234:1234+tasks.indexOf(task));
  const attempt=(attempts.get(task)??0)+1;attempts.set(task,attempt);
  const prior=directories.get(task)??[];assert(!prior.includes(dir));prior.push(dir);directories.set(task,prior);
  const child=new EventEmitter();child.pid=10000+attempts.size;interruptedTask??=task;
  void(async()=>{
   await new Promise(r=>setTimeout(r,2));await fs.mkdir(path.join(dir,'game'),{recursive:true});
   const quota=task===interruptedTask&&attempt===1;
   if(!quota)await fs.writeFile(path.join(dir,'game/source.tar.gz'),'fixture');
   const report=quota?{status:'evaluation_error',providerLimit:kimiFiveHourLimit({status:429,body:limited}),usage:{input_tokens:10,output_tokens:2}}:
    {status:'completed',usage:{input_tokens:10,output_tokens:2},gameResult:{taskId:task,status:'round_limit',success:false,rounds:3,archive:'source.tar.gz'}};
   await fs.writeFile(path.join(dir,'report.json'),JSON.stringify(report));child.emit('exit',quota?1:0,null);
  })();return child;
 };
 try{
  const result=await runBatch({model:'kimi-k3',baseURL:'https://provider.test',keyFile:key,planFile,output,workers:4,quotaRecovery:{enabled:true}},{spawnTask,quotaGateFactory,fetcher:async url=>String(url).endsWith('/models')?Response.json({data:[{id:'kimi-k3'}]}):new Response('<script src="/assets/fixture.js"></script>')});
  assert.equal(result.completed,150);assert.equal(attempts.size,150);assert.equal(attempts.get(interruptedTask),2);assert.equal([...attempts.values()].reduce((a,b)=>a+b,0),151);assert.equal(waits,1);
  const summary=JSON.parse(await fs.readFile(path.join(output,'summary.json'),'utf8'));
  assert.equal(summary.errors,0);assert.equal(summary.quotaInterruptedAttempts,1);assert.equal(summary.usage.input_tokens,1510);assert.equal(summary.usage.output_tokens,302);
  assert.equal(summary.pendingTasks.length,0);assert.equal(new Set(summary.results.map(r=>r.taskId)).size,150);
  assert.equal((await fs.readdir(output)).filter(f=>f.endsWith('.tar.gz')).length,150);
 }finally{await fs.rm(directory,{recursive:true,force:true});}
});
