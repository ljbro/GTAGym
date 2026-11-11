import type {V2} from './city-types.ts';
export type StairSpec={id:string;points:number[][];heights:number[];length:number};
export type StairPanel={x:number;z:number;w:number;d:number;yaw:number;y:number;landing:boolean};
export type StairLayout={spec:StairSpec;points:V2[];panels:StairPanel[];base:number;room:StairPanel;upper:V2;roomSide:number;yaw:number};
export function stairLocal(p:{x:number;z:number;yaw:number},x:number,z:number):V2{const dx=x-p.x,dz=z-p.z,c=Math.cos(p.yaw),s=Math.sin(p.yaw);return [dx*c-dz*s,dx*s+dz*c];}
export function stairPoint(p:{x:number;z:number;yaw:number},u:number,v:number):V2{return [p.x+u*Math.cos(p.yaw)+v*Math.sin(p.yaw),p.z-u*Math.sin(p.yaw)+v*Math.cos(p.yaw)];}
export function stairFloor(layout:StairLayout,x:number,z:number){let result:number|null=null;for(const p of layout.panels){const [u,v]=stairLocal(p,x,z);if(Math.abs(u)<=p.w/2+1e-5&&Math.abs(v)<=p.d/2+1e-5)result=Math.max(result??-Infinity,p.y);}return result;}
export function makeStairLayout(spec:StairSpec,x:number,z:number,base:number,yaw:number):StairLayout{
 const points=spec.points.map(p=>stairPoint({x,z,yaw},p[0],p[1])),panels:StairPanel[]=[];
 // Landings are actual supported horizontal surfaces. Flights join their
 // edges with <=16cm risers; source centreline vertices are never changed.
 for(let i=0;i<points.length;i++)panels.push({x:points[i][0],z:points[i][1],w:1.8,d:1.8,yaw,y:base+spec.heights[i],landing:true});
 for(let i=1;i<points.length;i++){
  const a=points[i-1],b=points[i],dx=b[0]-a[0],dz=b[1]-a[1],length=Math.hypot(dx,dz),heading=Math.atan2(dx,dz),h0=spec.heights[i-1],h1=spec.heights[i];
  const count=Math.max(1,Math.ceil(Math.abs(h1-h0)/.16)),start=.82,end=length-.82,run=(end-start)/count;
  for(let j=0;j<count;j++){const t=(start+(j+.5)*run)/length;panels.push({x:a[0]+dx*t,z:a[1]+dz*t,w:1.8,d:run+.02,yaw:heading,y:base+h0+(h1-h0)*(j+1)/count,landing:false});}
 }
 const upperIndex=spec.heights[0]>0?0:points.length-1,upper=points[upperIndex],side=upperIndex===0?-1:1;
 const roomCenter=stairPoint({x:upper[0],z:upper[1],yaw},side*3.0,0);
 const room={x:roomCenter[0],z:roomCenter[1],w:3.6,d:3.4,yaw,y:base+3.2,landing:true};
 const bridge=stairPoint({x:upper[0],z:upper[1],yaw},side*.95,0);
 panels.push({x:bridge[0],z:bridge[1],w:1.9,d:1.6,yaw,y:base+3.2,landing:true});
 return {spec,points,panels,base,room,upper,roomSide:side,yaw};
}
type Checks={blocked:(x:number,z:number)=>boolean;heightAt:(x:number,z:number)=>number;roadAt:(x:number,z:number)=>{d:number;road:{width:number}}|null};
export function findStairLayout(spec:StairSpec,nodes:readonly V2[],checks:Checks){
 for(let trial=0;trial<Math.min(nodes.length,800);trial++){
  const n=nodes[(trial*37+(spec.id==='c07-n02'?81:137))%nodes.length];
  for(const distance of [18,28,42])for(const yaw of [0,Math.PI/2,Math.PI,-Math.PI/2]){
   const p=makeStairLayout(spec,n[0]+Math.cos(yaw)*distance,n[1]-Math.sin(yaw)*distance,0,yaw),rects=[...p.panels,p.room];let low=Infinity,high=-Infinity,clear=true;
   for(const r of rects){for(let u=-r.w/2-.4;u<=r.w/2+.401&&clear;u+=.4)for(let v=-r.d/2-.4;v<=r.d/2+.401;v+=.4){
    const [x,z]=stairPoint(r,u,v),h=checks.heightAt(x,z),road=checks.roadAt(x,z);
    if(!Number.isFinite(h)||checks.blocked(x,z)||road&&road.d<road.road.width/2+1){clear=false;break;}low=Math.min(low,h);high=Math.max(high,h);if(high-low>.06){clear=false;break;}
   }if(!clear)break;}
   if(clear)return makeStairLayout(spec,p.points[0][0],p.points[0][1],high+.02,yaw);
  }
 }
 throw Error("No level site for outdoor stairs was found that would leave existing roads unobstructed");
}
