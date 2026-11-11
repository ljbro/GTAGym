import {closest} from './driving.ts';
export type HillSpec={id:string;path:{points:number[][];length:number}};
const smooth=(v:number)=>{const t=Math.max(0,Math.min(1,v));return t*t*(3-2*t);};
/** Terrain-first task adaptation. Roads and physics sample the SAME triangles;
 * height is added to native land, never an unsupported elevated road slab. */
export function hillLayout(spec:HillSpec,nativeHeight:(x:number,z:number)=>number){
 let distance=0;
 const segments=spec.path.points.slice(1).map((b,i)=>{const a=spec.path.points[i],length=Math.hypot(b[0]-a[0],b[1]-a[1]),start=distance;distance+=length;return {a,b,length,start,yaw:Math.atan2(b[0]-a[0],b[1]-a[1])};});
 const project=(x:number,z:number)=>{let best={distance:Infinity,along:0,u:0,yaw:0};for(const s of segments){const p=closest(x,z,s.a as [number,number],s.b as [number,number]);if(p.d<best.distance)best={distance:p.d,along:s.start+p.t*s.length,u:(x-p.x)*Math.cos(s.yaw)-(z-p.z)*Math.sin(s.yaw),yaw:s.yaw};}return best;};
 const bridgeSegment=segments[6],bridge={x:(bridgeSegment.a[0]+bridgeSegment.b[0])/2,z:(bridgeSegment.a[1]+bridgeSegment.b[1])/2,yaw:bridgeSegment.yaw};
 const bridgeLocal=(x:number,z:number)=>{const dx=x-bridge.x,dz=z-bridge.z,c=Math.cos(bridge.yaw),s=Math.sin(bridge.yaw);return {u:dx*c-dz*s,v:dx*s+dz*c};};
 function delta(x:number,z:number){
  const near=project(x,z);if(near.distance>=22)return 0;
  // Blend adjacent segments, rather than discontinuously selecting a segment
  // grade when the nearest segment changes on the inside of a bend.
  let sum=0,total=0,crest=0;
  for(const s of segments){const p=closest(x,z,s.a as [number,number],s.b as [number,number]),w=Math.exp(-p.d*p.d/32),along=s.start+p.t*s.length,u=(x-p.x)*Math.cos(s.yaw)-(z-p.z)*Math.sin(s.yaw),v=(x-s.a[0])*Math.sin(s.yaw)+(z-s.a[1])*Math.cos(s.yaw),beyond=Math.max(0,-v,v-s.length);sum+=w*8*smooth((along/spec.path.length-.30)/.65);total+=w;crest=Math.max(crest,15*Math.exp(-(((u-16)/4)**2))*Math.exp(-((beyond/9)**2))*smooth((along/spec.path.length-.25)/.2));}
  const br=bridgeLocal(x,z),abutment=14*Math.exp(-(((Math.abs(br.u)-17)/4)**2))*Math.exp(-((br.v/15)**2));
  const bank=Math.max(crest,abutment)*smooth((near.distance-10)/4),edge=1-smooth((near.distance-18)/4);
  return ((sum/(total||1))*(1-smooth((near.distance-11)/11))+bank)*edge;
 }
 const step=2,x0=Math.floor((Math.min(...spec.path.points.map(p=>p[0]))-26)/step)*step,z0=Math.floor((Math.min(...spec.path.points.map(p=>p[1]))-26)/step)*step;
 const columns=Math.ceil((Math.max(...spec.path.points.map(p=>p[0]))+26-x0)/step)+1,rows=Math.ceil((Math.max(...spec.path.points.map(p=>p[1]))+26-z0)/step)+1;
 const heights=new Float64Array(columns*rows),deltas=new Float64Array(heights.length),positions:number[]=[],indices:number[]=[],uvs:number[]=[];
 for(let j=0;j<rows;j++)for(let i=0;i<columns;i++){const x=x0+i*step,z=z0+j*step,k=j*columns+i;deltas[k]=delta(x,z);heights[k]=nativeHeight(x,z)+deltas[k];positions.push(x,heights[k]+.04,z);uvs.push(x/6,z/6);}
 for(let j=0;j<rows-1;j++)for(let i=0;i<columns-1;i++){const a=j*columns+i,b=a+1,d=a+columns,c=d+1;if(Math.max(deltas[a],deltas[b],deltas[c],deltas[d])<1e-6)continue;indices.push(a,b,d,b,c,d);}
 function sample(data:Float64Array,x:number,z:number){const u=(x-x0)/step,v=(z-z0)/step,i=Math.floor(u),j=Math.floor(v);if(i<0||j<0||i>=columns-1||j>=rows-1)return null;const fx=u-i,fz=v-j,k=j*columns+i,a=data[k],b=data[k+1],d=data[k+columns],c=data[k+columns+1];return fx+fz<=1?a+(b-a)*fx+(d-a)*fz:c+(d-c)*(1-fx)+(b-c)*(1-fz);}
 // The level tunnel approach is also a road surface, even where no hill
 // elevation was added. Keep navigation and wheels on the rendered grid.
 const floorAt=(x:number,z:number)=>project(x,z).distance<=8||(sample(deltas,x,z)??0)>1e-6?sample(heights,x,z):null;
 const heightAt=(x:number,z:number)=>floorAt(x,z)??nativeHeight(x,z);
 const bridgeBase=heightAt(bridge.x,bridge.z);
 const railLines=segments.slice(1).map(s=>{const dx=-Math.cos(s.yaw)*9,dz=Math.sin(s.yaw)*9;return [[s.a[0]+dx,s.a[1]+dz],[s.b[0]+dx,s.b[1]+dz]] as [[number,number],[number,number]];});
 const first=segments[0],tunnelLocal=(x:number,z:number)=>{const dx=x-first.a[0],dz=z-first.a[1];return {u:dx*Math.cos(first.yaw)-dz*Math.sin(first.yaw),v:dx*Math.sin(first.yaw)+dz*Math.cos(first.yaw)};};
 const blocked=(x:number,z:number)=>{const b=bridgeLocal(x,z),t=tunnelLocal(x,z);return Math.abs(b.u)>13.6&&Math.abs(b.u)<20.4&&Math.abs(b.v)<4.4||t.v> -15.4&&t.v<45.4&&Math.abs(t.u)>8.65&&Math.abs(t.u)<9.9||railLines.some(([a,b])=>closest(x,z,a,b).d<.25);};
 // Include the roadside camera clearance and each tree's canopy radius.
 const vegetationReserved=(x:number,z:number,radius=0)=>project(x,z).distance<=14+Math.max(0,radius);
 return {project,bridge,bridgeBase,bridgeLocal,heightAt,floorAt,blocked,vegetationReserved,positions,indices,uvs,grid:{x0,z0,step,columns,rows},heights,deltas};
}
