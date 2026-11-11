import type {V2} from './city-types.ts';
import {closest} from './driving.ts';
import {farmRoadGrid} from './native-farm-layout.ts';
export type RescueBridgeSpec={id:string;path:{points:number[][];length:number}};
const smooth=(n:number)=>{const t=Math.max(0,Math.min(1,n));return t*t*(3-2*t);};
/** One road mesh and exact triangle sampler. Bridge piers use native ground,
 * vehicles use deck triangles; there are no separately stacked road sections. */
export function rescueBridgeLayout(spec:RescueBridgeSpec,nativeHeight:(x:number,z:number)=>number){
 const original=spec.path.points as V2[],p0=original[0],p1=original[1],pn=original.at(-1)!,pp=original.at(-2)!,yaw0=Math.atan2(p1[0]-p0[0],p1[1]-p0[1]),yaw1=Math.atan2(pn[0]-pp[0],pn[1]-pp[1]);
 const points:V2[]=[[p0[0]-Math.sin(yaw0)*12,p0[1]-Math.cos(yaw0)*12],...original,[pn[0]+Math.sin(yaw1)*12,pn[1]+Math.cos(yaw1)*12]];
 let distance=-12;const segments=points.slice(1).map((b,i)=>{const a=points[i],length=Math.hypot(b[0]-a[0],b[1]-a[1]),start=distance;distance+=length;return {a,b,length,start,yaw:Math.atan2(b[0]-a[0],b[1]-a[1])};});
 const project=(x:number,z:number)=>{let best={distance:Infinity,along:0,yaw:0,u:0};for(const s of segments){const p=closest(x,z,s.a,s.b);if(p.d<best.distance)best={distance:p.d,along:s.start+p.t*s.length,yaw:s.yaw,u:(x-p.x)*Math.cos(s.yaw)-(z-p.z)*Math.sin(s.yaw)};}return best;};
 const elevation=(along:number)=>12*smooth(along/110)*smooth((spec.path.length-along)/110);
 const grid=farmRoadGrid(points,(x,z)=>nativeHeight(x,z)+elevation(project(x,z).along),20,{x0:0,z0:0,step:4});
 const cells=new Map<string,number[]>(),size=4;
 for(let i=0;i<grid.indices.length;i+=3){const ids=grid.indices.slice(i,i+3),xs=ids.map(k=>grid.positions[k*3]),zs=ids.map(k=>grid.positions[k*3+2]);for(let x=Math.floor(Math.min(...xs)/size);x<=Math.floor(Math.max(...xs)/size);x++)for(let z=Math.floor(Math.min(...zs)/size);z<=Math.floor(Math.max(...zs)/size);z++){const key=x+','+z,list=cells.get(key)??[];list.push(i);cells.set(key,list);}}
 function floorAt(x:number,z:number){
  for(const i of cells.get(Math.floor(x/size)+','+Math.floor(z/size))??[]){const[a,b,c]=grid.indices.slice(i,i+3).map(k=>grid.positions.slice(k*3,k*3+3)),den=(b[2]-c[2])*(a[0]-c[0])+(c[0]-b[0])*(a[2]-c[2]);if(Math.abs(den)<1e-10)continue;
   const u=((b[2]-c[2])*(x-c[0])+(c[0]-b[0])*(z-c[2]))/den,v=((c[2]-a[2])*(x-c[0])+(a[0]-c[0])*(z-c[2]))/den,w=1-u-v;
   if(u>=-1e-7&&v>=-1e-7&&w>=-1e-7)return u*a[1]+v*b[1]+w*c[1]-.06;
  }return null;
 }
 const normals=points.map((p,i)=>{const a=points[Math.max(0,i-1)],b=points[Math.min(points.length-1,i+1)],n=(a:V2,b:V2)=>{const d=Math.hypot(b[0]-a[0],b[1]-a[1])||1;return[(b[1]-a[1])/d,-(b[0]-a[0])/d];},aN=n(i===0?p:a,i===0?b:p),bN=n(i===points.length-1?a:p,i===points.length-1?p:b),d=1+aN[0]*bN[0]+aN[1]*bN[1];return[(aN[0]+bN[0])/d,(aN[1]+bN[1])/d];});
 function station(along:number,u=0){const index=segments.findIndex((s,i)=>along<=s.start+s.length||i===segments.length-1),s=segments[index],t=Math.max(0,Math.min(1,(along-s.start)/s.length)),a=normals[index],b=normals[index+1];const x=s.a[0]+(s.b[0]-s.a[0])*t+(a[0]+(b[0]-a[0])*t)*u,z=s.a[1]+(s.b[1]-s.a[1])*t+(a[1]+(b[1]-a[1])*t)*u;return{x,z,y:floorAt(x,z)??nativeHeight(x,z)+elevation(along),yaw:s.yaw};}
 const rails=[-1,1].map(side=>{const list:V2[]=[];for(let d=-12;d<=spec.path.length+12;d+=2){const p=station(d,side*9.65);list.push([p.x,p.z]);}return list;});
 const railCells=new Map<string,[V2,V2][]>();for(const line of rails)for(let i=1;i<line.length;i++){const a=line[i-1],b=line[i];for(let x=Math.floor((Math.min(a[0],b[0])-.3)/8);x<=Math.floor((Math.max(a[0],b[0])+.3)/8);x++)for(let z=Math.floor((Math.min(a[1],b[1])-.3)/8);z<=Math.floor((Math.max(a[1],b[1])+.3)/8);z++){const key=x+','+z,list=railCells.get(key)??[];list.push([a,b]);railCells.set(key,list);}}
 const towers=[spec.path.length*.47,spec.path.length*.8].flatMap(d=>[-1,1].map(side=>station(d,side*9)));
 const blocked=(x:number,z:number)=>(railCells.get(Math.floor(x/8)+','+Math.floor(z/8))??[]).some(([a,b])=>closest(x,z,a,b).d<.22)||towers.some(t=>{const dx=x-t.x,dz=z-t.z,c=Math.cos(t.yaw),s=Math.sin(t.yaw);return Math.abs(dx*c-dz*s)<.62&&Math.abs(dx*s+dz*c)<1.22;});
 // Reserve both the continuous 20 m deck and each tree's crown radius.
 // Include the 12 m end extensions, not just the SVG vertices/road centre.
 const deckEnvelope=10*Math.max(...normals.map(n=>Math.hypot(n[0],n[1])));
 const vegetationReserved=(x:number,z:number,radius=0)=>project(x,z).distance<=deckEnvelope+Math.max(0,radius);
 return {grid,points,project,station,elevation,floorAt,heightAt:(x:number,z:number)=>floorAt(x,z)??nativeHeight(x,z),blocked,rails,vegetationReserved};
}
