import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import sharp from 'sharp';
import {resolvePlan,calibrateTrainingBudget,main} from '../scripts/task-generator.mjs';
import {readGenerationSpec} from '../scripts/read-generation-spec.mjs';
import {buildShootingPool,loadShootingPool,verifyShootingPair} from '../scripts/training-shooting-pool.mjs';
import {generateTrainingTask,TEMPLATE_CAPABILITIES} from '../native-city/src/training-task-generator.ts';
import {TRAINING_SCHEMA,parseTrainingDataset,trainingDatasetPath,loadTrainingDatasetFromUrl} from '../native-city/src/training-task-schema.ts';
import {TrainingShootingEnvironment} from '../tasks/engines/training-shooting-engine.mjs';
import {replayStatic} from '../scripts/server-eval/static-replay.mjs';
import {loadConfig} from '../scripts/game-mcp/config.mjs';

const root=fileURLToPath(new URL('../',import.meta.url));
test('paper matrix has ten non-sniping templates and range plans remain strictly typed',async()=>{
 assert.equal(Object.keys(TEMPLATE_CAPABILITIES).length,10);
 const p=resolvePlan(await readGenerationSpec(path.join(root,'configs/generation/online.yaml')));
 assert.equal(p.plan.length,12);assert.equal(new Set(p.plan.map(s=>s.template)).size,9);
 assert.deepEqual(new Set(p.plan.flatMap(s=>s.movement??[])),new Set(['walk','drive','swim','dive','boat','plane','helicopter']));
 for(const s of [null,[],{template:'sniper'},{name:'../test',requests:[{template:'road'}]},
  {template:'pursuit',movement:['walk']},{template:'evasion',destination:{x:1,z:1}},
  {template:'road',actorSpeed:1},{template:'outdoor',count:1.5},
  {split:'train',requests:[{template:'outdoor',split:'validation'}]}])assert.throws(()=>resolvePlan(s));
});
test('YAML and JSON resolve identically; duplicate keys and executable YAML are rejected',async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'gtasuite-generation-'));
 try{
  const yaml=path.join(dir,'config.yaml'),json=path.join(dir,'config.json');
  await fs.writeFile(yaml,'template: follow\nmovement: [walk]\nlength: [80, 120]\nturns: 1\ncount: 20\n');
  const data=await readGenerationSpec(yaml);await fs.writeFile(json,JSON.stringify(data));
  assert.deepEqual(resolvePlan(data),resolvePlan(await readGenerationSpec(json)));
  await fs.writeFile(yaml,'name: one\nname: two\n');await assert.rejects(readGenerationSpec(yaml),/duplicate/);
  await fs.writeFile(yaml,'!!python/object/apply:os.system [echo forbidden]');await assert.rejects(readGenerationSpec(yaml),/constructor/);
 }finally{await fs.rm(dir,{recursive:true});}
});
test('navigation budgets use actual controller time; fixed infeasible deadlines fail and relation rules stay fixed',()=>{
 const t={maxDuration:20,outdoor:{objective:'arrival',maxDuration:20}},proof={controllerSeconds:33};
 calibrateTrainingBudget(t,proof);assert.equal(t.maxDuration,66);
 for(const kind of ['interior','flight']){const t={[kind]:{},maxDuration:180};calibrateTrainingBudget(t,{seconds:25});assert.equal(t.maxDuration,50);}
 for(const objective of ['follow','intercept','escape']){const t={maxDuration:180,outdoor:{objective,maxDuration:180}};calibrateTrainingBudget(t,{});assert.equal(t.maxDuration,180);}
 assert.throws(()=>calibrateTrainingBudget({maxDuration:5,timeLimit:{mode:'fixed',seconds:5},outdoor:{objective:'arrival'}},{controllerSeconds:20}),/shorter/);
});
test('retained and newly generated datasets have isolated basename-only loading paths',async()=>{
 assert.equal(trainingDatasetPath('tasks.json'),'training-tasks/outdoor-walk/tasks.json');
 assert.equal(trainingDatasetPath('new-data.json'),'training-tasks/generated/new-data.json');
 for(const file of ['../tasks.json','https://host/tasks.json','a/b.json','.hidden.json','a.json?x'])assert.throws(()=>trainingDatasetPath(file));
 const retained=JSON.parse(await fs.readFile(path.join(root,trainingDatasetPath('tasks.json')),'utf8'));let requested;
 await loadTrainingDatasetFromUrl('?trainingDataset=new-data.json','http://localhost:4203/',async url=>{requested=url.href;return {ok:true,json:async()=>retained};});
 assert.equal(requested,'http://localhost:4203/training-tasks/generated/new-data.json');
});
test('shooting import excludes benchmark images, preserves original scoring, and generated tasks run through MCP and replay',async()=>{
 const temp=await fs.mkdtemp(path.join(os.tmpdir(),'gtasuite-shooting-')),name='generator-test-'+process.pid,file=path.join(root,trainingDatasetPath(name+'.json'));
 let imported,resumeFile;
 try{
  const cfg={task:{id:'UNIT_SHOOTING',dataset_version:'unit',instruction:'Shoot the target.',stages:[{image:'image.png',width:32,height:32,prompt:'Shoot the target.'}]},gold:{point_xy:[16,16],bbox_xyxy:[8,8,24,24]}};
  await sharp({create:{width:32,height:32,channels:3,background:'#123456'}}).png().toFile(path.join(temp,'image.png'));
  await fs.writeFile(path.join(temp,'task.json'),JSON.stringify(cfg));
  const source=path.join(temp,'sources.json');await fs.writeFile(source,JSON.stringify({pairs:[{config:'task.json',instruction:'Shoot the target.'}]}));
  const pool=await buildShootingPool(root,source);imported=path.resolve(root,'tasks',pool.pairs[0].config);
  const poolFile=path.join(temp,'pool.json');await fs.writeFile(poolFile,JSON.stringify(pool));assert.equal((await loadShootingPool(root,poolFile)).pairs.length,1);
  const spec={template:'shooting',name,imageIndices:[1],aimOffset:{x:160,y:90}},task=generateTrainingTask({shootingPool:pool},spec,0);
  task.validation={status:'physics-verified',scope:'Unit fixture: original hit evaluator'};
  const dataset=parseTrainingDataset({schema:TRAINING_SCHEMA,generatorVersion:'unit',split:'train',spec,provenance:{},tasks:[task]});
  await fs.mkdir(path.dirname(file),{recursive:true});await fs.writeFile(file,JSON.stringify(dataset),{flag:'wx'});
  const config=await loadConfig(['--task',task.id,'--training-dataset',name+'.json']);assert.equal(config.maxRounds,20);assert.equal(config.instruction,task.instruction.en);
  const engine=new TrainingShootingEnvironment(cfg.task,cfg.gold,task.shooting.initialAim);assert.equal(engine.exportTrace().actions.length,0);
  engine.step({type:'look',dx:16-task.shooting.initialAim[0],dy:16-task.shooting.initialAim[1]});assert(engine.step({type:'button',button:'RT',event:'down'}).result.hit);
  const trace={...engine.exportTrace(),max_steps:20,model_steps:2};assert.equal((await replayStatic(task.id,trace,{trainingDataset:name+'.json'})).reward,1);
  await assert.rejects(replayStatic(task.id,{...trace,initial_camera:[1,1]},{trainingDataset:name+'.json'}),/initial aim/);
  // Exercise real CLI persistence/resume without a browser or model call.
  const resumeName='resume-'+process.pid,specFile=path.join(temp,'resume.json'),output=path.join(temp,'output');
  await fs.writeFile(specFile,JSON.stringify({template:'shooting',name:resumeName,count:2,aimOffset:{x:40,y:20}}));
  const args=['generate','--spec',specFile,'--shooting-pool',poolFile,'--output',output];
  await main(args);resumeFile=path.join(root,trainingDatasetPath(resumeName+'.json'));
  const complete=JSON.parse(await fs.readFile(resumeFile,'utf8')),partial=JSON.parse(await fs.readFile(path.join(output,'partial.json'),'utf8'));
  partial.tasks=partial.tasks.slice(0,1);partial.proofs=partial.proofs.slice(0,1);
  await fs.writeFile(path.join(output,'partial.json'),JSON.stringify(partial));await fs.rm(resumeFile);
  await main([...args,'--resume']);assert.deepEqual(JSON.parse(await fs.readFile(resumeFile,'utf8')).tasks,complete.tasks);
  await fs.rm(resumeFile);await fs.writeFile(specFile,JSON.stringify({template:'shooting',name:resumeName,count:3}));
  await assert.rejects(main([...args,'--resume']),/Resume generation parameters changed/);
  await fs.writeFile(path.join(path.dirname(imported),'image.png'),'changed');await assert.rejects(verifyShootingPair(root,pool.pairs[0]),/hash changed/);
  const heldSource=path.join(temp,'held.json');await fs.writeFile(heldSource,JSON.stringify({pairs:[{config:path.join(root,'tasks/c10-n01/task.json'),instruction:'Shoot the target.'}]}));
  await assert.rejects(buildShootingPool(root,heldSource),/No eligible/);
 }finally{await fs.rm(file,{force:true});if(resumeFile)await fs.rm(resumeFile,{force:true});await fs.rm(temp,{recursive:true,force:true});if(imported)await fs.rm(path.dirname(imported),{recursive:true,force:true});}
});
