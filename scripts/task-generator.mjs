#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {parseArgs} from 'node:util';
import {createHash} from 'node:crypto';
import {build} from 'esbuild';
import {ServerEnvironment} from './server-eval/environment.mjs';
import {buildShootingPool,loadShootingPool,verifyShootingPair} from './training-shooting-pool.mjs';
import {generateTrainingTask,validateTemplateSpec,TEMPLATE_CAPABILITIES} from '../native-city/src/training-task-generator.ts';
import {TRAINING_SCHEMA,TRAINING_GENERATOR_VERSION,parseTrainingDataset} from '../native-city/src/training-task-schema.ts';
import {ShootingEnvironment} from '../tasks/engines/shooting-engine.mjs';
import {walkingStartDensities,distanceToRoutes} from './walk-training-profile.mjs';
import {validateWalkConstraints,checkWalkConstraints} from './training-walk-constraints.mjs';
import {readGenerationSpec} from './read-generation-spec.mjs';
import {calibrateArrivalTimeLimit} from '../native-city/src/training-time-limit.ts';

const root=fileURLToPath(new URL('../',import.meta.url)),sha=b=>createHash('sha256').update(b).digest('hex');
export const help=`Template/range training generator (all ten non-sniping categories).
  node scripts/task-generator.mjs matrix
  node scripts/task-generator.mjs shooting-pool --source annotated-images.json --output outputs/shooting-pool
  node scripts/task-generator.mjs plan --spec configs/generation/online.yaml
  node scripts/task-generator.mjs generate --spec FILE --output NEW_DIRECTORY
       [--url http://127.0.0.1:4203/] [--renderer gpu|auto|cpu] [--resume]
       [--walk-constraints FILE] [--shooting-pool POOL_JSON]

The JSON/YAML spec is one SamplingSpec or {name, seed, split, requests:[SamplingSpec,...]}.
YAML input uses Python 3 with PyYAML; both formats share the same validation.
Lengths, headings, speeds and distances accept a number or [min,max]; turns
and pursuer count use integer intervals. Positions are {x:[...],y:[...],z:[...]}.
imageIndices is a 1-based candidate SET; offsets use 1280x720 pixels (+x right,
+y up). Following/pursuit length and turns describe the complete NPC route.
Evasion has no goal or route constraints. Shooting preserves original scoring.
Arrival templates accept timeLimit: {mode: fixed, seconds: NUMBER_OR_RANGE} or
{mode: controller, multiplier: NUMBER_OR_RANGE, slackSeconds: NUMBER_OR_RANGE}.
showCountdown defaults to true. Fixed limits are rejected, never enlarged, if
the real controller cannot finish. minSeparation separates starts and goals
within the same template/movement in a generated batch (metres).
Sniping is evaluation-only. No model API, training job or evaluation batch is
started. Publication is atomic; the frozen benchmark is never modified.
`;
export function resolvePlan(input){
 if(!input||typeof input!=='object'||Array.isArray(input))throw Error('Expected a sampling object or batch plan');
 const requests=Array.isArray(input?.requests)?input.requests:[input],name=input.name??'sample',seed=input.seed??42,split=input.split??'train';
 validateTemplateSpec({template:'outdoor',name,seed,split});
 if(Array.isArray(input?.requests)&&Object.keys(input).some(k=>!['requests','name','seed','split'].includes(k)))throw Error('Unknown batch parameter');
 if(!requests.length||requests.length>100)throw Error('Expected 1..100 template requests');
 const resolved=requests.map((s,i)=>({...s,name:s.name??name,seed:s.seed??(((seed+i*1009)>>>0)||1),split:s.split??split}));
 resolved.forEach(s=>{validateTemplateSpec(s);if(s.split!==split)throw Error('All requests must use the batch split');});const plan=resolved.flatMap(spec=>Array.from({length:spec.count??1},()=>spec));
 if(plan.length>10000)throw Error('Batch size exceeds 10000');
 return {spec:Array.isArray(input?.requests)?{name,seed,split,requests:resolved}:resolved[0],name,seed,split,plan};
}
export function calibrateTrainingBudget(task,proof){
 if(task.outdoor?.objective==='arrival'){
  if(!Number.isFinite(proof.controllerSeconds)||proof.controllerSeconds<=0)throw Error('Missing navigation controller timing');
  if(task.timeLimit)task.timeLimit=calibrateArrivalTimeLimit(task.timeLimit,proof.controllerSeconds);
  const seconds=task.timeLimit?.seconds??proof.controllerSeconds*2;
  if(seconds>7200)throw Error('Verified navigation route exceeds template budget capacity');
  task.maxDuration=task.outdoor.maxDuration=seconds;
  proof.budget={policy:task.timeLimit?.mode??'2*controller-seconds',...task.timeLimit,controllerSeconds:proof.controllerSeconds,maxDuration:seconds};
 }else if(task.interior||task.flight){
  if(!Number.isFinite(proof.seconds)||proof.seconds<=0||proof.seconds*2>7200)throw Error('Invalid reference-controller timing');
  task.maxDuration=proof.seconds*2;
  proof.budget={policy:'2*controller-seconds',controllerSeconds:proof.seconds,maxDuration:task.maxDuration};
 }
 return task;
}
export function checkTrainingDiversity(task,previous,spec){
 if(!task.outdoor)return;
 for(const old of previous.filter(t=>t.template===task.template&&t.resolved.movement===task.resolved.movement)){
  const a=task.outdoor.points,b=old.outdoor.points,signature=p=>JSON.stringify(p.map(v=>v.map(n=>Math.round(n*100)/100)));
  if(signature(a)===signature(b)||signature(a)===signature([...b].reverse()))throw Error('Repeated training route (including reverse)');
  for(const index of [0,-1])if(Math.hypot(a.at(index)[0]-b.at(index)[0],a.at(index)[1]-b.at(index)[1])<(spec.minSeparation??0))throw Error('Training start/goal violates minSeparation');
 }
}
async function json(file,value,exclusive=false){
 const tmp=file+'.'+process.pid+'.tmp',handle=await fs.open(tmp,'wx',0o600);
 try{await handle.writeFile(JSON.stringify(value,null,2)+'\n');await handle.sync();}finally{await handle.close();}
 try{if(exclusive)await fs.link(tmp,file);else await fs.rename(tmp,file);}finally{await fs.rm(tmp,{force:true});}
}
// Offline route search is much longer than a normal interactive game action.
// Keep this deadline local to generation; model evaluation retains its watchdog.
async function searchInBrowser(env,fn,arg){
 let timer;
 try{return await Promise.race([env.page.evaluate(fn,arg),new Promise((_,reject)=>{timer=setTimeout(()=>{env.broken=true;void env.browser.close().catch(()=>{});reject(Error('Generation search exceeded its 10-minute budget'));},600000);})]);}
 finally{clearTimeout(timer);}
}
export async function shootingProof(task){
 const cfg=await verifyShootingPair(root,task.shooting.pair),env=new ShootingEnvironment(cfg.task,cfg.gold);
 env.step({type:'aim',point:task.shooting.initialAim});env.step({type:'aim',point:task.shooting.pair.center});
 return {passed:env.step({type:'fire'}).result.hit,scope:'Original image/config hashes, annotated target and original ShootingEnvironment hit rule'};
}
export async function main(argv=process.argv.slice(2)){
 const command=argv[0];if(['--help','-h',undefined].includes(command)){console.log(help);return;}
 if(command==='matrix'){console.log(JSON.stringify(TEMPLATE_CAPABILITIES,null,2));return;}
 if(!['shooting-pool','plan','generate'].includes(command))throw Error(help);
 const {values:v}=parseArgs({args:argv.slice(1),strict:true,options:{spec:{type:'string'},output:{type:'string'},url:{type:'string',default:'http://127.0.0.1:4203/'},renderer:{type:'string',default:'gpu'},resume:{type:'boolean',default:false},'walk-constraints':{type:'string'},source:{type:'string'},'shooting-pool':{type:'string'}}});
 if(command==='shooting-pool'){
  if(!v.source||!v.output)throw Error('--source and --output are required');
  const pool=await buildShootingPool(root,path.resolve(v.source)),output=path.resolve(v.output);
  await fs.mkdir(path.dirname(output),{recursive:true});await fs.mkdir(output);await json(path.join(output,'pool.json'),pool,true);
  console.log(JSON.stringify({output,count:pool.pairs.length,rejected:pool.provenance.rejected}));return pool;
 }
 if(!v.spec)throw Error('--spec FILE is required');const request=resolvePlan(await readGenerationSpec(v.spec));
 if(command==='plan'){console.log(JSON.stringify(request,null,2));return request;}
 const walkConstraints=v['walk-constraints']?validateWalkConstraints(JSON.parse(await fs.readFile(v['walk-constraints'],'utf8'))):null;
 if(walkConstraints&&request.plan.some(s=>!['outdoor','follow'].includes(s.template)||s.movement?.some(m=>m!=='walk')||s.template==='follow'&&(!s.movement||s.movement.length!==1)))throw Error('Walk constraints require an entirely on-foot arrival/following batch');
 if(!v.output)throw Error('--output NEW_DIRECTORY is required');const output=path.resolve(v.output),url=new URL(v.url);
 if(!['http:','https:'].includes(url.protocol)||!['127.0.0.1','localhost','[::1]'].includes(url.hostname)||url.username||url.password||url.hash||['walkDataset','outdoorDataset','trainingDataset'].some(k=>url.searchParams.has(k)))throw Error('Use a credential-free loopback generation URL without a training dataset');
 if(!['gpu','auto','cpu'].includes(v.renderer))throw Error('Invalid renderer');
 if(request.name==='tasks')throw Error('The retained tasks.json dataset name is reserved');
 const publish=path.join(root,'training-tasks/generated',request.name+'.json');try{await fs.access(publish);throw Error('Published dataset already exists; choose a new name');}catch(e){if(e.code!=='ENOENT')throw e;}
 await fs.mkdir(path.dirname(output),{recursive:true});if(!v.resume)await fs.mkdir(output);
 const sourceFiles=['scripts/task-generator.mjs','scripts/training-shooting-pool.mjs','scripts/training-walk-constraints.mjs','scripts/walk-training-profile.mjs','scripts/read-generation-spec.mjs','scripts/read-generation-yaml.py','city/city.json','city/navigation.json','tasks/engines/shooting-engine.mjs','tasks/engines/training-shooting-engine.mjs','tasks/runtime.mjs'];
 for(const name of await fs.readdir(path.join(root,'native-city/src')))if(/\.(ts|json)$/.test(name))sourceFiles.push('native-city/src/'+name);
 for(const name of ['flight-pilot.mjs','test-flight-pilot.mjs']){try{await fs.access(path.join(root,'native-city/tests',name));sourceFiles.push('native-city/tests/'+name);}catch(e){if(e.code!=='ENOENT')throw e;}}
 const pool=request.plan.some(s=>s.template==='shooting')?await loadShootingPool(root,v['shooting-pool']):{schema:'gtabench.shooting-pool.v1',pairs:[],provenance:{source:'No shooting templates requested'}};
 const hashes=Object.fromEntries(await Promise.all(sourceFiles.map(async f=>[f,sha(await fs.readFile(path.join(root,f)))])));
 const fingerprint=sha(JSON.stringify({spec:request.spec,url:url.href,renderer:v.renderer,version:TRAINING_GENERATOR_VERSION,hashes,walkConstraints,pool}));
 let tasks=[],proofs=[];
 if(v.resume){const old=JSON.parse(await fs.readFile(path.join(output,'partial.json'),'utf8'));if(old.fingerprint!==fingerprint)throw Error('Resume generation parameters changed');tasks=old.tasks;proofs=old.proofs;}
 else{
  await json(path.join(output,'plan.json'),{...request,fingerprint,url:url.href,renderer:v.renderer,walkConstraints},true);
  await fs.writeFile(path.join(output,/\.ya?ml$/i.test(v.spec)?'config.yaml':'config.json'),await fs.readFile(v.spec),{flag:'wx'});
  for(const [file,expected] of Object.entries(hashes)){
   const bytes=await fs.readFile(path.join(root,file));if(sha(bytes)!==expected)throw Error('Generation source changed before snapshot: '+file);
   const snapshot=path.join(output,'generation-source',file);await fs.mkdir(path.dirname(snapshot),{recursive:true});await fs.writeFile(snapshot,bytes,{flag:'wx'});
  }
 }
 await json(path.join(output,'shooting-pool.json'),pool);
 if(!v.resume)await json(path.join(output,'partial.json'),{fingerprint,runtimeBuild:null,tasks,proofs});
 const needsWorld=request.plan.some(s=>s.template!=='shooting'),abort=new AbortController();let env;
 const stop=()=>abort.abort(Error('Generation interrupted'));process.once('SIGINT',stop);process.once('SIGTERM',stop);
 try{
  if(needsWorld){
   env=new ServerEnvironment({url:url.href,renderer:v.renderer,quality:'low',seed:request.seed,signal:abort.signal});await json(path.join(output,'boot.json'),await env.open());
   // Load the real walking controller before generating navigation candidates.
   await env.reset('c02-n01');
   if(v.resume&&tasks.length&&JSON.parse(await fs.readFile(path.join(output,'partial.json'),'utf8')).runtimeBuild!==env.build)throw Error('Resume environment build changed');
   const bundle=await build({entryPoints:[path.join(root,'native-city/src/training-generation-host.ts')],bundle:true,format:'iife',globalName:'GtaTrainingGenerator',write:false,platform:'browser'});await env.page.addScriptTag({content:bundle.outputFiles[0].text});
   const [navigation,city]=await Promise.all(['city/navigation.json','city/city.json'].map(async f=>JSON.parse(await fs.readFile(path.join(root,f),'utf8'))));
   const starts=walkingStartDensities(navigation.nodes,city.buildings).filter(s=>!walkConstraints||distanceToRoutes(s.point,walkConstraints.referenceRoutes)>=walkConstraints.evalClearance+Math.max(...request.plan.flatMap(s=>Array.isArray(s.length)?s.length:[s.length??150])));
   await env.evaluate(({navigation,starts,pool})=>{const w=window.__SHENCHENGJI_CITY__.world;w.paused=true;w.keys.clear();const roads={nodes:navigation.nodes,edges:navigation.nodes.map(()=>new Map())};for(const [a,b] of navigation.edges){const p=roads.nodes[a],q=roads.nodes[b],d=Math.hypot(p[0]-q[0],p[1]-q[1]);roads.edges[a].set(b,d);roads.edges[b].set(a,d);}
    const safe=starts.filter(({point:p})=>{const n=w.collision.nearest(...p);return n&&!['motorway','motorway_link','trunk','trunk_link'].includes(n.road.kind);});
    window.__trainingWalkPools={all:safe.map(s=>s.point),turning:safe.filter(s=>s.density>=8).map(s=>s.point),complex:safe.filter(s=>s.density>=20).map(s=>s.point)};
    window.__trainingGeneration=window.GtaTrainingGenerator.createTrainingGenerationEnvironment(w,roads,window.__trainingWalkPools.all,pool);
   },{navigation,starts,pool});
  }
  for(let index=tasks.length;index<request.plan.length;index++){
   const spec=request.plan[index];let accepted;
   for(let retry=0;retry<8;retry++){
    abort.signal.throwIfAborted();const candidateSpec={...spec,seed:((spec.seed+Math.imul(retry,2246822519))>>>0)||1};
    console.log(JSON.stringify({event:'generating',index,template:spec.template,retry}));
    try{
     const result=spec.template==='shooting'?{task:generateTrainingTask({shootingPool:pool},candidateSpec,index)}:await searchInBrowser(env,({spec,index,profile})=>{const g=window.GtaTrainingGenerator;let e=window.__trainingGeneration;
      if(profile){const k=Array.isArray(spec.turns)?spec.turns[0]:spec.turns??0,p=window.__trainingWalkPools;const starts=k>=3?p.complex:k>=1?p.turning:p.all;e={...e,outdoor:{...e.outdoor,walk:{...e.outdoor.walk,starts}}};}
      try{const task=g.generateTrainingTask(e,spec,index),proof=g.probeTrainingTask(task,e.outdoor,window.__SHENCHENGJI_CITY__.world);return {task,proof};}catch(error){return {error:error.message};}},{spec:candidateSpec,index,profile:!!walkConstraints});
     if(result.error)throw Error(result.error);const proof=result.proof??await shootingProof(result.task);if(!proof.passed)throw Error(proof.reason??'Controller probe failed');
     if(walkConstraints)checkWalkConstraints(result.task,tasks,walkConstraints);
     checkTrainingDiversity(result.task,tasks,spec);
     result.task.validation={status:'physics-verified',scope:result.task.flight?'State-informed ordinary-key expert completed boarding/takeoff/route/landing with the real aircraft simulation and loaded static city collision; not a model score.':result.task.interior?'CityWalk completed the full route, pushing doors with forward input and climbing physical stair treads. Static geometry, not dynamic-actor guarantee.':result.task.shooting?proof.scope:'Original movement controller reached the route end in the loaded static world. Target-route feasibility, not a full following/interception/evasion episode proof.'};
     if(result.task.outdoor)result.task.outdoor.validation={status:'physics-verified',scope:result.task.validation.scope};
     calibrateTrainingBudget(result.task,proof);accepted={task:result.task,proof};break;
    }catch(error){await json(path.join(output,`rejected-${index}-${retry}.json`),{error:error.message,spec:candidateSpec});if(env?.broken)throw error;}
   }
   if(!accepted)throw Error(`No controller-verified ${spec.template} instance at index ${index}; see rejected files. Nothing published.`);
   tasks.push(accepted.task);proofs.push(accepted.proof);await json(path.join(output,'partial.json'),{fingerprint,runtimeBuild:env?.build??null,tasks,proofs});console.log(JSON.stringify({event:'generated',id:accepted.task.id,resolved:accepted.task.resolved}));
  }
  if(env&&(env.errors.length||env.failedResources.length))throw Error('Generation browser reported scene/resource errors; refusing publication');
  for(const [file,expected] of Object.entries(hashes))if(sha(await fs.readFile(path.join(root,file)))!==expected)throw Error('Generation source changed during the batch: '+file);
  const dataset=parseTrainingDataset({schema:TRAINING_SCHEMA,generatorVersion:TRAINING_GENERATOR_VERSION,split:request.split,spec:request.spec,provenance:{hashes,runtimeBuild:env?.build??null,shootingPool:pool.provenance,...walkConstraints?{walkConstraints}:{},scope:'Training-only opt-in. Same city/scene assets are reused; no global train/evaluation spatial split is claimed.'},tasks});
  await fs.rm(path.join(output,'error.json'),{force:true});
  await json(path.join(output,'dataset.json'),dataset);await json(path.join(output,'proofs.json'),proofs);
  for(const language of ['en'])await json(path.join(output,`prompts.${language}.json`),{language,instructions:Object.fromEntries(tasks.map(t=>[t.id,t.instruction[language]]))});
  await fs.mkdir(path.dirname(publish),{recursive:true});await json(publish,dataset,true);
  console.log(JSON.stringify({event:'complete',count:tasks.length,published:publish,playUrl:`${url.href}${url.search?'&':'?'}trainingDataset=${request.name}.json`}));return dataset;
 }catch(error){await json(path.join(output,'error.json'),{error:error.message,completed:tasks.length});throw error;}
 finally{process.removeListener('SIGINT',stop);process.removeListener('SIGTERM',stop);await env?.close();}
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))main().catch(e=>{console.error(e.stack);process.exitCode=1;});
