import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {evaluationPlan} from '../scripts/evaluate.mjs';
import {createGameServer} from '../scripts/serve-game.mjs';
const read=async p=>JSON.parse(await fs.readFile(new URL('../'+p,import.meta.url),'utf8'));
test('release examples cover the same frozen task catalog and preserve evaluation budgets',async()=>{
 const a=await evaluationPlan(await read('configs/json.example.json')),b=await evaluationPlan(await read('configs/codex.example.json'));
 assert.deepEqual(a.tasks,b.tasks);assert.equal(a.tasks.length,150);assert.equal(a.maxRounds,300);assert.equal(b.maxRounds,300);
 assert.equal(a.maxTokens,32768);assert.equal(b.maxTokens,32768);assert.equal(b.wallSeconds,10800);
 assert.equal(a.settings.effort,'high');assert.equal(b.settings.effort,'high');
});
test('configuration rejects retired/unknown tasks, plaintext keys and invalid capacities',async()=>{
 const base=await read('configs/json.example.json');
 for(const change of [{tasks:['does-not-exist']},{workers:24},{apiKey:'DO_NOT_EMBED_KEYS'},{tasks:[]},{tasks:['c01-n04','c01-n04']}]){
  await assert.rejects(evaluationPlan({...base,...change}));
 }
 const one=await evaluationPlan({...base,tasks:['c01-n04']});assert.deepEqual(one.tasks,['c01-n04']);
});
test('timing options select the same 103 online tasks and preserve their independent budgets',async()=>{
 const base=await read('configs/codex.example.json');
 const cases=[[0.5,600,'stepped'],[2,300,'stepped'],[1,300,'realtime']];
 let tasks;
 for(const [cap,rounds,clock] of cases){
  const plan=await evaluationPlan({...base,tasks:'online',maxActionSeconds:cap,maxRounds:rounds,clockMode:clock});
  assert.equal(plan.protocol,'codex');assert.equal(plan.tasks.length,103);
  assert(plan.tasks.every(id=>!/^c(?:10|11)-n/.test(id)));
  assert.equal(plan.maxActionSeconds,cap);assert.equal(plan.maxRounds,rounds);assert.equal(plan.clockMode,clock);
  assert.equal(plan.maxTokens,32768);assert.equal(plan.workers,4);assert.equal(plan.settings.effort,'high');
  if(tasks)assert.deepEqual(plan.tasks,tasks);else tasks=plan.tasks;
 }
});
test('timing conditions reject incompatible protocols and scenes before launching a browser',async()=>{
 const base=await read('configs/codex.example.json');
 for(const change of [{clockMode:'invalid'},{clockMode:'realtime'},{maxActionSeconds:0},
  {clockMode:'realtime',tasks:'online',maxActionSeconds:2},{protocol:'json',maxActionSeconds:2},
  {protocol:'json',clockMode:'realtime'}])await assert.rejects(evaluationPlan({...base,...change}));
});
test('game server serves local models/media with ranges and excludes private evaluator files',async t=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'gtasuite-server-'));
 await fs.mkdir(path.join(dir,'native-city/dist'),{recursive:true});await fs.mkdir(path.join(dir,'city'));
 await fs.writeFile(path.join(dir,'native-city/dist/index.html'),'<html>fixture</html>');
 await fs.writeFile(path.join(dir,'city/model.glb'),'0123456789');
 await fs.writeFile(path.join(dir,'city/clip.mp4'),'0123456789');
 await fs.writeFile(path.join(dir,'private.key'),'NEVER_SERVE');
 await fs.symlink(path.join(dir,'private.key'),path.join(dir,'city/link.glb'));
 const server=createGameServer(dir);await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 t.after(async()=>{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));await fs.rm(dir,{recursive:true,force:true});});
 const base='http://127.0.0.1:'+server.address().port;
 assert.equal(await (await fetch(base)).text(),'<html>fixture</html>');
 const range=await fetch(base+'/city/clip.mp4',{headers:{Range:'bytes=2-5'}});
 assert.equal(range.status,206);assert.equal(range.headers.get('Content-Range'),'bytes 2-5/10');assert.equal(await range.text(),'2345');
 for(const name of ['/.git/config','/.cache/result.json','/scripts/evaluate.mjs','/city/link.glb'])assert.equal((await fetch(base+name)).status,404);
});
