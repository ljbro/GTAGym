import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readEnvironmentState} from '../scripts/server-eval/state-snapshot.mjs';
import {verifyReplayState} from '../scripts/server-eval/checkpoint.mjs';
import {frozenEqual} from '../scripts/server-eval/episode.mjs';

const base=()=>({controlMode:'car',state:{x:1,z:2,yaw:.2,speed:3,steer:0},actor:{x:999,z:999},groundHeight:()=>.5,carSurfaceHeight:()=>.7,paused:false,scene:{_animationTime:0},time:0,__evalMousePosition:{x:640,y:360}});
const read=(world,task={})=>JSON.parse(JSON.stringify(vm.runInNewContext('('+readEnvironmentState.toString()+')()',{
 window:{__SHENCHENGJI_CITY__:{world,stats:{nativeTask:{taskId:'test',active:true,elapsed:0,...task}}},innerWidth:1280,innerHeight:720},document:{querySelector:()=>null},
})));
const walker=()=>({active:true,x:10,feetY:8,z:20,yaw:1,speed:1.6,verticalSpeed:0,grounded:true,airborne:false,traversing:false,completedLinks:new Set(['b','a'])});
const plane=()=>({active:true,model:'plane',sim:{pose:{x:100,y:250,z:300,yaw:.5,pitch:.1,roll:.2},velocity:{x:1,y:2,z:3},speed:40,phase:'flying',onGround:false,throttle:.8}});

test('interior partial push-door angles and opening side are retained for replay validation',()=>{
 const w={...base(),walk:walker(),nativeFootSite:{doorSnapshot:[{name:'door',progress:.3,side:-1,locked:false}]}};
 const a=read(w);assert.deepEqual(a.replayState.physical.interiorDoors,w.nativeFootSite.doorSnapshot);
 w.nativeFootSite.doorSnapshot[0].progress=.4;assert.throws(()=>verifyReplayState(a,read(w),'door'),/diverged/);
});

test('water transfer captures pending boarding approach and selected side',()=>{
 const boat={mode:'swim',spec:{objective:'shore-transfer',waterHeight:-.25},swimmer:{depth:0},boardingSide:1,approach:{index:1,points:[{x:10,z:12},{x:11,z:15}]}};
 const w={...base(),taskVehicle:{spec:boat.spec,x:10,y:-.25,z:12,active:boat,boat}};
 const s=read(w);assert.deepEqual(s.replayState.physical.boardingAssist,{side:1,approach:{index:1,points:[{x:10,z:12},{x:11,z:15}]}});
 boat.approach.index=0;assert.throws(()=>verifyReplayState(s,read(w),'boarding'),/diverged/);
});

