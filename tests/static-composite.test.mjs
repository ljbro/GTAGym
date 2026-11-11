import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {StaticShootingSite} from '../tasks/runtime.mjs';
import {ShootingEnvironment} from '../tasks/engines/shooting-engine.mjs';
import {createSniperEnvironment as SniperEnvironment} from '../tasks/engines/photo-sniper-engine.mjs';
import {staticTurn,validateCompositeTrace} from '../tasks/gui-turn.mjs';
import {replayStatic} from '../scripts/server-eval/static-replay.mjs';
import {parse} from '../scripts/server-eval/actions.mjs';
const base=new URL('../tasks/',import.meta.url);
const catalog=JSON.parse(await fs.readFile(new URL('catalog.json',base))).filter(row=>row.kind!=='native');
async function fixture(kind){
 const row=catalog.find(r=>r.kind===kind),config=JSON.parse(await fs.readFile(new URL(row.config,base)));
 const env=kind==='shooting'?new ShootingEnvironment(config.task,config.gold):new SniperEnvironment(config);env.reset({seed:1234});
 return Object.assign(Object.create(StaticShootingSite.prototype),{row,config,env,seed:1234,steps:0,limit:20,turnActionCounts:[],composite:false,cursor:{x:640,y:360},canvas:{width:1280,height:720},paused:()=>false,renders:0,changes:0,render(){this.renders++;},onChange(){this.changes++;}});
}
const run=(site,input)=>site.stepGui(parse(JSON.stringify(input)),{composite:true});
test('both static kinds rebase every move on center, including repeated points and zero movement',async()=>{
 for(const kind of ['shooting','sniper']){
  const site=await fixture(kind);
  if(kind==='sniper')run(site,{keys:[],mouse:{buttons:[{button:'right',event:'down'}]}});
  const start=site.snapshot().camera;
  for(let i=0;i<2;i++)run(site,{keys:[],mouse:{move:{dx:10,dy:5}}});
  const looks=site.trace().actions.filter(a=>a.type==='look').map(({type,dx,dy})=>({type,dx,dy}));
  assert.deepEqual(looks[0],looks[1]);
  assert.deepEqual(looks[0],{type:'look',dx:kind==='shooting'?15:10,dy:kind==='shooting'?-7.5:-5});
  assert.deepEqual(site.snapshot().cursor,{x:640,y:360});
  assert.notDeepEqual(site.snapshot().camera,start);
  const camera=site.snapshot().camera;
  run(site,{keys:[],mouse:{move:{dx:0,dy:0}}});
  assert.deepEqual(site.snapshot().camera,camera);
  assert.equal(site.trace().actions.at(-1).dx,0);assert.equal(site.trace().actions.at(-1).dy,0);
  run(site,{keys:[],mouse:{buttons:[{button:'left',event:'down'}]}});
  assert.equal((await replayStatic(site.row.id,site.trace())).reward,site.snapshot().hit?1:0);
 }
});
test('shooting corrects aim in successive screenshots, not original coordinates',async()=>{
 const site=await fixture('shooting'),stage=site.config.task.stages[0],gold=site.config.gold.point_xy;
 run(site,{keys:[],mouse:{move:{dx:10,dy:10}}});
 const screen=site.env.toScreen(gold);
 run(site,{keys:[],mouse:{move:{dx:(screen[0]*1280/stage.width)-640,dy:360-(screen[1]*720/stage.height)}}});
 assert(Math.abs(site.snapshot().camera.x-gold[0])<1e-8);
 assert(Math.abs(site.snapshot().camera.y-gold[1])<1e-8);
 run(site,{keys:[],mouse:{buttons:[{button:'left',event:'down'}]}});
 assert(site.snapshot().hit);assert.equal((await replayStatic(site.row.id,site.trace())).reward,1);
});
test('static center reference ignores stale cursor even for ignored-only replies',()=>{
 for(const kind of ['shooting','sniper']){
  const state={kind,cursor:{x:800,y:300},width:1280,height:720};
  assert.deepEqual(staticTurn({keys:[],mouse:{}},state),{actions:[],cursor:{x:640,y:360}});
  assert.deepEqual(staticTurn({keys:[],mouse:{move:{dx:0,dy:0}}},state),{actions:[{type:'look',dx:0,dy:0}],cursor:{x:640,y:360}});
 }
});
test('shooting move+fire executes once as one turn and scores the unchanged target',async()=>{
 const site=await fixture('shooting'),stage=site.config.task.stages[0],p=site.config.gold.point_xy;
 run(site,{keys:[],mouse:{move:{dx:(p[0]*1280/stage.width)-640,dy:360-(p[1]*720/stage.height)},buttons:[{button:'left',event:'down'}]}});
 assert.equal(site.steps,1);assert.equal(site.renders,1);assert.equal(site.changes,1);assert.equal(site.snapshot().hit,true);
 const trace=site.trace();assert.deepEqual(trace.turn_action_counts,[2]);assert.deepEqual(trace.actions.map(a=>a.type),['look','button']);
 assert.equal((await replayStatic(site.row.id,trace)).reward,1);
 assert.throws(()=>run(site,{keys:[],mouse:{buttons:[{button:'left',event:'down'}]}}),/not active/);
});
test('sniper scope+look applies both before observation, then move+fire ends once',async()=>{
 const site=await fixture('sniper');
 run(site,{keys:[],mouse:{move:{dx:13,dy:-10},buttons:[{button:'right',event:'down'}]}});
 assert(site.env.scoped);assert.equal(site.steps,1);assert.equal(site.renders,1);
 assert.deepEqual(site.trace().actions.map(a=>a.button??a.type),['LT','look']);
 assert.equal(site.env.entryTravel,Math.hypot(13,10));
 run(site,{keys:[],mouse:{move:{dx:20,dy:-20},buttons:[{button:'left',event:'down'}]}});
 const trace=site.trace();assert.deepEqual(trace.turn_action_counts,[2,2]);assert.equal(trace.model_steps,2);
 assert.equal((await replayStatic(site.row.id,trace)).reward,site.env.result.reward);
});
test('sniper supports scope+zoom+fire even with reverse button array order',async()=>{
 const site=await fixture('sniper');
 run(site,{keys:[],mouse:{scroll:{direction:'up',steps:2},buttons:[{button:'left',event:'down'},{button:'right',event:'down'}]}});
 const trace=site.trace();assert.deepEqual(trace.actions.map(a=>a.button),['LT','UP','RT']);
 assert.equal(site.steps,1);assert(site.env.zoom>site.config.scope.min_zoom);assert.equal(site.renders,1);
 assert.equal((await replayStatic(site.row.id,trace)).reward,site.env.result.reward);
});
test('20 model turns may contain more than 20 operations; step limit and replay still agree',async()=>{
 const site=await fixture('sniper');
 for(let i=0;i<20;i++)run(site,{keys:[],mouse:{move:{dx:(640+i)-640,dy:0},buttons:[{button:'right',event:'down'}]}});
 const trace=site.trace();assert.equal(trace.model_steps,20);assert.equal(trace.actions.length,40);assert(site.snapshot().done);
 assert.equal((await replayStatic(site.row.id,trace)).reason,'step_limit_without_shot');
 assert.throws(()=>run(site,{keys:[],mouse:{buttons:[{button:'left',event:'down'}]}}),/not active/);
 for(const bad of [{...trace,model_steps:19},{...trace,turn_action_counts:[40]},{...trace,max_steps:19},{...trace,action_protocol:'unknown'}])await assert.rejects(()=>replayStatic(site.row.id,bad));
 const legacy={...trace};delete legacy.action_protocol;delete legacy.turn_action_counts;
 await assert.rejects(()=>replayStatic(site.row.id,legacy),/step_budget/);
});
test('invalid groups fail atomically; top-level and duplicate buttons remain invalid',async()=>{
 for(const kind of ['shooting','sniper']){
  const site=await fixture(kind),before=JSON.stringify(site.trace()),cursor={...site.cursor};
  for(const input of [
   {keys:[],buttons:[{button:'left',event:'down'}]},
   {keys:[],mouse:{move:{dx:60,dy:0},buttons:[{button:'left',event:'bad'}]}},
   {keys:[],mouse:{move:{dx:641,dy:0},buttons:[{button:'right',event:'down'}]}},
   {keys:[],mouse:{buttons:[{button:'right',event:'down'},{button:'right',event:'up'}]}},
  ])assert.throws(()=>site.stepGui(input,{composite:true}));
  assert.equal(JSON.stringify(site.trace()),before);assert.deepEqual(site.cursor,cursor);assert.equal(site.renders,0);
 }
 const state={kind:'shooting',cursor:{x:640,y:360},width:1280,height:720};
 assert.deepEqual(staticTurn({keys:[],mouse:{move:{dx:60,dy:0},buttons:[{button:'right',event:'down'}]}},state),{actions:[{type:'look',dx:60,dy:0}],cursor:{x:640,y:360}});
 assert.throws(()=>validateCompositeTrace([{type:'button',button:'RT',event:'down'},{type:'look',dx:1,dy:0}],{action_protocol:'gui-composite-v1',max_steps:20,model_steps:1,turn_action_counts:[2]}));
});
test('keyboard is ignored and empty mouse counts a zero-operation turn, with replay parity',async()=>{
 for(const kind of ['shooting','sniper']){
  const site=await fixture(kind),initial=site.env.observe();
  for(const input of [{keys:[],mouse:{}},{keys:[{key:'Shift',duration_seconds:1}],mouse:{}},{keys:[{key:'c',duration_seconds:.1}]}])run(site,input);
  assert.deepEqual(site.env.observe(),initial);assert.equal(site.steps,3);
  assert.deepEqual(site.trace().turn_action_counts,[0,0,0]);
  run(site,{keys:[{key:'w',duration_seconds:1}],mouse:{move:{dx:20,dy:10}}});
  assert.deepEqual(site.cursor,{x:640,y:360});assert.deepEqual(site.trace().turn_action_counts,[0,0,0,1]);
  run(site,{keys:[{key:'Shift',duration_seconds:.2}],mouse:{buttons:[{button:'left',event:'down'}]}});
  assert(site.snapshot().done);assert.equal((await replayStatic(site.row.id,site.trace())).reward,site.snapshot().hit?1:0);
 }
});
test('shooting ignores scope/zoom, counts empty turns, and preserves move/fire scoring',async()=>{
 const site=await fixture('shooting'),initial=site.env.observe(),cursor={...site.cursor};
 for(const mouse of [
  {buttons:[{button:'right',event:'down'}]},
  {buttons:[{button:'right',event:'up'}]},
  {scroll:{direction:'up',steps:6}},
  {scroll:{direction:'down',steps:1},buttons:[{button:'right',event:'down'}]},
 ])run(site,{keys:[],mouse});
 assert.equal(site.steps,4);assert.deepEqual(site.env.observe(),initial);assert.deepEqual(site.cursor,cursor);
 assert.deepEqual(site.trace().actions,[]);assert.deepEqual(site.trace().turn_action_counts,[0,0,0,0]);
 const stage=site.config.task.stages[0],p=site.config.gold.point_xy;
 run(site,{keys:[],mouse:{move:{dx:(p[0]*1280/stage.width)-640,dy:360-(p[1]*720/stage.height)},buttons:[{button:'right',event:'down'}]}});
 run(site,{keys:[],mouse:{scroll:{direction:'up',steps:2},buttons:[{button:'right',event:'down'},{button:'left',event:'down'}]}});
 assert.equal(site.steps,6);assert(site.snapshot().hit);
 const trace=site.trace();assert.deepEqual(trace.turn_action_counts,[0,0,0,0,1,1]);
 assert.deepEqual(trace.actions.map(a=>a.button??a.type),['look','RT']);
 assert.equal((await replayStatic(site.row.id,trace)).reward,1);
});
test('ignored shooting controls still require valid schema and respect the turn limit',async()=>{
 const site=await fixture('shooting');
 for(const scroll of [null,{direction:'sideways',steps:1},{direction:'up',steps:7}])assert.throws(()=>site.stepGui({keys:[],mouse:{scroll}},{composite:true}));
 assert.equal(site.steps,0);
 for(let i=0;i<20;i++)run(site,{keys:[],mouse:{scroll:{direction:'up',steps:1},buttons:[{button:'right',event:'down'}]}});
 assert(site.snapshot().done);assert.equal(site.trace().actions.length,0);
 assert.equal((await replayStatic(site.row.id,site.trace())).reason,'step_limit_without_shot');
});
test('twenty ignored-key turns reach the limit without emitting source actions',async()=>{
 const site=await fixture('sniper');
 for(let i=0;i<20;i++)run(site,{keys:[{key:'Shift',duration_seconds:.1}]});
 assert(site.snapshot().done);assert.equal(site.trace().actions.length,0);
 assert.equal((await replayStatic(site.row.id,site.trace())).reason,'step_limit_without_shot');
});
test('shooting and sniper waits consume one model turn, leave source state unchanged and replay',async()=>{
 for(const kind of ['shooting','sniper']){
  const site=await fixture(kind),initial=site.env.observe();
  run(site,{keys:[],mouse:{},wait_seconds:.5});
  assert.deepEqual(site.env.observe(),initial);assert.equal(site.steps,1);
  assert.deepEqual(site.trace().turn_action_counts,[0]);
  assert.deepEqual(site.trace().actions,[]);
  run(site,{keys:[],mouse:{buttons:[{button:'left',event:'down'}]}});
  assert.equal((await replayStatic(site.row.id,site.trace())).reward,site.snapshot().hit?1:0);
 }
 const state={kind:'shooting',cursor:{x:640,y:360},width:1280,height:720};
 for(const wait_seconds of [0,2,null,'1'])assert.throws(()=>staticTurn({keys:[],wait_seconds},state),/wait_seconds/);
});
test('empty mouse preserves sniper scope and zoom; only explicit nested up releases scope',async()=>{
 const site=await fixture('sniper');
 run(site,{keys:[],mouse:{buttons:[{button:'right',event:'down'}]}});
 run(site,{keys:[],mouse:{scroll:{direction:'up',steps:2}}});
 const before=site.snapshot();run(site,{keys:[{key:'Shift',duration_seconds:1}],mouse:{}});
 assert(site.snapshot().scoped);assert.equal(site.snapshot().zoom,before.zoom);
 assert.deepEqual(site.snapshot().cursor,before.cursor);
 run(site,{keys:[],mouse:{buttons:[{button:'right',event:'up'}]}});
 assert.equal(site.snapshot().scoped,false);
});
test('legacy runtime caller stays strict so an in-flight old batch does not silently change protocol',async()=>{
 const site=await fixture('shooting');
 assert.throws(()=>site.stepGui({keys:[],mouse:{move:{dx:0,dy:0},buttons:[{button:'left',event:'down'}]}}));
 site.stepGui({keys:[],mouse:{move:{dx:10,dy:0}}});
 assert.equal(site.trace().action_protocol,undefined);assert.equal(site.steps,1);
 await replayStatic(site.row.id,site.trace());
});
