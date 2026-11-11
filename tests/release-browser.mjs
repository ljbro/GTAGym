// One real server-side browser, no paid model calls or legacy checkout access.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createGameServer} from '../scripts/serve-game.mjs';
import {ServerEnvironment} from '../scripts/server-eval/environment.mjs';
import {loadConfig} from '../scripts/game-mcp/config.mjs';
import {GameSession} from '../scripts/game-mcp/session.mjs';
import {selectFullTasks} from '../scripts/server-eval/full-selection.mjs';
import {parse,execute} from '../scripts/server-eval/actions.mjs';
import {chromium} from 'playwright';
const root=fileURLToPath(new URL('../',import.meta.url)),output=path.join(root,'.cache/release-browser-'+Date.now());
await fs.mkdir(output,{recursive:true});
const server=createGameServer();await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const url='http://127.0.0.1:'+server.address().port+'/',external=[];
const env=new ServerEnvironment({url,renderer:process.env.GTA_TEST_RENDERER??'gpu',seed:1234,quality:'low'});
const launch=chromium.launch.bind(chromium);
chromium.launch=async options=>{
 const browser=await launch(options),newContext=browser.newContext.bind(browser);
 browser.newContext=async options=>{
  const context=await newContext(options);
  context.on('request',r=>{if(/^https?:/.test(r.url())&&!r.url().startsWith(url))external.push(r.url());});
  return context;
 };
 return browser;
};
try{
 const ready=await env.open();console.log(JSON.stringify({event:'standalone_game_ready',...ready}));
 const manifest=JSON.parse(await fs.readFile(path.join(root,'configs/benchmark150.json'),'utf8'));
 const live=await env.evaluate(()=>{
  const c=document.querySelector('#native-task-category'),p=document.querySelector('#native-task-picker');
  const tasks=[...c.options].filter(o=>o.value!=='all').flatMap(o=>{
   c.value=o.value;c.dispatchEvent(new Event('change',{bubbles:true}));return [...p.options].map(o=>o.value);
  });
  c.value='all';c.dispatchEvent(new Event('change',{bubbles:true}));return tasks;
 });
 const canonical=manifest.categories.flatMap(c=>c.tasks);
 assert.deepEqual([...new Set(live)].sort(),[...canonical].sort(),'Standalone task picker differs from frozen benchmark');
 const expectedInstructions=JSON.parse(await fs.readFile(path.join(root,'tasks/instructions.json'),'utf8')).instructions;
 const menu=await env.evaluate(()=>{
  document.querySelector('#native-task-button').click();
  const panel=document.querySelector('#native-task-panel'),category=panel.querySelector('#native-task-category'),picker=panel.querySelector('#native-task-picker');
  category.value='all';category.dispatchEvent(new Event('change',{bubbles:true}));
  const instructions={};
  for(const id of [...picker.options].map(o=>o.value)){
   picker.value=id;picker.dispatchEvent(new Event('change',{bubbles:true}));
   instructions[id]=panel.querySelector('#native-task-objective').textContent;
  }
  return {instructions,selectors:panel.querySelectorAll('select').length,extra:panel.querySelectorAll('.native-task-note,#native-task-route,#native-task-status,#native-flight-visit,a').length};
 });
 assert.equal(menu.selectors,2);assert.equal(menu.extra,0);
 for(const id of canonical)assert.equal(menu.instructions[id],expectedInstructions[id]?.trim()?expectedInstructions[id]:'play the game','Menu instruction differs from model input: '+id);
 const first=await env.reset('c01-n04');
 await env.observe();await env.page.screenshot({path:path.join(output,'navigation.png')});
 const state=await env.state();await env.assertFrozen();
 console.log(JSON.stringify({event:'navigation_ready',task:'c01-n04',mode:state.mode}));
 await env.close();
 for(const kind of ['shooting','sniper']){
  const imageTasks=manifest.categories.find(c=>c.category===kind).tasks;
  const scene=new ServerEnvironment({url,renderer:process.env.GTA_TEST_RENDERER??'gpu',seed:1234,quality:'low'});
  try{
   await scene.open();await scene.reset(imageTasks[0]);await scene.observe();
   await scene.page.screenshot({path:path.join(output,kind+'.png')});
   if(kind==='sniper')await execute(scene,parse(JSON.stringify({keys:[],mouse:{buttons:[{button:'right',event:'down'}]}})));
   // Exercise every released configuration and texture in the actual browser
   // without reusing an evaluator episode or changing its fresh-browser rule.
   const loaded=await scene.evaluate(async ids=>{
    const {StaticShootingSite}=await import(new URL('./tasks/runtime.mjs',document.baseURI).href);
    const rows=await (await fetch(new URL('./tasks/catalog.json',document.baseURI))).json();
    window.__SHENCHENGJI_CITY__.world.staticTask?.dispose();
    const result=[];
    for(const id of ids){
     const row=rows.find(row=>row.id===id),site=new StaticShootingSite(row);
     try{
      await site.load();site.render();
      if(row.kind==='sniper'){
       site.env.step({type:'button',button:'LT',event:'down'});site.render();
       site.env.step({type:'button',button:'UP',event:'down',duration_ms:960});site.render();
      }
      if(site.canvas.width!==1280||site.canvas.height!==720||!site.screenshot().startsWith('data:image/png'))throw Error('Invalid image observation: '+id);
      result.push(id);
     }finally{site.dispose();}
    }
    return result;
   },imageTasks);
   assert.deepEqual(loaded,imageTasks);
   assert.equal(scene.errors.length,0,JSON.stringify(scene.errors));
   assert.equal(scene.failedResources.length,0,JSON.stringify(scene.failedResources));
   for(const task of loaded)console.log(JSON.stringify({event:'image_task_ready',kind,task}));
  }finally{await scene.close();}
 }
 assert.equal(env.errors.length,0,JSON.stringify(env.errors));
 assert.equal(env.failedResources.length,0,JSON.stringify(env.failedResources));
 assert.equal(external.length,0,'Runtime requested external resources: '+external.join(','));
 await env.close();
 // Check the actual MCP session, initial instruction rendering and image-only
 // observation generation against the same repository's server.
 const settings=await loadConfig(['--task','c01-n04','--url',url,'--renderer',process.env.GTA_TEST_RENDERER??'gpu',
  '--max-rounds','1','--output',path.join(output,'mcp')]);
 const session=new GameSession(settings);
 try{
  const initial=await session.observe();assert(initial.image);assert.equal(initial.metadata.instruction,undefined);
  const result=await session.step({request_id:'release-step-1',observation_id:initial.metadata.observation_id,action:{keys:[],wait_seconds:0.1}});
  assert(result.image);assert.equal(result.metadata.done,true);
 }finally{await session.close('release_validation');}
 await fs.writeFile(path.join(output,'validation.json'),JSON.stringify({tasks:canonical.length,
  navigation:true,shooting:true,sniping:true,mcp:true,externalRequests:external,failedResources:[],gpu:ready.gpu},null,2));
 console.log(JSON.stringify({event:'standalone_browser_validation_passed',output,tasks:canonical.length}));
}finally{
 chromium.launch=launch;await env.close().catch(()=>{});server.closeAllConnections();await new Promise(resolve=>server.close(resolve));
}
