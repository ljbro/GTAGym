import {Matrix,Vector3,VertexBuffer,VertexData,type AbstractMesh} from '@babylonjs/core';

export type Waterway={points:number[][];waterHeight:number};
const INNER=30,OUTER=100,STEP=12;
function distance(x:number,z:number,routes:Waterway[]){
 let best=Infinity;
 for(const r of routes)for(let i=1;i<r.points.length;i++){
  const a=r.points[i-1],b=r.points[i],dx=b[0]-a[0],dz=b[1]-a[1];
  const t=Math.max(0,Math.min(1,((x-a[0])*dx+(z-a[1])*dz)/(dx*dx+dz*dz||1)));
  best=Math.min(best,Math.hypot(x-a[0]-t*dx,z-a[1]-t*dz));
 }
 return best;
}
/** Lower only the backdrop overlapping navigable water. Refinement happens
 * before deformation: coarse 70m terrain triangles must not bridge the lane.
 * The original GLB and all route/scoring coordinates remain untouched.
 */
export function clearWaterwayGeometry(source:ArrayLike<number>,indices:ArrayLike<number>,world:Matrix,routes:Waterway[]){
 const points:Vector3[]=[],out:number[]=[],midpoints=new Map<string,number>();
 for(let i=0;i<source.length;i+=3)points.push(Vector3.TransformCoordinates(Vector3.FromArray(source,i),world));
 const midpoint=(a:number,b:number)=>{const key=a<b?`${a}:${b}`:`${b}:${a}`;let id=midpoints.get(key);if(id===undefined){id=points.length;points.push(points[a].add(points[b]).scale(.5));midpoints.set(key,id);}return id;};
 function triangle(a:number,b:number,c:number,depth=0){
  const p=points[a],q=points[b],r=points[c],x=(p.x+q.x+r.x)/3,z=(p.z+q.z+r.z)/3;
  const radius=Math.max(...[p,q,r].map(v=>Math.hypot(v.x-x,v.z-z)));
  const edge=Math.max(Math.hypot(p.x-q.x,p.z-q.z),Math.hypot(q.x-r.x,q.z-r.z),Math.hypot(r.x-p.x,r.z-p.z));
  if(depth<10&&edge>STEP&&distance(x,z,routes)-radius<OUTER){
   const ab=midpoint(a,b),bc=midpoint(b,c),ca=midpoint(c,a);
   triangle(a,ab,ca,depth+1);triangle(ab,b,bc,depth+1);triangle(ca,bc,c,depth+1);triangle(ab,bc,ca,depth+1);
  }else out.push(a,b,c);
 }
 for(let i=0;i<indices.length;i+=3)triangle(indices[i],indices[i+1],indices[i+2]);
 // Close adaptive T-junctions with the already shared midpoint cache. Without
 // this pass the horizon builder could mistake an internal coarse/fine edge
 // for a coast and extrude an artificial vertical wall there.
 const joined:number[]=[];
 function conform(a:number,b:number,c:number){
  for(const [u,v,w] of [[a,b,c],[b,c,a],[c,a,b]]){const mid=midpoints.get(u<v?`${u}:${v}`:`${v}:${u}`);if(mid!==undefined){conform(u,mid,w);conform(mid,v,w);return;}}
  joined.push(a,b,c);
 }
 for(let i=0;i<out.length;i+=3)conform(out[i],out[i+1],out[i+2]);
 const inverse=Matrix.Invert(world),positions:number[]=[],normals:number[]=[];
 const bottom=Math.min(...routes.map(r=>r.waterHeight))-8;let lowered=0;
 for(let i=0;i<points.length;i++){const p=points[i],d=distance(p.x,p.z,routes),change=d<OUTER&&p.y>bottom;
  if(change){const t=Math.max(0,Math.min(1,(d-INNER)/(OUTER-INNER))),blend=t*t*(3-2*t);p.y=bottom+(p.y-bottom)*blend;lowered++;}
  // Avoid a float-matrix round trip changing untouched original terrain.
  if(!change&&i*3<source.length)positions.push(source[i*3],source[i*3+1],source[i*3+2]);
  else Vector3.TransformCoordinates(p,inverse).toArray(positions,positions.length);
 }
 VertexData.ComputeNormals(positions,joined,normals);
 return {positions,normals,indices:joined,stats:{lowered,sourceTriangles:indices.length/3,triangles:joined.length/3,innerRadius:INNER,outerRadius:OUTER}};
}

export function clearBackdropWaterways(mesh:AbstractMesh,routes:Waterway[]){
 const p=mesh.getVerticesData(VertexBuffer.PositionKind),indices=mesh.getIndices();if(!p||!indices||!routes.length)return;
 const geometry=clearWaterwayGeometry(p,indices,mesh.computeWorldMatrix(true),routes);
 mesh.setVerticesData(VertexBuffer.PositionKind,geometry.positions,false);
 mesh.setVerticesData(VertexBuffer.NormalKind,geometry.normals,false);mesh.setIndices(geometry.indices,geometry.positions.length/3);
 mesh.refreshBoundingInfo({applySkeleton:false});mesh.metadata={...mesh.metadata,waterwayClearance:geometry.stats};
 return geometry.stats;
}
