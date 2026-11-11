import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {CityWalk,JUMP_SPEED,WALK_GRAVITY,LADDER_SPEED,LADDER_FAST_SPEED,LADDER_SLIDE_SPEED} from '../src/city-walk.ts';
import {CLIMB_START,CLIMB_SITE,CLIMB_SOURCE,NativeClimbSite,NativeClimbMission} from '../src/native-climb-site.ts';
import {CityCollision} from '../src/driving.ts';
import type {CityData} from '../src/city-types.ts';

const keys=(...codes:string[])=>new Set(codes);
test('remote jump physics coexists with Space traversal links on the same walker',()=>{
 const walker=new CityWalk(()=>false,()=>0);walker.active=true;
 walker.links=[{id:'compat-vault',kind:'vault',from:{x:0,y:0,z:0},to:{x:0,y:0,z:2},top:1,duration:1}];
 walker.step(keys('Space'),1/60);
 assert.equal(walker.traversing,true);assert.equal(walker.jumps,0,'Space selects traversal before a jump');
 assert.equal(walker.canEnter({x:1,z:0}),false,'cannot board halfway through traversal');
 for(let i=0;i<90;i++)walker.step(keys(),1/60);
 assert.equal(walker.traversing,false);assert.equal(walker.z,2);assert.ok(walker.completedLinks.has('compat-vault'));
 walker.links=[];walker.step(keys('Space','KeyW','ShiftLeft'),1/60);
 assert.equal(walker.jumps,1);assert.equal(walker.airborne,true);
 const before=walker.z;walker.step(keys(),1/60);assert.ok(walker.z>before,'remote airborne inertia survives traversal');
 walker.resetMotion();assert.equal(walker.grounded,true);assert.equal(walker.airborne,false);assert.equal(walker.completedLinks.size,0);
});
test('legacy resetMotion cancels both manual ladder and automatic climb state',()=>{
 const {walker,site}=walkSite();walker.z=site.ladder.z;walker.step(keys('KeyW'),1/60);
 assert.ok(walker.ladder);assert.equal(walker.traversing,true);
 walker.resetMotion();assert.equal(walker.ladder,null);assert.equal(walker.traversing,false);assert.equal(walker.grounded,true);
 walker.x=walker.z=0;walker.resetMotion();
 walker.links=[{id:'compat-climb',kind:'climb',from:{x:0,y:0,z:0},to:{x:0,y:0,z:2},top:1,duration:1}];
 walker.step(keys('Space'),1/60);assert.equal(walker.traversing,true);
 walker.resetMotion();assert.equal(walker.traversing,false);assert.equal(walker.traversalPose,null);
});
function walkSite(){
 const site=new NativeClimbSite(0),walker=new CityWalk((x,z,y)=>site.blocked(x,z,y),(x,z)=>site.groundAt(x,z)??0,{floorAt:(x,z,y)=>site.floorAt(x,z,y,0),ladders:[site.ladder]});
 Object.assign(walker,{active:true,x:CLIMB_START.x,z:CLIMB_START.z,yaw:0});walker.resetVertical();
 return {site,walker};
}
function approach(walker:CityWalk){
 for(let i=0;i<600&&!walker.ladder;i++)walker.step(keys('KeyW'),1/60);
 assert.ok(walker.ladder,'walking toward the ladder attaches without an interaction key');
}
function ascend(walker:CityWalk){
 approach(walker);
 for(let i=0;i<400&&walker.ladder;i++)walker.step(keys('KeyW'),1/60);
 assert.equal(walker.ladder,null);assert.equal(walker.grounded,true);
}
test('jump follows a ballistic arc, lands, and holding Space cannot auto-jump',()=>{
 const walker=new CityWalk(()=>false,()=>2);walker.active=true;
 let peak=walker.y;for(let i=0;i<120;i++){walker.step(keys('Space'),1/60);peak=Math.max(peak,walker.y);}
 assert.ok(Math.abs(peak-2-JUMP_SPEED**2/(2*WALK_GRAVITY))<.015);assert.equal(walker.y,2);assert.equal(walker.jumps,1);assert.equal(walker.landings,1);assert.equal(walker.grounded,true);
 walker.step(keys(),1/60);walker.step(keys('Space'),1/60);assert.equal(walker.jumps,2);assert.equal(walker.canEnter({x:0,z:0}),false);
 walker.resetVertical();assert.equal(walker.grounded,true);assert.equal(walker.verticalSpeed,0);
});
test('jump cannot pass a wall or jump again in air; running carries horizontal momentum',()=>{
 const walker=new CityWalk((_x,z)=>z>1,()=>0);walker.active=true;
 walker.step(keys('Space','KeyW','ShiftLeft'),.05);walker.step(keys('KeyW','ShiftLeft'),.05);walker.step(keys('Space','KeyW','ShiftLeft'),.05);
 assert.equal(walker.jumps,1);for(let i=0;i<60;i++)walker.step(keys('KeyW','ShiftLeft'),1/60);assert.ok(walker.z<1);
 const runner=new CityWalk(()=>false,()=>0);runner.active=true;runner.step(keys('Space','KeyW','ShiftLeft'),.05);const before=runner.z;runner.step(keys(),.05);assert.ok(runner.z>before+.1);
});
test('jumping onto a crate and walking off it use the actual support height',()=>{
 const {walker,site}=walkSite();walker.x=3494;walker.z=901.75;walker.resetVertical();
 for(let i=0;i<23;i++)walker.step(keys('Space','KeyW'),1/60);
 for(let i=0;i<90;i++)walker.step(keys(),1/60);
 assert.ok(Math.abs(walker.y-(site.groundY+.72))<.01,'land on crate top');assert.equal(walker.grounded,true);
 for(let i=0;i<100;i++)walker.step(keys('KeyS'),1/60);
 for(let i=0;i<70;i++)walker.step(keys(),1/60);
 assert.equal(walker.y,site.groundY);assert.ok(walker.landings>=2);
});
test('walking toward a ladder auto-attaches; W/S climb, release holds, and top exits onto a real roof',()=>{
 const {walker,site}=walkSite();walker.step(keys('KeyE'),.05);assert.equal(walker.ladder,null);
 approach(walker);
 for(let i=0;i<40;i++)walker.step(keys('KeyW'),1/60);const middle=walker.y;
 for(let i=0;i<60;i++)walker.step(keys(),1/60);assert.equal(walker.y,middle,'hold on rung without input');
 for(let i=0;i<20;i++)walker.step(keys('KeyS'),1/60);assert.ok(walker.y<middle);
 for(let i=0;i<200;i++)walker.step(keys('KeyW'),1/60);
 assert.equal(walker.ladder,null);assert.equal(walker.completedClimbs,1);assert.equal(walker.y,site.ladder.top);assert.equal(walker.grounded,true);assert.ok(walker.z>910);
});
test('stationary, sideways, backward, misaligned and airborne movement do not grab a ladder',()=>{
 for(const input of [[],['KeyE'],['KeyA'],['KeyD'],['KeyS'],['KeyW','Space']]){
  const {walker,site}=walkSite();walker.z=site.ladder.z-.5;walker.step(keys(...input),1/60);assert.equal(walker.ladder,null,input.join('+'));
 }
 for(const change of [{yaw:Math.PI},{x:3490.6},{z:909.6}]){
  const {walker,site}=walkSite();walker.z=site.ladder.z-.5;Object.assign(walker,change);walker.step(keys('KeyW'),1/60);assert.equal(walker.ladder,null,JSON.stringify(change));
 }
 const {walker,site}=walkSite();walker.z=site.ladder.z-.5;walker.step(keys('KeyW','Space'),1/60);
 for(let i=0;i<10;i++){walker.step(keys('KeyW'),1/60);assert.equal(walker.ladder,null);}
});
test('mount direction follows rotated ladders and cannot snap through an obstruction',()=>{
 for(const yaw of [0,Math.PI/2,Math.PI,-Math.PI/2]){
  const nx=Math.sin(yaw),nz=Math.cos(yaw),ladder={id:'rotated',x:0,z:0,bottom:0,top:4,yaw,exit:{x:nx,z:nz}};
  const environment={floorAt:()=>0,ladders:[ladder]};
  const walker=new CityWalk(()=>false,()=>0,environment);Object.assign(walker,{active:true,x:-nx*.5,z:-nz*.5,yaw});
  walker.step(keys('KeyW'),1/60);assert.equal(walker.ladder?.ladder.id,'rotated');
  const blocked=new CityWalk((x,z)=>Math.hypot(x,z)<.25,()=>0,environment);Object.assign(blocked,{active:true,x:-nx*.5,z:-nz*.5,yaw});
  blocked.step(keys('KeyW'),1/60);assert.equal(blocked.ladder,null);
 }
});
test('Shift climbs faster or slides down; releasing stops and unrelated keys never drop the player',()=>{
 const {walker,site}=walkSite();approach(walker);
 walker.step(keys('KeyW'),.05);assert.equal(walker.verticalSpeed,LADDER_SPEED);
 for(let i=0;i<30;i++)walker.step(keys('KeyW','ShiftLeft'),1/60);
 assert.equal(walker.verticalSpeed,LADDER_FAST_SPEED);const middle=walker.y;
 walker.step(keys('KeyE','Space'),1/60);assert.ok(walker.ladder);assert.equal(walker.y,middle);assert.equal(walker.jumps,0);
 walker.step(keys('ShiftLeft'),1/60);assert.equal(walker.y,middle,'Shift alone does not move');
 walker.step(keys('KeyS','ShiftLeft'),1/60);assert.equal(walker.verticalSpeed,-LADDER_SLIDE_SPEED);assert.equal(walker.ladder?.sliding,true);
 const lower=walker.y;walker.step(keys(),.05);assert.equal(walker.y,lower);assert.equal(walker.ladder?.sliding,false);
 for(let i=0;i<80;i++)walker.step(keys('KeyS','ShiftRight'),1/60);
 assert.equal(walker.y,site.groundY);assert.equal(walker.ladder,null);assert.equal(walker.grounded,true);assert.equal(walker.completedClimbs,0);
});
test('walking back toward the roof ladder auto-turns onto it, then S descends to ground',()=>{
 const {walker,site}=walkSite();ascend(walker);
 for(let i=0;i<40;i++)walker.step(keys(),1/60);
 walker.step(keys('KeyE'),1/60);assert.equal(walker.ladder,null);
 walker.step(keys('KeyS'),1/60);assert.equal(walker.ladder?.phase,'enter');
 for(let i=0;i<250;i++)walker.step(keys('KeyS'),1/60);
 assert.equal(walker.ladder,null);assert.equal(walker.y,site.groundY);assert.equal(walker.grounded,true);assert.equal(walker.completedClimbs,1);
});
test('forward roof approach mounts safely without bouncing back up; ascent never reattaches on the roof',()=>{
 const {walker,site}=walkSite();ascend(walker);
 for(let i=0;i<40;i++){walker.step(keys('KeyW'),1/60);assert.equal(walker.ladder,null);}
 walker.yaw=Math.PI;for(let i=0;i<60&&!walker.ladder;i++)walker.step(keys('KeyW'),1/60);
 assert.equal(walker.ladder?.phase,'enter');assert.equal(walker.yaw,site.ladder.yaw);
 for(let i=0;i<80;i++)walker.step(keys('KeyW'),1/60);
 assert.equal(walker.ladder?.phase,'climb');assert.equal(walker.completedClimbs,1);
 walker.step(keys(),1/60);walker.step(keys('KeyS'),1/60);assert.ok(walker.y<site.ladder.top);
 for(let i=0;i<100;i++)walker.step(keys('KeyS','ShiftLeft'),1/60);
 assert.equal(walker.y,site.groundY);assert.equal(walker.ladder,null);assert.equal(walker.completedClimbs,1);
});
test('roof arrival is immediate while moving, without climb history or standing delay',()=>{
 const {walker,site}=walkSite(),mission=new NativeClimbMission(site,walker);
 walker.z=site.goal.z;for(let i=0;i<60;i++)mission.step(walker,1/60);assert.equal(mission.outcome,null);
 Object.assign(walker,{x:site.goal.x,z:site.goal.z,y:site.goal.y,speed:4.2,grounded:false});
 assert.equal(walker.completedClimbs,0);
 const elapsed=mission.elapsed;for(let i=0;i<50;i++)mission.step(walker,1/60,true);assert.equal(mission.elapsed,elapsed);
 assert.equal(mission.outcome,null,'paused arrival waits until gameplay resumes');
 mission.step(walker,1/60);
 assert.equal(mission.outcome,'success');assert.equal(mission.stage,'complete');
 assert.equal(mission.settledFor,0,'no dwell-time counter');
 const retry=new NativeClimbMission(site,walker);assert.equal(retry.step(walker,1/60),'success');
});
test('holding W through approach, ladder and roof completes without releasing the key',()=>{
 const {walker,site}=walkSite(),mission=new NativeClimbMission(site,walker);
 for(let i=0;i<1200&&!mission.outcome;i++){walker.step(keys('KeyW'),1/60);mission.step(walker,1/60);}
 assert.equal(mission.outcome,'success');assert(walker.speed>.15);assert.equal(mission.settledFor,0);
});
test('arrival remains at the old roof-ring location, not any point on the roof',()=>{
 const {walker,site}=walkSite(),mission=new NativeClimbMission(site,walker);
 Object.assign(walker,{x:site.goal.x+1.11,z:site.goal.z,y:site.goal.y});assert.equal(mission.step(walker,.05),null);
 walker.x=site.goal.x;walker.y=site.goal.y-.36;assert.equal(mission.step(walker,.05),null);
 walker.y=site.goal.y;assert.equal(mission.step(walker,.05),'success');
});
test('climb scene has no ground start ring or rooftop goal ring',()=>{
 const source=fs.readFileSync(new URL('../src/native-climb-scene.ts',import.meta.url),'utf8');
 assert.doesNotMatch(source,/CreateTorus|city-climb:roof-goal|city-climb:task-start|mission-blue/);
});
test('c07-n04 fails at twenty active seconds, pauses its clock and resets on retry',()=>{
 const {walker,site}=walkSite(),mission=new NativeClimbMission(site,walker);
 assert.equal(mission.maxDuration,20);
 for(let i=0;i<399;i++)mission.step(walker,.05);
 assert.equal(mission.outcome,null);const before=mission.elapsed;
 for(let i=0;i<100;i++)mission.step(walker,.05,true);
 assert.equal(mission.elapsed,before);assert.equal(mission.outcome,null);
 assert.equal(mission.step(walker,.05),'failure');assert.equal(mission.elapsed,20);assert.match(mission.reason,/20 seconds/i);
 assert.equal(mission.step(walker,.05),'failure');assert.equal(mission.elapsed,20);
 const retry=new NativeClimbMission(site,walker);assert.equal(retry.elapsed,0);assert.equal(retry.outcome,null);
});
test('c07-n04 completing on the deadline succeeds before timeout',()=>{
 const {walker,site}=walkSite(),mission=new NativeClimbMission(site,walker);
 walker.completedClimbs++;walker.lastClimbedLadder=site.ladder.id;
 walker.x=site.goal.x;walker.z=site.goal.z;walker.y=site.goal.y;walker.speed=0;walker.grounded=true;
 mission.elapsed=19.95;
 assert.equal(mission.step(walker,.05),'success');
});
test('authored site fits inside the real city with a clear pedestrian approach from Zhenxing Road',()=>{
 const data=JSON.parse(fs.readFileSync(new URL('../../city/city.json',import.meta.url),'utf8')) as CityData,collision=new CityCollision(data);
 for(let x=-CLIMB_SITE.width/2;x<=CLIMB_SITE.width/2;x+=2)for(let z=-CLIMB_SITE.depth/2;z<=CLIMB_SITE.depth/2;z+=2)assert.equal(collision.blocked(CLIMB_SITE.x+x,CLIMB_SITE.z+z),false,`${x},${z} obstructed`);
 for(let z=879.3;z<=CLIMB_START.z;z+=.25)assert.equal(collision.blocked(CLIMB_START.x,z),false);
 assert.equal(CLIMB_SOURCE.taskId,'gta-nav-c07-n04');
});
