import test from 'node:test';
import assert from 'node:assert/strict';
import {FlightSimulation} from '../src/city-flight-simulation.ts';

const extent=[-20000,-20000,20000,20000];
const start=()=>{const s=new FlightSimulation();s.start({x:0,y:1000,z:0},0);return s;};
function advance(s:FlightSimulation,seconds:number,keys:string[]=[],dt=1/60){
 for(let i=0;i<Math.round(seconds/dt);i++)s.step(new Set(keys),dt,i*dt*1000,()=>null,extent);
}

test('unpowered spawn has no automatic forward speed or lift and falls under gravity',()=>{
 const s=start();assert.equal(s.throttle,0);assert.equal(s.speed,0);assert.equal(s.status.engineOn,false);
 advance(s,3);
 assert.equal(s.pose.x,0);assert.equal(s.pose.z,0);assert.ok(s.pose.y<970);
 assert.ok(s.velocity.y<-20);assert.equal(s.stalled,true);assert.equal(s.throttle,0);
});

test('held throttle produces thrust; release returns to idle without automatically switching off the engine',()=>{
 const powered=start(),released=start();advance(powered,8,['KeyW']);advance(released,8,['KeyW']);
 assert.ok(powered.pose.z>100);assert.ok(powered.throttle>.99);
 advance(powered,12,['KeyW']);advance(released,12);
 assert.equal(released.throttle,0);assert.equal(released.status.engineOn,true);
 released.stopEngine();assert.equal(released.status.engineOn,false);
 assert.ok(released.speed<powered.speed-15);
 assert.ok(released.pose.y<powered.pose.y-10);assert.ok(released.velocity.y<0);
});

test('attitude is controlled by the pilot; releasing controls does not level the aircraft',()=>{
 const s=start();advance(s,10,['KeyW']);advance(s,.5,['KeyW','Numpad5','Numpad6']);
 const pitch=s.pose.pitch,roll=s.pose.roll;
 assert.ok(pitch>.1&&roll>.2);advance(s,1,['KeyW']);
 assert.equal(s.pose.pitch,pitch);assert.equal(s.pose.roll,roll);
});

test('pulling too hard causes stall and cannot create unlimited lift',()=>{
 const s=start();advance(s,12,['KeyW']);advance(s,24,['KeyW','Numpad5']);
 assert.equal(s.stalled,true);assert.ok(s.angleOfAttack>.32);assert.ok(s.pose.pitch>1);
});

test('gravity alone can cause a swept terrain collision and a task failure',()=>{
 const s=new FlightSimulation();s.start({x:0,y:30,z:0},0);let result;
 for(let i=0;i<600&&s.phase==='flying';i++)result=s.step(new Set(),1/60,i*1000/60,(_a,b)=>b.y<=0?{kind:'terrain',point:b}:null,extent);
 assert.equal(result,'crashed');assert.equal(s.phase,'exploding');assert.equal(s.crashes,1);
});

test('fixed substeps reproduce dynamics and reset clears engine, velocity and attitude',()=>{
 const a=start(),b=start();advance(a,6,['KeyW']);advance(b,6,['KeyW'],.05);
 for(const axis of ['x','y','z'] as const)assert.ok(Math.abs(a.pose[axis]-b.pose[axis])<1e-7);
 a.start({x:0,y:1000,z:0},0);assert.equal(a.throttle,0);assert.equal(a.speed,0);assert.deepEqual(a.velocity,{x:0,y:0,z:0});assert.equal(a.pose.pitch,0);
});

import {FLIGHT_GEAR_CLEARANCE,runwayPoint} from '../src/city-flight-ground.ts';
import {NATIVE_FLIGHT_RUNWAYS,FLIGHT_DEPARTURE,nativeFlightSurfaceAt,NATIVE_FLIGHT_TASK} from '../src/native-flight-route.ts';
import {FlightCityCollision} from '../src/city-flight-collision.ts';
const groundCollision=new FlightCityCollision({buildings:[]} as any,(x,z)=>nativeFlightSurfaceAt(x,z)??0);
const groundSweep=(a:any,b:any)=>groundCollision.sweep(a,b);
function groundPlane(){const sim=new FlightSimulation();sim.runways=NATIVE_FLIGHT_RUNWAYS;sim.start(NATIVE_FLIGHT_TASK.spawn,NATIVE_FLIGHT_TASK.yaw);return sim;}

test('parked aircraft remains stationary without power, accelerates on wheels and requires rotation',()=>{
 const sim=groundPlane(),pose={...sim.pose};
 for(let i=0;i<600;i++)sim.step(new Set(),1/60,i*1000/60,groundSweep,extent);
 assert.deepEqual(sim.pose,pose);assert.equal(sim.onGround,true);assert.equal(sim.phase,'flying');
 for(let i=0;i<480;i++)sim.step(new Set(['KeyW']),1/60,i*1000/60,groundSweep,extent);
 assert.ok(sim.speed>32);assert.equal(sim.onGround,true);assert.equal(sim.takeoffs,0);
 for(let i=0;i<120&&sim.onGround;i++)sim.step(new Set(['KeyW','Numpad5']),1/60,i*1000/60,groundSweep,extent);
 assert.equal(sim.onGround,false);assert.equal(sim.takeoffs,1);assert.ok(sim.pose.y>pose.y);
});

