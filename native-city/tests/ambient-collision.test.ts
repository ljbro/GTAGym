import test from 'node:test';
import assert from 'node:assert/strict';
import {streetOverlap,streetSweepClear,streetQueue,recoverStreetMotion,type StreetBody} from '../src/ambient-collision.ts';
import {detectPedestrianImpact} from '../src/pedestrian-impact.ts';
const car=(x=0,z=0,extra:Partial<StreetBody>={}):StreetBody=>({id:{},x,z,y:0,yaw:0,width:2.1,length:4.9,height:1.8,kind:'car',...extra});

test('pedestrian impacts use the actual driven model dimensions, not a sports car for every model',()=>{
 const before={x:0,z:-5,yaw:0,speed:10,groundY:0},after={...before,z:5},person={x:1,y:0,z:0};
 assert(detectPedestrianImpact(before,after,person));
 assert.equal(detectPedestrianImpact(before,after,person,{width:.74,length:2.2,height:1.16}),null);
 assert(detectPedestrianImpact(before,after,{...person,x:0},{width:.74,length:2.2,height:1.16}));
 assert(detectPedestrianImpact(before,after,{...person,x:1.3,y:2},{width:2.6,length:8,height:4.1}));
});

test('front contact permits reversing out; rear contact permits forward escape',()=>{
 const p=car(),front=car(0,4.7),rear=car(0,-4.7);
 assert(streetOverlap(p,front)>0);
 assert(streetSweepClear(p,{...p,z:-1},[front]));
 assert(!streetSweepClear(p,{...p,z:.2},[front]));
 assert(streetSweepClear(p,{...p,z:1},[rear]));
 assert(!streetSweepClear(p,{...p,z:-.2},[rear]));
});
test('front/rear overlaps allow outward slide, but never allow deeper penetration',()=>{
 const p=car(),others=[car(0,4.7),car(0,-4.7)];
 assert(streetSweepClear(p,{...p,x:3},others));
 assert(!streetSweepClear(p,{...p,z:.2},others));
 assert(!streetSweepClear(p,{...p,z:-.2},others));
 assert(!streetSweepClear(p,{...p,x:3},[...others,car(3,0)]));
});
test('sweeps stop high speed crossings for cars, motorcycles, bikes, people and long trucks',()=>{
 for(const width of [.7,2.1,2.6])for(const target of [car(),car(0,0,{width:.7,length:1.9,kind:'bike'}),car(0,0,{width:.56,length:.56,kind:'person'})]){
  const p=car(0,-20,{width,length:width===2.6?8:4.9});
  assert(!streetSweepClear(p,{...p,z:20},[target]));
 }
});
test('adjacent lanes and different elevations do not create false contacts/queues',()=>{
 const p=car();assert(!streetQueue(p,[car(3,4)]));assert(!streetQueue(p,[car(0,6,{yaw:Math.PI})]));
 assert(streetQueue(p,[car(0,6)]));
 assert(!streetQueue(p,[car(0,6,{y:8})]));
 assert(streetSweepClear(p,{...p,z:20},[car(0,8,{y:8})]));
 assert(streetSweepClear(p,{...p,z:20},[car(2.3,8)]));
});
test('rotating long vehicle cannot sweep tail through another body',()=>{
 const p=car(0,0,{length:8});assert(!streetSweepClear(p,{...p,yaw:Math.PI/2},[car(3.9,0,{width:.5,length:.5})]));
});
test('blocked NPC reverses first then steers around the obstacle without sideways translation',()=>{
 const obstacle=car(0,0),state={offsetX:0,offsetZ:0,wait:0,side:1};let p=car(0,5,{yaw:Math.PI}),baseZ=5,resumed=false,maxShift=0,firstMove=false,backed=false;
 for(let i=0;i<600;i++){
  const desired={...p,x:0,z:baseZ-.15};
  const move=recoverStreetMotion(p,desired,state,.05,[obstacle],()=>true);
  assert(streetOverlap(move.body,obstacle)<1e-5,'no collision bypass during recovery');
  assert(Math.hypot(move.body.x-p.x,move.body.z-p.z)<.2,'no teleport');
  const dx=move.body.x-p.x,dz=move.body.z-p.z,mid=(move.body.yaw+p.yaw)/2;
  assert(Math.abs(dx*Math.cos(mid)-dz*Math.sin(mid))<.003,'no lateral sliding');
  if(!firstMove&&Math.hypot(dx,dz)>.001){firstMove=true;assert(dz>0,'must reverse before steering');}
  if(move.body.z>7)backed=true;
  if(move.advance)baseZ-=.15;
  if(move.rejoin)baseZ=move.body.z;
  maxShift=Math.max(maxShift,Math.abs(move.body.x));p=move.body;if(p.z< -7){resumed=true;break;}
 }
 assert(resumed);assert(backed);assert(maxShift>2);
});
test('recovery respects walls and red lights, paused dt never moves actors',()=>{
 for(const held of [true,false]){
  const p=car(0,5,{yaw:Math.PI}),s={offsetX:0,offsetZ:0,wait:0,side:1};
  for(let i=0;i<200;i++){
   const move=recoverStreetMotion(p,{...p,z:4.9},s,.05,[car()],()=>false,held);
   assert.deepEqual(move.body,p);assert(!move.advance);
  }
 }
 const p=car(0,5,{yaw:Math.PI}),s={offsetX:0,offsetZ:0,wait:10,side:1};
 assert.deepEqual(recoverStreetMotion(p,{...p,z:4.8},s,0,[car()],()=>true).body,p);
});
