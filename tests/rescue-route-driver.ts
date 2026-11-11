import type {CarState} from '../native-city/src/driving.ts';
import {closest,manualSteeringInput} from '../native-city/src/driving.ts';
import type {V2} from '../native-city/src/city-types.ts';
import {routePose} from '../native-city/src/native-npc-objective.ts';
/** Test-only keyboard-bounded steering/throttle; never writes pose or teleports. */
export function rescueDriverInput(points:readonly V2[],state:CarState,rescue:{distance:number;boarded:number}){
 const clamp=(n:number,a:number,b:number)=>Math.max(a,Math.min(b,n));let start=0,along=0,near=Infinity;
 const vertices=points.map((p,i)=>{if(i)start+=Math.hypot(p[0]-points[i-1][0],p[1]-points[i-1][1]);return start;});
 for(let i=1;i<points.length;i++){const p=closest(state.x,state.z,points[i-1],points[i]);if(p.d<near){near=p.d;along=vertices[i-1]+p.t*(vertices[i]-vertices[i-1]);}}
 const desiredAlong=rescue.distance-7.955,gap=desiredAlong-along;
 const lane=-4.25;
 const look=7+Math.abs(state.speed)*.18,target=routePose(points,along+look),x=target.point[0]+Math.cos(target.yaw)*lane,z=target.point[1]-Math.sin(target.yaw)*lane;
 const angle=Math.atan2(Math.sin(Math.atan2(x-state.x,z-state.z)-state.yaw),Math.cos(Math.atan2(x-state.x,z-state.z)-state.yaw));
 const wheel=Math.atan2(6.4*Math.sin(angle),Math.max(2,Math.hypot(x-state.x,z-state.z))),limit=manualSteeringInput(1,state.speed),steer=clamp(wheel*(1+Math.abs(state.speed)*.026)/.48,-limit,limit);
 let desired=clamp(18+gap*.8,6,36);
 for(let i=1;i<points.length-1;i++){const distance=vertices[i]-along;if(distance<0||distance>100)continue;const a=points[i-1],b=points[i],c=points[i+1],bend=Math.abs(Math.atan2((b[1]-a[1])*(c[0]-b[0])-(b[0]-a[0])*(c[1]-b[1]),(b[0]-a[0])*(c[0]-b[0])+(b[1]-a[1])*(c[1]-b[1])));if(bend>.3)desired=Math.min(desired,Math.sqrt(14*14+8*Math.max(0,distance-9)));}
 return {throttle:clamp((desired-state.speed)*.5,-1,1),steer,handbrake:false,along,gap,lane};
}
