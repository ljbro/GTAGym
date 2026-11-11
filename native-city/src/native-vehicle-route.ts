import type {V2} from './city-types.ts';
const delta=(a:number,b:number)=>Math.atan2(Math.sin(b-a),Math.cos(b-a));
const mix=(a:V2,b:V2,t:number):V2=>[a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t];
// Gameplay cornering limits (m/s² and rad/s). Keep tight/obstructed bends
// slower without forcing ordinary junctions down to walking speed.
export const VEHICLE_CORNER_RULES={lateralAcceleration:9,yawRate:1.25,approachBrake:6} as const;
/** Metre-sampled rounded route, with a backward braking envelope.
 * Unsafe corner cuts shrink back toward the source route, never across a wall. */
export class VehicleRoute{
 readonly points:V2[]=[];
 readonly distances:number[]=[0];
 readonly headings:number[]=[];
 readonly limits:number[]=[];
 readonly length:number;
 constructor(source:readonly V2[],readonly cruise:number,clear:(x:number,z:number,yaw:number)=>boolean=()=>true,cornerSpeedScale=1){
  const input=source.filter((p,i)=>!i||Math.hypot(p[0]-source[i-1][0],p[1]-source[i-1][1])>.01);
  if(input.length<2)throw Error('Vehicle route requires two distinct points');
  const add=(p:V2)=>{const a=this.points.at(-1);if(!a){this.points.push([...p]);return;}const n=Math.ceil(Math.hypot(p[0]-a[0],p[1]-a[1])/.6);for(let j=1;j<=n;j++)this.points.push(mix(a,p,j/n));};
  add(input[0]);
  for(let i=1;i<input.length-1;i++){
   const a=input[i-1],b=input[i],c=input[i+1],la=Math.hypot(b[0]-a[0],b[1]-a[1]),lb=Math.hypot(c[0]-b[0],c[1]-b[1]);
   const turn=Math.abs(delta(Math.atan2(b[0]-a[0],b[1]-a[1]),Math.atan2(c[0]-b[0],c[1]-b[1])));
   let curve:V2[]|null=null;
   if(turn>.04&&turn<Math.PI-.08)for(const scale of [1,.5,.25]){
    const trim=Math.min(12,la*.35,lb*.35)*scale,p=mix(b,a,trim/la),q=mix(b,c,trim/lb);
    const samples:V2[]=Array.from({length:33},(_,j)=>{const t=j/32;return [(1-t)**2*p[0]+2*(1-t)*t*b[0]+t*t*q[0],(1-t)**2*p[1]+2*(1-t)*t*b[1]+t*t*q[1]];});
    if(samples.every((p,j)=>{const u=samples[Math.max(0,j-1)],v=samples[Math.min(32,j+1)];return clear(p[0],p[1],Math.atan2(v[0]-u[0],v[1]-u[1]));})){curve=samples;break;}
   }
   if(curve)curve.forEach(add);else add(b);
  }
  add(input.at(-1)!);
  for(let i=1;i<this.points.length;i++)this.distances.push(this.distances[i-1]+Math.hypot(this.points[i][0]-this.points[i-1][0],this.points[i][1]-this.points[i-1][1]));
  this.length=this.distances.at(-1)!;
  for(let i=0;i<this.points.length;i++){
   const a=this.points[Math.max(0,i-1)],b=this.points[Math.min(this.points.length-1,i+1)];
   this.headings.push(Math.atan2(b[0]-a[0],b[1]-a[1]));
  }
  for(let i=0;i<this.points.length;i++){
   const a=Math.max(0,i-1),b=Math.min(this.points.length-1,i+1),k=Math.abs(delta(this.headings[a],this.headings[b]))/Math.max(.01,this.distances[b]-this.distances[a]);
   this.limits.push(Math.min(cruise,k>.0001?Math.sqrt(VEHICLE_CORNER_RULES.lateralAcceleration/k)*cornerSpeedScale:cruise,k>.0001?VEHICLE_CORNER_RULES.yawRate/k*cornerSpeedScale:cruise));
  }
  // Braking starts BEFORE a corner, not on the frame that reaches the vertex.
  for(let i=this.points.length-2;i>=0;i--)this.limits[i]=Math.min(this.limits[i],Math.sqrt(this.limits[i+1]**2+2*VEHICLE_CORNER_RULES.approachBrake*(this.distances[i+1]-this.distances[i])));
 }
 sample(distance:number){
  const d=Math.max(0,Math.min(this.length,distance));let lo=0,hi=this.distances.length-1;
  while(hi-lo>1){const m=(lo+hi)>>1;if(this.distances[m]<=d)lo=m;else hi=m;}
  const t=(d-this.distances[lo])/Math.max(1e-9,this.distances[hi]-this.distances[lo]);
  return {point:mix(this.points[lo],this.points[hi],t),yaw:this.headings[lo]+delta(this.headings[lo],this.headings[hi])*t,limit:this.limits[lo]+(this.limits[hi]-this.limits[lo])*t};
 }
}
