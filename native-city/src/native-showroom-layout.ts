import type {RoadGraph} from './navigation.ts';
import type {V2} from './city-types.ts';
import {findGaragePlacement,garageLocal,garageWorld,type GaragePlacement} from './native-garage-layout.ts';
import {nativeArrival} from './native-task-arrival.ts';
type Checks=Parameters<typeof findGaragePlacement>[1];
export function findShowroomPlacement(graph:RoadGraph,target:V2,checks:Checks,from:V2=target):GaragePlacement{
 const candidates=graph.nodes.map((p,i)=>({p,i,d:Math.hypot(p[0]-target[0],p[1]-target[1])})).filter(n=>n.d<350).sort((a,b)=>a.d-b.d),tried:V2[]=[];
 for(const {p,i}of candidates){
  if(tried.some(q=>Math.hypot(p[0]-q[0],p[1]-q[1])<15))continue;tried.push(p);
  if(!graph.route(from,p).length)continue;
  const neighbor=graph.edges[i].keys().next().value;if(neighbor===undefined)continue;
  let site:GaragePlacement;try{site=findGaragePlacement([graph.nodes[neighbor],p],checks);}catch{continue;}
  const dx=site.door[0]-p[0],dz=site.door[1]-p[1],length=Math.hypot(dx,dz);let clear=true;
  for(let t=0;t<=length;t+=.5)for(const side of [-1.4,0,1.4])if(checks.blocked(p[0]+dx*t/length-dz*side/length,p[1]+dz*t/length+dx*side/length))clear=false;
  if(clear)return site;
 }
 throw Error("There is no safe indoor space near the car dealership large enough for a vehicle");
}
export function showroomInside(site:GaragePlacement,x:number,z:number,_yaw=0){
 // Entry is enough: centre just beyond the facade counts, even with the rear
 // still outside. No full-footprint, counter proximity, speed or yaw gate.
 const [u,v]=garageLocal(site,x,z);
 return u>=-5.9&&u<=4.1&&v>=-5.8&&v<=5.8;
}
export function showroomEntered(site:GaragePlacement,previous:V2,position:V2){
 return nativeArrival({previous,position,goal:garageWorld(site,-.9,0),radius:0,
  gate:{forward:[Math.cos(site.yaw),-Math.sin(site.yaw)],halfDepth:5,halfWidth:5.8},
  mode:'drive',walking:false,grounded:true,heightValid:true,discontinuity:false});
}
export function showroomReserved(site:GaragePlacement,x:number,z:number,radius=0){
 const [u,v]=garageLocal(site,x,z);if(Math.abs(u)<7+radius&&Math.abs(v)<7+radius)return true;
 const a=site.originalGoal,b=site.door,dx=b[0]-a[0],dz=b[1]-a[1],t=Math.max(0,Math.min(1,((x-a[0])*dx+(z-a[1])*dz)/(dx*dx+dz*dz||1)));
 return Math.hypot(x-a[0]-dx*t,z-a[1]-dz*t)<3.8+radius;
}
