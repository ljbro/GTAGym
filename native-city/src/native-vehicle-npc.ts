import type {V2} from './city-types.ts';
import type {NpcRules} from './native-npc-objective.ts';
import {VehicleRoute} from './native-vehicle-route.ts';
import {streetOverlap,type StreetBody} from './ambient-collision.ts';
// Chase/follow targets take bends 20% faster. Keep cruise, collision braking,
// road-clearance checks and the companion-rescue vehicle's profile unchanged.
export const TARGET_CORNER_SPEED_SCALE=1.2;
export const INTERCEPT_RULES={speed:3,hold:1.5,brake:9,maxDeceleration:18,recovery:4.5,impulseSeconds:.25};
export const MOTORCYCLE_INTERCEPT_RULES={hits:3,minClosingSpeed:2,fallSeconds:.35,downSeconds:1.5,riseSeconds:1.2,rearmSeconds:.5,rearmClearance:.75,brake:18} as const;
export type MotorcycleKnockdown={hits:number;elapsed:number;side:number;blend:number;phase:'riding'|'falling'|'down'|'recovering';armed:boolean};
export type NpcVehicleFit={width:number;length:number;height:number;mass:number;motorcycle?:boolean};
export type InterceptPlayer=StreetBody&{speed:number;mass:number};
/** Gameplay masses in kg; not claims about the source vehicles. */
export function npcVehicleMass(kind:string){return kind.startsWith('motorcycle')?240:kind==='semi-tractor'?7000:kind==='box-truck'?4500:kind==='van'?2600:kind.startsWith('baller')||kind==='pickup'?2300:1600;}
type World={height:(x:number,z:number)=>number;clear:(body:StreetBody)=>boolean;pushClear:(from:StreetBody,to:StreetBody)=>boolean};
const angle=(a:number,b:number)=>Math.atan2(Math.sin(b-a),Math.cos(b-a));
const clamp=(v:number,a:number,b:number)=>Math.max(a,Math.min(b,v));
/** Distance along the target's heading until its OBB meets the blocker.
 * A projected bounding-box gap is incorrect for oblique cars: their empty
 * corners can report deep penetration while the actual bumpers only touch. */
