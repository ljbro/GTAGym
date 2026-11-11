import test from 'node:test';
import assert from 'node:assert/strict';
import {NativeVehicleNpc,MOTORCYCLE_INTERCEPT_RULES,type InterceptPlayer} from '../src/native-vehicle-npc.ts';
import {npcRules} from '../src/native-npc-objective.ts';
const fit={width:.74,length:2.2,height:1.16,mass:240,motorcycle:true};
const world={height:()=>0,clear:()=>true,pushClear:()=>true};
const create=(kind:'chase'|'follow'='chase')=>new NativeVehicleNpc([[0,0],[0,4000]],npcRules(kind,'drive'),fit,world);
function player(n:NativeVehicleNpc,side:'front'|'rear'|'side'|'far'='front',speed=0):InterceptPlayer{
 const b=n.body;
 return {id:{},kind:'car',width:2.1,length:4.9,height:1.5,mass:1600,y:0,yaw:side==='side'?Math.PI/2:0,speed,
  x:b.x+(side==='side'?-(b.width+4.9)/2+.04:side==='far'?100:0),
  z:b.z+(side==='front'?(b.length+4.9)/2-.04:side==='rear'?-(b.length+4.9)/2+.04:0)};
}
function tick(n:NativeVehicleNpc,p:InterceptPlayer,dt=.02,valid=true){
 const next={...p,x:p.x+Math.sin(p.yaw)*p.speed*dt,z:p.z+Math.cos(p.yaw)*p.speed*dt};
 return n.step(dt,[p.x,p.z],[next.x,next.z],valid,next);
}
function recover(n:NativeVehicleNpc,dt:number){
 for(let i=0;i<Math.ceil(4/dt)&&!n.outcome;i++)tick(n,player(n,'far'),dt);
}
test('three independent motorcycle knockdowns are required at different frame rates',()=>{
 for(const hz of [30,60,120]){
  const n=create(),dt=1/hz;
  for(let hit=1;hit<=3;hit++){
   n.speed=8;assert.equal(tick(n,player(n),dt),null);assert.equal(n.knockdown?.hits,hit);
   assert.equal(n.knockdown?.phase,'falling');assert(!n.knockdown?.armed);assert(!n.qualified);
   const saved=n.snapshot;tick(n,player(n),0);assert.deepEqual(n.snapshot,saved,'pause freezes recovery and hit count');
   if(hit<3){recover(n,dt);assert.equal(n.outcome,null);assert.equal(n.knockdown?.phase,'riding');assert(n.knockdown?.armed);}
   else{
    for(let i=0;i<hz*3&&!n.outcome;i++)tick(n,player(n,'far'),dt);
    assert.equal(n.outcome,'success');assert.equal(n.knockdown?.hits,3);assert.equal(n.knockdown?.phase,'down');assert(n.speed<=1);
   }
  }
 }
});
test('sustained overlap and repeated contact during a fall only count once',()=>{
 const n=create();n.speed=8;tick(n,player(n));
 for(let i=0;i<250;i++)tick(n,player(n));
 assert.equal(n.knockdown?.hits,1);assert.equal(n.outcome,null);assert(!n.knockdown?.armed);
 recover(n,.02);assert(n.knockdown?.armed);n.speed=8;tick(n,player(n));assert.equal(n.knockdown?.hits,2);
});
test('rear and side impacts knock down motorcycles, unlike car interception',()=>{
 for(const side of ['rear','side'] as const){
  const n=create();n.speed=side==='rear'?8:0;
  tick(n,player(n,side,side==='rear'?16:8));assert.equal(n.knockdown?.hits,1,side);
 }
});
test('a gentle initial contact can still knock down the bike when the car keeps accelerating',()=>{
 const n=create();n.speed=8;
 tick(n,player(n,'rear',8.8));assert.equal(n.knockdown?.hits,0);assert(n.snapshot.contact);
 // No separation: the driver keeps W held and increases the rear impact.
 tick(n,player(n,'rear',14));assert.equal(n.knockdown?.hits,1);
});
test('an offset rear bumper strike is not mistaken for zero-speed sideways contact',()=>{
 const n=create();n.speed=8;const p=player(n,'rear',16);p.x=n.body.x+1.36;
 tick(n,p);assert.equal(n.knockdown?.hits,1);
});
test('weak scrapes, wrong floor, invalid mode and proximity do not count',()=>{
 for(const scenario of ['weak','floor','invalid','near']){
  const n=create();n.speed=scenario==='weak'?0:8;const p=player(n);
  if(scenario==='floor')p.y=5;if(scenario==='near')p.z+=2;
  tick(n,p,.02,scenario!=='invalid');assert.equal(n.knockdown?.hits,0,scenario);assert.equal(n.outcome,null);
 }
});
test('arrival still fails motorcycle chases; following retains its own objective',()=>{
 const n=create();n.distance=n.length-.01;assert.equal(tick(n,player(n,'far')),'failure');
 const f=create('follow');f.speed=8;tick(f,player(f));assert.equal(f.knockdown,null);assert.equal(f.outcome,null);
 assert.equal(MOTORCYCLE_INTERCEPT_RULES.hits,3);
});
