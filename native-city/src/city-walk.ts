import {clamp} from './driving.ts';
import {linkPosition,walkTraversalPose,type WalkLink,type WalkPoint} from './native-walk-traversal.ts';
export const WALK_SPEED=1.6;
export const RUN_SPEED=4.2;
export const WALK_RADIUS=.23;
export const WALK_BODY_HEIGHT=1.75;
export const JUMP_SPEED=6.2;
export const WALK_GRAVITY=18;
export const LADDER_SPEED=1.5;
export const LADDER_FAST_SPEED=2.6;
export const LADDER_SLIDE_SPEED=4.5;
export type WalkLadder={id:string;x:number;z:number;bottom:number;top:number;yaw:number;exit:{x:number;z:number};link?:WalkLink;reverseLinkId?:string};
export type WalkEnvironment={
 floorAt:(x:number,z:number,maxY:number)=>number;
 ladders:readonly WalkLadder[];
};
export type LadderMotion={ladder:WalkLadder;phase:'climb'|'exit'|'enter';progress:number;fromBottom:boolean;sliding:boolean;waitForUpRelease:boolean};
type Vehicle={x:number;z:number;yaw:number;speed:number};
/** Walking state and odometer are independent of the parked vehicle. */
export class CityWalk {
 active=false;x=0;z=0;yaw=0;pitch=0;distance=0;moving=false;speed=0;cameraDistance=3.7;
 verticalSpeed=0;grounded=true;jumps=0;landings=0;completedClimbs=0;lastClimbedLadder:string|null=null;
 ladder:LadderMotion|null=null;
 coverCrouched=false;crouchBlend=0;
 enterCover(yaw:number){if(!this.active||!this.grounded||this.traversing)return false;this.coverCrouched=true;this.yaw=yaw;this.speed=0;this.moving=false;return true;}
 private physicalY:number|null=null;private jumpHeld=false;private ladderCooldown=0;
 private airX=0;private airZ=0;
 constructor(private blocked:(x:number,z:number,y:number)=>boolean,private heightAt:(x:number,z:number)=>number,private environment?:WalkEnvironment){}
 get y(){return this.physicalY??this.heightAt(this.x,this.z);}
 set y(value:number){this.physicalY=value;}
 get feetY(){return this.y;}
 get airborne(){return !this.grounded&&!this.ladder&&!this.traversalMotion;}
 links:WalkLink[]=[];completedLinks=new Set<string>();
 traversalClear:((point:WalkPoint,link:WalkLink)=>boolean)|null=null;
 private traversalMotion:{link:WalkLink;t:number}|null=null;
 get traversing(){return !!this.traversalMotion||!!this.ladder;}
 get traversalPose(){
  const m=this.traversalMotion,p={x:this.x,y:this.y,z:this.z};if(m)return walkTraversalPose(m.link,m.t,p,this.yaw);
  const l=this.ladder;if(!l?.ladder.link)return null;
  const t=l.phase==='exit'?.78+l.progress*.22:l.phase==='enter'?1-l.progress*.22:.12+.66*(this.y-l.ladder.bottom)/(l.ladder.top-l.ladder.bottom);
  return walkTraversalPose(l.ladder.link,t,p,this.yaw,false,l.sliding);
 }
 resetMotion(){this.coverCrouched=false;this.crouchBlend=0;this.resetVertical();this.completedLinks.clear();}
 private startTraversal(){
  const link=this.links.find(link=>link.kind!=='ladder'&&Math.hypot(link.from.x-this.x,link.from.z-this.z)<(link.triggerRadius??1.6)&&Math.abs(link.from.y-this.y)<.7&&
   ((link.to.x-link.from.x)*Math.sin(this.yaw)+(link.to.z-link.from.z)*Math.cos(this.yaw))/Math.max(.01,Math.hypot(link.to.x-link.from.x,link.to.z-link.from.z))>.3);
  if(link){
   if(!this.clear(link.to.x,link.to.z,link.to.y)||Math.abs(this.heightAt(link.to.x,link.to.z)-link.to.y)>.45)return false;
   const actual={...link,from:{x:this.x,y:this.y,z:this.z}};
   for(let i=0;i<=40;i++)if(this.traversalClear&&!this.traversalClear(linkPosition(actual,i/40),actual))return false;
   this.traversalMotion={link:actual,t:0};return true;
  }
  const x=this.x+Math.sin(this.yaw)*1.1,z=this.z+Math.cos(this.yaw)*1.1,h=this.heightAt(x,z),rise=h-this.y;
  if(rise>.48&&rise<=1.5&&this.clear(x,z,h)){
   const ledge:WalkLink={id:'native-ledge',kind:'climb',from:{x:this.x,y:this.y,z:this.z},to:{x,y:h,z},top:h,duration:1.3};
   for(let i=0;i<=30;i++){const p=linkPosition(ledge,i/30);if(this.traversalClear?!this.traversalClear(p,ledge):!this.clear(p.x,p.z,p.y))return false;}
   this.traversalMotion={link:ledge,t:0};return true;
  }
  return false;
 }
 get motion(){return this.ladder?'climbing':this.grounded?'grounded':this.verticalSpeed>0?'jumping':'falling';}
 resetVertical(){this.traversalMotion=null;this.physicalY=this.heightAt(this.x,this.z);this.verticalSpeed=0;this.grounded=true;this.ladder=null;this.jumpHeld=false;this.airX=this.airZ=0;this.ladderCooldown=0;}
 private floor(x:number,z:number,maxY:number){return this.environment?.floorAt(x,z,maxY)??this.heightAt(x,z);}
 clear(x:number,z:number,y=this.y){
  if(!Number.isFinite(this.heightAt(x,z))||this.blocked(x,z,y))return false;
  for(let i=0;i<8;i++){const a=i*Math.PI/4;if(this.blocked(x+Math.cos(a)*WALK_RADIUS,z+Math.sin(a)*WALK_RADIUS,y))return false;}
  return true;
 }
 private doors(car:{x:number;z:number;yaw:number},offset:number){return [offset,-offset,offset+.9,-offset-.9].map(side=>({x:car.x+Math.cos(car.yaw)*side,z:car.z-Math.sin(car.yaw)*side}));}
 exitCar(car:Vehicle,doorOffset=1.9){
  if(Math.abs(car.speed)>1)return false;
  const floor=this.heightAt(car.x,car.z);
  for(const p of this.doors(car,doorOffset)){
   // Reject a bridge edge, wall, vehicle hull, water or unsupported ground.
   if(!this.clear(p.x,p.z,this.heightAt(p.x,p.z))||Math.abs(this.heightAt(p.x,p.z)-floor)>.55)continue;
   this.x=p.x;this.z=p.z;this.yaw=car.yaw;this.pitch=.06;this.active=true;this.moving=false;this.speed=0;this.resetVertical();return true;
  }
  return false;
 }
 canEnter(car:{x:number;z:number;yaw?:number;speed?:number},radius=5,doorOffset=1.9){
  if(!this.grounded||this.ladder||this.traversalMotion||Math.abs(car.speed??0)>1||Math.hypot(this.x-car.x,this.z-car.z)>=radius||Math.abs(this.y-this.heightAt(car.x,car.z))>.8)return false;
  // A nearby car behind a wall is not reachable. Check the path to a door,
  // excluding the hull rather than ignoring all collision for the last metre.
  return this.doors({...car,yaw:car.yaw??0},doorOffset).some(p=>{
   const distance=Math.hypot(p.x-this.x,p.z-this.z);if(distance>2.7||!this.clear(p.x,p.z))return false;
   const steps=Math.max(1,Math.ceil(distance/.15));let previous=this.heightAt(this.x,this.z);
   for(let i=1;i<=steps;i++){const x=this.x+(p.x-this.x)*i/steps,z=this.z+(p.z-this.z)*i/steps,h=this.heightAt(x,z);if(!this.clear(x,z)||Math.abs(h-previous)>.48)return false;previous=h;}
   return true;
  });
 }
 zoom(delta:number){this.cameraDistance=clamp(this.cameraDistance*Math.exp(clamp(delta,-400,400)*.0014),1.5,7);}
 look(dx:number,dy:number){this.yaw+=dx*.004;this.pitch=clamp(this.pitch+dy*.003,-1.0,1.05);}
 private get ladders():WalkLadder[]{
  const result=[...this.environment?.ladders??[]];
  // Older roof tasks describe ladders as paired traversal links. Use the same
  // physical controls as the permanent city ladder, retaining their rung IK
  // and directional completion IDs. Space still owns vaults and low ledges.
  for(const link of this.links){
   const g=link.ladder;if(link.kind!=='ladder'||!g||link.to.y<=link.from.y)continue;
   const reverse=this.links.find(other=>other.kind==='ladder'&&other.from.x===link.to.x&&other.from.z===link.to.z&&other.from.y===link.to.y&&other.to.y===link.from.y);
   result.push({id:link.id,x:g.plane.x+g.outward.x*g.bodyOffset,z:g.plane.z+g.outward.z*g.bodyOffset,bottom:link.from.y,top:link.to.y,
    yaw:Math.atan2(-g.outward.x,-g.outward.z),exit:link.to,link,reverseLinkId:reverse?.id});
  }
  return result;
 }
 private ladderClear(ladder:WalkLadder,x:number,z:number,y:number){
  return ladder.link&&this.traversalClear?this.traversalClear({x,y,z},ladder.link):this.clear(x,z,y);
 }
 nearbyLadder(){
  if(!this.active||!this.grounded||this.ladder||this.traversalMotion||this.ladderCooldown>0)return null;
  for(const ladder of this.ladders){
   const nx=Math.sin(ladder.yaw),nz=Math.cos(ladder.yaw),dx=this.x-ladder.x,dz=this.z-ladder.z;
   if(Math.abs(dx*nz-dz*nx)>.4)continue;
   const atTop=Math.abs(this.y-ladder.top)<.15&&Math.hypot(this.x-ladder.exit.x,this.z-ladder.exit.z)<.85;
   const atBottom=Math.abs(this.y-ladder.bottom)<.35&&Math.hypot(dx,dz)<.9&&dx*nx+dz*nz<.15&&Math.cos(this.yaw-ladder.yaw)>.45;
   if(atTop||atBottom)return {ladder,atTop};
  }
  return null;
 }
 private attachLadder(vx:number,vz:number,keys:Set<string>){
  const near=this.nearbyLadder();if(!near)return false;
  const {ladder,atTop}=near;
  // GTA-style contextual mounting: approach the rungs from the ground, or
  // approach the outward-facing ladder lip from its roof landing. Merely
  // standing nearby, passing sideways or walking away must never grab it.
  const speed=Math.hypot(vx,vz),toward=(vx*Math.sin(ladder.yaw)+vz*Math.cos(ladder.yaw))*(atTop?-1:1);
  if(speed===0||toward/speed<.65)return false;
  // Do not snap through a wall to grab a nearby ladder.
  const end=atTop?ladder.exit:ladder;
  for(let i=1;i<=8;i++)if(!this.ladderClear(ladder,this.x+(end.x-this.x)*i/8,this.z+(end.z-this.z)*i/8,this.y))return false;
  this.x=end.x;this.z=end.z;this.physicalY=atTop?ladder.top:ladder.bottom;this.yaw=ladder.yaw;this.pitch=-.12;
  this.verticalSpeed=0;this.grounded=false;this.moving=false;
  this.ladder={ladder,phase:atTop?'enter':'climb',progress:0,fromBottom:!atTop,sliding:false,waitForUpRelease:atTop&&keys.has('KeyW')&&!keys.has('KeyS')};return true;
 }
 private stepLadder(keys:Set<string>,dt:number){
  const motion=this.ladder!,ladder=motion.ladder;this.yaw=ladder.yaw;this.speed=0;this.moving=false;
  motion.sliding=false;
  // W used to approach the roof edge must not immediately send the character
  // back onto the roof after the automatic turn. S can descend immediately;
  // releasing W restores the ordinary up/down mapping.
  if(!keys.has('KeyW')||keys.has('KeyS'))motion.waitForUpRelease=false;
  if(motion.phase==='climb'){
   const direction=(keys.has('KeyW')&&!motion.waitForUpRelease?1:0)-(keys.has('KeyS')?1:0),fast=keys.has('ShiftLeft')||keys.has('ShiftRight');
   motion.sliding=direction<0&&fast;
   this.verticalSpeed=direction*(fast?(direction<0?LADDER_SLIDE_SPEED:LADDER_FAST_SPEED):LADDER_SPEED);
   const y=clamp(this.y+this.verticalSpeed*dt,ladder.bottom,ladder.top);
   if(!this.ladderClear(ladder,this.x,this.z,y)){this.verticalSpeed=0;motion.sliding=false;return;}
   this.physicalY=y;
   this.moving=this.verticalSpeed!==0;
   if(this.y>=ladder.top&&this.verticalSpeed>0){motion.phase='exit';motion.progress=0;this.verticalSpeed=0;}
   else if(this.y<=ladder.bottom&&this.verticalSpeed<0){if(!motion.fromBottom&&ladder.reverseLinkId)this.completedLinks.add(ladder.reverseLinkId);this.ladder=null;this.grounded=true;this.verticalSpeed=0;this.ladderCooldown=.5;}
  }else{
   const duration=Math.max(.55,Math.hypot(ladder.exit.x-ladder.x,ladder.exit.z-ladder.z)/3.1);
   motion.progress=Math.min(1,motion.progress+dt/duration);
   const t=motion.phase==='exit'?motion.progress:1-motion.progress;
   const x=ladder.x+(ladder.exit.x-ladder.x)*t,z=ladder.z+(ladder.exit.z-ladder.z)*t;
   if(!this.ladderClear(ladder,x,z,ladder.top)){motion.progress=Math.max(0,motion.progress-dt/duration);return;}
   this.x=x;this.z=z;this.physicalY=ladder.top;this.moving=true;
   if(motion.progress===1){
    if(motion.phase==='enter'){motion.phase='climb';motion.progress=0;}
    else{if(motion.fromBottom){this.completedClimbs++;this.lastClimbedLadder=ladder.id;if(ladder.link)this.completedLinks.add(ladder.link.id);}this.ladder=null;this.grounded=true;this.ladderCooldown=.5;}
   }
  }
 }
 step(keys:Set<string>,dt:number){
  if(!this.active)return;
  dt=clamp(dt,0,.05);if(dt===0)return;
  if(this.physicalY===null)this.physicalY=this.heightAt(this.x,this.z);
  this.speed=0;this.ladderCooldown=Math.max(0,this.ladderCooldown-dt);
  const jump=keys.has('Space')&&!this.jumpHeld;
  this.jumpHeld=keys.has('Space');
  if(this.coverCrouched){this.crouchBlend=Math.min(1,this.crouchBlend+dt/.32);this.moving=false;return;}
  if(this.traversalMotion){
   const motion=this.traversalMotion,t=Math.min(1,motion.t+dt/motion.link.duration),p=linkPosition(motion.link,t);
   if(this.traversalClear&&!this.traversalClear(p,motion.link)){this.moving=false;return;}
   const moved=Math.hypot(p.x-this.x,p.z-this.z);this.distance+=moved;this.speed=moved/dt;this.x=p.x;this.z=p.z;this.y=p.y;this.moving=true;motion.t=t;
   if(t===1){this.completedLinks.add(motion.link.id);this.traversalMotion=null;this.grounded=true;this.verticalSpeed=0;this.moving=false;this.speed=0;}return;
  }
  if(this.ladder){this.stepLadder(keys,dt);return;}
  if(jump&&this.grounded&&this.startTraversal())return;
  this.yaw+=((keys.has('ArrowRight')?1:0)-(keys.has('ArrowLeft')?1:0))*dt*1.6;
  this.pitch=clamp(this.pitch+((keys.has('ArrowDown')?1:0)-(keys.has('ArrowUp')?1:0))*dt,-1.0,1.05);
  let f=(keys.has('KeyW')?1:0)-(keys.has('KeyS')?1:0),s=(keys.has('KeyD')?1:0)-(keys.has('KeyA')?1:0);
  const length=Math.hypot(f,s);if(length){f/=length;s/=length;}
  const speed=keys.has('ShiftLeft')||keys.has('ShiftRight')?RUN_SPEED:WALK_SPEED;
  const vx=(Math.sin(this.yaw)*f+Math.cos(this.yaw)*s)*speed,vz=(Math.cos(this.yaw)*f-Math.sin(this.yaw)*s)*speed;
  if(!jump&&this.attachLadder(vx,vz,keys))return;
  if(jump&&this.grounded){this.verticalSpeed=JUMP_SPEED;this.grounded=false;this.jumps++;this.airX=vx;this.airZ=vz;}
  const oldX=this.x,oldZ=this.z;
  // Substeps prevent tunnelling at roof edges and keep the ballistic arc stable
  // across 20–120 Hz simulation. Releasing jump never adds another impulse.
  const steps=this.grounded?1:Math.ceil(dt/(1/120)),h=dt/steps;
  for(let i=0;i<steps;i++){
   if(!this.grounded){const blend=1-Math.exp(-h*(length?4:1.2));this.airX+=(vx-this.airX)*blend;this.airZ+=(vz-this.airZ)*blend;}
   const dx=(this.grounded?vx:this.airX)*h,dz=(this.grounded?vz:this.airZ)*h;
   const clear=(x:number,z:number)=>{const floor=this.floor(x,z,this.y+(this.grounded?.45:.001));return floor-this.y<(this.grounded?.48:.002)&&this.clear(x,z,this.grounded?Math.max(this.y,floor):this.y);};
   if(Math.abs(dx)+Math.abs(dz)>1e-10){
    if(clear(this.x+dx,this.z+dz)){this.x+=dx;this.z+=dz;}
    else if(clear(this.x+dx,this.z))this.x+=dx;
    else if(clear(this.x,this.z+dz))this.z+=dz;
   }
   const floor=this.floor(this.x,this.z,this.y+(this.grounded?.45:.001));
   if(this.grounded&&this.y-floor<=.48){this.physicalY=floor;this.airX=vx;this.airZ=vz;}
   else{
    this.grounded=false;const next=this.y+this.verticalSpeed*h-.5*WALK_GRAVITY*h*h;this.verticalSpeed-=WALK_GRAVITY*h;
    if(this.verticalSpeed<=0&&next<=floor){this.physicalY=floor;this.verticalSpeed=0;this.grounded=true;this.landings++;}
    else this.physicalY=next;
   }
  }
  const moved=Math.hypot(this.x-oldX,this.z-oldZ);this.distance+=moved;this.speed=dt>0?moved/dt:0;this.moving=moved>0;
 }
 get eye(){return {x:this.x,y:this.y+1.53-.65*this.crouchBlend+(this.moving&&this.grounded?Math.sin(this.distance*7)*.008:0),z:this.z};}
}
