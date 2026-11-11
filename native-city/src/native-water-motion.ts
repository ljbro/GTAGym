import type {V2} from './city-types.ts';
import {diveEntranceBoxes,diveEntranceClear,type DiveEntranceBox} from './native-dive-entrance.ts';
export type NativeWaterSpec={id:string;path:{points:number[][];length:number;forward:number[];right:number[]};waterHeight:number;startDepth:number;goalDepth:number;shallowFloorDepth:number;deepFloorDepth:number;entrance?:boolean;freeRoamRegion?:{minX:number;maxX:number;minZ:number;maxZ:number};region?:{minX:number;maxX:number;minZ:number;maxZ:number}};
const clamp=(v:number,a:number,b:number)=>Math.max(a,Math.min(b,v));
export function waterLocal(spec:NativeWaterSpec,x:number,z:number):V2{
 const [a]=spec.path.points,dx=x-a[0],dz=z-a[1];return [dx*spec.path.right[0]+dz*spec.path.right[1],dx*spec.path.forward[0]+dz*spec.path.forward[1]];
}
export function waterWorld(spec:NativeWaterSpec,u:number,v:number):V2{const [a]=spec.path.points;return [a[0]+spec.path.right[0]*u+spec.path.forward[0]*v,a[1]+spec.path.right[1]*u+spec.path.forward[1]*v];}
/** Explicit checked world bounds for curved routes; legacy straight tasks
 * retain their original local strip. Neither snaps the actor to the line. */
export function waterRegionContains(spec:NativeWaterSpec,x:number,z:number){
 const r=spec.freeRoamRegion??spec.region;if(r)return x>=r.minX&&x<=r.maxX&&z>=r.minZ&&z<=r.maxZ;
 const [u,v]=waterLocal(spec,x,z);return Math.abs(u)<=50&&v>=-15&&v<=spec.path.length+30;
}
/** A continuous sloped seabed, shared by the mesh and the swimmer collision. */
export function diveFloor(spec:NativeWaterSpec,x:number,z:number){
 const [,v]=waterLocal(spec,x,z),t=clamp(v/spec.path.length,0,1);
 return spec.waterHeight-spec.shallowFloorDepth-(spec.deepFloorDepth-spec.shallowFloorDepth)*t;
}
export class NativeWaterMotion{
 private entranceBoxes:DiveEntranceBox[]=[];
 x:number;z:number;yaw:number;speed=0;depth:number;pitch=.12;verticalSpeed=0;
 constructor(readonly spec:NativeWaterSpec,private waterAllowed:(x:number,z:number,depth:number)=>boolean,private floorAt:(x:number,z:number)=>number=(x,z)=>diveFloor(spec,x,z)){
  [this.x,this.z]=spec.path.points[0];this.depth=spec.startDepth;
  this.yaw=Math.atan2(spec.path.forward[0],spec.path.forward[1]);
  if(spec.id==='c06-n02'&&spec.entrance!==false)this.entranceBoxes=diveEntranceBoxes(diveFloor(spec,...waterWorld(spec,0,spec.path.length)),spec.path.length);
 }
 /** Horizontal GPS checks water bounds; depth changes remain pilot-controlled. */
 navigationClear(x:number,z:number){return waterRegionContains(this.spec,x,z)&&this.waterAllowed(x,z,this.depth);}
 get y(){return this.spec.waterHeight-this.depth;}
 look(dx:number,dy:number){this.yaw+=dx*.004;this.pitch=clamp(this.pitch+dy*.003,-.65,1.05);}
 reset(){[this.x,this.z]=this.spec.path.points[0];this.depth=this.spec.startDepth;this.speed=0;this.verticalSpeed=0;this.yaw=Math.atan2(this.spec.path.forward[0],this.spec.path.forward[1]);this.pitch=.12;}
 clear(x:number,z:number,depth=this.depth){
  const [u,v]=waterLocal(this.spec,x,z),L=this.spec.path.length;
  if(!waterRegionContains(this.spec,x,z)||!this.waterAllowed(x,z,depth))return false;
  // Two attached piers and a lintel form an actual entrance at the deep end.
  const y=this.spec.waterHeight-depth,floor=diveFloor(this.spec,...waterWorld(this.spec,0,L));
  if(!diveEntranceClear(this.entranceBoxes,u,y,v))return false;
  if(this.spec.entrance!==false&&Math.abs(v-L)<.9&&Math.abs(u)<4.3&&y>floor-.3&&y<floor+4.7){
   if(Math.abs(u)>1.4||y>floor+3.6)return false;
  }return true;
 }
 step(keys:ReadonlySet<string>,dt:number){
  // Substeps keep controls, collision and depth consistent across frame rates.
  let left=clamp(dt,0,.25);if(left===0)return;
  let travelled=0,dy=0;
  while(left>1e-8){const s=Math.min(.025,left);left-=s;
   this.look(((keys.has('ArrowRight')?1:0)-(keys.has('ArrowLeft')?1:0))*s*380,((keys.has('ArrowDown')?1:0)-(keys.has('ArrowUp')?1:0))*s*300);
   let f=(keys.has('KeyW')?1:0)-(keys.has('KeyS')?1:0),r=(keys.has('KeyD')?1:0)-(keys.has('KeyA')?1:0),n=Math.max(1,Math.hypot(f,r));f/=n;r/=n;
   const speed=keys.has('ShiftLeft')||keys.has('ShiftRight')?2.4:1.4;
   const dx=(Math.sin(this.yaw)*f+Math.cos(this.yaw)*r)*speed*s,dz=(Math.cos(this.yaw)*f-Math.sin(this.yaw)*r)*speed*s;
   // Idle treading feet are ~1.29m below the reference; reserve shoe thickness.
   const maxDepth=(x:number,z:number)=>Math.max(0,this.spec.waterHeight-this.floorAt(x,z)-1.5);
   const vertical=(keys.has('ControlLeft')||keys.has('ControlRight')?1:0)-(keys.has('Space')?1:0);
   const nextDepth=clamp(this.depth+vertical*1.2*s,0,maxDepth(this.x,this.z));
   if(this.clear(this.x,this.z,nextDepth)){dy+=this.depth-nextDepth;this.depth=nextDepth;}
   const x=this.x+dx,z=this.z+dz;
   if(this.clear(x,z)&&this.depth<=maxDepth(x,z)+.001){this.x=x;this.z=z;travelled+=Math.hypot(dx,dz);}
  }
  this.speed=travelled/Math.min(dt,.25);this.verticalSpeed=dy/Math.min(dt,.25);
 }
 canFinish(){const end=this.spec.path.points.at(-1)!;return Math.hypot(this.x-end[0],this.z-end[1])<=3&&Math.abs(this.depth-this.spec.goalDepth)<=.8;}
}