test('aircraft uses flight pose, velocity and actual flight pause flag, including crash/boundary',()=>{
 const w={...base(),paused:true,taskFlightPaused:false,flight:plane()};
 const a=read(w,{flight:{stage:'route',checkpoint:2}});
 assert.deepEqual(a.actor,{x:100,y:250,z:300});assert.equal(a.mode,'aircraft');assert.equal(a.paused,false);assert(a.worldPaused);
 assert.equal(a.replayState.physical.verticalSpeed,2);assert.equal(a.replayState.physical.pitch,.1);
 w.flight.sim.pose.y=251;assert.equal(read(w).actor.y,251);w.taskFlightPaused=true;assert(read(w).paused);
 w.flight.active=false;w.flight.sim.phase='idle';assert.equal(read(w,{flight:{stage:'route',outcome:'failure'}}).actor.y,251);
 w.walk=walker();assert.equal(read(w,{flight:{stage:'boarding'}}).mode,'walking');
});
test('walking records feet height, climb state and deterministic completed links',()=>{
 const w={...base(),walk:walker()},s=read(w);assert.deepEqual(s.actor,{x:10,y:8,z:20});assert.equal(s.mode,'walking');
 assert.deepEqual(s.replayState.physical.completedLinks,['a','b']);
 w.walk.ladder={ladder:{id:'ladder'},phase:'climb',progress:.4};assert.equal(read(w).replayState.physical.ladder.progress,.4);
});
test('standalone swimmer records water depth and never falls through to car mode',()=>{
 const w={...base(),taskVehicle:{x:10,y:-4.25,z:20,depth:4,spec:{waterHeight:-.25},yaw:1,speed:2,verticalSpeed:-1.2}};
 const s=read(w);assert.equal(s.mode,'swimming');assert.equal(s.actor.y,-4.25);assert.equal(s.replayState.physical.depth,4);assert.equal(s.replayState.physical.verticalSpeed,-1.2);
});
test('submarine retains depth and pipe-entry history in replay state',()=>{
 const v={x:10,y:-12.25,z:20,mode:'submarine',depth:12,enteredPipe:true,spec:{waterHeight:-.25},yaw:1,speed:3,verticalSpeed:-.5};
 const s=read({...base(),taskVehicle:v});assert.equal(s.mode,'submarine');assert.equal(s.replayState.physical.kind,'submarine');assert.equal(s.replayState.physical.depth,12);assert.equal(s.replayState.physical.enteredPipe,true);
 const t=structuredClone(s);t.replayState.physical.enteredPipe=false;assert.throws(()=>verifyReplayState(s,t,'entry'),/diverged/);
});
test('boat, boarding and leaving use task controller, not stale swimming or car state',()=>{
 const v={x:10,y:.3,z:20,mode:'boat',yaw:1,speed:8,boat:{x:10,z:20,yaw:1,speed:8},body:{bottomY:-1,pitch:.1,grounded:false},spec:{craft:'zodiac',waterHeight:-.25},boarded:true};
 const w={...base(),taskVehicle:v};
 for(const mode of ['boat','boarding','leaving']){v.mode=mode;const s=read(w);assert.equal(s.mode,mode);assert.equal(s.actor.y,.3);assert.equal(s.replayState.physical.boat.y,-1);}
});
test('shore-to-boat wrapper follows active walking/swimming controller',()=>{
 const w={...base(),taskVehicle:{x:10,y:8,z:20,active:{mode:'walk',walker:walker()}}};
 assert.equal(read(w).mode,'walking');assert.equal(read(w).replayState.physical.grounded,true);
 w.taskVehicle.active={mode:'swim',swimmer:{depth:2,verticalSpeed:-1,spec:{waterHeight:0}}};w.taskVehicle.y=-2;
 assert.equal(read(w).mode,'swimming');assert.equal(read(w).replayState.physical.depth,2);
});
test('car records physical support height and sinking; static has no fabricated 3D actor',()=>{
 const w=base();assert.equal(read(w).actor.y,.7);
 w.carWaterEnabled=true;w.carWater={phase:'sinking',elapsed:2,depth:3,baseY:-2,pitch:.1};w.carSurfaceHeight=()=>-2;
 assert.equal(read(w).actor.y,-2);assert.equal(read(w).replayState.physical.water.phase,'sinking');
 w.staticTask={canvas:{width:1280,height:720},snapshot:()=>({hit:false})};const s=read(w);assert.equal(s.mode,'static');assert.equal(s.actor,null);assert.deepEqual(s.staticTask,{hit:false});
});
test('replay catches height, depth, attitude, phase and pause drift; incompatible old schema fails explicitly',()=>{
 const w={...base(),flight:plane()},s=read(w,{flight:{stage:'route'}});
 verifyReplayState(s,structuredClone(s),'same');
 const changed=fn=>{const t=structuredClone(s);fn(t);assert.throws(()=>verifyReplayState(s,t,'test'),/diverged/);assert(!frozenEqual(s,t));};
 changed(t=>t.actor.y+=1);changed(t=>t.replayState.physical.pitch+=.1);changed(t=>t.replayState.task.flight.stage='landing');changed(t=>t.paused=!t.paused);
 const swim=read({...base(),taskVehicle:{x:0,y:-2,z:0,depth:2,spec:{waterHeight:0}}}),deep=structuredClone(swim);deep.replayState.physical.depth=3;
 assert.throws(()=>verifyReplayState(swim,deep,'depth'),/diverged/);assert(!frozenEqual(swim,deep));
 const legacy={...s};delete legacy.stateVersion;
 assert.throws(()=>verifyReplayState(legacy,s,'legacy'),/schema mismatch/);
 assert.throws(()=>verifyReplayState(s,legacy,'downgrade'),/schema mismatch/);
});