test('throttle down and wheel brakes bring ground motion to rest without reversing',()=>{
 const sim=groundPlane();for(let i=0;i<420;i++)sim.step(new Set(['KeyW']),1/60,i*1000/60,groundSweep,extent);
 assert.ok(sim.speed>25);
 for(let i=0;i<600;i++)sim.step(new Set(['KeyS']),1/60,i*1000/60,groundSweep,extent);
 assert.equal(sim.phase,'flying');assert.equal(sim.onGround,true);assert.equal(sim.throttle,0);assert.ok(sim.speed<.001);assert.equal(sim.landings,0);
});

test('landing checks reject hard, banked, sideways and excessive-speed touchdowns',()=>{
 for(const kind of ['hard','banked','sideways','fast','safe']){
  const sim=groundPlane(),r=FLIGHT_DEPARTURE,p=runwayPoint(r,0);
  sim.start({...p,y:r.y+FLIGHT_GEAR_CLEARANCE+.12},r.yaw);
  const speed=kind==='fast'?80:43;
  sim.velocity={x:Math.sin(r.yaw)*speed,y:kind==='hard'?-12:-3,z:Math.cos(r.yaw)*speed};sim.speed=Math.hypot(speed,sim.velocity.y);
  if(kind==='banked')sim.pose.roll=.4;if(kind==='sideways')sim.pose.yaw+=Math.PI/2;
  for(let i=0;i<120&&!sim.onGround&&sim.phase==='flying';i++)sim.step(new Set(),1/120,i*1000/120,groundSweep,extent);
  if(kind==='safe'){assert.equal(sim.phase,'flying');assert.equal(sim.onGround,true);assert.equal(sim.landings,1);}
  else {assert.equal(sim.phase,'exploding',kind);assert.equal(sim.landings,0);assert.match(sim.hit!.reason!,/Crashed on landing/i);}
 }
});

test('boarding starts the engine in place; starter delay prevents thrust until the engine is ready',()=>{
 const sim=groundPlane(),pose={...sim.pose};sim.startEngine();
 advance(sim,1,['KeyW']);assert.equal(sim.engineState,'starting');assert.equal(sim.throttle,0);assert.deepEqual(sim.pose,pose);assert.ok(sim.engineRpm>0);
 advance(sim,2);assert.equal(sim.engineState,'running');assert.deepEqual(sim.pose,pose);assert.equal(sim.throttle,0);
 advance(sim,1,['ShiftLeft','KeyX','KeyQ','KeyE']);assert.deepEqual(sim.pose,pose,'old controls must not accelerate or steer');
});
test('aircraft attitude uses numpad only; arrows and top-row digits do not steer',()=>{
 const a=start(),b=start();a.speed=b.speed=60;a.velocity.z=b.velocity.z=60;
 advance(a,.2,['Numpad5','Numpad6']);advance(b,.2,['ArrowDown','ArrowRight']);
 assert.ok(a.pose.pitch>0);assert.ok(a.pose.roll>0);assert.equal(b.pose.pitch,0);assert.equal(b.pose.roll,0);
 advance(b,.2,['ArrowUp','ArrowLeft','Digit5','Digit6']);assert.equal(b.pose.pitch,0);assert.equal(b.pose.roll,0);
 advance(b,.2,['Numpad8','Numpad4']);assert.ok(b.pose.pitch<0);assert.ok(b.pose.roll<0);
 const yaw=start();yaw.speed=60;yaw.velocity.z=60;advance(yaw,.2,['KeyD']);assert.ok(yaw.pose.yaw>0);assert.equal(yaw.pose.roll,0);assert.equal(yaw.pose.pitch,0);
 const throttle=groundPlane();advance(throttle,5,['KeyW']);assert.equal(throttle.pose.pitch,0);assert.ok(throttle.speed>0);assert.equal(throttle.onGround,true);
});
test('G changes gear once per press, works during a short tap, and cannot retract gear on the ground',()=>{
 const ground=groundPlane();ground.controlKey('KeyG',true);assert.equal(ground.gearTargetDown,true);
 const sim=start();advance(sim,1,['KeyG']);assert.equal(sim.gearTargetDown,false);assert.equal(sim.gearProgress,0);
 advance(sim,1,['KeyG']);assert.equal(sim.gearProgress,0,'holding G must not repeatedly toggle');
 sim.controlKey('KeyG',false);sim.controlKey('KeyG',true);sim.controlKey('KeyG',false);advance(sim,1);
 assert.equal(sim.gearProgress,1);assert.equal(sim.status.gearDown,true);
});
test('a geometrically safe approach still crashes when landing gear is retracted or not fully extended',()=>{
 for(const progress of [0,.5]){
  const sim=groundPlane(),r=FLIGHT_DEPARTURE,p=runwayPoint(r,0);sim.start({...p,y:r.y+FLIGHT_GEAR_CLEARANCE+.12},r.yaw);
  sim.gearProgress=progress;sim.gearTargetDown=progress>0;sim.velocity={x:Math.sin(r.yaw)*43,y:-2,z:Math.cos(r.yaw)*43};sim.speed=43;
  for(let i=0;i<30&&sim.phase==='flying';i++)sim.step(new Set(),1/120,i*1000/120,groundSweep,extent);
  assert.equal(sim.phase,'exploding');assert.equal(sim.landings,0);assert.match(sim.hit!.reason!,/Landing gear not fully lowered/i);
 }
});
