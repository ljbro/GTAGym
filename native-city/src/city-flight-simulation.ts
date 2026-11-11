/** Simplified point-mass aircraft: thrust, drag, lift, gravity and stall.
 * Controls change attitude, never position or a target cruising speed. */
import {FLIGHT_GEAR_CLEARANCE,FLIGHT_ROTATE_SPEED,FLIGHT_LANDING_LIMITS,landingHeadingError,runwayContains,type FlightRunway} from './city-flight-ground.ts';
import {flightControls,FLIGHT_ENGINE_START_SECONDS} from './city-flight-controls.ts';
export type FlightPoint={x:number;y:number;z:number};
export type FlightPose=FlightPoint&{yaw:number;pitch:number;roll:number};
export type FlightHit={point:FlightPoint;kind:'building'|'terrain';id?:string;reason?:string};
export type FlightSweep=(from:FlightPoint,to:FlightPoint)=>FlightHit|null;
export const FLIGHT_RECOVERY_MS=3000;
const clamp=(v:number,a:number,b:number)=>Math.max(a,Math.min(b,v));
export function flightBasis(p:Pick<FlightPose,'yaw'|'pitch'|'roll'>){
 const sy=Math.sin(p.yaw),cy=Math.cos(p.yaw),sp=Math.sin(p.pitch),cp=Math.cos(p.pitch),sr=Math.sin(p.roll),cr=Math.cos(p.roll);
 const forward={x:sy*cp,y:sp,z:cy*cp},right={x:cy*cr+sy*sp*sr,y:-cp*sr,z:-sy*cr+cy*sp*sr};
 return {forward,right,up:{x:forward.y*right.z-forward.z*right.y,y:forward.z*right.x-forward.x*right.z,z:forward.x*right.y-forward.y*right.x}};
}
export function flightPoint(p:FlightPose,right:number,forward:number,up=0):FlightPoint{
 const b=flightBasis(p);return {x:p.x+b.right.x*right+b.forward.x*forward+b.up.x*up,y:p.y+b.right.y*right+b.forward.y*forward+b.up.y*up,z:p.z+b.right.z*right+b.forward.z*forward+b.up.z*up};
}
export function flightChaseCamera(p:FlightPose){
 const f=flightBasis(p).forward;
 return {eye:{x:p.x-f.x*27,y:p.y+8-f.y*12,z:p.z-f.z*27},target:{x:p.x+f.x*12,y:p.y+1.5+f.y*12,z:p.z+f.z*12}};
}
export class FlightSimulation{
 kind:'plane'|'helicopter'='plane';rotorRpm=0;
 engineState:'off'|'starting'|'running'='off';engineStartedFor=0;engineRpm=0;
 gearTargetDown=true;gearProgress=1;private gearPressed=false;
 phase:'idle'|'flying'|'exploding'='idle';
 pose:FlightPose={x:0,y:120,z:0,yaw:0,pitch:0,roll:0};
 lastSafe:FlightPose={...this.pose};velocity:FlightPoint={x:0,y:0,z:0};speed=0;throttle=0;angleOfAttack=0;stalled=true;crashedAt=0;hit:FlightHit|null=null;crashes=0;
 runways:readonly FlightRunway[]=[];onGround=false;groundRunwayId:string|null=null;takeoffs=0;landings=0;
 touchdown:{runwayId:string;sinkSpeed:number;speed:number;roll:number;pitch:number}|null=null;
 get active(){return this.phase!=='idle';}
 startEngine(){if(this.phase==='flying'&&this.engineState==='off'){this.engineState='starting';this.engineStartedFor=0;}}
 stopEngine(){this.engineState='off';this.engineStartedFor=0;}
 controlKey(code:string,down:boolean){
  if(code!=='KeyG')return;
  if(down&&!this.gearPressed&&this.kind==='plane'&&this.phase==='flying'&&!this.onGround)this.gearTargetDown=!this.gearTargetDown;
  this.gearPressed=down;
 }
 protected stepSystems(dt:number){
  if(this.engineState==='starting'){this.engineStartedFor+=dt;if(this.engineStartedFor+1e-8>=FLIGHT_ENGINE_START_SECONDS)this.engineState='running';}
  const rpm=this.engineState==='running'?.25+.75*this.throttle:this.engineState==='starting'?.2:0;
  this.engineRpm+=(rpm-this.engineRpm)*(1-Math.exp(-dt*3));
  this.gearProgress=clamp(this.gearProgress+(this.gearTargetDown?1:-1)*dt/.9,0,1);
 }
 start(point:FlightPoint,yaw:number){this.pose={...point,yaw,pitch:0,roll:0};this.lastSafe={...this.pose};this.velocity={x:0,y:0,z:0};this.speed=0;this.throttle=0;this.angleOfAttack=0;this.stalled=true;this.phase='flying';this.hit=null;this.crashedAt=0;
  this.stopEngine();this.engineRpm=0;this.gearTargetDown=true;this.gearProgress=1;this.gearPressed=false;
  const runway=this.runways.find(r=>runwayContains(r,point,7)&&Math.abs(point.y-r.y-FLIGHT_GEAR_CLEARANCE)<.05);
  this.onGround=!!runway;this.groundRunwayId=runway?.id??null;this.takeoffs=0;this.landings=0;this.touchdown=null;
 }
 stop(){this.phase='idle';this.stopEngine();this.engineRpm=0;this.rotorRpm=0;this.hit=null;this.crashedAt=0;this.throttle=0;this.speed=0;this.velocity={x:0,y:0,z:0};this.onGround=false;this.groundRunwayId=null;}
 protected crash(hit:FlightHit,now:number){this.stopEngine();this.hit=hit;this.phase='exploding';this.crashedAt=now;this.crashes++;this.speed=0;this.throttle=0;this.velocity={x:0,y:0,z:0};this.onGround=false;this.groundRunwayId=null;return 'crashed' as const;}
 step(keys:ReadonlySet<string>,dt:number,now:number,sweep:FlightSweep,extent:readonly number[]):'crashed'|'recovered'|'boundary'|null{
  if(this.phase==='idle')return null;
  if(this.phase==='exploding'){if(now-this.crashedAt>=FLIGHT_RECOVERY_MS){this.phase='idle';return 'recovered';}return null;}
  const {pitch,roll,yaw:rudder,brake,throttle}=flightControls(keys);
  if(throttle&&!brake)this.startEngine();this.controlKey('KeyG',keys.has('KeyG'));
  let left=clamp(dt,0,.1);
  while(left>1e-7){
   const h=Math.min(left,1/120);left-=h;const before={...this.pose},p=this.pose;
   this.stepSystems(h);const powered=throttle&&!brake&&this.engineState==='running';
   this.throttle+=(Number(powered)-this.throttle)*(1-Math.exp(-h*(powered?2:3)));
   if(this.throttle<.0001)this.throttle=0;
   const authority=clamp(this.speed/35,.15,1);
   p.pitch=clamp(p.pitch+pitch*.45*authority*h,this.onGround?0:-1.3,this.onGround?.22:1.3);
   if(this.onGround){p.roll=0;p.yaw+=h*(rudder+roll)*.55*Math.min(1,this.speed/8);if(!pitch&&this.landings)p.pitch*=Math.exp(-h*4);}
   else{p.roll=clamp(p.roll+roll*.85*authority*h,-1.45,1.45);p.yaw+=h*authority*(9.81*Math.tan(p.roll)/Math.max(20,this.speed)+rudder*.35);}
   const {forward,up}=flightBasis(p),v=this.velocity;
   const speed=Math.hypot(v.x,v.y,v.z),along=v.x*forward.x+v.y*forward.y+v.z*forward.z;
   const normal=v.x*up.x+v.y*up.y+v.z*up.z;
   const alpha=this.angleOfAttack=speed>.1?Math.atan2(-normal,along):0;
   this.stalled=speed<28||Math.abs(alpha)>.32;
   const flow=speed>.001?{x:v.x/speed,y:v.y/speed,z:v.z/speed}:forward;
   const dot=up.x*flow.x+up.y*flow.y+up.z*flow.z;
   const liftAxis={x:up.x-flow.x*dot,y:up.y-flow.y*dot,z:up.z-flow.z*dot};
   const length=Math.hypot(liftAxis.x,liftAxis.y,liftAxis.z);
   // Lift falls after the critical angle; pulling harder in a stall cannot
   // create unlimited lift. Lift is perpendicular to velocity, drag opposes it.
   const stallFactor=Math.abs(alpha)<=.32?1:Math.max(.08,(.32/Math.abs(alpha))**2);
   const cl=clamp(.28+4.2*alpha,-1.4,1.7)*stallFactor;
   const pressure=.012*speed*speed,lift=pressure*cl;
   const drag=pressure*(.105+.06*cl*cl+.7*Math.sin(alpha)**2+(brake?.4:0));
   const thrust=8*this.throttle;
   for(const axis of ['x','y','z'] as const){
    const liftForce=length>.001?liftAxis[axis]/length*lift:0;
    v[axis]+=(forward[axis]*thrust-flow[axis]*drag+liftForce-(axis==='y'?9.81:0))*h;
   }
   if(this.onGround){
    const runway=this.runways.find(r=>r.id===this.groundRunwayId)!;
    if(this.speed>=FLIGHT_ROTATE_SPEED&&p.pitch>.035&&v.y>0&&(!this.landings||pitch>0)){this.onGround=false;this.groundRunwayId=null;this.takeoffs++;}
    else{
     v.y=0;p.y=runway.y+FLIGHT_GEAR_CLEARANCE;
     const s=Math.sin(p.yaw),c=Math.cos(p.yaw),forwardSpeed=v.x*s+v.z*c;
     const rollingSpeed=Math.max(0,forwardSpeed-h*(brake?9:.55));
     const sideways=(v.x*c-v.z*s)*Math.exp(-h*10);
     v.x=s*rollingSpeed+c*sideways;v.z=c*rollingSpeed-s*sideways;
    }
   }
   for(const axis of ['x','y','z'] as const)p[axis]+=v[axis]*h;
   if(this.onGround){
    const runway=this.runways.find(r=>r.id===this.groundRunwayId)!;
    if(!runwayContains(runway,p,7))return this.crash({point:{...p},kind:'terrain',id:runway.id,reason:"Taxi off the runway, Restart and take off or brake to a stop within the runway."},now);
   }else{
    const runway=this.runways.find(r=>runwayContains(r,p,7)&&before.y>=r.y+FLIGHT_GEAR_CLEARANCE-.05&&p.y<=r.y+FLIGHT_GEAR_CLEARANCE&&v.y<=0);
    if(runway){
     if(this.gearProgress<.99)return this.crash({point:{...p},kind:'terrain',id:runway.id,reason:"Landing gear not fully lowered: Before entering, press G Lower landing gear."},now);
     const limits=FLIGHT_LANDING_LIMITS,landingSpeed=Math.hypot(v.x,v.z);
     this.touchdown={runwayId:runway.id,sinkSpeed:-v.y,speed:landingSpeed,roll:p.roll,pitch:p.pitch};
     if(-v.y>limits.sinkSpeed||landingSpeed>limits.speed||Math.abs(p.roll)>limits.roll||p.pitch<limits.minPitch||p.pitch>limits.maxPitch||landingHeadingError(p.yaw,runway)>limits.heading)
      return this.crash({point:{...p},kind:'terrain',id:runway.id,reason:"Crashed on landing: Runway alignment required, Keep the wings level, and reduce airspeed and descent rate."},now);
     p.y=runway.y+FLIGHT_GEAR_CLEARANCE;v.y=0;this.onGround=true;this.groundRunwayId=runway.id;this.landings++;
    }
   }
   this.speed=Math.hypot(v.x,v.y,v.z);
   if(p.y>2100){p.y=2100;p.pitch=Math.min(0,p.pitch);v.y=Math.min(0,v.y);}
   if(p.x<extent[0]+15||p.x>extent[2]-15||p.z<extent[1]+15||p.z>extent[3]-15){this.phase='idle';this.pose={...before};return 'boundary';}
   // Swept nose, tail, floats and wing points plus the full current wing edge:
   // a fast plane cannot jump through a thin facade between rendered frames.
   let hit:FlightHit|null=null;
   for(const [r,f,u] of [[0,4.7,0],[0,-5.2,0],[-6.9,0,1.1],[6.9,0,1.1],[-3.4,0,1.1],[3.4,0,1.1],[-1.64,1,-1.45],[1.64,1,-1.45],[0,0,0]]){
    hit=sweep(flightPoint(before,r,f,u),flightPoint(p,r,f,u));if(hit)break;
   }
   hit??=sweep(flightPoint(p,-6.9,0,1.1),flightPoint(p,6.9,0,1.1));
   if(hit)return this.crash(hit,now);
   this.lastSafe={...p};
  }
  return null;
 }
 get status(){return {kind:this.kind,rotorRpm:this.rotorRpm,phase:this.phase,active:this.active,position:{x:this.pose.x,y:this.pose.y,z:this.pose.z},yaw:this.pose.yaw,pitch:this.pose.pitch,roll:this.pose.roll,speed:this.speed,throttle:this.throttle,engineOn:this.engineState!=='off',engineState:this.engineState,engineRpm:this.engineRpm,engineStartedFor:this.engineStartedFor,gearDown:this.gearProgress>=.99,gearTargetDown:this.gearTargetDown,gearProgress:this.gearProgress,verticalSpeed:this.velocity.y,stalled:!this.onGround&&this.stalled,angleOfAttack:this.angleOfAttack,onGround:this.onGround,groundRunwayId:this.groundRunwayId,takeoffs:this.takeoffs,landings:this.landings,touchdown:this.touchdown,crashes:this.crashes,hit:this.hit,crashedAt:this.crashedAt};}
}
