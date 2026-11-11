// Offline/state-informed reference pilot. It emits ordinary movement keys;
// never teleports after spawn, edits velocities or forces mission success.
import {CityWalk} from '../src/city-walk.ts';
import {CityCollision} from '../src/driving.ts';
import type {CityData} from '../src/city-types.ts';
import {FlightSimulation,type FlightSweep} from '../src/city-flight-simulation.ts';
import {HelicopterSimulation} from '../src/city-helicopter-simulation.ts';
import {FlightCityCollision} from '../src/city-flight-collision.ts';
import {NativeFlightMission,NATIVE_FLIGHT_RUNWAYS,NATIVE_FLIGHT_LAUNCH,FLIGHT_ARRIVAL,nativeFlightSurfaceAt} from '../src/native-flight-route.ts';
import {flightTestControls} from './flight-pilot.mjs';

export const EXPERT_HZ=60;
export type ExpertAction={startTick:number;ticks:number;keys:string[]};
export function createExpertRun(data:CityData,id:string,environment?:{heightAt:(x:number,z:number)=>number;sweep:FlightSweep;blocked?:(x:number,z:number,y:number)=>boolean}){
 const mission=new NativeFlightMission(id),config=mission.config,context={...config};
 const sim=config.model==='plane'?new FlightSimulation():new HelicopterSimulation(config.model);
 sim.runways=NATIVE_FLIGHT_RUNWAYS;sim.start(config.spawn,config.yaw);
 const heightAt=environment?.heightAt??((x:number,z:number)=>nativeFlightSurfaceAt(x,z)??0);
 const city=new CityCollision(data),collision=new FlightCityCollision(data,heightAt);
 const sweep=environment?.sweep??((a,b)=>collision.sweep(a,b));
 const walk=new CityWalk(environment?.blocked??((x,z)=>city.blocked(x,z)),heightAt);
 walk.active=true;walk.x=NATIVE_FLIGHT_LAUNCH.x;walk.z=NATIVE_FLIGHT_LAUNCH.z;walk.yaw=NATIVE_FLIGHT_LAUNCH.yaw;walk.resetVertical();
 const offset=config.model==='cargobob'?3.2:config.model==='frogger'?1.8:2.4;
 const canBoard=()=>walk.canEnter({...sim.pose,speed:0},offset+3,offset);
 const door=[-offset,offset].map(side=>({x:sim.pose.x+Math.cos(sim.pose.yaw)*side,z:sim.pose.z-Math.sin(sim.pose.yaw)*side})).sort((a,b)=>Math.hypot(a.x-walk.x,a.z-walk.z)-Math.hypot(b.x-walk.x,b.z-walk.z))[0];
 let ticks=0;
 return {mission,sim,walk,get ticks(){return ticks;},controls():string[]{
  if(mission.stage!=='boarding')return flightTestControls(sim,mission.stage,mission.navigationTarget,FLIGHT_ARRIVAL,context);
  if(canBoard())return ['KeyF'];
  const dx=door.x-walk.x,dz=door.z-walk.z,forward=dx*Math.sin(walk.yaw)+dz*Math.cos(walk.yaw),right=dx*Math.cos(walk.yaw)-dz*Math.sin(walk.yaw);
  return [forward>.2?'KeyW':forward<-.2?'KeyS':'',right>.2?'KeyD':right<-.2?'KeyA':''].filter(Boolean);
 },step(keys:string[]){
  if(mission.outcome)throw Error('Cannot replay after terminal state');
  if(mission.stage==='boarding'){
   if(keys.includes('KeyF')){if(!canBoard())throw Error('Recorded F is outside reachable aircraft door');sim.startEngine();mission.board();walk.active=false;}
   else walk.step(new Set(keys),1/EXPERT_HZ);
  }else sim.step(new Set(keys),1/EXPERT_HZ,ticks*1000/EXPERT_HZ,sweep,data.meta.extent);
  mission.step(mission.stage==='boarding'?null:sim,1/EXPERT_HZ,false,data.meta.extent);ticks++;
 },sample(){const pose=mission.stage==='boarding'?{x:walk.x,y:walk.y,z:walk.z,yaw:walk.yaw,pitch:0,roll:0}:sim.pose;return {tick:ticks,stage:mission.stage,checkpoint:mission.checkpoint,pose:{...pose},speed:mission.stage==='boarding'?walk.speed:sim.speed};}};
}