function forwardContactGap(a:StreetBody,b:StreetBody):number{
 const s=Math.sin(a.yaw),c=Math.cos(a.yaw),dx=b.x-a.x,dz=b.z-a.z;
 let enter=-Infinity,exit=Infinity;
 for(const [x,z] of [[s,c],[c,-s],[Math.sin(b.yaw),Math.cos(b.yaw)],[Math.cos(b.yaw),-Math.sin(b.yaw)]]){
  const radius=(p:StreetBody)=>Math.abs(x*Math.sin(p.yaw)+z*Math.cos(p.yaw))*p.length/2+Math.abs(x*Math.cos(p.yaw)-z*Math.sin(p.yaw))*p.width/2;
  const r=radius(a)+radius(b),d=dx*x+dz*z,v=s*x+c*z;
  if(Math.abs(v)<1e-8){if(Math.abs(d)>=r)return Infinity;continue;}
  const lo=(d-r)/v,hi=(d+r)/v;
  enter=Math.max(enter,Math.min(lo,hi));exit=Math.min(exit,Math.max(lo,hi));
 }
 return exit>=Math.max(0,enter)?enter:Infinity;
}
/** Task-owned vehicle dynamics, separate from the pedestrian proximity objective. */
export class NativeVehicleNpc{
 readonly route:VehicleRoute;readonly points:V2[];readonly length:number;
 distance:number;speed:number;hold=0;qualified=false;contacts=0;
 outcome:'success'|'failure'|null=null;
 correction={x:0,z:0,speed:0};
 private contact=false;private contactClear=0;private impulse=0;private impulseLeft=0;private lost=0;
 private reactionSeconds=0;private collisionSpeedLimit:number|null=null;private peakClosing=0;private playerImpulse=0;
 private previousYaw:number|null=null;
 private motorcycleHits=0;private knockdownElapsed=-1;private knockdownSide=1;private motorcycleArmed=true;private separatedFor=0;
 constructor(points:readonly V2[],readonly rules:NpcRules,readonly fit:NpcVehicleFit,private world:World){
  this.route=new VehicleRoute(points,rules.speed,(x,z,yaw)=>world.clear(this.bodyAt({point:[x,z],yaw})),TARGET_CORNER_SPEED_SCALE);
  this.points=this.route.points;this.length=this.route.length;this.distance=Math.min(rules.headStart,this.length*.2);this.speed=this.route.sample(this.distance).limit;
 }
 get pose(){return this.route.sample(this.distance);}
 get arrived(){return this.distance>=this.length-1e-6;}
 get motorcycleInterception(){return !!this.fit.motorcycle&&this.rules.kind==='chase';}
 get knockdown():MotorcycleKnockdown|null{
  if(!this.motorcycleInterception)return null;
  const r=MOTORCYCLE_INTERCEPT_RULES,t=this.knockdownElapsed,end=r.fallSeconds+r.downSeconds;
  const phase=t<0?'riding':t<r.fallSeconds?'falling':t<end?'down':'recovering';
  const u=phase==='falling'?clamp(t/r.fallSeconds,0,1):phase==='recovering'?1-clamp((t-end)/r.riseSeconds,0,1):phase==='down'?1:0;
  return {hits:this.motorcycleHits,elapsed:t,side:this.knockdownSide,blend:u*u*(3-2*u),phase,armed:this.motorcycleArmed};
 }
 bodyAt(p:{point:V2;yaw:number}):StreetBody{
  const k=this.knockdown,roll=(k?.blend??0)*1.35;
  const sideOffset=-(k?.side??0)*Math.sin(roll)*this.fit.height/2;
  return {id:this,x:p.point[0]+Math.cos(p.yaw)*sideOffset,z:p.point[1]-Math.sin(p.yaw)*sideOffset,y:this.world.height(...p.point),yaw:p.yaw,width:this.fit.width*Math.cos(roll)+this.fit.height*Math.sin(roll),length:this.fit.length,height:this.fit.height*Math.cos(roll)+this.fit.width*Math.sin(roll),kind:this.fit.motorcycle?'bike':'car'};
 }
 get body(){return this.bodyAt(this.pose);}
 get snapshot(){return {distance:this.distance,speed:this.speed,yaw:this.pose.yaw,hold:this.hold,qualified:this.qualified,contacts:this.contacts,contact:this.contact,contactClear:this.contactClear,impulse:this.impulse,impulseLeft:this.impulseLeft,playerImpulse:this.playerImpulse,reactionSeconds:this.reactionSeconds,collisionSpeedLimit:this.collisionSpeedLimit,peakClosing:this.peakClosing,lost:this.lost,previousYaw:this.previousYaw,knockdown:this.knockdown,separatedFor:this.separatedFor,outcome:this.outcome};}
 step(dt:number,previous:V2,position:V2,valid:boolean,player?:InterceptPlayer):'success'|'failure'|null{
  this.correction={x:0,z:0,speed:0};
  if(this.outcome)return this.outcome;
  if(!Number.isFinite(dt)||dt<=0)return null;
  // Short physics steps and relative swept OBB tests, independent of GUI action duration.
  const elapsed=Math.min(dt,.25),travel=Math.hypot(position[0]-previous[0],position[1]-previous[1]);
  const steps=Math.max(1,Math.ceil(elapsed/.01),Math.ceil((travel+this.speed*elapsed)/.12)),h=elapsed/steps;
  const yaw=player?.yaw??0,oldYaw=this.previousYaw??yaw;this.previousYaw=yaw;
  for(let i=1;i<=steps;i++){
   if(this.knockdownElapsed>=0){
    this.knockdownElapsed+=h;
    const r=MOTORCYCLE_INTERCEPT_RULES;
    if(this.knockdownElapsed>=r.fallSeconds+r.downSeconds+r.riseSeconds&&this.motorcycleHits<r.hits)this.knockdownElapsed=-1;
   }
   const t=i/steps,oldDistance=this.distance,before=this.body;
   const p=player?{...player,x:previous[0]+(position[0]-previous[0])*t+this.correction.x,z:previous[1]+(position[1]-previous[1])*t+this.correction.z,yaw:oldYaw+angle(oldYaw,yaw)*t,speed:player.speed+this.correction.speed}:null;
   const sameFloor=!!p&&Math.abs(p.y-before.y)<1.2;
   const dx=p?p.x-before.x:0,dz=p?p.z-before.z:0,s=Math.sin(before.yaw),c=Math.cos(before.yaw);
   const forward=dx*s+dz*c,lateral=dx*c-dz*s,relativeYaw=p?angle(before.yaw,p.yaw):0;
   const halfForward=p?(Math.abs(Math.cos(relativeYaw))*p.length+Math.abs(Math.sin(relativeYaw))*p.width)/2:0;
   const halfSide=p?(Math.abs(Math.cos(relativeYaw))*p.width+Math.abs(Math.sin(relativeYaw))*p.length)/2:0;
   const gap=p?forwardContactGap(before,p):Infinity;
   const ahead=valid&&sameFloor&&forward>0&&forward>=Math.hypot(dx,dz)*.5;
   const blocking=ahead&&gap<8&&gap>-.8;
   this.lost=blocking?0:this.lost+h;
   if(!valid||this.lost>1){this.qualified=false;this.hold=0;}
   if(!valid){this.impulse=0;this.playerImpulse=0;this.impulseLeft=0;this.contact=false;this.peakClosing=0;}
   this.reactionSeconds=Math.max(0,this.reactionSeconds-h);
   if(!this.reactionSeconds)this.collisionSpeedLimit=null;
   const knockedDown=this.knockdownElapsed>=0;
   const target=knockedDown||this.qualified&&blocking?0:Math.min(this.route.sample(this.distance).limit,this.collisionSpeedLimit??Infinity);
   const brake=knockedDown?MOTORCYCLE_INTERCEPT_RULES.brake:this.qualified&&blocking||this.reactionSeconds>0?INTERCEPT_RULES.brake:8;
   let impact=0;
   if(this.impulseLeft>0){
    impact=Math.min(this.impulse,this.impulse/this.impulseLeft*h,(INTERCEPT_RULES.maxDeceleration-brake)*h);this.impulse-=impact;
    // Resolve along the player's own forward axis, not the NPC's: a 90-degree
    // side strike must slow the striking car too. Never deliver debt remotely.
    const kick=clamp(this.playerImpulse/this.impulseLeft*h,-18*h,18*h);
    if(p&&valid&&sameFloor&&Math.hypot(dx,dz)<(p.length+this.fit.length)/2+2){this.correction.speed+=kick;this.playerImpulse-=kick;}
    else this.playerImpulse=0;
    this.impulseLeft=Math.max(0,this.impulseLeft-h);if(!this.impulseLeft){this.impulse=0;this.playerImpulse=0;}
   }
   const oldSpeed=this.speed;
   this.speed=clamp(this.speed+clamp(target-this.speed,-brake*h,INTERCEPT_RULES.recovery*h)-impact,0,this.rules.speed);
   this.distance=Math.min(this.length,this.distance+(oldSpeed+this.speed)*.5*h);
   const next=this.body,depth=p&&valid&&sameFloor?streetOverlap(next,p):0;
   if(depth>0&&p){
    if(!this.contact){
     this.contacts++;
    }
    // Project along the shallowest separating axis; never shove into scenery.
    const axes=[[s,c],[c,-s],[Math.sin(p.yaw),Math.cos(p.yaw)],[Math.cos(p.yaw),-Math.sin(p.yaw)]];
    let correction:{x:number;z:number}|null=null,best=Infinity;
    for(const [ax,az] of axes){
     const radius=(b:StreetBody)=>Math.abs(ax*Math.sin(b.yaw)+az*Math.cos(b.yaw))*b.length/2+Math.abs(ax*Math.cos(b.yaw)-az*Math.sin(b.yaw))*b.width/2;
     const dot=(p.x-next.x)*ax+(p.z-next.z)*az,push=radius(p)+radius(next)-Math.abs(dot)+.002;
     if(push<best){best=push;correction={x:ax*Math.sign(dot||1)*push,z:az*Math.sign(dot||1)*push};}
    }
    // A target driving into a parked/angled roadblock pushes in its direction
    // of travel. The shallowest SAT axis otherwise slides the blocking car
    // sideways every substep until the front gate disappears and reaccelerates.
    // Keep lateral responses for real side/rear strikes and deep spawn overlaps.
    const frontPenetration=-forwardContactGap(next,p);
    if(!this.motorcycleInterception&&ahead&&blocking&&frontPenetration>=0&&frontPenetration<.5){
     correction={x:Math.sin(next.yaw)*(frontPenetration+.002),z:Math.cos(next.yaw)*(frontPenetration+.002)};
    }
    const length=Math.hypot(correction!.x,correction!.z),nx=correction!.x/length,nz=correction!.z/length;
    const vx=Math.sin(next.yaw)*this.speed-Math.sin(p.yaw)*p.speed,vz=Math.cos(next.yaw)*this.speed-Math.cos(p.yaw)*p.speed;
    const rx=p.x-next.x,rz=p.z-next.z,distance=Math.max(.001,Math.hypot(rx,rz));
    const closing=Math.max(0,vx*nx+vz*nz,(vx*rx+vz*rz)/distance);
    if(!this.motorcycleInterception){
     // Physical reaction is independent of the objective's front-only gate.
     // Remember peak approach speed to avoid repeated impulses while touching,
     // but allow a harder shove after an initially gentle contact.
     if(ahead&&forward>this.fit.length*.3)this.qualified=true;
     if(closing>=1){
      const increment=Math.max(0,closing-this.peakClosing),share=p.mass/(p.mass+this.fit.mass);
      if(increment>0){
       const deltaV=1.1*increment*share,first=this.peakClosing<1;
       this.impulse+=deltaV*(.25+.75*Math.max(0,nx*s+nz*c));
       this.playerImpulse+=deltaV*this.fit.mass/p.mass*(nx*Math.sin(p.yaw)+nz*Math.cos(p.yaw));
       this.impulseLeft=INTERCEPT_RULES.impulseSeconds;
       this.collisionSpeedLimit=Math.max(0,Math.min(this.speed,this.collisionSpeedLimit??this.speed)-deltaV*.65-(first?2:0));
       this.reactionSeconds=Math.max(this.reactionSeconds,clamp(.8+.05*deltaV,1,1.8));
       this.peakClosing=closing;
      }
      // Sustained squeezing makes the driver keep braking, without lateral
      // teleportation or converting a side impact into interception success.
      this.collisionSpeedLimit=Math.max(0,Math.min(this.speed,this.collisionSpeedLimit??this.speed)-5*share*h);
      this.reactionSeconds=Math.max(this.reactionSeconds,.4);
     }
    }
    if(this.motorcycleInterception&&this.motorcycleArmed&&!knockedDown){
     // An unsuccessful gentle touch must not latch the whole contact out:
     // continuing to accelerate into the bike can still destabilize it.
     // The minimum-translation axis alone is ambiguous at bumper corners;
     // also measure approach toward the bike so offset rear impacts count.
     if(closing>=MOTORCYCLE_INTERCEPT_RULES.minClosingSpeed){
      this.motorcycleHits++;this.knockdownElapsed=0;this.motorcycleArmed=false;this.separatedFor=0;
      // Fall away from the striking vehicle; prefer the road-clear side.
      const preferred=lateral>=0?1:-1,roll=1.35;
      const fallen={...next,width:this.fit.width*Math.cos(roll)+this.fit.height*Math.sin(roll),height:this.fit.height*Math.cos(roll)+this.fit.width*Math.sin(roll)};
      this.knockdownSide=preferred;
      const offset=(side:number)=>({...fallen,x:fallen.x-side*Math.cos(next.yaw)*Math.sin(roll)*this.fit.height/2,z:fallen.z+side*Math.sin(next.yaw)*Math.sin(roll)*this.fit.height/2});
      if(!this.world.clear(offset(preferred))&&this.world.clear(offset(-preferred)))this.knockdownSide=-preferred;
     }
    }
    const shifted={...p,x:p.x+correction!.x,z:p.z+correction!.z};
    if(this.world.pushClear(p,shifted)){this.correction.x+=correction!.x;this.correction.z+=correction!.z;}
    else this.distance=oldDistance;
   }
   if(depth>0){this.contact=true;this.contactClear=0;}
   else{this.contactClear+=h;if(this.contactClear>.3){this.contact=false;this.peakClosing=0;}}
   if(this.motorcycleInterception&&!this.motorcycleArmed){
    const clearance=Math.max(Math.abs(lateral)-(before.width/2+halfSide),Math.abs(forward)-(before.length/2+halfForward));
    this.separatedFor=p&&valid&&sameFloor&&depth===0&&clearance>=MOTORCYCLE_INTERCEPT_RULES.rearmClearance?this.separatedFor+h:0;
    if(this.knockdownElapsed<0&&this.separatedFor>=MOTORCYCLE_INTERCEPT_RULES.rearmSeconds)this.motorcycleArmed=true;
   }
   if(this.rules.kind==='follow'){
    const q=this.pose.point;
    if(Math.hypot(previous[0]+(position[0]-previous[0])*t-q[0],previous[1]+(position[1]-previous[1])*t-q[1])>this.rules.radius+1e-8)return this.outcome='failure';
    if(this.arrived&&valid)return this.outcome='success';
   }else{
    // Endpoint escape wins ties. A natural slow corner is never an interception.
    if(this.arrived)return this.outcome='failure';
    if(this.motorcycleInterception){
     // The third knockdown completes after the visible fall and braking,
     // so the success dialog never freezes the bike upright or at full speed.
     if(this.motorcycleHits>=MOTORCYCLE_INTERCEPT_RULES.hits&&this.knockdownElapsed>=MOTORCYCLE_INTERCEPT_RULES.fallSeconds&&this.speed<=1)return this.outcome='success';
     continue;
    }
    this.hold=this.qualified&&blocking&&gap<2.5&&this.speed<=INTERCEPT_RULES.speed&&p&&Math.abs(p.speed)<=4?this.hold+h:0;
    if(this.hold>=INTERCEPT_RULES.hold-1e-8)return this.outcome='success';
   }
  }
  return null;
 }
}
