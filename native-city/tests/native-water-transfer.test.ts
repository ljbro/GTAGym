import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {fileURLToPath} from 'node:url';
import {WATER_TRANSFER_SPECS,transferPlatformBlocks} from '../src/native-water-transfer.ts';
import {NativeShoreBoatMotion} from '../src/native-shore-boat-motion.ts';
import {waterWorld} from '../src/native-water-motion.ts';
import {nativeWaterTiming} from '../src/native-water-timing.ts';
import {loadWaterExpertEnvironment} from './water-expert-environment.ts';
import {createWaterExpertRun} from './water-expert-runner.ts';
const repo=new URL('../../',import.meta.url),{env}=await loadWaterExpertEnvironment(fileURLToPath(repo));
const city=JSON.parse(fs.readFileSync(new URL('city/city.json',repo),'utf8'));
for(const spec of WATER_TRANSFER_SPECS){
 test(spec.id+' starts on dry shore, uses a nearby small boat, and cannot win by boarding',()=>{
  const m=new NativeShoreBoatMotion(spec,env);assert.equal(m.mode,'walk');assert(env.land(m.x,m.z));assert(m.y>spec.waterHeight);assert(!m.canFinish());
  assert.equal(m.boat.spec.craft,'zodiac');assert(!env.land(m.boat.boat.x,m.boat.boat.z));
  assert(Math.hypot(m.x-m.boat.boardingPoint.x,m.z-m.boat.boardingPoint.z)<=61);
  const run=createWaterExpertRun('shore-boat',spec,env);const modes=new Set<string>();
  while(run.ticks<60*200&&!run.motion.canFinish()){
   const keys=run.controls();run.step(keys);modes.add((run.motion as NativeShoreBoatMotion).mode);
   if((run.motion as NativeShoreBoatMotion).mode==='boat'&&run.ticks<60*35)assert(!run.motion.canFinish(),'Boarding is not the destination');
  }
  assert.deepEqual([...modes],['walk','swim','boarding','boat']);assert(run.motion.canFinish());
  assert(run.ticks/60<nativeWaterTiming(spec.id).maxDurationSeconds);
  const vessel=run.motion as NativeShoreBoatMotion;
  // Continuing past the success point cannot drive through the platform.
  for(let i=0;i<600;i++)vessel.step(new Set(['KeyW']),1/60);
  assert(!transferPlatformBlocks(spec,vessel.x,vessel.z));assert.equal(vessel.boat.boat.speed,0);
  run.motion.reset();assert.equal((run.motion as NativeShoreBoatMotion).mode,'walk');assert(!run.motion.canFinish());
 });
 test(spec.id+' deadline is shorter than swimming even from the nearest shoreline',()=>{
  const [x,z]=spec.path.points.at(-1)!;let nearest=Infinity;
  for(const poly of city.land)for(const ring of poly)for(let i=0;i<ring.length;i++){
   const a=ring[i],b=ring[(i+1)%ring.length],dx=b[0]-a[0],dz=b[1]-a[1],t=Math.max(0,Math.min(1,((x-a[0])*dx+(z-a[1])*dz)/(dx*dx+dz*dz||1)));
   nearest=Math.min(nearest,Math.hypot(x-a[0]-dx*t,z-a[1]-dz*t));
  }
  // Give the no-boat strategy free travel to ANY native shoreline, a free
  // 35m shallow approach and the whole 7m goal radius. Still cannot make it.
  const swimmingLowerBound=(nearest-35-7)/2.4,timing=nativeWaterTiming(spec.id);
  assert(swimmingLowerBound>timing.maxDurationSeconds+5,JSON.stringify({swimmingLowerBound,timing}));
 });
 test(spec.id+' destination is a reachable docking point, platform is solid, free water remains open',()=>{
  const m=new NativeShoreBoatMotion(spec,env),goal=spec.path.points.at(-1)!;
  m.shore.mode='swim';m.shore.walker.active=false;[m.shore.swimmer.x,m.shore.swimmer.z]=goal;
  assert(m.canFinish(),'Success checks arrival, not a hidden vehicle prerequisite');
  m.shore.swimmer.depth=1;assert(!m.canFinish());
  assert(transferPlatformBlocks(spec,...waterWorld(spec,0,spec.path.length+16)));
  assert(!m.shore.swimmer.clear(...waterWorld(spec,0,spec.path.length+16),0));
  assert(!transferPlatformBlocks(spec,...goal as [number,number]));
  assert(m.shore.swimmer.clear(...waterWorld(spec,30,150),0),'No invisible narrow swimming corridor');
  for(let v=60;v<=spec.path.length;v+=5)for(const u of [-6,0,6])assert(!env.land(...waterWorld(spec,u,v)),'Boat route intersects native land');
 });
}
