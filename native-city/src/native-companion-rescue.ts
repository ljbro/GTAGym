import type {V2} from './city-types.ts';
import {NPC_DRIVE_SPEED} from './native-npc-objective.ts';
import {VehicleRoute} from './native-vehicle-route.ts';
import {createTrailerState,stepTrailer,type TrailerState} from './native-semi-articulation.ts';

/** c04-n04: explicit, estimated gameplay windows, NOT original video measurements. */
export const RESCUE_RULES={speed:NPC_DRIVE_SPEED,headStart:65,holdSeconds:.35,transferSeconds:1.2,graceSeconds:.35,maxRelativeSpeed:10,maxYaw:Math.PI*.3,lateral:1.8,longitudinal:4} as const;
export type RescuePlayer={point:V2;yaw:number;speed:number;driving:boolean;heightValid:boolean};
export type RescueStage='side'|'side-transfer'|'complete'|'failed';
export function rescueWindow(trailer:Pick<TrailerState,'x'|'z'|'yaw'>,index:0|1){
 // Side window under supported boom; stern window is behind the trailer body,
 // leaving space for a 4.7 m convertible without overlapping its rear bumper.
 const u=index===0?-4.25:0,v=index===0?-4.5:-12.6,c=Math.cos(trailer.yaw),s=Math.sin(trailer.yaw);
 return {point:[trailer.x+c*u+s*v,trailer.z-s*u+c*v] as V2,yaw:trailer.yaw};
}
function angle(a:number,b:number){return Math.atan2(Math.sin(b-a),Math.cos(b-a));}
function mix(a:RescuePlayer,b:RescuePlayer,t:number):RescuePlayer{return {point:[a.point[0]+(b.point[0]-a.point[0])*t,a.point[1]+(b.point[1]-a.point[1])*t],yaw:a.yaw+angle(a.yaw,b.yaw)*t,speed:a.speed+(b.speed-a.speed)*t,driving:a.driving&&b.driving,heightValid:a.heightValid&&b.heightValid};}

/** Separate from ordinary chase: touching the truck cannot win a rescue. */
export class NativeCompanionRescue{
 readonly length:number;distance:number;readonly trailer:TrailerState;readonly vehicleRoute:VehicleRoute;speed:number;
 stage:RescueStage='side';boarded=0;hold=0;transfer=0;private misalignedSeconds=0;
 constructor(readonly points:readonly V2[],clear:(x:number,z:number,yaw:number)=>boolean=()=>true){
  this.vehicleRoute=new VehicleRoute(points,RESCUE_RULES.speed,clear);this.length=this.vehicleRoute.length;
  if(points.length<2||!Number.isFinite(this.length)||this.length<80)throw Error('Rescue needs a finite driving route of at least 80 metres');
  this.distance=Math.min(RESCUE_RULES.headStart,this.length*.15);this.speed=this.vehicleRoute.sample(this.distance).limit;const p=this.pose;this.trailer=createTrailerState({x:p.point[0],z:p.point[1],yaw:p.yaw});
 }
 get pose(){return this.vehicleRoute.sample(this.distance);}
 get window(){return rescueWindow(this.trailer,0);}
 get transferProgress(){return this.transfer/RESCUE_RULES.transferSeconds;}
 conditions(player:RescuePlayer){
  const p=this.window,dx=player.point[0]-p.point[0],dz=player.point[1]-p.point[1],c=Math.cos(p.yaw),s=Math.sin(p.yaw);
  return {driving:player.driving,height:player.heightValid,position:Math.abs(dx*c-dz*s)<=RESCUE_RULES.lateral&&Math.abs(dx*s+dz*c)<=RESCUE_RULES.longitudinal,heading:Math.abs(angle(player.yaw,p.yaw))<=RESCUE_RULES.maxYaw,speed:Math.abs(player.speed-this.speed)<=RESCUE_RULES.maxRelativeSpeed};
 }
 aligned(player:RescuePlayer){return Object.values(this.conditions(player)).every(Boolean);}
 step(dt:number,previous:RescuePlayer,player:RescuePlayer,discontinuity=false):'success'|'failure'|null{
  if(this.stage==='complete')return 'success';if(this.stage==='failed')return 'failure';
  if(!Number.isFinite(dt)||dt<=0)return null;
  // Real game ticks are short. A resumed/tab-suspended frame cannot accrue a
  // full boarding hold or teleport the convoy through a road bend.
  const elapsed=Math.min(dt,.25),steps=Math.ceil(elapsed/.025),h=elapsed/steps;
  for(let i=1;i<=steps;i++){
   const oldSpeed=this.speed;this.speed+=Math.max(-8*h,Math.min(2.5*h,this.vehicleRoute.sample(this.distance).limit-this.speed));
   this.distance=Math.min(this.length,this.distance+(oldSpeed+this.speed)*.5*h);const p=this.pose;
   stepTrailer(this.trailer,{x:p.point[0],z:p.point[1],yaw:p.yaw});
   if(this.distance>=this.length-1e-7){this.stage='failed';return 'failure';}
   const sample=mix(previous,player,i/steps),checks=this.conditions(sample);
   const hardReset=discontinuity||!checks.driving||!checks.height;
   if(hardReset||!Object.values(checks).every(Boolean)){
    this.misalignedSeconds+=h;
    // Small steering corrections pause progress instead of cancelling the
    // boarding animation. They never count as aligned rescue time.
    if(hardReset||this.misalignedSeconds>RESCUE_RULES.graceSeconds+1e-8){this.hold=0;this.transfer=0;this.stage='side';}
    continue;
   }
   this.misalignedSeconds=0;
   if(this.hold<RESCUE_RULES.holdSeconds){this.hold+=h;continue;}
   this.stage='side-transfer';this.transfer=Math.min(RESCUE_RULES.transferSeconds,this.transfer+h);
   if(this.transfer>=RESCUE_RULES.transferSeconds-1e-8){
    this.boarded=1;this.transfer=0;this.hold=0;this.stage='complete';return 'success';
   }
  }return null;
 }
}
