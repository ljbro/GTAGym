import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {ServerEnvironment} from '../scripts/server-eval/environment.mjs';
import {parseTrainingDataset,trainingDatasetPath} from '../native-city/src/training-task-schema.ts';
import {replayStatic} from '../scripts/server-eval/static-replay.mjs';

import {parseArgs} from 'node:util';
const {values}=parseArgs({options:{dataset:{type:'string'},url:{type:'string',default:'http://127.0.0.1:4203/'},renderer:{type:'string',default:'gpu'}}});
if(!values.dataset)throw Error('--dataset FILE[,FILE] is required');
const root=fileURLToPath(new URL('../',import.meta.url)),tasks=[];
for(const file of values.dataset.split(',')){
 const data=parseTrainingDataset(JSON.parse(await fs.readFile(path.join(root,trainingDatasetPath(file)),'utf8')));
 tasks.push(...data.tasks.map(task=>({...task,datasetFile:file})));
}
const output=path.join(root,'.cache',`generator-browser-${Date.now()}`);await fs.mkdir(output,{recursive:true});
const report={cases:[],scope:'Fresh server browser episodes; saved spawn/budget, resource loading, room completion, and original shooting replay. No model calls.'};
for(const t of tasks){
 const file=t.datasetFile,url=new URL(values.url);url.searchParams.set('trainingDataset',file);
 const env=new ServerEnvironment({url:url.href,renderer:values.renderer,quality:'low',seed:t.seed}),row={id:t.id,template:t.template};
 try{
  console.log(JSON.stringify({event:'checking_generated_task',id:t.id,template:t.template}));
  row.boot=await env.open();await env.reset(t.id);const state=await env.state();assert.equal(state.active,true);assert.equal(state.failed,false);
  const actual=await env.evaluate(()=>{const c=window.__SHENCHENGJI_CITY__,w=c.world;return {category:[...document.querySelector('#native-task-category').options].map(o=>o.value),actor:[w.actor.x,w.actor.y,w.actor.z],yaw:w.actor.yaw,view:w.view,walking:!!w.walk?.active,water:!!w.taskVehicle,static:!!w.staticTask,flight:c.stats.nativeTask.flight,police:c.stats.nativeTask.police,site:w.nativeFootSite?{points:w.nativeFootSite.points,doors:w.nativeFootSite.doorSnapshot,goalHeight:w.nativeFootSite.goalHeight}:null};});
  assert(actual.category.includes(t.category),`Missing task category ${t.category}`);if(!t.shooting)assert(Math.abs(state.maxDuration-t.maxDuration)<1e-6,'Saved deadline ignored');
  if(t.outdoor){assert(Math.hypot(actual.actor[0]-t.resolved.start.x,actual.actor[2]-t.resolved.start.z)<.05,'Saved spawn changed');const dyaw=actual.yaw-t.resolved.heading*Math.PI/180;assert(Math.abs(Math.atan2(Math.sin(dyaw),Math.cos(dyaw)))<1e-6,'Saved initial heading ignored');if(t.template==='evasion')assert.equal(actual.police.length,t.resolved.pursuerCount,'Initial pursuer count ignored');}
  if(t.flight)assert.equal(actual.flight.id,t.flight.id);
  if(t.interior){assert(actual.site);assert(actual.site.doors.some(d=>d.locked));assert(actual.site.doors.filter(d=>!d.locked).every(d=>d.progress===0));}
  await fs.writeFile(path.join(output,t.id+'-start.jpg'),await env.observe({type:'jpeg',quality:85}));
  if(t.interior){
   row.completion=await env.evaluate(()=>{const c=window.__SHENCHENGJI_CITY__,w=c.world,points=w.nativeFootSite.points;let index=1,frames=0,stalled=0;const max=Math.ceil(c.stats.nativeTask.maxDuration*60);
    while(c.stats.nativeTask.active&&frames<max&&index<points.length){const a=w.walk,p=points[index];if(Math.hypot(a.x-p[0],a.z-p[1])<.12){index++;continue;}a.yaw=Math.atan2(p[0]-a.x,p[1]-a.z);const before=[a.x,a.z];w.keys.clear();w.keys.add('KeyW');w.engine._deltaTime=1000/60;w.update(1/60);frames++;stalled=Math.hypot(a.x-before[0],a.z-before[1])<1e-6?stalled+1:0;if(stalled>240)break;}
    w.keys.clear();return {complete:c.stats.nativeTask.complete,failed:c.stats.nativeTask.failed,index,frames,position:{x:w.walk.x,y:w.walk.y,z:w.walk.z},doors:w.nativeFootSite.doorSnapshot,reason:document.querySelector('#native-result-reason')?.textContent};
   });assert(row.completion.complete&&!row.completion.failed,JSON.stringify(row.completion));
   await fs.writeFile(path.join(output,t.id+'-finish.jpg'),await env.observe({type:'jpeg',quality:85}));
  }
  if(t.shooting){
   const {pair,initialAim}=t.shooting,dx=(pair.center[0]-initialAim[0])*1280/pair.width,dy=(initialAim[1]-pair.center[1])*720/pair.height;
   await env.stepStatic({keys:[],mouse:{move:{dx,dy},buttons:[{button:'left',event:'down'}]}});
   const final=await env.state();assert(final.complete&&!final.failed);const trace=await env.staticTrace(),score=await replayStatic(t.id,trace,{trainingDataset:file});assert.equal(score.reward,1);assert.deepEqual(trace.initial_camera,initialAim);row.originalReplay=score;
  }
  assert.deepEqual(env.errors,[]);assert.deepEqual(env.failedResources,[]);row.passed=true;row.actual=actual;
 }catch(error){row.passed=false;row.error=error.message;row.errors=env.errors;row.failedResources=env.failedResources;}
 finally{await env.close();report.cases.push(row);await fs.writeFile(path.join(output,'report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({id:row.id,passed:row.passed,error:row.error}));}
}
report.passed=report.cases.every(c=>c.passed);await fs.writeFile(path.join(output,'report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({passed:report.passed,output}));assert(report.passed,'Generated browser acceptance failed; see report');
