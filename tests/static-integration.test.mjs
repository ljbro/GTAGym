import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {ShootingEnvironment} from '../tasks/engines/shooting-engine.mjs';
import {createSniperEnvironment as SniperEnvironment} from '../tasks/engines/photo-sniper-engine.mjs';
import {staticAction} from '../tasks/gui-action.mjs';
import {parse} from '../scripts/server-eval/actions.mjs';
import {ModelContext} from '../scripts/server-eval/context.mjs';
import {loadPrompts} from '../scripts/server-eval/prompts.mjs';
import {replayStatic} from '../scripts/server-eval/static-replay.mjs';
import {execute} from '../scripts/server-eval/actions.mjs';
const root=new URL('../',import.meta.url),base=new URL('tasks/',root);
const catalog=JSON.parse(await fs.readFile(new URL('catalog.json',base))).filter(row=>row.kind!=='native');
test('only 24 shooting and 23 current sniper tasks; no aim',()=>{
 assert.equal(catalog.length,47);assert.equal(new Set(catalog.map(r=>r.id)).size,47);
 assert.equal(catalog.filter(r=>r.kind==='shooting').length,24);assert.equal(catalog.filter(r=>r.kind==='sniper').length,23);
 assert(catalog.every(r=>['shooting','sniper'].includes(r.kind)&&!JSON.stringify(r).includes('hit_polygons')));
});
test('all shipped engine, image and sniper config bytes match release SHA256',async()=>{
 const manifest=JSON.parse(await fs.readFile(new URL('manifest.json',base)));
 for(const f of manifest.files){const bytes=await fs.readFile(new URL(f.file,base));assert.equal(bytes.length,f.bytes);assert.equal(createHash('sha256').update(bytes).digest('hex'),f.sha256,f.file);}
});
test('GUI operations map to exactly one original action; invalid combinations never consume steps',()=>{
 const state={kind:'sniper',cursor:{x:640,y:360},width:1280,height:720};
 const move=staticAction(parse('{"keys":[],"mouse":{"move":{"dx":60,"dy":20}}}'),state);
 assert.deepEqual(move.action,{type:'look',dx:60,dy:-20});
 assert.deepEqual(move.cursor,{x:640,y:360});
 assert.deepEqual(staticAction(parse('{"keys":[],"mouse":{"move":{"dx":60,"dy":20}}}'),{...state,cursor:move.cursor}).action,{type:'look',dx:60,dy:-20});
 assert.deepEqual(staticAction(parse('{"keys":[],"mouse":{"scroll":{"direction":"up","steps":3}}}'),state).action,{type:'button',button:'UP',event:'down',duration_ms:480});
 assert.deepEqual(staticAction(parse('{"keys":[],"mouse":{"scroll":{"direction":"down","steps":1}}}'),state).action,{type:'button',button:'DOWN',event:'down',duration_ms:160});
 assert.throws(()=>staticAction(parse('{"keys":[],"mouse":{"scroll":{"direction":"up","steps":1}}}'),{...state,kind:'shooting'}));
 for(const button of ['left','right'])for(const event of ['down','up'])assert.equal(staticAction(parse(JSON.stringify({keys:[],mouse:{buttons:[{button,event}]}})),state).action.button,button==='left'?'RT':'LT');
 assert.throws(()=>staticAction(parse('{"keys":[],"mouse":{"buttons":[{"button":"left","event":"down"}],"move":{"dx":60,"dy":20}}}'),state));
 assert.throws(()=>staticAction(parse('{"keys":[],"mouse":{"buttons":[{"button":"right","event":"down"}]}}'),{...state,kind:'shooting'}));
 assert.throws(()=>staticAction(parse('{"keys":[],"mouse":{"move":{"dx":641,"dy":20}}}'),state));
});
test('static full history has first instruction+PNG, subsequent PNG only, no pruning at round 11',()=>{
 const ctx=new ModelContext('shared system','instruction',{staticOriginal:true});
 for(let round=1;round<=20;round++){assert.deepEqual(ctx.observe({round,gameSeconds:0,image:Buffer.from('PNG'),mime:'image/png'}),[]);if(round<20)ctx.reply('{}');}
 const messages=ctx.messages(),users=messages.filter(m=>m.role==='user');assert.equal(users.length,20);
 assert.equal(users[0].content.length,2);assert.equal(users[0].content[0].text,'instruction');
 assert(users.slice(1).every(m=>m.content.length===1&&m.content[0].image_url.url.startsWith('data:image/png')));
});
test('wheel schema rejects invalid/mixed inputs and old zoom keys before any action',async()=>{
 for(const scroll of [null,{},[],{direction:'up'},{direction:'left',steps:1},{direction:'up',steps:0},{direction:'up',steps:7},{direction:'down',steps:1.5},{direction:'up',steps:'1'},{direction:'up',steps:1,duration_seconds:1}])assert.throws(()=>parse(JSON.stringify({keys:[],mouse:{scroll}})));
 assert.throws(()=>parse(JSON.stringify({keys:[],mouse:{move:{dx:-639,dy:359},scroll:{direction:'up',steps:1}}})));
 for(const key of ['Equal','Minus'])assert.throws(()=>parse(JSON.stringify({keys:[{key,duration_seconds:.1}]})));
 let received;
 const a=parse('{"keys":[],"mouse":{"scroll":{"direction":"up","steps":2}}}');
 await execute({stepSequence:async(chunks,options)=>{received={chunks,options};return {advanced:0};}},a);
 assert.deepEqual(received.chunks,[]);assert.deepEqual(received.options.scroll,{direction:'up',steps:2});assert(!('moveBy' in received.options));assert.equal(a.frames,0);
});
test('scroll never closes the scope, clamps at original limits and consumes one source step',async()=>{
 const row=catalog.find(r=>r.kind==='sniper'),cfg=JSON.parse(await fs.readFile(new URL(row.config,base))),env=new SniperEnvironment(cfg),state={kind:'sniper',cursor:{x:640,y:360},width:1280,height:720};
 const scroll=direction=>staticAction(parse(JSON.stringify({keys:[],mouse:{scroll:{direction,steps:6}}})),state).action;
 env.step({type:'button',button:'LT',event:'down'});const first=env.zoom;
 env.step(scroll('up'));assert(env.scoped);assert(env.zoom>first);assert.equal(env.trace().actions.length,2);
 for(let i=0;i<10;i++)env.step(scroll('up'));assert.equal(env.zoom,cfg.scope.max_zoom);assert(env.scoped);
 for(let i=0;i<10;i++)env.step(scroll('down'));assert.equal(env.zoom,cfg.scope.min_zoom);assert(env.scoped);
 env.step({type:'button',button:'LT',event:'up'});const before=env.zoom;env.step(scroll('up'));assert(!env.scoped);assert.equal(env.zoom,before);
});
test('all released image tasks replay with their current outcome and 20-turn policies',async()=>{
 for(const row of catalog){
  const cfg=JSON.parse(await fs.readFile(new URL(row.config,base)));
  const env=row.kind==='shooting'?new ShootingEnvironment(cfg.task,cfg.gold):new SniperEnvironment(cfg);
  if(row.kind==='sniper'){assert.equal(cfg.evaluation.enabled,true);env.reset({seed:1234});env.step({type:'button',button:'LT',event:'down'});}
  env.step({type:'look',dx:12,dy:-7});env.step({type:'button',button:'RT',event:'down'});
  const trace={...(row.kind==='shooting'?env.exportTrace():env.trace()),max_steps:20},obs=env.observe();
  const scored=await replayStatic(row.id,trace);assert.equal(scored.reward,(obs.result??env.result).reward);assert.equal(obs.done,true);
  assert.equal((await replayStatic(row.id,trace,{executionError:true})).reward,0);
  await assert.rejects(()=>replayStatic(row.id,{...trace,max_steps:1}));
 }
});
test('ordinary head/body/vehicle gold points still produce positive replay scores',async()=>{
 for(const row of catalog.filter(r=>r.kind==='shooting')){
  const cfg=JSON.parse(await fs.readFile(new URL(row.config,base))),env=new ShootingEnvironment(cfg.task,cfg.gold),o=env.observe(),p=cfg.gold.point_xy;
  env.step({type:'look',dx:p[0]-o.camera.x,dy:p[1]-o.camera.y});env.step({type:'button',button:'RT',event:'down'});
  assert.equal((await replayStatic(row.id,env.exportTrace())).reward,1,row.id);
 }
});
test('native and static tasks load exactly the same Markdown system prompt',async()=>{
 const prompts=await loadPrompts({systemPrompt:new URL('scripts/server-eval/system-prompt.md',root).pathname,promptsFile:new URL('tasks/instructions.json',root).pathname,tasks:['c01-n04',catalog[0].id,catalog[24].id]});
 assert.equal(prompts.instructions[catalog[0].id],catalog[0].instruction);assert.equal(prompts.instructions[catalog[24].id],catalog[24].instruction);
 assert.equal(prompts.system,await fs.readFile(new URL('scripts/server-eval/system-prompt.md',root),'utf8'));
});
test('all 24 shooting tasks map 1280x720 policy coordinates back to unchanged source scoring',async()=>{
 for(const row of catalog.filter(r=>r.kind==='shooting')){
  const cfg=JSON.parse(await fs.readFile(new URL(row.config,base))),stage=cfg.task.stages[0];
  assert.equal(stage.width,1920);assert.equal(stage.height,1080);
  const env=new ShootingEnvironment(cfg.task,cfg.gold),p=cfg.gold.point_xy;
  const state={kind:'shooting',cursor:{x:640,y:360},width:1280,height:720,sourceWidth:stage.width,sourceHeight:stage.height};
  const input={keys:[],mouse:{move:{dx:(p[0]*1280/stage.width)-640,dy:360-(p[1]*720/stage.height)}}};
  const move=staticAction(parse(JSON.stringify(input)),state);env.step(move.action);
  assert(Math.abs(env.observe().camera.x-p[0])<1e-8);assert(Math.abs(env.observe().camera.y-p[1])<1e-8);
  const repeated=staticAction(parse(JSON.stringify(input)),{...state,cursor:move.cursor});
  assert.deepEqual(repeated.action,move.action);assert.deepEqual(repeated.cursor,{x:640,y:360});
  for(const point of [{x:1280,y:360},{x:640,y:720}])assert.throws(()=>staticAction({keys:[],mouse:{move_to:point}},state));
  env.step({type:'button',button:'RT',event:'down'});
  assert.equal((await replayStatic(row.id,env.exportTrace())).reward,1,row.id);
 }
});
