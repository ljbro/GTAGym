import type {V2} from './city-types.ts';
import {distanceToTravel} from './minimap-route-progress.ts';
export type ArrivalGate={forward:V2;halfWidth:number;halfDepth:number};
export function nativeArrival(options:{position:V2;previous:V2;goal:V2;radius:number;mode:'walk'|'drive';walking:boolean;grounded:boolean;heightValid:boolean;discontinuity:boolean;gate?:ArrivalGate}){
 const o=options;if(o.discontinuity||!o.heightValid||!o.grounded||o.walking!==(o.mode==='walk'))return false;
 if(o.gate){
  // A passage is an oriented region across the exit, not a tiny centre dot.
  // Clip this frame's travel against both axes; endpoints may both be outside.
  const {forward,halfWidth,halfDepth}=o.gate,len=Math.hypot(...forward);
  if(!Number.isFinite(len)||len<=0||halfWidth<=0||halfDepth<=0)return false;
  const dx=forward[0]/len,dz=forward[1]/len;
  const local=(p:V2)=>[(p[0]-o.goal[0])*dz-(p[1]-o.goal[1])*dx,(p[0]-o.goal[0])*dx+(p[1]-o.goal[1])*dz];
  const a=local(o.previous),b=local(o.position);let enter=0,exit=1;
  for(const [axis,half] of [[0,halfWidth],[1,halfDepth]]){
   const v=b[axis]-a[axis];if(!Number.isFinite(a[axis])||!Number.isFinite(v))return false;
   if(Math.abs(v)<1e-9){if(Math.abs(a[axis])>half)return false;continue;}
   const t0=(-half-a[axis])/v,t1=(half-a[axis])/v;
   enter=Math.max(enter,Math.min(t0,t1));exit=Math.min(exit,Math.max(t0,t1));
   if(enter>exit)return false;
  }
  return true;
 }
 // Swept arrival also catches a fast vehicle crossing the whole goal in a frame.
 return distanceToTravel(o.goal,o.previous,o.position)<=o.radius;
}
