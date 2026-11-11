import type {NativeWaterSpec} from './native-water-motion.ts';
export type BeachEnvironment={land:(x:number,z:number)=>boolean;heightAt:(x:number,z:number)=>number;blocked:(x:number,z:number)=>boolean};
export type BeachSpec=NativeWaterSpec&{shoreSegments:number[][][]};
const clamp=(x:number,a:number,b:number)=>Math.max(a,Math.min(b,x));
function nearest(a:number[],b:number[],x:number,z:number){const dx=b[0]-a[0],dz=b[1]-a[1],t=clamp(((x-a[0])*dx+(z-a[1])*dz)/Math.max(1e-9,dx*dx+dz*dz),0,1);return [a[0]+t*dx,a[1]+t*dz];}
/** One continuous bathymetry sampled both by the mesh and hull contacts. */
export class NativeBeachTerrain{
 constructor(readonly spec:BeachSpec,readonly env:BeachEnvironment){}
 at=(x:number,z:number)=>{
  if(this.env.land(x,z))return this.env.heightAt(x,z)+.035;
  let distance=Infinity,bank=[x,z];for(const [a,b] of this.spec.shoreSegments){const p=nearest(a,b,x,z),d=Math.hypot(x-p[0],z-p[1]);if(d<distance){distance=d;bank=p;}}
  const q=clamp(1-distance/50,0,1),t=q*q*(3-2*q),bottom=this.spec.waterHeight-8,top=this.env.heightAt(bank[0],bank[1])+.035;
  return bottom+(top-bottom)*t;
 };
 /** Only the final 80m approach is allowed to touch land, never arbitrary city
  * ground. The final point has an independent full-hull dry-land check. */
 isBeach(x:number,z:number){const ps=this.spec.path.points,a=ps.at(-2)!,b=ps.at(-1)!,p=nearest(a,b,x,z);return Math.hypot(x-p[0],z-p[1])<20&&Math.hypot(x-b[0],z-b[1])<80;}
 clear(x:number,z:number){return !this.env.blocked(x,z)&&(!this.env.land(x,z)||this.isBeach(x,z));}
 support(x:number,z:number,yaw:number,length:number,width:number,waterline:number){
  const c=Math.cos(yaw),s=Math.sin(yaw),floor=(u:number,v:number)=>this.at(x+c*u+s*v,z-s*u+c*v),half=length/2,wetBottom=this.spec.waterHeight-waterline;
  const bow=floor(0,half),stern=floor(0,-half),raw=Math.atan2(bow-stern,length),top=Math.max(bow,stern,floor(0,0))+.06,weight=clamp((top-wetBottom)/.35,0,1),pitch=clamp(raw,-.25,.25)*weight;
  let bottomY=wetBottom;
  for(const u of [-width/2,0,width/2])for(let v=-half;v<=half+.001;v+=length/4)bottomY=Math.max(bottomY,floor(u,v*Math.cos(pitch))+.06-v*Math.sin(pitch));
  return {bottomY,pitch,grounded:bottomY>wetBottom+.001};
 }
}
