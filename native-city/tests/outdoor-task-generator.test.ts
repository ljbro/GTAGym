import test from 'node:test';
import assert from 'node:assert/strict';
import {DEFAULT_OUTDOOR_GENERATOR,generateOutdoorTask,validateOutdoorGeneratorConfig,roadRouteCandidates,type OutdoorGeneratorEnvironment} from '../src/outdoor-task-generator.ts';
import {OUTDOOR_DATASET_SCHEMA,outdoorObjective,outdoorNpcRules,outdoorWaterSpec,parseOutdoorDataset,loadOutdoorDatasetFromUrl,type OutdoorVehicle} from '../src/generated-outdoor-tasks.ts';
import {probeOutdoorRoute} from '../src/outdoor-task-validation.ts';
import {CityWalk} from '../src/city-walk.ts';
import {NativeNpcObjective} from '../src/native-npc-objective.ts';
import {NativeVehicleNpc} from '../src/native-vehicle-npc.ts';
import {walkLength} from '../src/generated-walk-tasks.ts';

const nodes:[number,number][]=[[0,0],[0,100],[100,100],[200,100]],edges=[new Map([[1,100]]),new Map([[0,100],[2,100]]),new Map([[1,100],[3,100]]),new Map([[2,100]])];
const flat:OutdoorGeneratorEnvironment={walk:{starts:[[0,0]],clear:()=>true,height:()=>0},roads:{nodes,edges},ground:()=>0,driveClear:()=>true,water:{starts:[[0,0]],height:-.25,clear:()=>true}};
const config=(vehicle:OutdoorVehicle='walk')=>({...DEFAULT_OUTDOOR_GENERATOR,vehicle,distance:30,minTurns:0,maxTurns:0,count:1,maxVisited:4000,prefix:'unit'});
function verified(vehicle:OutdoorVehicle='walk',flags={follow:false,intercept:false,escape:false}){const result=generateOutdoorTask(flat,{...config(vehicle),...flags},0);result.task.validation={status:'physics-verified',scope:'fixture'};return result.task;}
function dataset(){return {schema:OUTDOOR_DATASET_SCHEMA,split:'train',generatorVersion:'fixture',config:{},provenance:{},tasks:[verified()]};}

