/** Host-only reference pilot; ordinary keys and real simulation, no teleport. */
import type {DrivingWorld} from './city-world.ts';
import type {TrainingTask} from './training-task-schema.ts';
import {TrainingFlightMission} from './training-flight-mission.ts';
import {FlightSimulation} from './city-flight-simulation.ts';
import {HelicopterSimulation} from './city-helicopter-simulation.ts';
import {FlightCityCollision} from './city-flight-collision.ts';
import {NATIVE_FLIGHT_RUNWAYS,NATIVE_FLIGHT_LAUNCH,FLIGHT_ARRIVAL} from './native-flight-sites.ts';
import {CityWalk} from './city-walk.ts';
import {flightTestControls} from '../tests/flight-pilot.mjs';

export function probeTrainingFlight(t:TrainingTask,world:DrivingWorld){
 const c=t.flight!;const mission=new TrainingFlightMission(c,t.maxDuration),context={...c};
 const sim=c.model==='plane'?new FlightSimulation():new HelicopterSimulation(c.model);
 sim.runways=NATIVE_FLIGHT_RUNWAYS;sim.start(c.spawn,c.yaw);
 const collision=new FlightCityCollision(world.data,world.groundHeight),walk=new CityWalk((x,z,y)=>!world.walk?.clear(x,z,y),(x,z)=>world.walkingSurfaceHeight(x,z));
 walk.active=true;walk.x=NATIVE_FLIGHT_LAUNCH.x;walk.z=NATIVE_FLIGHT_LAUNCH.z;walk.yaw=NATIVE_FLIGHT_LAUNCH.yaw;walk.resetVertical();
 const offset=c.model==='cargobob'?3.2:c.model==='frogger'?1.8:2.4;
 const door=[-offset,offset].map(side=>({x:sim.pose.x+Math.cos(sim.pose.yaw)*side,z:sim.pose.z-Math.sin(sim.pose.yaw)*side})).sort((a,b)=>Math.hypot(a.x-walk.x,a.z-walk.z)-Math.hypot(b.x-walk.x,b.z-walk.z))[0];
 const actions:{keys:string[];frames:number}[]=[];let ticks=0;
 while(!mission.outcome&&ticks<Math.ceil(t.maxDuration*60)){
  let keys:string[];
  if(mission.stage==='boarding'){
   const canBoard=walk.canEnter({...sim.pose,speed:0},offset+3,offset);
   if(canBoard){keys=['KeyF'];sim.startEngine();mission.board();walk.active=false;}
   else{const dx=door.x-walk.x,dz=door.z-walk.z,forward=dx*Math.sin(walk.yaw)+dz*Math.cos(walk.yaw),right=dx*Math.cos(walk.yaw)-dz*Math.sin(walk.yaw);keys=[forward>.2?'KeyW':forward<-.2?'KeyS':'',right>.2?'KeyD':right<-.2?'KeyA':''].filter(Boolean);walk.step(new Set(keys),1/60);}
  }else{keys=flightTestControls(sim,mission.stage,mission.navigationTarget,FLIGHT_ARRIVAL,context);sim.step(new Set(keys),1/60,ticks*1000/60,(a,b)=>collision.sweep(a,b),world.data.meta.extent);}
  const last=actions.at(-1);if(last&&JSON.stringify(last.keys)===JSON.stringify(keys))last.frames++;else actions.push({keys,frames:1});
  mission.step(mission.stage==='boarding'?null:sim,1/60,false,world.data.meta.extent);ticks++;
 }
 return {passed:mission.outcome==='success',frames:ticks,seconds:ticks/60,reason:mission.reason,expertActions:actions};
}
