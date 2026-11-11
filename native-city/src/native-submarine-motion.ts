import {MarineFacilityLayout,MARINE_PIPE,SUBMARINE_TASK} from './native-marine-facility.ts';
import type {NativeWaterSpec} from './native-water-motion.ts';
const clamp=(x:number,a:number,b:number)=>Math.max(a,Math.min(b,x));
const approach=(a:number,b:number,d:number)=>a+clamp(b-a,-d,d);
export class NativeSubmarineMotion{
 readonly mode='submarine';readonly layout:MarineFacilityLayout;
 x=0;z=0;yaw=0;speed=0;depth=0;verticalSpeed=0;enteredPipe=false;
 orbitYaw=0;orbitPitch=.16;firstPerson=false;
 constructor(readonly spec:NativeWaterSpec=SUBMARINE_TASK,private sea:(x:number,z:number)=>boolean=()=>true){this.layout=new MarineFacilityLayout(spec);this.reset();}
 navigationClear(x:number,z:number){const [u,v]=this.layout.local(x,z);return this.sea(x,z)&&this.layout.clear(u,this.y,v,.25);}
 get y(){return this.spec.waterHeight-this.depth;}
 reset(){[this.x,this.z]=this.spec.path.points[0];this.depth=this.spec.startDepth;this.yaw=Math.atan2(this.spec.path.forward[0],this.spec.path.forward[1]);this.speed=0;this.verticalSpeed=0;this.enteredPipe=false;this.orbitYaw=0;this.orbitPitch=.16;this.firstPerson=false;}
 look(dx:number,dy:number){this.orbitYaw+=dx*.004;this.orbitPitch=clamp(this.orbitPitch+dy*.003,-.6,.85);}
 toggleView(){this.firstPerson=!this.firstPerson;}
 /** Seven overlapping spheres cover the hull, outriggers and tail. */
 clear(x:number,z:number,y:number,yaw:number){
  if(y>this.spec.waterHeight-.2)return false;
  for(let i=-3;i<=3;i++){
   const px=x+Math.sin(yaw)*i*.65,pz=z+Math.cos(yaw)*i*.65,[u,v]=this.layout.local(px,pz);
   if(!this.sea(px,pz)||!this.layout.clear(u,y,v,1.4))return false;
  }return true;
 }
 step(keys:ReadonlySet<string>,dt:number){
  let left=clamp(dt,0,.25);while(left>1e-8){const h=Math.min(left,1/120);left-=h;
   const throttle=(keys.has('KeyW')?1:0)-(keys.has('KeyS')?1:0),turn=(keys.has('KeyD')?1:0)-(keys.has('KeyA')?1:0);
   this.speed=approach(this.speed,throttle>0?5:throttle<0?-2:0,(throttle?1.8:2.3)*h);
   const up=(keys.has('Space')?1:0)-(keys.has('ControlLeft')||keys.has('ControlRight')?1:0);
   this.verticalSpeed=approach(this.verticalSpeed,up*1.3,2*h);
   const yaw=this.yaw+turn*.55*h;
   if(this.clear(this.x,this.z,this.y,yaw))this.yaw=yaw;
   const ny=this.y+this.verticalSpeed*h;
   if(this.clear(this.x,this.z,ny,this.yaw))this.depth=this.spec.waterHeight-ny;else this.verticalSpeed=0;
   const x=this.x+Math.sin(this.yaw)*this.speed*h,z=this.z+Math.cos(this.yaw)*this.speed*h;
   const [beforeU,beforeV]=this.layout.local(this.x,this.z);
   if(this.clear(x,z,this.y,this.yaw)){
    this.x=x;this.z=z;const [u,v]=this.layout.local(x,z);
    if(beforeV<MARINE_PIPE.mouth&&v>=MARINE_PIPE.mouth&&Math.abs(u)<2.6&&Math.abs(beforeU)<2.6&&Math.abs(this.depth-MARINE_PIPE.depth)<2.6)this.enteredPipe=true;
    if(v<MARINE_PIPE.mouth-4)this.enteredPipe=false;
   }else this.speed=0;
  }
 }
 canFinish(){
  const [u,v]=this.layout.local(this.x,this.z),p=MARINE_PIPE;
  const angle=this.yaw-Math.atan2(this.spec.path.forward[0],this.spec.path.forward[1]);
  return this.enteredPipe&&v>=p.goal&&v<=p.end-4&&Math.hypot(u,this.depth-p.depth)<p.inner-1.4&&Math.cos(angle)>.85&&this.clear(this.x,this.z,this.y,this.yaw);
 }
 diagnostics(){return {mode:this.mode,depth:this.depth,local:this.layout.local(this.x,this.z),enteredPipe:this.enteredPipe,canFinish:this.canFinish()};}
}
