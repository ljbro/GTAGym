import test from 'node:test';
import assert from 'node:assert/strict';
import {HelicopterSimulation} from '../src/city-helicopter-simulation.ts';
import {NATIVE_FLIGHT_RUNWAYS,NATIVE_FLIGHT_TASK,FLIGHT_ARRIVAL} from '../src/native-flight-sites.ts';
const extent=[-10000,-10000,10000,10000];
function advance(sim:HelicopterSimulation,seconds:number,keys:string[]=[]){for(let i=0;i<seconds*120;i++)sim.step(new Set(keys),1/120,i*1000/120,()=>null,extent);}
test('both helicopter models start parked with stopped rotors and lift off only under power',()=>{
 for(const model of ['frogger','cargobob'] as const){
  const sim=new HelicopterSimulation(model);sim.runways=NATIVE_FLIGHT_RUNWAYS;sim.start(NATIVE_FLIGHT_TASK.spawn,0);const initial={...sim.pose};
  advance(sim,10);assert.deepEqual(sim.pose,initial);assert.equal(sim.rotorRpm,0);assert.equal(sim.takeoffs,0);
  advance(sim,5,['KeyW']);assert.equal(sim.onGround,false);assert.equal(sim.takeoffs,1);assert.ok(sim.pose.y>20);assert.equal(sim.pose.z,initial.z);
 }
});
test('unpowered helicopter falls; powered neutral collective does not create forward flight',()=>{
 const sim=new HelicopterSimulation();sim.start({x:0,y:200,z:0},0);advance(sim,3);
 assert.equal(sim.pose.z,0);assert.ok(sim.pose.y<175);assert.ok(sim.velocity.y<0);
 sim.start({x:0,y:200,z:0},0);sim.engineState='running';sim.rotorRpm=1;sim.throttle=9.81/18;advance(sim,5,[]);
 assert.ok(Math.abs(sim.pose.y-200)<1e-8);assert.equal(sim.speed,0);
 advance(sim,1,['Numpad8']);assert.ok(sim.pose.pitch<0);assert.ok(sim.velocity.z>0);
 const pitch=sim.pose.pitch;advance(sim,1,[]);assert.equal(sim.pose.pitch,pitch,'releasing cyclic does not enable autopilot');
});
test('rotor tips use swept collision and a building hit fails the flight',()=>{
 const sim=new HelicopterSimulation();sim.start({x:0,y:50,z:0},0);
 const result=sim.step(new Set(),1/60,0,(_a,b)=>b.x>5?{point:b,kind:'building',id:'rotor-obstacle'}:null,extent);
 assert.equal(result,'crashed');assert.equal(sim.crashes,1);assert.equal(sim.hit?.id,'rotor-obstacle');
});
test('helicopter touchdown rejects excessive sink, speed and tilt; ground support ends at the runway edge',()=>{
 for(const kind of ['safe','sink','speed','tilt']){
  const sim=new HelicopterSimulation();sim.runways=NATIVE_FLIGHT_RUNWAYS;
  sim.start({x:FLIGHT_ARRIVAL.x,y:3.4,z:FLIGHT_ARRIVAL.z},0);
  sim.velocity={x:kind==='speed'?10:0,y:kind==='sink'?-7:-1,z:0};if(kind==='tilt')sim.pose.roll=.5;
  for(let i=0;i<20&&sim.phase==='flying'&&!sim.onGround;i++)sim.step(new Set(),1/120,i*1000/120,()=>null,extent);
  assert.equal(sim.phase,kind==='safe'?'flying':'exploding',kind);assert.equal(sim.landings,kind==='safe'?1:0);
 }
 const sim=new HelicopterSimulation();sim.runways=NATIVE_FLIGHT_RUNWAYS;sim.start(NATIVE_FLIGHT_TASK.spawn,0);
 sim.pose.x+=100;sim.step(new Set(),1/60,0,()=>null,extent);assert.equal(sim.phase,'exploding');
});
test('engine idles after boarding without lifting the helicopter; W rises and S descends without changing pitch',()=>{
 const sim=new HelicopterSimulation();sim.runways=NATIVE_FLIGHT_RUNWAYS;sim.start(NATIVE_FLIGHT_TASK.spawn,0);sim.startEngine();const p={...sim.pose};
 advance(sim,4);assert.equal(sim.engineState,'running');assert.ok(sim.rotorRpm>.98);assert.equal(sim.throttle,0);assert.deepEqual(sim.pose,p);
 advance(sim,4,['KeyW']);assert.equal(sim.onGround,false);assert.equal(sim.pose.pitch,0);assert.equal(sim.pose.z,p.z);
 advance(sim,5,['KeyS']);assert.ok(sim.velocity.y<0);assert.equal(sim.pose.pitch,0);
});
test('cutting an airborne helicopter engine removes neutral collective and gravity takes over',()=>{
 const sim=new HelicopterSimulation();sim.start({x:0,y:200,z:0},0);sim.engineState='running';sim.rotorRpm=1;sim.throttle=9.81/18;
 advance(sim,2);assert.equal(sim.pose.y,200);sim.stopEngine();advance(sim,3);assert.equal(sim.status.engineOn,false);assert.ok(sim.pose.y<180);assert.ok(sim.rotorRpm<.3);
});
