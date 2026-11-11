import type {FlightPoint,FlightSimulation} from './city-flight-simulation.ts';
import {FLIGHT_ARRIVAL,FLIGHT_DEPARTURE,NATIVE_FLIGHT_TASK,nativeFlightTarget} from './native-flight-sites.ts';
import {nativeFlightConfig,type NativeFlightConfig,helicopterControls} from './native-flight-catalog.ts';
import {runwayContains} from './city-flight-ground.ts';
import {nativeFlightTiming,FLIGHT_TIME_MULTIPLIER} from './native-flight-timing.ts';
export * from './native-flight-sites.ts';
export {NATIVE_FLIGHT_TASKS,nativeFlightConfig} from './native-flight-catalog.ts';
export function flightTargetDistance(player:FlightPoint,target:FlightPoint){return Math.hypot(player.x-target.x,player.y-target.y,player.z-target.z);}
export type NativeFlightStage='boarding'|'takeoff'|'route'|'approach'|'hover'|'recovery'|'landing'|'complete';
type Aircraft=Pick<FlightSimulation,'pose'|'phase'|'onGround'|'groundRunwayId'|'speed'|'throttle'|'takeoffs'|'landings'|'hit'>;

/** Ordered annotation gates, source-specific objectives and a real ground finish. */
export class NativeFlightMission{
 readonly config:NativeFlightConfig;
 readonly expertSeconds:number;readonly maxDuration:number;
 stage:NativeFlightStage='boarding';elapsed=0;airElapsed=0;stoppedFor=0;hoveredFor=0;approached=false;checkpoint=0;recoveryIndex=0;
 target:FlightPoint;distance=0;npcTarget:FlightPoint;npcYaw=0;
 outcome:'success'|'failure'|null=null;reason='';
 constructor(id=NATIVE_FLIGHT_TASK.id as string){this.config=nativeFlightConfig(id);const timing=nativeFlightTiming(id);this.expertSeconds=timing.expertSeconds;this.maxDuration=timing.maxDurationSeconds;this.npcTarget=this.npcPosition(0);this.target=this.config.objective==='approach'?this.npcTarget:this.config.route[0];this.distance=flightTargetDistance(this.config.spawn,this.target);}
 board(){if(this.stage!=='boarding'||this.outcome)return false;this.stage='takeoff';return true;}
 get hasNpc(){return this.config.objective==='approach'||this.config.objective==='follow';}
 get navigationTarget():FlightPoint{
  return this.stage==='boarding'?this.config.spawn:this.stage==='landing'||this.stage==='complete'?this.config.landingPoint:
   this.stage==='recovery'?this.config.recovery[this.recoveryIndex]:this.stage==='approach'?this.npcTarget:
   this.stage==='hover'?this.config.route.at(-1)!:this.config.route[this.checkpoint]??this.npcTarget;
 }
 get instruction(){
  const c=this.config;
  switch(this.stage){
   case 'boarding':return "Move closer to the ground"+(c.vehicle==='helicopter'?"Helicopter":"Airplane")+", press F Board aircraft";
   case 'takeoff':return c.vehicle==='helicopter'?"After the engine starts, press W Vertical takeoff;"+helicopterControls:"After the engine starts, hold W Ground roll; Airspeed exceeds 115 km/h Then press the numeric keypad 5 Look up, After leaving the ground G Retract landing gear";
   case 'route':return `Pass through the waypoints in order ${this.checkpoint+1}/${c.route.length} · Distance ${Math.round(this.distance)} meters · Target Height ${Math.round(this.navigationTarget.y)} meters`;
   case 'approach':return "Approach the aircraft ahead to within 60 meters within · Current "+Math.round(this.distance)+" meters";
   case 'hover':return `Hover inside the target circle, Speed ≤ 3 m/s · ${this.hoveredFor.toFixed(1)} / ${c.hoverSeconds} seconds`;
   case 'recovery':return `Fly to the Approach Point ${this.recoveryIndex+1}/${c.recovery.length} · Distance ${Math.round(this.distance)} meters · Height ${Math.round(this.navigationTarget.y)} meters`;
   case 'landing':return c.vehicle==='helicopter'?`In northern Futian H Slow down on the apron, press S Descend gently and come to a stop · ${this.stoppedFor.toFixed(1)} / 2 seconds`:`Head to the landing zone in northern Futian, G Lower landing gear, After Touching the Ground, Press S Brake to a stop · ${this.stoppedFor.toFixed(1)} / 2 seconds`;
   case 'complete':return "Urban takeoff completed, Mission objectives and landing to a full stop";
  }
 }
 private npcPosition(elapsed:number):FlightPoint{
  if(this.config.objective==='approach'){this.npcYaw=this.config.yaw;return nativeFlightTarget(elapsed);}
  const route=this.config.route;let remaining=Math.max(0,elapsed)*this.config.npcSpeed;
  for(let i=1;i<route.length;i++){
   const a=route[i-1],b=route[i],length=flightTargetDistance(a,b);
   if(remaining<=length){const t=remaining/Math.max(1,length);this.npcYaw=Math.atan2(b.x-a.x,b.z-a.z);return {x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t,z:a.z+(b.z-a.z)*t};}
   remaining-=length;
  }
  // The leader keeps flying a holding circle after its last route point.
  const end=route.at(-1)??this.config.approachOrigin,angle=remaining/100;
  this.npcYaw=-angle;return {x:end.x+100*(Math.cos(angle)-1),y:end.y,z:end.z+100*Math.sin(angle)};
 }
 private recover(){this.stage=this.config.recovery.length?'recovery':'landing';}
 fail(reason:string){if(!this.outcome){this.outcome='failure';this.reason=reason;}return this.outcome;}
 step(aircraft:Aircraft|null,dt:number,paused:boolean,extent:readonly number[]){
  if(this.outcome)return this.outcome;if(paused||!Number.isFinite(dt)||dt<0)return null;
  const step=Math.max(0,Math.min(.1,dt,this.maxDuration-this.elapsed));this.elapsed=Math.min(this.maxDuration,this.elapsed+step);
  // Evaluate a finish at the deadline before timing out. Boarding is included;
  // menu/asset-loading pauses reach this method with paused=true.
  const outcome=this.advance(aircraft,step,extent);
  if(!outcome&&this.elapsed+1e-8>=this.maxDuration)return this.fail(`Flight mission timed out: Maximum runtime ${this.maxDuration.toFixed(1)} seconds(of the time taken by the expert trajectory ${FLIGHT_TIME_MULTIPLIER} times). `);
  return outcome;
 }
 private advance(aircraft:Aircraft|null,step:number,extent:readonly number[]){
  if(this.stage==='boarding')return null;
  if(!aircraft||aircraft.phase!=='flying')return this.fail(aircraft?.phase==='exploding'?(aircraft.hit?.reason??"Aircraft crashed, Please restart from the city starting point."):"Exited the mission aircraft or left the city flight boundary.");
  if(this.stage==='takeoff'){
   if(aircraft.onGround||aircraft.takeoffs<1||aircraft.pose.y<FLIGHT_DEPARTURE.y+12)return null;
   this.stage=this.config.objective==='approach'?'approach':'route';
  }
  this.airElapsed+=step;this.npcTarget=this.npcPosition(this.airElapsed);
  if(this.stage==='route'){
   this.target=this.navigationTarget;this.distance=flightTargetDistance(aircraft.pose,this.target);
   if(!aircraft.onGround&&this.distance<=this.config.checkpointRadius){
    this.checkpoint++;
    if(this.checkpoint===this.config.route.length){
     if(this.config.objective==='hover')this.stage='hover';
     else if(this.config.objective==='follow')this.stage='approach';
     else this.recover();
    }
   }
  }
  if(this.stage==='approach'){
   this.target=this.npcTarget;this.distance=flightTargetDistance(aircraft.pose,this.target);
   if(!aircraft.onGround&&this.distance<=this.config.completionRadius){this.approached=true;this.recover();}
   else if(this.config.objective==='approach'&&(this.target.x<extent[0]+80||this.target.x>extent[2]-80||this.target.z<extent[1]+80||this.target.z>extent[3]-80))return this.fail("Not yet near the target aircraft, The target has flown out of the city mission airspace.");
  }
  if(this.stage==='hover'){
   this.target=this.navigationTarget;this.distance=flightTargetDistance(aircraft.pose,this.target);
   this.hoveredFor=!aircraft.onGround&&this.distance<=12&&aircraft.speed<=3?this.hoveredFor+step:0;
   if(this.hoveredFor+1e-8>=this.config.hoverSeconds)this.recover();
  }
  if(this.stage==='recovery'){
   this.target=this.navigationTarget;this.distance=flightTargetDistance(aircraft.pose,this.target);
   if(!aircraft.onGround&&this.distance<=55){this.recoveryIndex++;if(this.recoveryIndex===this.config.recovery.length)this.stage='landing';}
  }
  if(this.stage==='landing'){
   const onPad=this.config.vehicle==='plane'||Math.hypot(aircraft.pose.x-this.config.landingPoint.x,aircraft.pose.z-this.config.landingPoint.z)<=12;
   const stopped=onPad&&aircraft.onGround&&aircraft.groundRunwayId===FLIGHT_ARRIVAL.id&&aircraft.landings>0&&runwayContains(FLIGHT_ARRIVAL,aircraft.pose,7)&&aircraft.speed<=this.config.stopSpeed&&aircraft.throttle<.05;
   this.stoppedFor=stopped?this.stoppedFor+step:0;
   if(this.stoppedFor+1e-8>=this.config.stopSeconds){this.stage='complete';this.outcome='success';this.reason="Taken off from ground level in the city, Complete"+this.config.title+", and land at the designated urban site, Release the throttle and come to a stop 2 seconds.";}
  }
  return this.outcome;
 }
}
