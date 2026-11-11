import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {NATIVE_FLIGHT_TASKS,NativeFlightMission,NATIVE_FLIGHT_RUNWAYS,FLIGHT_ARRIVAL,nativeFlightSurfaceAt} from '../src/native-flight-route.ts';
import {NATIVE_AIR_TASKS as NATIVE_TASKS} from '../src/native-task-catalog.ts';
import {FlightSimulation} from '../src/city-flight-simulation.ts';
import {HelicopterSimulation} from '../src/city-helicopter-simulation.ts';
import {FlightCityCollision} from '../src/city-flight-collision.ts';
import {flightTestControls} from './flight-pilot.mjs';
const data=JSON.parse(fs.readFileSync(new URL('../../city/city.json',import.meta.url),'utf8'));
const collision=new FlightCityCollision(data,(x,z)=>nativeFlightSurfaceAt(x,z)??0);
const aircraft=(model:string)=>{const sim=model==='plane'?new FlightSimulation():new HelicopterSimulation(model as 'frogger'|'cargobob');sim.runways=NATIVE_FLIGHT_RUNWAYS;return sim;};
test('all eight flight tasks have standalone city routes, aircraft and landing sites',()=>{
 assert.equal(NATIVE_TASKS.length,8);assert.equal(NATIVE_TASKS.filter(t=>t.mode==='flight').length,8);
 assert.equal(new Set(NATIVE_TASKS.map(t=>t.id)).size,8);
 assert.deepEqual(NATIVE_FLIGHT_TASKS.map(t=>t.id).sort(),NATIVE_TASKS.map(t=>t.id).sort());
 for(const config of NATIVE_FLIGHT_TASKS){
  assert.equal(config.spawn.y,3.25);assert.ok(config.landingPoint.z<data.meta.extent[3]-200);
  assert(!('annotation' in config));
  if(config.id==='c08-n07'){assert.equal(config.route.length,0);continue;}
  assert.ok(config.route.length>=2);
  config.route.forEach((point,i)=>{assert.equal(point.sourceIndex,i);assert([point.x,point.y,point.z].every(Number.isFinite));});
 }
});
for(const config of NATIVE_FLIGHT_TASKS)test(config.id+' completes its source objective and city landing using only flight controls',()=>{
 const sim=aircraft(config.model);sim.start(config.spawn,config.yaw);const mission=new NativeFlightMission(config.id),context={...config};mission.board();
 for(let i=0;i<480*60&&!mission.outcome;i++){
  const keys=flightTestControls(sim,mission.stage,mission.navigationTarget,FLIGHT_ARRIVAL,context);
  sim.step(new Set(keys),1/60,i*1000/60,(a,b)=>collision.sweep(a,b),data.meta.extent);mission.step(sim,1/60,false,data.meta.extent);
 }
 assert.equal(mission.outcome,'success',JSON.stringify({reason:mission.reason,stage:mission.stage,checkpoint:mission.checkpoint,hit:sim.hit}));
 assert.equal(mission.checkpoint,config.route.length);assert.equal(sim.crashes,0);assert.equal(sim.landings,1);assert.equal(sim.takeoffs,1);
 assert.equal(sim.groundRunwayId,FLIGHT_ARRIVAL.id);assert.ok(sim.speed<=1.5);assert.ok(sim.throttle<.05);assert.ok(mission.stoppedFor>=2-1e-8);
 if(config.objective==='hover')assert.ok(mission.hoveredFor>=3-1e-8);
 if(mission.hasNpc)assert.equal(mission.approached,true);
});
test('skipping route points, fast flyovers and short hovers cannot satisfy helicopter objectives',()=>{
 const mission=new NativeFlightMission('c08-n04'),sim=aircraft('frogger');sim.start(mission.config.spawn,mission.config.yaw);mission.board();
 sim.takeoffs=1;sim.onGround=false;sim.pose={...mission.config.route.at(-1)!,yaw:0,pitch:0,roll:0};
 mission.step(sim,.1,false,data.meta.extent);assert.equal(mission.checkpoint,0);assert.equal(mission.stage,'route');
 for(const waypoint of mission.config.route){sim.pose={...waypoint,yaw:0,pitch:0,roll:0};mission.step(sim,.1,false,data.meta.extent);}
 assert.equal(mission.stage,'hover');sim.speed=15;for(let i=0;i<50;i++)mission.step(sim,.1,false,data.meta.extent);assert.equal(mission.hoveredFor,0);
 sim.speed=0;for(let i=0;i<20;i++)mission.step(sim,.1,false,data.meta.extent);assert.equal(mission.stage,'hover');
 const paused=JSON.stringify(mission);mission.step(sim,30,true,data.meta.extent);assert.equal(JSON.stringify(mission),paused);
 sim.pose.x+=30;mission.step(sim,.1,false,data.meta.extent);assert.equal(mission.hoveredFor,0);assert.equal(mission.outcome,null);
});