test('objective flags are exclusive and interception is car-only',()=>{
 assert.equal(outdoorObjective({follow:false,intercept:false,escape:false}),'arrival');
 assert.throws(()=>outdoorObjective({follow:true,intercept:true,escape:false}),/exclusive/);
 assert.throws(()=>outdoorObjective({follow:1 as any,intercept:false,escape:false}),/boolean/);
 for(const vehicle of ['walk','swim','boat'] as const)assert.throws(()=>validateOutdoorGeneratorConfig({...config(vehicle),intercept:true}),/car/);
 for(const change of [{distance:NaN},{distance:19},{seed:0},{minTurns:3,maxTurns:2},{attempts:0},{maxVisited:1e9},{prefix:'../escape'},{vehicle:'flight' as any},{landmark:'remote.glb' as any},{follow:true,landmark:'motorcycle-green' as const}])assert.throws(()=>validateOutdoorGeneratorConfig({...config(),...change}));
});
test('all 13 allowed movement/objective combinations are deterministic and clone-safe',()=>{
 let cases=0;
 for(const vehicle of ['walk','swim','drive','boat'] as const)for(const objective of ['arrival','follow','intercept','escape']){
  if(objective==='intercept'&&vehicle!=='drive')continue;
  const c={...config(vehicle),follow:objective==='follow',intercept:objective==='intercept',escape:objective==='escape'},a=generateOutdoorTask(flat,c,0),b=generateOutdoorTask(flat,c,0);
  assert.deepEqual(a,b);assert.equal(a.task.objective,objective);assert.equal(a.task.turnCount,0);assert(Math.abs(a.task.length-30)<=3);cases++;
  a.task.validation={status:'physics-verified',scope:'test'};const input={...dataset(),tasks:[a.task]},parsed=parseOutdoorDataset(input);parsed.tasks[0].points[0][0]+=100;assert.notDeepEqual(parsed.tasks[0].points,input.tasks[0].points);
 }
 assert.equal(cases,13);
});
test('distance and turn count of follow/interception describe the full NPC path, not a consumed prefix',()=>{
 for(const vehicle of ['walk','swim','drive','boat'] as const){const t=verified(vehicle,{follow:true,intercept:false,escape:false}),rules=outdoorNpcRules(t);assert.equal(t.routeRole,'npc');assert.equal(rules.headStart,0);assert(t.playerSpawn.gap>0);assert.notDeepEqual(t.playerSpawn.point,t.points[0]);
  const npc=vehicle==='drive'?new NativeVehicleNpc(t.points,rules,{width:2,length:4.9,height:1.5,mass:1600},{height:()=>0,clear:()=>true,pushClear:()=>true}):new NativeNpcObjective(t.points,rules);
  assert.equal(npc.distance,0);assert.deepEqual(npc.pose.point,t.points[0]);assert(Math.abs(t.length-walkLength(t.points))<1e-9);
 }
 const t=verified('drive',{follow:false,intercept:true,escape:false});assert.equal(t.playerSpawn.gap,55);assert.equal(t.objective,'intercept');assert.equal(t.category,'chase');
 assert(Math.abs(outdoorNpcRules(t).speed-31.8)<1e-9);
});
test('road Dijkstra paths are connected shortest paths, not repeated turn-padding loops',()=>{
 const c={...config('drive'),distance:200,minTurns:1,maxTurns:1};const paths=roadRouteCandidates(0,flat,c);assert(paths.some(p=>p.length===3&&walkLength(p)===200));
 const {task}=generateOutdoorTask(flat,c,0);assert.equal(task.turnCount,1);assert.equal(task.length,200);assert.equal(new Set(task.points.map(p=>p.join(','))).size,task.points.length);
});
test('NPC distance and exact turn request survive independent follow/intercept player lead-ins',()=>{
 for(const objective of ['follow','intercept'] as const){
  const {task}=generateOutdoorTask(flat,{...config('drive'),distance:200,minTurns:1,maxTurns:1,follow:objective==='follow',intercept:objective==='intercept'},0);
  assert.equal(task.length,200);assert.equal(task.turnCount,1);assert.equal(task.routeRole,'npc');
  const npc=new NativeVehicleNpc(task.points,outdoorNpcRules(task),{width:2,length:4.9,height:1.5,mass:1600},{height:()=>0,clear:()=>true,pushClear:()=>true});
  assert.equal(npc.distance,0);assert.deepEqual(npc.pose.point,task.points[0]);
  assert(task.playerSpawn.gap>0);assert.equal(walkLength([task.playerSpawn.point,...task.points]),task.length+task.playerSpawn.gap);
 }
});
test('real movement-controller probes reach unobstructed goals without waypoint teleportation',()=>{
 const walker=new CityWalk(()=>false,()=>0);
 for(const vehicle of ['walk','swim','drive','boat'] as const){const task=verified(vehicle),proof=probeOutdoorRoute(task,flat,walker);assert(proof.passed,vehicle+': '+JSON.stringify(proof));assert(proof.frames>0);assert(proof.controllerSeconds>0);}
});
test('water follow uses separate player and target spawns; no invisible route corridor',()=>{
 const t=verified('boat',{follow:true,intercept:false,escape:false});const player=outdoorWaterSpec(t),npc=outdoorWaterSpec(t,-.25,false);assert.deepEqual(player.path.points[0],t.playerSpawn.point);assert.deepEqual(npc.path.points[0],t.points[0]);assert.equal(npc.path.length,t.length);assert(player.path.length>t.length);assert.equal(player.channelHalfWidth,undefined);assert.equal(player.entrance,false);
});
test('escape keeps benchmark survival rules and labels distance/turns reference-only',()=>{
 for(const vehicle of ['walk','swim','drive','boat'] as const){const t=verified(vehicle,{follow:false,intercept:false,escape:true});assert.equal(t.routeRole,'escape-reference');assert.equal(t.maxDuration,180);assert.equal(t.playerSpawn.gap,0);assert.match(t.instruction.en,/60 continuous/);assert.equal(outdoorWaterSpec(t).objective,'water-escape');}
});
test('dataset rejects unverified geometry, mismatched route measurements and unsafe ownership metadata',()=>{
 for(const change of [{validation:{status:'geometry-verified',scope:'test'}},{length:300},{turnCount:4},{routeRole:'npc'},{playerSpawn:{point:[NaN,0],yaw:0,gap:0}},{vehicle:'drive',goalDepth:2},{id:'c01-n04'}]){const d=dataset();Object.assign(d.tasks[0],change);assert.throws(()=>parseOutdoorDataset(d));}
 const d=dataset();d.tasks.push(structuredClone(d.tasks[0]));assert.throws(()=>parseOutdoorDataset(d),/duplicate/);
});
test('only an explicit safe outdoor URL opt-in can load generated tasks',async()=>{
 const fetcher:typeof fetch=async()=>new Response(JSON.stringify(dataset()));assert.equal(await loadOutdoorDatasetFromUrl('?quality=low','http://localhost/',fetcher),undefined);
 assert.equal((await loadOutdoorDatasetFromUrl('?outdoorDataset=unit.json','http://localhost/',fetcher))?.tasks.length,1);
 for(const query of ['?outdoorDataset=../secret.json','?outdoorDataset=https://bad/x','?walkDataset=x.json&outdoorDataset=unit.json'])await assert.rejects(loadOutdoorDatasetFromUrl(query,'http://localhost/',fetcher));
});
