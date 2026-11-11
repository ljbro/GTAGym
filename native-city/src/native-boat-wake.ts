/** Cosmetic only. World-space foam follows the actual travelled path, not
 * throttle input. Simulation dt makes inference/pause freeze it as well. */
export type WakePatch={x:number;z:number;yaw:number;age:number;life:number;width:number;length:number;vx:number;vz:number;strength:number;seed:number};
export class BoatWake{
 readonly patches:WakePatch[]=[];
 private previous:{x:number;z:number}|null=null;
 private clock=0;private serial=0;
 constructor(readonly halfWidth:number,readonly halfLength:number,readonly swimmer=false){}
 reset(){this.patches.length=0;this.previous=null;this.clock=0;this.serial=0;}
 step(x:number,z:number,yaw:number,speed:number,dt:number,grounded=false){
  if(!(dt>0))return;
  const distance=this.previous?Math.hypot(x-this.previous.x,z-this.previous.z):0;
  if(distance>Math.max(8,Math.abs(speed)*dt*3)){this.reset();this.previous={x,z};return;}
  this.previous={x,z};
  for(let i=this.patches.length-1;i>=0;i--){const p=this.patches[i];p.age+=dt;p.x+=p.vx*dt;p.z+=p.vz*dt;if(p.age>=p.life)this.patches.splice(i,1);}
  const actualSpeed=Math.min(Math.abs(speed),distance/dt);
  if(grounded||actualSpeed<.45){this.clock=0;return;}
  const interval=this.swimmer?.22:.085;
  this.clock+=dt;if(this.clock<interval)return;this.clock%=interval;
  const strength=Math.min(1,actualSpeed/(this.swimmer?2.4:6)),direction=speed<0?-1:1;
  const s=Math.sin(yaw),c=Math.cos(yaw);
  const emit=(u:number,v:number,w:number,l:number,spread:number,life:number,power:number)=>{
   this.patches.push({x:x+c*u+s*v,z:z-s*u+c*v,yaw,age:0,life,width:w,length:l,
    vx:c*spread,vz:-s*spread,strength:power*strength,seed:++this.serial%97});
  };
  // Human strokes leave short, faint ripples, never a motorboat foam carpet.
  if(this.swimmer){for(const side of [-1,1])emit(side*.36,.16,.36,.65,side*.12,1.25,.18);return;}
  // Bow splits around the hull; side foam spreads into the familiar V wake.
  for(const side of [-1,1]){
   emit(side*this.halfWidth*.82,direction*this.halfLength*.60,.45+strength*.35,1.4+strength,side*(.35+strength*.45),3.6,.60);
   emit(side*this.halfWidth,-direction*this.halfLength*.85,.7+strength*.5,1.8,side*(.25+strength*.45),5.5,.48);
  }
  emit(0,-direction*(this.halfLength+.45),.8+strength*.6,1.8+strength*1.5,0,4.5,.72);
  // Bounded cost even during long free-roam sessions.
  if(this.patches.length>320)this.patches.splice(0,this.patches.length-320);
 }
}
