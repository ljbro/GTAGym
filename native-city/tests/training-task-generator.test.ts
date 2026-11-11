import test from 'node:test';
import assert from 'node:assert/strict';
import {generateTrainingTask,validateTemplateSpec,TEMPLATE_CAPABILITIES,hasVehicleHairpin,type TrainingGenerationEnvironment} from '../src/training-task-generator.ts';
import {domain,validateSamplingSpec,loadTrainingDatasetFromUrl,type SamplingSpec} from '../src/training-task-schema.ts';
import {trainingRooms,routeLength3} from '../src/training-room-layout.ts';
import {probeTrainingRoom} from '../src/training-task-validation.ts';
import {NATIVE_FLIGHT_TASKS} from '../src/native-flight-catalog.ts';
import {NATIVE_FLIGHT_LAUNCH} from '../src/native-flight-sites.ts';
import {resolvedOutdoorNpcRules} from '../src/generated-outdoor-tasks.ts';
import {extraBodyBlocked} from '../src/native-extra-layout.ts';

const nodes:[number,number][]=[[0,0],[0,100],[100,100],[200,100]],edges=[new Map([[1,100]]),new Map([[0,100],[2,100]]),new Map([[1,100],[3,100]]),new Map([[2,100]])];
const env:TrainingGenerationEnvironment={outdoor:{walk:{starts:[[0,0]],clear:()=>true,height:()=>0},roads:{nodes,edges},ground:()=>0,driveClear:()=>true,water:{starts:[[0,0]],height:-.25,clear:()=>true}},shootingPool:{schema:'gtabench.shooting-pool.v1',provenance:{},pairs:[{index:1,id:'source-1',sourceId:'SOURCE_1',config:'shooting/SOURCE_1/task.json',configSha256:'sha',imageSha256:'sha',width:1920,height:1080,center:[960,540],instruction:{en:'Shoot the target.',zh:'Shoot the target.'},quality:'silver'}]},flights:NATIVE_FLIGHT_TASKS,placeInterior:()=>({x:0,y:0,z:0}),airClear:()=>true,flightLaunch:{x:NATIVE_FLIGHT_LAUNCH.x,y:0,z:NATIVE_FLIGHT_LAUNCH.z}};
test('vehicle routes reject reversing junction spurs while retaining ordinary corners',()=>{
 assert.equal(hasVehicleHairpin([[0,0],[0,100],[100,100]]),false);
 assert.equal(hasVehicleHairpin([[-6029.7,701.2],[-6016.6,732.1],[-6027.3,691.1]]),true);
 assert.equal(hasVehicleHairpin([[0,0],[0,100],[0,1]]),true);
});
test('all ten non-sniping templates have a controller payload and seeded sampling is deterministic',()=>{
 assert.equal(Object.keys(TEMPLATE_CAPABILITIES).length,10);
 for(const template of Object.keys(TEMPLATE_CAPABILITIES) as SamplingSpec['template'][]){
  const spec:SamplingSpec={template,seed:42,name:'unit',...(template==='road'||template==='follow'||template==='pursuit'?{movement:['drive'],length:100,turns:0}:template==='outdoor'||template==='aquatic'?{length:[30,40],turns:0}:template==='evasion'?{movement:['walk'],pursuerCount:2,initialDistance:40}:template==='indoor'?{length:[25,40],turns:[1,3]}:template==='aviation'?{movement:['helicopter'],length:350,turns:1}:{})};
  const a=generateTrainingTask(env,spec,0),b=generateTrainingTask(env,spec,0);assert.deepEqual(a,b,template);assert.equal(a.template,template);assert.equal([a.outdoor,a.interior,a.flight,a.shooting].filter(Boolean).length,1);assert.equal(a.validation.status,'geometry-verified');
 }
});
test('ranges, fixed values and jointly incompatible bounds are handled explicitly',()=>{
 assert.deepEqual(domain(7,0,'x'),[7,7]);assert.deepEqual(domain([2,7],0,'x'),[2,7]);
 for(const spec of [{template:'sniper'},{template:'shooting',length:30},{template:'evasion',length:30},{template:'evasion',destination:{x:0,z:0}},{template:'road',actorSpeed:10},{template:'follow',pursuerCount:2},{template:'pursuit',movement:['walk']},{template:'indoor',transport:['water']},{template:'road',turns:[1.5,3]},{template:'outdoor',seed:0},{template:'shooting',imageIndices:[]},{template:'shooting',aimOffset:{x:[1,0],y:0}}])assert.throws(()=>validateTemplateSpec(spec as SamplingSpec),JSON.stringify(spec));
 assert.throws(()=>generateTrainingTask(env,{template:'outdoor',length:30,turns:10,attempts:1},0),/No feasible/);
 assert.throws(()=>generateTrainingTask(env,{template:'indoor',length:5000,turns:0,attempts:1},0),/No feasible/);
 assert.throws(()=>generateTrainingTask(env,{template:'follow',movement:['drive'],length:100,initialDistance:250,attempts:1},0),/No feasible/);
});
test('following distance/turns apply to the complete target route and target speed is executable',()=>{
 const t=generateTrainingTask(env,{template:'follow',movement:['drive'],length:200,turns:1,actorSpeed:23,initialDistance:30,heading:90},0),o=t.outdoor!;
 assert.equal(t.resolved.routeRole,'npc');assert.equal(o.length,200);assert.equal(o.playerSpawn.gap,30);assert.equal(resolvedOutdoorNpcRules(o).speed,23);assert.equal(t.resolved.heading,90);assert.notDeepEqual(o.playerSpawn.point,o.points[0]);
});
test('evasion freezes each initial pursuer, has no sampled destination and retains escape rules',()=>{
 const t=generateTrainingTask(env,{template:'evasion',movement:['walk'],pursuerCount:3,initialDistance:40,actorSpeed:[2,3]},0),p=t.outdoor!.actors!.pursuers!;
 assert.equal(t.resolved.destination,null);assert.equal(t.resolved.length,null);assert.equal(t.resolved.turns,null);assert.equal(t.resolved.routeRole,'none');assert.equal(t.maxDuration,180);assert.equal(p.length,3);
 for(const actor of p){assert(Math.abs(Math.hypot(actor.point[0]-t.resolved.start!.x,actor.point[1]-t.resolved.start!.z)-40)<1e-8);assert(actor.speed>=2&&actor.speed<=3);}
});
test('shooting chooses only the permitted source pair and applies an initial screen-pixel offset without replacing gold',()=>{
 const t=generateTrainingTask(env,{template:'shooting',imageIndices:[1],aimOffset:{x:100,y:50}},0);
 assert.deepEqual(t.shooting!.initialAim,[1110,465]);assert.equal(t.shooting!.pair.sourceId,'SOURCE_1');assert.equal(t.maxRounds,20);assert.equal(t.maxDuration,0);assert.equal(t.resolved.routeRole,'none');
 assert.throws(()=>generateTrainingTask(env,{template:'shooting',imageIndices:[2],attempts:1},0),/No feasible/);
 assert.throws(()=>generateTrainingTask(env,{template:'shooting',aimOffset:{x:100000,y:0},attempts:1},0),/No feasible/);
});
test('room geometry includes sealed walls, real doors, decoys, floors/roofs and climbable physical stairs',()=>{
 for(const upstairs of [false,true]){
  const r=trainingRooms('rl-task-vertical-unit-0001',1,12,upstairs),t=generateTrainingTask(env,{template:upstairs?'vertical':'indoor',length:[30,45]},0);
  assert(r.layout.solids.length>0);assert(r.layout.doors.some(d=>d.decoy));assert(r.layout.doors.some(d=>!d.decoy));assert.equal(r.layout.ceilings.length,r.layout.floors.filter(s=>s.name.startsWith('floor-')).length);
  assert.equal(r.layout.doors.filter(d=>!d.decoy).length,2,'Only the two actual room connections may have portals');
  assert(extraBodyBlocked(r.layout,-6,0,0,0));assert(extraBodyBlocked(r.layout,0,-6,0,0));assert(extraBodyBlocked(r.layout,0,6,0,0));
  if(upstairs){assert.equal(r.layout.steps!.length,20);assert.equal(r.layout.goalY,3.6);assert(routeLength3(r.route)>24);}
  const proof=probeTrainingRoom(t);assert(proof.passed,JSON.stringify({upstairs,proof,points:t.interior!.layout.points}));
 }
});
test('training URL cannot load arbitrary paths or coexist with legacy datasets',async()=>{
 assert.equal(await loadTrainingDatasetFromUrl('?foo=bar','http://localhost/'),undefined);
 for(const q of ['?trainingDataset=../key.json','?trainingDataset=https://bad/key.json','?trainingDataset=ok.json&walkDataset=old.json','?trainingDataset=a.json&trainingDataset=b.json'])await assert.rejects(loadTrainingDatasetFromUrl(q,'http://localhost/'));
});
test('fixed stair-turn values constrain the finished route, not an approximate pre-stair skeleton',()=>{
 for(const turns of [2,4,6]){const t=generateTrainingTask(env,{template:'vertical',turns,length:[35,65]},0);assert.equal(t.resolved.turns,turns);assert(probeTrainingRoom(t).passed);}
 const t=generateTrainingTask(env,{template:'indoor',turns:2,length:36,heading:0},0);assert.equal(t.resolved.turns,2);assert(Math.abs(t.resolved.length!-36)<1e-5);assert.equal(t.resolved.heading,0);assert(probeTrainingRoom(t).passed);
});
