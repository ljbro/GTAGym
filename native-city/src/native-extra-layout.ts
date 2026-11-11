import migrated from './native-extra-interiors.json' with {type:'json'};
import type {InteriorTask,InteriorSolid} from './native-interior-layout.ts';
import {mapBox,type InteriorMinimapPlan} from './interior-minimap.ts';
export type ExtraBox=InteriorSolid&{y:number};
export const EXTRA_SIGN_WIDTH=1.8,EXTRA_SIGN_HEIGHT=.45;
export type ExtraLayout={id:string;title:string;source:{task:string;sha256:string;note:string};bounds:{minX:number;maxX:number;minZ:number;maxZ:number};points:number[][];goalY:number;solids:ExtraBox[];doors:(ExtraBox&{open:boolean;decoy:boolean})[];floors:ExtraBox[];ceilings:ExtraBox[];signs:{x:number;y:number;z:number;yaw:number;text:string}[];lights:{x:number;y:number;z:number}[];steps?:ExtraBox[]};
const box=(name:string,x:number,z:number,w:number,d:number,h:number,y=0,material='wall'):ExtraBox=>({name,x,z,w,d,h,y,material});
const ENGLISH_SIGNS:Record<string,string>={
 "Emergency exit":'EXIT',"Emergency exit  EXIT":'EXIT',"Staff Area":'STAFF ONLY',"Emergency Exit":'EMERGENCY EXIT',
 "Archives / ARCHIVE":'ARCHIVE',"Fire Exit":'FIRE EXIT',"Security Zone  SECURITY":'SECURITY',
 "Vault VAULT":'VAULT',"Vault Passage":'VAULT ACCESS',"Vault":'VAULT',"Emergency Department":'EMERGENCY',
 "Safe Zone":'SAFE AREA',"Exit":'EXIT',
};
/** Infill only the narrow gap between an authored doorway and its adjacent walls.
 * Work in door-local axes so quarter-turn portals get identical visual/collision seals. */
