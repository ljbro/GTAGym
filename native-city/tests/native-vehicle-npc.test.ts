import test from 'node:test';import assert from 'node:assert/strict';
import {NativeVehicleNpc,TARGET_CORNER_SPEED_SCALE,type InterceptPlayer} from '../src/native-vehicle-npc.ts';
import {npcRules} from '../src/native-npc-objective.ts';
import {VehicleRoute} from '../src/native-vehicle-route.ts';
import {streetOverlap} from '../src/ambient-collision.ts';
import {stepCar} from '../src/driving.ts';
const fit={width:2.1,length:4.9,height:1.5,mass:1600};
const world={height:()=>0,clear:()=>true,pushClear:()=>true};
const create=(kind:'chase'|'follow'='chase')=>new NativeVehicleNpc([[0,0],[0,2000]],npcRules(kind,'drive'),fit,world);
const player=(x:number,z:number,speed=0):InterceptPlayer=>({id:{},...fit,x,z,y:0,yaw:0,kind:'car',speed});
test('approaching within old 10m capture radius no longer succeeds',()=>{
 const n=create();n.speed=2;const p=player(0,n.pose.point[1]-7,2);
 assert.equal(n.step(.02,[p.x,p.z],[p.x,p.z],true,p),null);assert(!n.qualified);
});
test('front interception brakes continuously, does not tunnel, and needs a low-speed hold',()=>{
 const n=create(),p=player(0,n.pose.point[1]+6);let firstSpeed=0,outcome:null|'success'|'failure'=null;
 let prior=n.speed;
 for(let i=0;i<800&&!outcome;i++){
  const before:[number,number]=[p.x,p.z];p.speed=Math.max(0,p.speed-9*.02);p.z+=p.speed*.02;
  outcome=n.step(.02,before,[p.x,p.z],true,p);
  p.x+=n.correction.x;p.z+=n.correction.z;p.speed+=n.correction.speed;
  assert(prior-n.speed<=18*.02+1e-7);prior=n.speed;
  assert(streetOverlap(n.body,p)<.01);
  if(n.contacts&&!firstSpeed)firstSpeed=n.speed;
 }
 assert(firstSpeed>25,'first contact must not stop the target');
 assert.equal(outcome,'success');assert(n.hold>=1.5-1e-8);assert(n.contacts<=2,'sustained contact is not repeated impulse spam');
});
test('rear, side, wrong floor, invalid mode and natural slowdowns cannot qualify',()=>{
 for(const scenario of ['rear','side','floor','invalid','corner']){
  const n=create();n.speed=0;
  const p=player(scenario==='side'?1.9:0,n.pose.point[1]+(scenario==='rear'?-4:scenario==='side'?0:4.8));
  if(scenario==='floor')p.y=5;
  for(let i=0;i<120;i++){
   n.step(.02,[p.x,p.z],[p.x,p.z],scenario!=='invalid'&&scenario!=='corner',p);
   p.x+=n.correction.x;p.z+=n.correction.z;p.speed+=n.correction.speed;
  }
  assert.notEqual(n.outcome,'success',scenario);assert(!n.qualified,scenario);
 }
});
test('leaving the front blocking zone resets hold and target accelerates again',()=>{
 const n=create();n.speed=2;n.qualified=true;n.hold=1;
 for(let i=0;i<100;i++){const p=player(30,n.pose.point[1]);n.step(.02,[p.x,p.z],[p.x,p.z],true,p);}
 assert(!n.qualified);assert.equal(n.hold,0);assert(n.speed>6);
 const frozen=n.snapshot;n.step(0,[0,0],[0,0],true);assert.deepEqual(n.snapshot,frozen);
});
test('NPC-initiated impacts into parked roadblocks brake and complete without player throttle',()=>{
 for(const hz of [30,60,120])for(const angle of [0,Math.PI/2,-Math.PI/2,Math.PI,.3,-.6,1.2]){
  const n=create(),p={...player(0,n.pose.point[1]+7),yaw:angle,steer:0,distance:0},dt=1/hz;
  // Oblique cars hold their brake, otherwise the genuine impact can make
  // them coast sideways out of the lane. Axis-aligned cars need no input.
  const brake=Math.abs(Math.sin(angle)*Math.cos(angle))>.01;
  let firstSpeed=0;
  for(let i=0;i<15*hz&&!n.outcome;i++){
   const before:[number,number]=[p.x,p.z],prior=n.speed;
   stepCar(p,{throttle:0,steer:0,handbrake:brake},dt);
   n.step(dt,before,[p.x,p.z],true,p);
   p.x+=n.correction.x;p.z+=n.correction.z;p.speed+=n.correction.speed;
   assert(prior-n.speed<=18*dt+1e-7,'no instant target stop');
   assert(streetOverlap(n.body,p)<.01,'no persistent penetration');
   if(n.contacts&&!firstSpeed)firstSpeed=n.speed;
  }
  assert(firstSpeed>25);assert.equal(n.outcome,'success',`${hz} Hz, yaw ${angle}`);
  assert(n.hold>=1.5-1e-8);
 }
});
test('actual angled bumper contact, not its empty projected corner, maintains the blocking gate',()=>{
 const n=create(),p=player(0,n.pose.point[1]+7);p.yaw=.6;
 let contacted=false;
 for(let i=0;i<600&&!n.outcome;i++){
  const before:[number,number]=[p.x,p.z];p.speed=0;
  n.step(1/60,before,before,true,p);p.x+=n.correction.x;p.z+=n.correction.z;
  if(n.contacts){contacted=true;assert(n.qualified);assert.equal(n.snapshot.lost,0);}
 }
 assert(contacted);assert.equal(n.outcome,'success');assert(Math.abs(p.x)<.01,'front pressure must not teleport the blocker sideways');
});
function sideImpact(side:number,impactSpeed=18,mass=1600,kind:'chase'|'follow'='chase'){
 const n=new NativeVehicleNpc([[0,0],[0,2000]],npcRules(kind,'drive'),{...fit,mass},world);n.speed=24;
 const p=player(side*((fit.width+fit.length)/2-.04),n.pose.point[1],impactSpeed);p.yaw=-side*Math.PI/2;
 const before:[number,number]=[p.x,p.z];p.x+=Math.sin(p.yaw)*p.speed*.02;
 n.step(.02,before,[p.x,p.z],true,p);const firstSpeed=n.speed;let minimum=n.speed,playerReaction=n.correction.speed;
 for(let i=0;i<75;i++){
  const q=player(80,n.pose.point[1]),prior=n.speed;n.step(.02,[q.x,q.z],[q.x,q.z],true,q);minimum=Math.min(minimum,n.speed);
  assert(prior-n.speed<=18*.02+1e-7);assert.equal(n.correction.speed,0,'pending reaction must not affect a distant player');
 }
 return {n,firstSpeed,minimum,playerReaction};
}
test('left and right impacts brake the NPC without granting interception success',()=>{
 const left=sideImpact(-1),right=sideImpact(1);
 for(const {n,firstSpeed,minimum} of [left,right]){
  assert(n.contacts>0);assert(firstSpeed>23,'contact must not instantly stop the target');
  assert(minimum<21,'a side impact must produce observable braking');assert(!n.qualified);assert.equal(n.outcome,null);
  const speed=n.speed;for(let i=0;i<100;i++){const p=player(80,n.pose.point[1]);n.step(.02,[p.x,p.z],[p.x,p.z],true,p);}
  assert(n.speed>speed+3,'target must gradually accelerate again after the impact');assert.equal(n.snapshot.collisionSpeedLimit,null);
 }
 assert(Math.abs(left.minimum-right.minimum)<.01,'left/right response must be symmetric');
});
test('stronger impacts brake more, heavy targets resist more, following targets also react',()=>{
 assert(sideImpact(-1,22).minimum<sideImpact(-1,5).minimum-2);
 assert(sideImpact(-1,18,1600).minimum<sideImpact(-1,18,7000).minimum-1);
 assert(sideImpact(-1,18,1600,'follow').minimum<21);
});
test('side impact reacts on the player axis; invalid, different-floor and non-closing contacts do not brake',()=>{
 assert(sideImpact(-1).playerReaction<0);assert(sideImpact(1).playerReaction<0);
 for(const scenario of ['invalid','floor','parallel']){
  const n=create();n.speed=24;const p=player(-2,n.pose.point[1],24);p.yaw=scenario==='parallel'?0:Math.PI/2;
  if(scenario==='floor')p.y=5;
  n.step(.02,[p.x,p.z],[p.x,p.z],scenario!=='invalid',p);
  assert.equal(n.snapshot.collisionSpeedLimit,null,scenario);assert(n.speed>=24,scenario);
 }
});
test('a gentle side touch does not suppress a later shove; sustained pressure brakes without instant stopping',()=>{
 const n=create();n.speed=24;
 const touch=(speed:number)=>{
  const p=player(-3.49,n.pose.point[1],speed);p.yaw=Math.PI/2;const prior=n.speed;
  n.step(.02,[p.x,p.z],[p.x+speed*.02,p.z],true,p);
  assert(prior-n.speed<=18*.02+1e-7);assert(!n.qualified);assert.equal(n.outcome,null);
 };
 touch(.1);assert.equal(n.snapshot.collisionSpeedLimit,null);
 touch(18);assert(n.snapshot.collisionSpeedLimit!==null);
 for(let i=0;i<100;i++)touch(18);
 assert(n.speed<15);assert.equal(n.contacts,1,'continuous pressure is one contact');
});
test('car, van and heavy tractor interception works at 30/60/120 Hz',()=>{
 for(const hz of [30,60,120])for(const target of [
  fit,
  {width:2.25,length:5.4,height:2.5,mass:2600},
  {width:2.63,length:8.13,height:4.13,mass:7000},
 ]){
  const n=new NativeVehicleNpc([[0,0],[0,2000]],npcRules('chase','drive'),target,world),dt=1/hz;
  const p=player(0,n.pose.point[1]+(target.length+fit.length)/2+.5);let outcome=null;
  for(let i=0;i<15*hz&&!outcome;i++){
   const before:[number,number]=[p.x,p.z],speed=n.speed;
   p.speed=Math.max(0,p.speed-9*dt);p.z+=p.speed*dt;
   outcome=n.step(dt,before,[p.x,p.z],true,p);
   p.x+=n.correction.x;p.z+=n.correction.z;p.speed+=n.correction.speed;
   assert(speed-n.speed<=18*dt+1e-7);assert(streetOverlap(n.body,p)<.01);
  }
  assert.equal(outcome,'success',`${target.mass} kg at ${hz} Hz`);
 }
});
test('target reaching endpoint fails; follow waits for endpoint and retains distance limit',()=>{
 const n=create();n.distance=n.length-.1;assert.equal(n.step(.02,[0,0],[0,0],true),'failure');
 const f=create('follow');assert.equal(f.step(.02,[0,0],[0,0],true),null);
 assert.equal(f.step(.02,[500,0],[500,0],true),'failure');
 const g=create('follow');g.distance=g.length-.1;assert.equal(g.step(.02,[0,g.length],[0,g.length],true),'success');
});
test('vehicles brake before corners, spend time turning, accelerate after and keep continuous yaw',()=>{
 const n=new NativeVehicleNpc([[0,0],[0,120],[120,120],[120,300]],npcRules('chase','drive'),fit,world);
 let minimum=100,maxTurn=0,turnSeconds=0,time=0;
 while(!n.arrived&&time<120){
  const yaw=n.pose.yaw,speed=n.speed;n.step(.02,[500,500],[500,500],false);time+=.02;
  const d=Math.abs(Math.atan2(Math.sin(n.pose.yaw-yaw),Math.cos(n.pose.yaw-yaw)));maxTurn=Math.max(maxTurn,d);
  if(d>.002){turnSeconds+=.02;minimum=Math.min(minimum,n.speed);}
  assert(speed-n.speed<=8*.02+1e-7);
 }
 assert(n.arrived);assert(minimum<13);assert(turnSeconds>3);assert(maxTurn<.05);assert(time>n.length/n.rules.speed+3);
 const r=new VehicleRoute([[0,0],[0,40],[40,40]],31.8,()=>false);
 assert(r.points.every(p=>p[0]===0||p[1]===40),'unsafe corner cuts retain original corridor');
});
test('ordinary turns retain 30–45 km/h, narrow turns slow down and straight cruise is unchanged',()=>{
 const ordinary=new VehicleRoute([[0,0],[0,120],[120,120]],31.8);
 const narrow=new VehicleRoute([[0,0],[0,120],[120,120]],31.8,(x,z)=>x<1||z>119);
 const normalMin=Math.min(...ordinary.limits),narrowMin=Math.min(...narrow.limits);
 assert(normalMin>=30/3.6&&normalMin<=45/3.6);
 assert(narrowMin<normalMin*.8,'geometry clearance must still slow down tight corners');
 const straight=new VehicleRoute([[0,0],[0,2000]],31.8);
 assert(straight.limits.every(v=>v===31.8));
 for(let i=1;i<ordinary.limits.length;i++){
  const ds=ordinary.distances[i]-ordinary.distances[i-1];
  assert(ordinary.limits[i-1]**2<=ordinary.limits[i]**2+12*ds+1e-7,'braking envelope is retained');
 }
});
test('chase and follow corners are 20 percent faster without changing geometry or straight cruise',()=>{
 const points:[number,number][]=[[0,0],[0,120],[120,120]],baseline=new VehicleRoute(points,31.8),oldMinimum=Math.min(...baseline.limits);
 for(const kind of ['chase','follow'] as const){
  const n=new NativeVehicleNpc(points,npcRules(kind,'drive'),fit,world);
  assert.deepEqual(n.route.points,baseline.points);
  assert(Math.abs(Math.min(...n.route.limits)/oldMinimum-TARGET_CORNER_SPEED_SCALE)<1e-9);
  assert(Math.abs(n.rules.speed-31.8)<1e-9);assert(n.route.limits.every(v=>v<=31.8));
  const tight=new NativeVehicleNpc(points,npcRules(kind,'drive'),fit,{...world,clear:(x:number,z:number)=>x<1||z>119});
  assert(Math.min(...tight.route.limits)<Math.min(...n.route.limits)*.8);
  for(let i=1;i<n.route.limits.length;i++){
   const ds=n.route.distances[i]-n.route.distances[i-1];
   assert(n.route.limits[i-1]**2<=n.route.limits[i]**2+12*ds+1e-7);
  }
 }
});
test('unobstructed NPC accelerates at 4.5 m/s² after a slow section, without exceeding cruise',()=>{
 for(const kind of ['chase','follow'] as const){
  const n=create(kind);n.speed=10;
  for(let i=0;i<60;i++){
   const p=player(80,n.pose.point[1]),before=n.speed;n.step(1/60,[p.x,p.z],[p.x,p.z],true,p);
   assert(n.speed-before<=4.5/60+1e-7);
  }
  assert(Math.abs(n.speed-14.5)<1e-6);
  for(let i=0;i<600;i++){const p=player(80,n.pose.point[1]);n.step(1/60,[p.x,p.z],[p.x,p.z],true,p);}
  assert(Math.abs(n.speed-31.8)<1e-7);assert(n.speed<=n.rules.speed);
 }
});
