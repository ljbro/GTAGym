import type {V2} from './city-types.ts';
// Both native relief grids share this origin; the far grid is 3 × coarser.
export const FARM_TERRAIN_GRID={x0:-6804,z0:-2628,step:12};
export const FARM_ROAD_OFFSET=.06; // native terrain renders at height + .04
type RoadVertex={x:number;z:number;u:number;v:number};
function clip(poly:RoadVertex[],side:(p:RoadVertex)=>number){
 const out:RoadVertex[]=[];
 for(let i=0;i<poly.length;i++){
  const a=poly[i],b=poly[(i+1)%poly.length],da=side(a),db=side(b),insideA=da>=0,insideB=db>=0;
  if(insideA)out.push(a);
  if(insideA!==insideB){const t=da/(da-db);out.push({x:a.x+(b.x-a.x)*t,z:a.z+(b.z-a.z)*t,u:a.u+(b.u-a.u)*t,v:a.v+(b.v-a.v)*t});}
 }return out;
}
/** Split overlay triangles on exactly the same cell edges AND diagonals as
 * native terrain. Vertex-only sampling otherwise allows grass through the
 * road between vertices, even with a dense, apparently continuous grid. */
function terrainConform(positions:number[],uvs:number[],indices:number[],height:(x:number,z:number)=>number,grid=FARM_TERRAIN_GRID){
 const p:number[]=[],uv:number[]=[],ids:number[]=[],vertices=new Map<string,number>(),{x0,z0,step}=grid;
 const vertex=(a:RoadVertex)=>{const key=`${a.x.toFixed(7)},${a.z.toFixed(7)}`;let i=vertices.get(key);if(i===undefined){i=p.length/3;vertices.set(key,i);p.push(a.x,height(a.x,a.z)+FARM_ROAD_OFFSET,a.z);uv.push(a.u,a.v);}return i;};
 for(let i=0;i<indices.length;i+=3){
  const triangle=indices.slice(i,i+3).map(n=>({x:positions[n*3],z:positions[n*3+2],u:uvs[n*2],v:uvs[n*2+1]}));
  const minX=Math.floor((Math.min(...triangle.map(p=>p.x))-x0)/step),maxX=Math.floor((Math.max(...triangle.map(p=>p.x))-x0)/step),minZ=Math.floor((Math.min(...triangle.map(p=>p.z))-z0)/step),maxZ=Math.floor((Math.max(...triangle.map(p=>p.z))-z0)/step);
  for(let x=minX;x<=maxX;x++)for(let z=minZ;z<=maxZ;z++){
   const left=x0+x*step,bottom=z0+z*step;
   let poly=clip(triangle,p=>p.x-left);poly=clip(poly,p=>left+step-p.x);poly=clip(poly,p=>p.z-bottom);poly=clip(poly,p=>bottom+step-p.z);
   for(const sign of [-1,1]){
    const half=clip(poly,p=>sign*(p.x-left+p.z-bottom-step));
    for(let k=1;k+1<half.length;k++){
     const a=half[0],b=half[k],c=half[k+1],area=(b.x-a.x)*(c.z-a.z)-(b.z-a.z)*(c.x-a.x);
     if(Math.abs(area)>1e-9)ids.push(vertex(a),vertex(b),vertex(c));
    }
   }
  }
 }
 return {positions:p,uvs:uv,indices:ids};
}
export type FarmSpec={id:string;path:{points:number[][];length:number;placement:{farm:number[];yaw:number}}};
export function farmPoint(spec:FarmSpec,u:number,v:number):V2{
 const {farm,yaw}=spec.path.placement,c=Math.cos(yaw),s=Math.sin(yaw);return [farm[0]+u*c+v*s,farm[1]-u*s+v*c];
}
/** One shared grid, including the corner joins, draped on the native height field.
 * This is a thin ground material overlay, never an elevated stacked road slab. */
export function farmRoadGrid(points:readonly number[][],height:(x:number,z:number)=>number,width=14,terrainGrid=FARM_TERRAIN_GRID){
 const sections:{x:number;z:number;nx:number;nz:number;distance:number}[]=[];let distance=0;
 for(let i=0;i<points.length;i++){
  const a=points[Math.max(0,i-1)],p=points[i],b=points[Math.min(points.length-1,i+1)];
  const normal=(a:number[],b:number[])=>{const d=Math.hypot(b[0]-a[0],b[1]-a[1])||1;return [(b[1]-a[1])/d,-(b[0]-a[0])/d];};
  const n0=normal(i===0?p:a,i===0?b:p),n1=normal(i===points.length-1?a:p,i===points.length-1?p:b),d=1+n0[0]*n1[0]+n0[1]*n1[1];
  const nx=(n0[0]+n1[0])/d,nz=(n0[1]+n1[1])/d;
  if(i){const last=sections.at(-1)!,length=Math.hypot(p[0]-a[0],p[1]-a[1]),count=Math.ceil(length/.8),start=distance;
   for(let k=1;k<count;k++){const t=k/count;sections.push({x:a[0]+(p[0]-a[0])*t,z:a[1]+(p[1]-a[1])*t,nx:last.nx+(nx-last.nx)*t,nz:last.nz+(nz-last.nz)*t,distance:start+length*t});}distance+=length;
  }
  sections.push({x:p[0],z:p[1],nx,nz,distance});
 }
 const positions:number[]=[],uvs:number[]=[],indices:number[]=[],across=14;
 for(const s of sections)for(let j=0;j<=across;j++){const u=(j/across-.5)*width,x=s.x+s.nx*u,z=s.z+s.nz*u;positions.push(x,height(x,z)+.018,z);uvs.push(u/3,s.distance/3);}
 // Babylon's left-handed mesh convention: outward normal must point up.
 for(let i=1;i<sections.length;i++)for(let j=0;j<across;j++){const a=(i-1)*(across+1)+j,b=i*(across+1)+j;indices.push(a,a+1,b,a+1,b+1,b);}
 return {...terrainConform(positions,uvs,indices,height,terrainGrid),rows:sections.length,across};
}
export function farmBlocked(spec:FarmSpec,x:number,z:number){
 const {farm,yaw}=spec.path.placement,c=Math.cos(yaw),s=Math.sin(yaw),dx=x-farm[0],dz=z-farm[1],u=dx*c-dz*s,v=dx*s+dz*c;
 return Math.abs(u)<6.2&&Math.abs(v)<4.7||Math.abs(u-9)<2.3&&Math.abs(v-4)<3.3||[-3,3].some(z=>Math.hypot(u+8.3,v-z)<.25);
}
