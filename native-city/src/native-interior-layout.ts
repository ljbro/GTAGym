import data from './native-interior-tasks.json' with {type:'json'};
import type {V2} from './city-types.ts';
import {inRing} from './driving.ts';
import {WORKSHOP_YAW,workshopPoint,STORE_LAYOUT,STORE_STAIRS,STORE_FURNITURE} from './native-interior-video-layout.ts';
import {MERGED_INTERIORS} from './native-interior-mission.ts';
import {GARAGE_YARD_BOUNDS,GARAGE_YARD_SOLIDS} from './native-garage-approach.ts';
import {interiorEnclosureSolids} from './native-interior-enclosure.ts';
import {EXTRA_INTERIOR_TASKS,extraInteriorLayout} from './native-extra-layout.ts';
export type InteriorTask=typeof data[number];
export const NATIVE_INTERIORS=[...MERGED_INTERIORS,...EXTRA_INTERIOR_TASKS];
// Menu taxonomy is independent of the task-owned geometry and scoring rules.
export function interiorTaskCategory(spec:Pick<InteriorTask,'mode'>){return spec.mode==='drive'?'outdoor-road':'indoor';}
export function interiorCompletionRadius(id:string){const spec=NATIVE_INTERIORS.find(s=>s.id===id);return spec?(spec.mode==='drive'?1.5:.9):undefined;}
export const INTERIOR_TUNNEL_HALF_WIDTH=5.7;
export type InteriorSolid={name:string;x:number;z:number;w:number;d:number;h:number;y?:number;yaw?:number;material?:string};
export type InteriorPlacement={x:number;z:number;y:number;rotation?:number};
export function interiorNearest(points:readonly number[][],x:number,z:number){
 let distance=Infinity,index=0,t=0,along=0,total=0,px=0,pz=0;
 for(let i=1;i<points.length;i++){const a=points[i-1],b=points[i],dx=b[0]-a[0],dz=b[1]-a[1],len=Math.hypot(dx,dz),u=Math.max(0,Math.min(1,((x-a[0])*dx+(z-a[1])*dz)/(len*len||1))),qx=a[0]+dx*u,qz=a[1]+dz*u,d=Math.hypot(x-qx,z-qz);if(d<distance){distance=d;index=i-1;t=u;along=total+len*u;px=qx;pz=qz;}total+=len;}
 return {distance,index,t,along,x:px,z:pz};
}
export function interiorBounds(spec:InteriorTask){
 const extra=extraInteriorLayout(spec.id);if(extra)return extra.bounds;
 if(spec.theme==='bank')return {minX:-19,maxX:18,minZ:-24,maxZ:25};
 // Rotated showroom corner reaches z=-14.59; its foundation must cover it.
 if(spec.theme==='workshop')return {minX:-14,maxX:14,minZ:-15,maxZ:14};
 if(spec.theme==='store')return {minX:-9,maxX:9,minZ:-11,maxZ:16};
 if(spec.theme==='garage')return GARAGE_YARD_BOUNDS;
 return {minX:Math.min(...spec.points.map(p=>p[0]))-12,maxX:Math.max(...spec.points.map(p=>p[0]))+12,minZ:Math.min(...spec.points.map(p=>p[1]))-12,maxZ:Math.max(...spec.points.map(p=>p[1]))+12};
}
export function interiorSolids(spec:InteriorTask):InteriorSolid[]{
 const extra=extraInteriorLayout(spec.id);if(extra)return [...extra.solids];
 const solids:InteriorSolid[]=[];
 const box=(name:string,x:number,z:number,w:number,d:number,h:number,material='wall')=>solids.push({name,x,z,w,d,h,material});
 if(spec.theme==='bank'){
  for(const w of spec.walls??[])box(w.id,(w.minX+w.maxX)/2,(w.minZ+w.maxZ)/2,w.maxX-w.minX,w.maxZ-w.minZ,w.id==='warehouse-west'?4.6:w.height,w.kind==='glass'?'glass':'wall');
  for(const p of spec.props??[])box(p.id,p.x,p.z,p.width,p.depth,p.height,p.kind==='crate'?'wood':'metal');
  for(const z of [2.95,9.95]){
   box('loading-bay-side',14.25,z,7.3,.22,4.3,'metal');
   box('loading-bay-column',16.7,z, .45,.55,4.3);
  }
  box('security-desk',-1.7,-5.15,1.8,.8,.85,'wood');
  box('equipment-rack',9.85,-2.1,.9,2.3,2.4,'metal');
  box('equipment-cabinet',3,-3.85,2.8,.6,1.6,'metal');
  box('cash-cage-south',-10.5,1.95,.10,4.9,3.2,'cage');
  box('cash-cage-north',-10.5,9.1,.10,4.2,3.2,'cage');
 }else if(spec.theme==='garage'){
  solids.push(...GARAGE_YARD_SOLIDS.map(s=>s.name.startsWith('garage-yard-')?{...s,h:2.6}:s));
 }else if(spec.theme==='workshop'){
  // Both clips show the SAME premises, in opposite directions: tiled showroom
  // -> broad partition opening -> concrete repair bay -> open rear yard.
  const solid=(name:string,u:number,v:number,w:number,d:number,h:number,material='wall')=>{const [x,z]=workshopPoint(u,v);solids.push({name,x,z,w,d,h,yaw:WORKSHOP_YAW,material});};
  for(const u of [-8,8])solid('workshop-side',u,0,.3,18,4.7);
  solid('showroom-front',0,-9,16,.18,4.7,'glass');
  for(const u of [-5.75,5.75])solid('partition',u,0,4.5,.3,4.7);
  for(const u of [-6.25,6.25])solid('rear-opening',u,9,3.5,.3,4.7);
  solid('tool-cabinet',-7,4,1,4,1.2,'metal');
  solid('tire-rack',7,4,.8,4,2.5,'metal');
 }else if(spec.theme==='store'){
  const b=STORE_LAYOUT,h=3.5;
  for(const x of [b.minX,b.maxX])box(x<0?'west-wall':'east-wall',x,(b.front+b.rearDoor)/2,.3,b.rearDoor-b.front,h);
  // Exterior openings and internal partition share actual collision geometry.
  const opening=(name:string,z:number,x:number,width:number)=>{
   const left=x-width/2,right=x+width/2;
   if(left>b.minX)box(name+'-left',(b.minX+left)/2,z,left-b.minX,.3,h);
   if(right<b.maxX)box(name+'-right',(right+b.maxX)/2,z,b.maxX-right,.3,h);
  };
  opening('front',b.front,0,2.5);
  const partition=b.partition;
  let cross=spec.points[0][0];
  for(let i=1;i<spec.points.length;i++){const a=spec.points[i-1],p=spec.points[i];if((a[1]-partition)*(p[1]-partition)<=0&&Math.abs(p[1]-a[1])>.001){cross=a[0]+(p[0]-a[0])*(partition-a[1])/(p[1]-a[1]);break;}}
  opening('partition',partition,cross,2.5);opening('stock-room-back',b.rearDoor,1.05,2.1);
  const s=STORE_STAIRS;
  for(const x of [s.minX-.13,s.maxX+.13])box('stairwell-side',x,12.8,.25,5.9,4.7);
  box('stairwell-back',1.05,15.85,2.35,.3,4.7);
  for(const p of STORE_FURNITURE)solids.push({...p,material:p.name.includes('shelf')?'metal':'wood'});
 }
 return [...solids,...interiorEnclosureSolids(spec,solids)];
}
export function insideSolid(s:InteriorSolid,x:number,z:number,pad=.24){const c=Math.cos(s.yaw??0),r=Math.sin(s.yaw??0),dx=x-s.x,dz=z-s.z;return Math.abs(dx*c-dz*r)<s.w/2+pad&&Math.abs(dx*r+dz*c)<s.d/2+pad;}
/** Exact rectangle overlap: thin walls cannot fit between vehicle sample points. */
export function interiorVehicleOverlap(s:InteriorSolid,x:number,z:number,yaw:number,width:number,length:number){
 const reach=(width+length+s.w+s.d)/2+.04;if(Math.abs(x-s.x)>reach||Math.abs(z-s.z)>reach)return false;
 const a=yaw,b=s.yaw??0,axes=[[Math.cos(a),-Math.sin(a)],[Math.sin(a),Math.cos(a)],[Math.cos(b),-Math.sin(b)],[Math.sin(b),Math.cos(b)]];
 const radius=(angle:number,w:number,d:number,n:number[])=>Math.abs(Math.cos(angle)*n[0]-Math.sin(angle)*n[1])*w/2+Math.abs(Math.sin(angle)*n[0]+Math.cos(angle)*n[1])*d/2;
 return axes.every(n=>Math.abs((x-s.x)*n[0]+(z-s.z)*n[1])<radius(a,width,length,n)+radius(b,s.w,s.d,n)+.04);
}
export function interiorVehicleSweepClear(before:{x:number;z:number;yaw:number},after:{x:number;z:number;yaw:number},width:number,length:number,blocked:(x:number,z:number,yaw:number,width:number,length:number)=>boolean){
 const angle=Math.atan2(Math.sin(after.yaw-before.yaw),Math.cos(after.yaw-before.yaw));
 const steps=Math.max(1,Math.ceil((Math.hypot(after.x-before.x,after.z-before.z)+Math.abs(angle)*Math.hypot(width,length)/2)/.15));
 for(let i=1;i<=steps;i++){const t=i/steps;if(blocked(before.x+(after.x-before.x)*t,before.z+(after.z-before.z)*t,before.yaw+angle*t,width,length))return false;}return true;
}
export function interiorRibbon(points:readonly number[][],halfWidth:number){
 // One joined strip, including shared vertices at every bend. No per-segment slabs.
 const left:V2[]=[],right:V2[]=[];
 for(let i=0;i<points.length;i++){
  const p=points[i],a=points[Math.max(0,i-1)],b=points[Math.min(points.length-1,i+1)],dx=b[0]-a[0],dz=b[1]-a[1],l=Math.hypot(dx,dz)||1;
  left.push([p[0]-dz/l*halfWidth,p[1]+dx/l*halfWidth]);right.push([p[0]+dz/l*halfWidth,p[1]-dx/l*halfWidth]);
 }
 return {left,right,ring:[...left,...right.slice().reverse()]};
}
export function interiorFloorPoints(points:readonly number[][]):number[][]{
 const extend=(a:number[],b:number[])=>{const dx=a[0]-b[0],dz=a[1]-b[1],l=Math.hypot(dx,dz)||1;return [a[0]+dx/l*8,a[1]+dz/l*8];};
 return [extend(points[0],points[1]),...points,extend(points.at(-1)!,points.at(-2)!)];
}
export function interiorGeometryPoints(points:readonly number[][]):number[][]{
 const out:number[][]=[points[0]];for(let i=1;i<points.length;i++){const a=points[i-1],b=points[i],n=Math.max(1,Math.ceil(Math.hypot(b[0]-a[0],b[1]-a[1])/2));for(let j=1;j<=n;j++)out.push([a[0]+(b[0]-a[0])*j/n,a[1]+(b[1]-a[1])*j/n]);}return out;
}
/** Locate each added site on native dry land, away from original building footprints.
 * Flat pads are foundations connected down to terrain, never floating task layers. */
