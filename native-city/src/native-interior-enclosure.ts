import type {InteriorSolid,InteriorTask} from './native-interior-layout.ts';
import {WORKSHOP_YAW,workshopPoint,STORE_LAYOUT} from './native-interior-video-layout.ts';

export const WORKSHOP_REAR_LIMIT=13;
export const STORE_VESTIBULE={minX:-4.6,maxX:4.6,minZ:-10.5,maxZ:STORE_LAYOUT.front};
type Room={minX:number;maxX:number;minZ:number;maxZ:number;height:number};
/** Close only the EXTERNAL union boundary. Shared doorways stay open. Subtract
 * existing walls to avoid coincident replacement meshes and duplicate surfaces. */
export function roomEnvelopeGaps(rooms:Room[],existing:readonly InteriorSolid[],roofSteps=false):InteriorSolid[]{
 const round=(n:number)=>Math.round(n*1e4)/1e4;
 const xs=[...new Set(rooms.flatMap(r=>[round(r.minX),round(r.maxX)]))].sort((a,b)=>a-b);
 const zs=[...new Set(rooms.flatMap(r=>[round(r.minZ),round(r.maxZ)]))].sort((a,b)=>a-b);
 const height=(i:number,j:number)=>{
  if(i<0||j<0||i>=xs.length-1||j>=zs.length-1)return 0;
  const x=(xs[i]+xs[i+1])/2,z=(zs[j]+zs[j+1])/2;
  return Math.max(0,...rooms.filter(r=>x>r.minX&&x<r.maxX&&z>r.minZ&&z<r.maxZ).map(r=>r.height));
 };
 const out:InteriorSolid[]=[];
 function edge(axis:'x'|'z',at:number,start:number,end:number,h:number,bottom=0){
  let spans=[[start,end]];
  for(const s of existing){
   if(s.yaw||s.h<h-.01||s.material==='cage')continue;
   const center=axis==='x'?s.x:s.z,thickness=axis==='x'?s.w:s.d;
   if(Math.abs(center-at)>thickness/2+.002)continue;
   const along=axis==='x'?s.z:s.x,length=axis==='x'?s.d:s.w,lo=along-length/2,hi=along+length/2;
   spans=spans.flatMap(([a,b])=>hi<=a||lo>=b?[[a,b]]:[[a,Math.min(b,lo)],[Math.max(a,hi),b]].filter(([a,b])=>b-a>.005));
  }
  // Upper bands share exact edges; overlap would leave coplanar flickering
  // strips when several room boundaries subdivide the same straight wall.
  for(const [a,b] of spans)out.push({name:`${roofSteps?'roof-step':'enclosure'}-${axis}-${out.length}`,x:axis==='x'?at:(a+b)/2,z:axis==='z'?at:(a+b)/2,w:axis==='x'?.24:b-a+(roofSteps?0:.02),d:axis==='z'?.24:b-a+(roofSteps?0:.02),h:h-bottom,...(roofSteps?{y:bottom}:{}),material:'wall'});
 }
 for(let i=0;i<xs.length-1;i++)for(let j=0;j<zs.length-1;j++){
  const h=height(i,j);if(!h)continue;
  const boundary=(axis:'x'|'z',at:number,start:number,end:number,neighbor:number)=>{
   if(roofSteps?neighbor>0&&neighbor<h-.005:!neighbor)edge(axis,at,start,end,h,roofSteps?neighbor:0);
  };
  boundary('x',xs[i],zs[j],zs[j+1],height(i-1,j));
  boundary('x',xs[i+1],zs[j],zs[j+1],height(i+1,j));
  boundary('z',zs[j],xs[i],xs[i+1],height(i,j-1));
  boundary('z',zs[j+1],xs[i],xs[i+1],height(i,j+1));
 }
 return out;
}
export function bankEnvelopeRooms(spec:InteriorTask):Room[]{return [
 ...(spec.rooms??[]).map(r=>({...r,height:r.id==='warehouse'?4.6:3.5})),
 {minX:10.6,maxX:17.9,minZ:2.95,maxZ:9.95,height:4.3},
];}
/** Vertical risers between adjacent low and high ceilings. These are overhead
 * geometry, NOT floor-to-ceiling obstacles: do not put them in 2D collisions. */
export function interiorRoofSteps(spec:InteriorTask,existing:readonly InteriorSolid[]):InteriorSolid[]{
 return spec.theme==='bank'?roomEnvelopeGaps(bankEnvelopeRooms(spec),existing,true):[];
}
export function interiorEnclosureSolids(spec:InteriorTask,existing:readonly InteriorSolid[]):InteriorSolid[]{
 if(spec.theme==='bank')return roomEnvelopeGaps(bankEnvelopeRooms(spec),existing);
 if(spec.theme==='workshop')return [[-8,11,.3,4],[8,11,.3,4],[0,WORKSHOP_REAR_LIMIT,16,.3]].map(([u,v,w,d],i)=>{
  const [x,z]=workshopPoint(u,v);return {name:'enclosure-workshop-rear-'+i,x,z,w,d,h:4.7,yaw:WORKSHOP_YAW,material:'wall'};
 });
 if(spec.theme==='store'){
  const b=STORE_VESTIBULE;
  return [{name:'enclosure-store-vestibule-back',x:0,z:b.minZ,w:b.maxX-b.minX+.24,d:.24,h:3.5,material:'wall'},
   ...[b.minX,b.maxX].map(x=>({name:'enclosure-store-vestibule-side-'+x,x,z:(b.minZ+b.maxZ)/2,w:.24,d:b.maxZ-b.minZ+.24,h:3.5,material:'wall'}))];
 }
 if(spec.theme==='garage')return [{name:'enclosure-garage-service-door',x:4.74,z:2.35,w:1.84,d:.18,h:3.1,material:'wood'}];
 return [];
}
