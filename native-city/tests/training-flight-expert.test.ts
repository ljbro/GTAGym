import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {CityCollision} from '../src/driving.ts';
import {CityWalk} from '../src/city-walk.ts';
import {nativeFlightSurfaceAt} from '../src/native-flight-sites.ts';
import {nativeFlightConfig} from '../src/native-flight-catalog.ts';
import {nativeFlightTiming} from '../src/native-flight-timing.ts';
import {createExpertRun} from './flight-expert-runner.ts';
import {probeTrainingFlight} from '../src/training-flight-expert.ts';
import type {DrivingWorld} from '../src/city-world.ts';
import type {TrainingTask} from '../src/training-task-schema.ts';
const data=JSON.parse(fs.readFileSync(new URL('../../city/city.json',import.meta.url),'utf8')),city=new CityCollision(data);
for(const id of ['c08-n04','c08-n03'])test(id+' training flight uses bound world surfaces and real boarding/takeoff/landing',()=>{
 const config=structuredClone(nativeFlightConfig(id));config.objective='navigate';
 const world={data,groundHeight:(x:number,z:number)=>nativeFlightSurfaceAt(x,z)??0,walkingSurfaceHeight(x:number,z:number){return this.groundHeight(x,z);},walk:new CityWalk((x,z)=>city.blocked(x,z),(x,z)=>nativeFlightSurfaceAt(x,z)??0)};
 const proof=probeTrainingFlight({flight:config,maxDuration:600} as TrainingTask,world as unknown as DrivingWorld);
 assert(proof.passed,JSON.stringify({reason:proof.reason,seconds:proof.seconds}));assert(proof.frames>0);assert(proof.expertActions.some(a=>a.keys.includes('KeyF')));assert.equal(proof.seconds,proof.frames/60);
});
