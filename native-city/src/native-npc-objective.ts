import type {V2} from './city-types.ts';
import type {NpcRules} from './native-npc-rules.ts';
export {NPC_DRIVE_SPEED,npcRules,type NpcRules} from './native-npc-rules.ts';
export function routePose(points:readonly V2[],distance:number){
 let left=Math.max(0,distance);
 for(let i=1;i<points.length;i++){const a=points[i-1],b=points[i],d=Math.hypot(b[0]-a[0],b[1]-a[1]);if(!d)continue;
  if(left<=d||i===points.length-1){const t=Math.min(1,left/d);return {point:[a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t] as V2,yaw:Math.atan2(b[0]-a[0],b[1]-a[1])};}left-=d;
 }return {point:points.at(-1)!,yaw:0};
}
/** First contact for relative swept positions, not just end-of-frame distance. */
export function contactTime(a:V2,b:V2,c:V2,d:V2,radius:number):number|null{
 const x=a[0]-c[0],z=a[1]-c[1],vx=b[0]-a[0]-d[0]+c[0],vz=b[1]-a[1]-d[1]+c[1],q=x*x+z*z-radius*radius;
 if(q<=0)return 0;const aa=vx*vx+vz*vz;if(aa<1e-12)return null;const bb=2*(x*vx+z*vz),disc=bb*bb-4*aa*q;if(disc<0)return null;
 const t=(-bb-Math.sqrt(disc))/(2*aa);return t>=0&&t<=1?t:null;
}
export class NativeNpcObjective{
 distance:number;readonly length:number;
 private followOutcome:'success'|'failure'|null=null;
 constructor(readonly points:readonly V2[],readonly rules:NpcRules){this.length=points.slice(1).reduce((n,b,i)=>n+Math.hypot(b[0]-points[i][0],b[1]-points[i][1]),0);this.distance=Math.min(rules.headStart,this.length*.2);}
 get pose(){return routePose(this.points,this.distance);}
 get arrived(){return this.distance>=this.length;}
 step(dt:number,previous:V2,position:V2,validPlayer:boolean):'success'|'failure'|null{
  if(this.followOutcome)return this.followOutcome;
  const start=this.distance,travel=Math.max(0,dt)*this.rules.speed,end=Math.min(this.length,start+travel),before=this.pose.point;
  this.distance=end;
  // Split at route corners and endpoint time; a straight chord must never
  // catch the player through the inside of a road bend.
  const arrivalTime=travel>0?(this.length-start)/travel:Infinity;
  let along=0,previousT=0,npcBefore=before;const breaks=[0];
  for(let i=1;i<this.points.length;i++){along+=Math.hypot(this.points[i][0]-this.points[i-1][0],this.points[i][1]-this.points[i-1][1]);const t=(along-start)/travel;if(t>0&&t<1)breaks.push(t);}
  breaks.push(1);
  if(this.rules.kind==='follow'){
   // On each straight interval relative position is linear, so its distance
   // is convex: checking both ends and every NPC corner catches even a
   // within-frame excursion that returns inside the limit before frame end.
   for(const t of breaks){
    const target=routePose(this.points,start+travel*t).point;
    const x=previous[0]+(position[0]-previous[0])*t,z=previous[1]+(position[1]-previous[1])*t;
    if(Math.hypot(x-target[0],z-target[1])>this.rules.radius+1e-9){this.followOutcome='failure';return this.followOutcome;}
   }
   if(this.arrived&&validPlayer)this.followOutcome='success';
   return this.followOutcome;
  }
  if(validPlayer)for(const t of breaks.slice(1)){
   const npcAfter=routePose(this.points,start+travel*t).point,p=(f:number):V2=>[previous[0]+(position[0]-previous[0])*f,previous[1]+(position[1]-previous[1])*f];
   const hit=contactTime(p(previousT),p(t),npcBefore,npcAfter,this.rules.radius);
   if(hit!==null&&previousT+hit*(t-previousT)<arrivalTime-1e-9)return 'success';
   previousT=t;npcBefore=npcAfter;
  }
  return this.arrived?'failure':null;
 }
}
