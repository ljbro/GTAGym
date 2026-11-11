import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {replayStatic} from '../scripts/server-eval/static-replay.mjs';
import {createSniperEnvironment,SCOPE_ONLY_CONTROLS} from '../tasks/engines/photo-sniper-engine.mjs';
const root=new URL('../tasks/',import.meta.url);
const catalog=JSON.parse(await fs.readFile(new URL('catalog.json',root),'utf8'));
for(const suffix of ['008752-segment-061','008752-segment-072','008074-segment-032']){
 test(`sniper ${suffix}: native initial_camera is recorded metadata, not a shooting override`,async()=>{
  const row=catalog.find(x=>x.kind==='sniper'&&x.sourceId.toLowerCase().replaceAll('_','-')===`gta-task-${suffix}`);
  const cfg=JSON.parse(await fs.readFile(new URL(row.config,root),'utf8'));
  const env=createSniperEnvironment(cfg,{scopeOnlyLook:true});env.reset({seed:1234});
  const trace={...env.trace(),max_steps:20};
  assert(trace.initial_camera);assert.equal(trace.sniper_controls,SCOPE_ONLY_CONTROLS);
  const result=await replayStatic(row.id,trace);
  assert.equal(result.reward,0);assert.equal(result.reason,'step_limit_without_shot');
 });
}
test('benchmark shooting still rejects initial camera injection',async()=>{
 const row=catalog.find(x=>x.kind==='shooting');
 await assert.rejects(replayStatic(row.id,{initial_camera:{x:640,y:360}}),/Benchmark shooting initial camera/);
});
