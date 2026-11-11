export type WaterBubble={x:number;y:number;z:number;age:number;life:number;radius:number;vx:number;vz:number;rise:number};
/** Bounded, deterministic visual particles; never changes physics or RNG. */
export class UnderwaterTrail{
 readonly particles:WaterBubble[]=[];private previous:{x:number;y:number;z:number}|null=null;private clock=0;private serial=0;
 constructor(readonly submarine=false){}
 reset(){this.particles.length=0;this.previous=null;this.clock=0;this.serial=0;}
 step(x:number,y:number,z:number,yaw:number,waterHeight:number,dt:number,active=true){
  if(!(dt>0))return;
  const distance=this.previous?Math.hypot(x-this.previous.x,y-this.previous.y,z-this.previous.z):0;
  if(distance>Math.max(8,dt*20)){this.reset();this.previous={x,y,z};return;}
  this.previous={x,y,z};
  for(let i=this.particles.length-1;i>=0;i--){const p=this.particles[i];p.age+=dt;p.x+=p.vx*dt;p.z+=p.vz*dt;p.y+=p.rise*dt;if(p.age>=p.life||p.y>=waterHeight-.035)this.particles.splice(i,1);}
  const speed=distance/dt;
  if(!active||y>waterHeight-.45||speed<(this.submarine?1.8:.12)){this.clock=0;return;}
  this.clock+=dt;const interval=this.submarine?.10:.18;if(this.clock<interval)return;this.clock%=interval;
  const s=Math.sin(yaw),c=Math.cos(yaw),offset=this.submarine?-2.5:.38;
  for(let i=0;i<3;i++){
   const n=++this.serial,jitter=Math.sin(n*2.399),side=jitter*(this.submarine?.27:.12);
   this.particles.push({x:x+s*offset+c*side,y:y+(this.submarine?0:.12),z:z+c*offset-s*side,age:0,
    life:this.submarine?2.4:3.2,radius:(this.submarine?.055:.025)+.018*(1+Math.cos(n*1.7)),
    vx:c*jitter*.12-s*(this.submarine?.65:.08),vz:-s*jitter*.12-c*(this.submarine?.65:.08),rise:this.submarine?.12:.38});
  }
  if(this.particles.length>96)this.particles.splice(0,this.particles.length-96);
 }
}
