import test from 'node:test';import assert from 'node:assert/strict';
import {NativeNpcObjective,npcRules,contactTime} from '../src/native-npc-objective.ts';
import {CAR_MAX_SPEED,stepCar} from '../src/driving.ts';
test('vehicle NPCs use 60% of player maximum; pedestrian speeds and follow gaps stay unchanged',()=>{
 const rules=npcRules('follow','drive'),npc=new NativeNpcObjective([[0,0],[0,1000]],rules),start=npc.distance;
 assert.equal(npc.step(1,[0,0],[0,0],true),null);assert(Math.abs(npc.distance-start-31.8)<1e-9);assert.equal(rules.radius,200);assert(rules.headStart<rules.radius);
 for(const kind of ['follow','chase'] as const)assert.equal(npcRules(kind,'drive').speed/CAR_MAX_SPEED,.6);
 const car={x:0,z:0,yaw:0,speed:0,steer:0,distance:0};for(let i=0;i<2400;i++)stepCar(car,{throttle:1,steer:0,handbrake:false},1/60);assert.equal(car.speed,CAR_MAX_SPEED);
 assert.equal(npcRules('follow','walk').speed,1.5);assert.equal(npcRules('follow','walk').radius,20);
 assert.equal(npcRules('chase','walk').speed,3);
});
test('60% speed allows a stationary player to accelerate and follow or chase on a clear straight road',()=>{
 for(const kind of ['follow','chase'] as const){
  const npc=new NativeNpcObjective([[0,0],[0,1500]],npcRules(kind,'drive'));
  const car={x:0,z:0,yaw:0,speed:0,steer:0,distance:0};let outcome:null|'success'|'failure'=null;
  for(let i=0;i<6000&&!outcome;i++){
   const previous:[number,number]=[car.x,car.z],v=car.speed;
   const throttle=kind==='chase'?1:Math.max(-1,Math.min(1,(v*.038+v*v*.0022+2*(npc.rules.speed-v))/9));
   stepCar(car,{throttle,steer:0,handbrake:false},1/60);
   outcome=npc.step(1/60,previous,[car.x,car.z],true);
  }
  assert.equal(outcome,'success',kind);
 }
});
test('follow requires the entire route in range, waits for endpoint and enforces mode',()=>{
 const n=new NativeNpcObjective([[0,0],[0,100]],npcRules('follow','walk'));
 assert.equal(n.step(0,[0,0],[0,0],true),null,'near NPC at start is not success');
 assert.equal(n.step(10,[0,0],[0,15],true),null);
 assert.equal(n.step(54,[0,15],[0,96],false),null,'wrong mode cannot complete, even inside range');
 assert.equal(n.step(0,[0,96],[0,96],true),'success');
});
test('follow fails on excess distance, including moving ahead, and cannot recover',()=>{
 for(const mode of ['walk','drive'] as const){const rules=npcRules('follow',mode),n=new NativeNpcObjective([[0,0],[0,1000]],rules);
  const target=n.pose.point[1];assert.equal(n.step(0,[rules.radius,target],[rules.radius,target],true),null,'boundary is inclusive');
  assert.equal(n.step(0,[rules.radius+.01,target],[rules.radius+.01,target],true),'failure');
  assert.equal(n.step(100,[0,target],[0,1000],true),'failure','failure is latched');
 }
 const n=new NativeNpcObjective([[0,0],[0,100]],npcRules('follow','walk'));
 assert.equal(n.step(1,[0,0],[0,100],true),'failure','racing ahead also breaks follow range');
});
test('follow detects a corner excursion even when both frame endpoints are close',()=>{
 const n=new NativeNpcObjective([[0,0],[0,20],[0,0]],{kind:'follow',speed:40,headStart:0,radius:10});
 assert.equal(n.step(1,[0,0],[0,0],true),'failure');
});
test('staying behind without moving fails before NPC reaches the end',()=>{
 const n=new NativeNpcObjective([[0,0],[0,1000]],npcRules('follow','drive'));
 assert.equal(n.step(5,[0,0],[0,0],true),null,'179m is within the 200m limit');
 assert.equal(n.step(1,[0,0],[0,0],true),'failure');assert(!n.arrived);
});
test('chase has a moving target and fails when target escapes',()=>{
 const r=npcRules('chase','drive'),n=new NativeNpcObjective([[0,0],[0,1000]],r);assert(Math.abs(r.speed-31.8)<1e-9);assert.equal(npcRules('follow','drive').speed,r.speed);
 assert.equal(n.step(5,[0,0],[0,0],true),null,'chase must not fail merely for exceeding 200m');assert(n.distance>200);
 assert.equal(n.step(100,[0,0],[0,0],true),'failure');
});
test('chase swept contact catches a fast crossing before finish, not after or at tie',()=>{
 assert(contactTime([0,0],[0,100],[0,40],[0,50],2)!<1);
 const create=()=>new NativeNpcObjective([[0,0],[0,100]],{kind:'chase',speed:10,headStart:10,radius:0});
 assert.equal(create().step(10,[0,0],[0,200],true),'success');
 assert.equal(create().step(10,[0,0],[0,100],true),'failure','player reaches goal after NPC');
 assert.equal(create().step(9,[0,0],[0,100],true),'failure','exact simultaneous finish is not before');
 assert.equal(create().step(10,[0,0],[0,200],false),'failure','wrong mode/teleport cannot catch');
});
test('NPC cannot catch across an inside-corner chord',()=>{
 const n=new NativeNpcObjective([[0,0],[0,20],[20,20]],{kind:'chase',speed:40,headStart:0,radius:1});
 assert.equal(n.step(1,[10,10],[10,10],true),'failure');
});
