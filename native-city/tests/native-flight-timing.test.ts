import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {NATIVE_FLIGHT_TASKS,NativeFlightMission,NATIVE_FLIGHT_RUNWAYS,FLIGHT_ARRIVAL} from '../src/native-flight-route.ts';
import {nativeFlightTiming} from '../src/native-flight-timing.ts';
import {FlightSimulation} from '../src/city-flight-simulation.ts';
const repo=new URL('../../',import.meta.url),data=JSON.parse(fs.readFileSync(new URL('city/city.json',repo),'utf8'));
for(const config of NATIVE_FLIGHT_TASKS)test(config.id+' retains a valid calibrated flight time budget',()=>{
 const timing=nativeFlightTiming(config.id);
 assert(Number.isInteger(timing.expertTicks)&&timing.expertTicks>0);
 assert.equal(timing.expertSeconds,timing.expertTicks/60);
 assert.equal(timing.maxDurationSeconds,1.5*timing.expertSeconds);
 assert.equal(new NativeFlightMission(config.id).maxDuration,timing.maxDurationSeconds);
});
test('all flight stages time out, pauses freeze clock and restarts reset it',()=>{
 for(const config of NATIVE_FLIGHT_TASKS)for(const stage of ['boarding','takeoff','route','approach','hover','recovery','landing'] as const){
  // M42 has no route/recovery points; use a navigation/hover config for those.
  if((stage==='route'||stage==='hover')&&!config.route.length||stage==='recovery'&&!config.recovery.length)continue;
  const m=new NativeFlightMission(config.id),sim=new FlightSimulation();sim.runways=NATIVE_FLIGHT_RUNWAYS;sim.start(config.spawn,config.yaw);
  m.stage=stage;m.elapsed=m.maxDuration-.05;
  const before=JSON.stringify(m);m.step(sim,99,true,data.meta.extent);assert.equal(JSON.stringify(m),before);
  m.step(sim,NaN,false,data.meta.extent);m.step(sim,-1,false,data.meta.extent);assert.equal(JSON.stringify(m),before);
  assert.equal(m.step(sim,.05,false,data.meta.extent),'failure',config.id+'/'+stage);assert.match(m.reason,/timed out/i);assert.equal(m.elapsed,m.maxDuration);
  assert.equal(m.step(sim,10,false,data.meta.extent),'failure');assert.equal(m.elapsed,m.maxDuration);
  const restart=new NativeFlightMission(config.id);assert.equal(restart.elapsed,0);assert.equal(restart.outcome,null);assert.equal(restart.maxDuration,m.maxDuration);
 }
});
test('no early timeout and valid touchdown completion wins exactly at deadline',()=>{
 const m=new NativeFlightMission('c08-n01'),sim=new FlightSimulation();sim.runways=NATIVE_FLIGHT_RUNWAYS;sim.start(m.config.landingPoint,m.config.yaw);
 m.elapsed=m.maxDuration-.2;assert.equal(m.step(null,.1,false,data.meta.extent),null);
 m.stage='landing';m.stoppedFor=1.9;sim.onGround=true;sim.groundRunwayId=FLIGHT_ARRIVAL.id;sim.landings=1;sim.throttle=0;sim.speed=0;
 assert.equal(m.step(sim,.1,false,data.meta.extent),'success');assert.ok(Math.abs(m.elapsed-m.maxDuration)<1e-8,'deadline floating-point roundoff only');
});
test('task system publishes flight deadline and retains failure dialog pipeline',()=>{
 const source=fs.readFileSync(new URL('../src/native-task-system.ts',import.meta.url),'utf8');
 assert.match(source,/state.maxDuration=flightState.maxDuration/);
 assert.match(source,/if\(outcome\)\{finish\(outcome,flightState.reason\)/);
});