export function extraDoorInfill(layout:ExtraLayout,ceilings=layout.ceilings):ExtraBox[]{
 return layout.doors.flatMap(d=>{
  const c=Math.cos(d.yaw??0),s=Math.sin(d.yaw??0);let left=-Infinity,right=Infinity,embedded=false;
  for(const wall of layout.solids.filter(w=>w.material==='wall'&&w.y<=d.y+.8&&w.y+w.h>d.y+.8)){
   const a=Math.cos(wall.yaw??0),b=Math.sin(wall.yaw??0);
   const corners=[[-1,-1],[-1,1],[1,-1],[1,1]].map(([i,j])=>{
    const x=wall.x+a*i*wall.w/2+b*j*wall.d/2-d.x,z=wall.z-b*i*wall.w/2+a*j*wall.d/2-d.z;
    return [x*c-z*s,x*s+z*c];
   });
   const u=corners.map(p=>p[0]),v=corners.map(p=>p[1]),lo=Math.min(...u),hi=Math.max(...u);
   if(Math.min(...v)>.001||Math.max(...v)<-.001)continue;
   if(lo<-.001&&hi>.001)embedded=true;
   else if(hi<=.001)left=Math.max(left,hi);else right=Math.min(right,lo);
  }
  const top=[...ceilings,...layout.floors].filter(w=>w.y>d.y+d.h&&Math.abs(d.x-w.x)<=w.w/2+.3&&Math.abs(d.z-w.z)<=w.d/2+.3).sort((a,b)=>a.y-b.y)[0]?.y;
  const parts:ExtraBox[]=[];
  const add=(name:string,lo:number,hi:number,y:number,h:number)=>{
   if(hi-lo<.001||h<=0)return;
   const u=(lo+hi)/2;parts.push({...box(d.name+name,d.x+c*u,d.z-s*u,hi-lo,Math.max(.3,d.d),h,y),yaw:d.yaw??0});
  };
  if(!embedded){
   // Never fill arbitrary corridors or make a door narrower than its authored width.
   if(-d.w/2-left>1||left>-d.w/2+.001)left=-d.w/2;
   if(right-d.w/2>1||right<d.w/2-.001)right=d.w/2;
   add('-left-infill',left-.005,-d.w/2,d.y,(top??d.y+d.h)-d.y);
   add('-right-infill',d.w/2,right+.005,d.y,(top??d.y+d.h)-d.y);
  }else{left=-d.w/2;right=d.w/2;}
  if(top!==undefined)add('-head-wall',left-.005,right+.005,d.y+d.h,top-d.y-d.h);
  return parts;
 });
}
const steps=Array.from({length:20},(_,i)=>box('stair-tread-'+i,7.5,-3+(i+.5)*.45,3,.45,(i+1)*.18,0,'wood'));
const factory:ExtraLayout={
 id:'c09-n08',title:"Find the factory stairs and go upstairs to the workshop",
 source:{task:'gta-nav-c09-n08',sha256:'3d189eb2655c89f6c4e6c5bb571a2e21a14fe8a06fec7fc36fa5cca15cbfa272',note:"Reference OffMapBench c09-n08(Original video 186–191 seconds)brick wall staircase of, Wooden handrails and upper workshop. Add ground floor pathfinding, The decoy door and upstairs office are gameplay adaptations, Not a recreation at the metric scale of the video; Do not simulate carrying boxes."},
 bounds:{minX:-12.3,maxX:12.3,minZ:-12.3,maxZ:12.3},goalY:3.6,
 points:[[-8,-9],[-8,-2],[-2,-2],[2,-2],[2,-7],[7.5,-7],[7.5,-3],[7.5,6],[7.5,9],[1,9],[1,1],[-7,1]],
 floors:[box('ground',0,0,24,24,.18,-.18),box('upper-west',-3,0,18,24,.16,3.44),box('upper-east',10.5,0,3,24,.16,3.44),box('upper-south',7.5,-7.5,3,9,.16,3.44),box('upper-north',7.5,9,3,6,.16,3.44)],
 ceilings:[box('roof',0,0,24.5,24.5,.2,7.2)],steps,
 solids:[...[-12,12].flatMap(v=>[box('outer-x-'+v,v,0,.3,24.3,7.2),box('outer-z-'+v,0,v,24.3,.3,7.2)]),
  box('lobby-west',-10.75,-4,2.5,.3,3.44),box('lobby-east',-3.25,-4,6.5,.3,3.44),
  box('hall-south',0,-3.65,.3,.7,3.44),box('hall-north',0,3.5,.3,9,3.44),
  box('stair-west',5.85,1.5,.3,9,7.2),box('stair-east',9.15,1.5,.3,9,7.2),
  box('upper-partition-west',-6.25,3,11.5,.3,3.6,3.6),box('upper-partition-east',4.25,3,3.5,.3,3.6,3.6),
  box('upper-office',0,-6,.3,12,3.6,3.6),
  box('reception',-10,-8,1.2,3,.95,0,'wood'),box('storage',-4,5,4,2,1.5,0,'wood'),
  ...[-8,-4].map(x=>box('sewing-workbench-'+x,x,8,2.2,1.4,.85,3.6,'wood')),
  box('office-desk',-9,0,1.5,3,.8,3.6,'wood')],
 doors:[{...box('fake-lobby',-3,-4,1.8,.32,2.5),open:false,decoy:true},{...box('fake-office',-5,3,1.8,.32,2.5,3.6),open:false,decoy:true},{...box('fake-east',0,5,1.8,.32,2.5),yaw:Math.PI/2,open:false,decoy:true},
  {...box('lobby-opening',-8,-4,3,.2,2.7),open:true,decoy:false},{...box('workshop-opening',1,3,3,.2,2.7,3.6),open:true,decoy:false}],
 signs:[{x:5.67,y:2.2,z:-2.2,yaw:-Math.PI/2,text:'STAIRS'},{x:1,y:6.62,z:3.17,yaw:0,text:'WORKSHOP'}],
 lights:[{x:-8,y:3.1,z:-8},{x:-5,y:3.1,z:0},{x:3,y:3.1,z:-7},{x:7.5,y:6.9,z:1},{x:0,y:6.9,z:8},{x:-7,y:6.9,z:0}],
};
export const EXTRA_LAYOUTS:ExtraLayout[]=[...migrated,factory].map(layout=>{
 // Close the original bank's 3 cm roof seam and seal around each doorway.
 // Door leaves retain their authored state and usable opening width.
 const ceilings=layout.ceilings.map(s=>layout.id==='c09-n06'?{...s,h:s.h+s.y-3.6,y:3.6}:s);
 // The archive/security T-junction also had a 15 cm end-to-end break.
 const joints=layout.id==='c09-n06'?[box('archive-security-wall-joint',6,2.075,.3,.17,3.6)]:[];
 // Source clinic signs were at eye level (1.75 m), intersecting the avatar.
 // Keep boards above heads/door headers and below the ceiling on each floor.
 const signs=layout.signs.map(s=>({...s,text:ENGLISH_SIGNS[s.text]??s.text,
  y:layout.id==='c09-n06'?3.25:layout.id==='c09-n08'&&s.y>3.6?6.65:3.05}));
 return {...layout,ceilings,signs,solids:[...layout.solids,...joints,...extraDoorInfill(layout,ceilings)]};
});
export const extraInteriorLayout=(id:string)=>EXTRA_LAYOUTS.find(s=>s.id===id);
export const EXTRA_INTERIOR_TASKS:InteriorTask[]=EXTRA_LAYOUTS.map(s=>({id:s.id,title:s.title,mode:'walk',theme:'reference',points:s.points,length:s.points.slice(1).reduce((n,p,i)=>n+Math.hypot(p[0]-s.points[i][0],p[1]-s.points[i][1]),0),source:{...s.source,video:s.id==='c09-n08'?"source-008437/raw_video/2026-07-28_15-16-04.mkv":'',start:s.id==='c09-n08'?186:0,end:s.id==='c09-n08'?191:0,metricStatus:'source-layout-adaptation',originalLength:0},intervals:[],times:[],rooms:[],walls:[],props:[]}));
export function extraFloorAt(layout:ExtraLayout,x:number,z:number,maxY=Infinity){
 const values=[...layout.floors,...layout.steps??[]].filter(s=>x>=s.x-s.w/2-1e-7&&x<=s.x+s.w/2+1e-7&&z>=s.z-s.d/2-1e-7&&z<=s.z+s.d/2+1e-7).map(s=>s.y+s.h).filter(y=>y<=maxY+1e-7);
 return values.length?Math.max(...values):null;
}
export function extraBodyBlocked(layout:ExtraLayout,x:number,z:number,y:number,pad=.24,bodyHeight=1.65){
 // Low ceilings / upper slabs are physical too: no jumping through a floor.
 return [...layout.solids,...layout.doors.filter(d=>!d.open),...layout.floors.filter(s=>s.y>0),...layout.ceilings].some(s=>{
  if(y>=s.y+s.h-.03||y+bodyHeight<=s.y+.03)return false;
  const c=Math.cos(s.yaw??0),r=Math.sin(s.yaw??0),dx=x-s.x,dz=z-s.z;
  return Math.abs(dx*c-dz*r)<s.w/2+pad&&Math.abs(dx*r+dz*c)<s.d/2+pad;
 });
}
export function extraMapPlan(layout:ExtraLayout,height:number):InteriorMinimapPlan{
 const level=layout.steps&&height>=3.2?3.6:0;
 const ring=(s:ExtraBox)=>mapBox(s.x,s.z,s.w,s.d,s.yaw);
 const visible=(s:ExtraBox)=>s.y<level+2&&s.y+s.h>level+.1;
 return {floors:layout.floors.filter(s=>Math.abs(s.y+s.h-level)<.1).map(ring),walls:layout.solids.filter(s=>visible(s)&&s.material==='wall').map(ring),obstacles:layout.solids.filter(s=>visible(s)&&s.material!=='wall'&&s.material!=='door').map(ring),stairs:(layout.steps??[]).map(ring),doors:layout.doors.filter(s=>!s.open&&visible(s)).map(ring)};
}
