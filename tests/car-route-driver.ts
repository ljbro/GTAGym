import type {CarState} from '../native-city/src/driving.ts';
import type {V2} from '../native-city/src/city-types.ts';

/** Test-only continuous steering/throttle driver. Never snaps position/yaw.
 * Look through graph subdivision nodes when anticipating a real corner. */
export type RouteDriveProfile={cruiseSpeed?:number;cornerSpeed?:number;lookAhead?:number;lookSpeed?:number;finishRadius?:number};
export function driveCarRoute(points:V2[],state:CarState,step:(input:{throttle:number;steer:number;handbrake:boolean},dt:number,trace:{plannedThrough:number})=>void,profile:RouteDriveProfile={}){
 const cruise=profile.cruiseSpeed??26,corner=profile.cornerSpeed??6;
 const clamp=(v:number,a:number,b:number)=>Math.max(a,Math.min(b,v));
 let index=1,ticks=0,maxStep=0,maxOffset=0,plannedThrough=1;const visited:number[]=[];
 for(;ticks<30000;ticks++){
  const a=points[index-1],b=points[index],dx=b[0]-a[0],dz=b[1]-a[1],length=Math.hypot(dx,dz);
  const t=clamp(((state.x-a[0])*dx+(state.z-a[1])*dz)/(length*length),0,1),px=a[0]+t*dx,pz=a[1]+t*dz;
  const near=Math.hypot(state.x-b[0],state.z-b[1]);
  if(index===points.length-1&&near<(profile.finishRadius??12))return {complete:true,ticks,visited,maxStep,maxOffset};
  if(index<points.length-1&&(t>.999||near<2)){visited.push(index++);continue;}
  maxOffset=Math.max(maxOffset,Math.hypot(state.x-px,state.z-pz));
  let desired=cruise,along=(1-t)*length;
  for(let k=index;k<points.length-1&&along<110;k++){
   plannedThrough=Math.max(plannedThrough,k+1);
   const p=points[k-1],q=points[k],r=points[k+1],ux=q[0]-p[0],uz=q[1]-p[1],vx=r[0]-q[0],vz=r[1]-q[1];
   const bend=Math.abs(Math.atan2(uz*vx-ux*vz,ux*vx+uz*vz));
   if(bend>.3)desired=Math.min(desired,Math.sqrt(corner*corner+8*Math.max(0,along-9)));
   along+=Math.hypot(vx,vz);
  }
  let look=(profile.lookAhead??4)+Math.abs(state.speed)*(profile.lookSpeed??.16),x=px,z=pz;
  for(let k=index;k<points.length;k++){
   plannedThrough=Math.max(plannedThrough,k);
   const p=points[k],d=Math.hypot(p[0]-x,p[1]-z);
   if(d>=look){x+=(p[0]-x)*look/d;z+=(p[1]-z)*look/d;break;}
   x=p[0];z=p[1];look-=d;
  }
  const delta=Math.atan2(x-state.x,z-state.z)-state.yaw,angle=Math.atan2(Math.sin(delta),Math.cos(delta));
  const wheel=Math.atan2(6.4*Math.sin(angle),Math.max(2,Math.hypot(x-state.x,z-state.z)));
  const steer=clamp(wheel*(1+Math.abs(state.speed)*.026)/.48,-1,1);
  desired=Math.min(desired,Math.max(Math.min(5,corner),cruise-Math.abs(angle)*18));
  const oldX=state.x,oldZ=state.z;
  step({throttle:clamp((desired-state.speed)*.5,-1,1),steer,handbrake:false},.025,{plannedThrough});
  maxStep=Math.max(maxStep,Math.hypot(state.x-oldX,state.z-oldZ));
 }
 return {complete:false,ticks,visited,maxStep,maxOffset};
}