export function findInteriorPlacement(spec:InteriorTask,env:{height:(x:number,z:number)=>number;blocked:(x:number,z:number)=>boolean;land:(x:number,z:number)=>boolean;roadAt?:(x:number,z:number)=>{d:number;road:{width:number}}|null}):InteriorPlacement{
 const long=spec.theme==='parking'||spec.theme==='tunnel',b=interiorBounds(spec),samples:V2[]=[];
 if(long){for(let i=0;i<spec.points.length;i+=Math.max(1,Math.floor(spec.points.length/100))){const p=spec.points[i];for(const dx of [-10,0,10])for(const dz of [-10,0,10])samples.push([p[0]+dx,p[1]+dz]);}samples.push(spec.points.at(-1)! as V2);}
 else for(let x=b.minX-1;x<=b.maxX+1;x+=2)for(let z=b.minZ-1;z<=b.maxZ+1;z+=2)samples.push([x,z]);
 // Try quiet neighbourhoods first, then search the actual city extent. A long
 // tunnel must not silently fall back to stamping over an active road.
 function* candidates():Generator<V2>{
  // Verified road-free parcels: still revalidate terrain and solids every time.
  if(long){yield [-5050,2300];yield [-300,-900];}
  for(const start of [[-4300,1450],[-4700,650],[-3500,2100],[-1900,2300],[-700,2300],[1500,2500],[5500,2400]])for(let r=0;r<=600;r+=100)for(const [dx,dz] of (r?[[r,0],[-r,0],[0,r],[0,-r],[r,r],[-r,-r]]:[[0,0]]))yield [start[0]+dx,start[1]+dz];
  for(let z=2400;z>=-2500;z-=50)for(let x=-6600;x<=6600;x+=50)yield [x,z];
 }
 for(const [x,z] of candidates())for(const rotation of long?[0,Math.PI/2,Math.PI,3*Math.PI/2]:[0]){
   let low=Infinity,high=-Infinity,ok=true;
   const c=Math.cos(rotation),s=Math.sin(rotation);
   for(const p of samples){const wx=x+c*p[0]+s*p[1],wz=z-s*p[0]+c*p[1],road=env.roadAt?.(wx,wz);if(!env.land(wx,wz)||env.blocked(wx,wz)||(road&&road.d<road.road.width/2+5)){ok=false;break;}const y=env.height(wx,wz);if(!Number.isFinite(y)){ok=false;break;}low=Math.min(low,y);high=Math.max(high,y);if(high-low>(long?2:.55)){ok=false;break;}}
   // Above authored road/pavement meshes (.105/.065), on a solid foundation.
   if(ok)return {x,z,y:high+.18,...rotation?{rotation}:{}};
 }
 throw Error("No continuous land site was found that avoids covering existing buildings, Check the indoor mission location.");
}
export function interiorPadContains(spec:InteriorTask,x:number,z:number){
 if(spec.theme==='parking'||spec.theme==='tunnel')return inRing(x,z,interiorRibbon(spec.points,10).ring);
 const b=interiorBounds(spec);return x>=b.minX&&x<=b.maxX&&z>=b.minZ&&z<=b.maxZ;
}
