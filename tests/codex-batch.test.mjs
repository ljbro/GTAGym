import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {EventEmitter} from 'node:events';
import {runBatch,dispatchOrder,totalUsage,hostEnvironment} from '../scripts/codex-eval/batch.mjs';
import {selectFullTasks} from '../scripts/server-eval/full-selection.mjs';

test('prioritizing both tracks keeps task membership and original seed indices unchanged',()=>{
 const plan={categories:[{category:'outdoor-road',tasks:['road']},{category:'shooting',tasks:['shot']},{category:'sniper',tasks:['scope']}]},tasks=['road','shot','scope'];
 assert.deepEqual(dispatchOrder(plan,tasks),[1,2,0]);assert.equal(new Set(dispatchOrder(plan,tasks)).size,3);
 assert.deepEqual(totalUsage([{input_tokens:1,output_tokens:2},{input_tokens:3,output_tokens:4}]),{input_tokens:4,output_tokens:6,cache_read_input_tokens:0,cache_creation_input_tokens:0,total_tokens:10});
});
test('trusted renderer retains browser cache locations but no model credentials or proxies',()=>{
 const env=hostEnvironment({PATH:'/bin',HOME:'/shared/home',PLAYWRIGHT_BROWSERS_PATH:'/shared/browsers',GTA_AGENT_API_KEY:'secret',HTTP_PROXY:'proxy',SSH_AUTH_SOCK:'private'});
 assert.equal(env.HOME,'/shared/home');assert.equal(env.PLAYWRIGHT_BROWSERS_PATH,'/shared/browsers');
 for(const key of ['GTA_AGENT_API_KEY','HTTP_PROXY','SSH_AUTH_SOCK'])assert(!Object.hasOwn(env,key));
});
test('category priority dispatches every walking task before other categories without changing task indices',()=>{
 const plan={categories:[{category:'outdoor-foot',tasks:['walk1','walk2']},{category:'shooting',tasks:['shot']},{category:'air',tasks:['air']}]},tasks=['air','walk1','shot','walk2'];
 assert.deepEqual(dispatchOrder(plan,tasks,['outdoor-foot']),[1,3,2,0]);
 assert.deepEqual(tasks,['air','walk1','shot','walk2']);
 assert.deepEqual(dispatchOrder(plan,['walk1','shot'],['outdoor-foot']),[0,1]);
 for(const invalid of [['missing'],['outdoor-foot','outdoor-foot'],'outdoor-foot'])assert.throws(()=>dispatchOrder(plan,tasks,invalid),/priority/);
});
for(const [harness,model]of [['codex','Qwen3.5-9B'],['codex','kimi-k3'],['codex','glm-5.3-flash'],['codex','deepseek-flash'],['codex','gpt-6.1-sol']])test(harness+' '+model+': full four-worker scheduler records all 150 fresh tasks, archives, categories and token totals',async()=>{
 const directory=await fs.mkdtemp(path.join(os.tmpdir(),'gta-codex-batch-')),out=path.join(directory,'batch'),key=path.join(directory,'key'),planPath=path.join(directory,'plan.json');
 const prompts=JSON.parse(await fs.readFile(new URL('../tasks/instructions.json',import.meta.url),'utf8'));
 const tasks=Object.keys(prompts.instructions);
 const plan={scope:'all',build:'http://127.0.0.1:4200/assets/fixture.js',categories:[{category:'fixture',label:'Fixture',available:tasks.length,tasks}]};
 const original=selectFullTasks(plan,tasks);await fs.writeFile(planPath,JSON.stringify(plan));await fs.writeFile(key,'private');
 const seen=new Set();let active=0,peak=0;
 const spawnTask=(command,args,options)=>{
  assert.equal(command,process.execPath);assert(args.includes('--prompt-snapshot'));assert.equal(options.env.NO_PROXY,'*');assert(!Object.hasOwn(options.env,'GTA_AGENT_API_KEY'));
  const task=args[args.indexOf('--task')+1],output=args[args.indexOf('--output')+1],seed=Number(args[args.indexOf('--seed')+1]);
  assert.equal(args[args.indexOf('--model')+1],model);
  assert.equal(args[args.indexOf('--wall-seconds')+1],'0');
  assert.equal(args[args.indexOf('--effort')+1],/^Qwen/.test(model)?'xhigh':/^gpt/.test(model)?'high':'max');
  assert(!seen.has(task));seen.add(task);assert.equal(seed,/^c(?:10|11)-n/.test(task)?1234:1234+original.indexOf(task));
  active++;peak=Math.max(peak,active);const child=new EventEmitter();child.pid=10000+seen.size;
  void(async()=>{await new Promise(r=>setTimeout(r,10));await fs.mkdir(path.join(output,'game'),{recursive:true});await fs.writeFile(path.join(output,'game/source.tar.gz'),'fixture');
   await fs.writeFile(path.join(output,'report.json'),JSON.stringify({status:'completed',usage:{input_tokens:10,output_tokens:2},gameResult:{taskId:task,status:'round_limit',success:false,rounds:3,archive:'source.tar.gz'}}));active--;child.emit('exit',0,null);
  })();return child;
 };
 try{
  const result=await runBatch({harness,model,baseURL:'https://provider.test',keyFile:key,planFile:planPath,output:out,workers:4},{spawnTask,fetcher:async url=>String(url).endsWith('/v1/models')?Response.json({data:[{id:model}]}):new Response('<script src="/assets/fixture.js"></script>')});
  assert.equal(result.completed,150);assert.equal(seen.size,150);assert.equal(peak,4);
  const summary=JSON.parse(await fs.readFile(path.join(out,'summary.json'),'utf8'));assert.equal(summary.running,false);assert.equal(summary.errors,0);assert.equal(summary.active.length,0);
  assert.equal(JSON.parse(await fs.readFile(path.join(out,'config.json'),'utf8')).wallSeconds,0);
  assert.equal(summary.usage.input_tokens,1500);assert.equal(summary.usage.output_tokens,300);assert.equal(summary.usage.total_tokens,1800);
  assert(summary.results.every(r=>r.archive&&r.harness===harness+'-native'));assert.equal((await fs.readdir(out)).filter(f=>f.endsWith('.tar.gz')).length,150);
  assert.equal(JSON.parse(await fs.readFile(path.join(out,'selection.json'),'utf8')).categories[0].tasks.length,150);
 }finally{await fs.rm(directory,{recursive:true,force:true});}
});
