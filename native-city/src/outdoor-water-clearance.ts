/** Exact projected triangle queries on the loaded, transformed terrain GLBs.
 * Logical coastline polygons alone do not include the opposite-shore backdrop.
 * This is shared by generation and generated-water gameplay collision.
 */
type SurfaceMesh={name:string;getVerticesData:(kind:string)=>ArrayLike<number>|null;getIndices:()=>ArrayLike<number>|null;computeWorldMatrix:(force:boolean)=>{m:ArrayLike<number>}};
type Triangle={a:[number,number,number];b:[number,number,number];c:[number,number,number];denominator:number};
export function renderedWaterClearance(meshes:readonly SurfaceMesh[],waterHeight:number,extent:readonly number[]){
 const wet=new Map<string,Triangle[]>(),land=new Map<string,Triangle[]>(),size=100;
 const counts={waterTriangles:0,landTriangles:0};
 for(const mesh of meshes){
  const water=mesh.name==='terrain_water'||mesh.name==='bay-horizon-water';
  if(!water&&!/^(terrain_|opposite[-_]shore|coastal_shore|ground[-_]relief|mountain)/.test(mesh.name))continue;
  const positions=mesh.getVerticesData('position'),indices=mesh.getIndices();if(!positions||!indices)continue;const m=mesh.computeWorldMatrix(true).m;
  const point=(i:number):[number,number,number]=>{const x=positions[i*3],y=positions[i*3+1],z=positions[i*3+2];return [x*m[0]+y*m[4]+z*m[8]+m[12],x*m[1]+y*m[5]+z*m[9]+m[13],x*m[2]+y*m[6]+z*m[10]+m[14]];};
  for(let i=0;i+2<indices.length;i+=3){const a=point(indices[i]),b=point(indices[i+1]),c=point(indices[i+2]),denominator=(b[2]-c[2])*(a[0]-c[0])+(c[0]-b[0])*(a[2]-c[2]);
   if(Math.abs(denominator)<1e-8||!water&&Math.max(a[1],b[1],c[1])<waterHeight-.1)continue;
   const minX=Math.max(extent[0]-1000,Math.min(a[0],b[0],c[0])),maxX=Math.min(extent[2]+1000,Math.max(a[0],b[0],c[0])),minZ=Math.max(extent[1]-1000,Math.min(a[2],b[2],c[2])),maxZ=Math.min(extent[3]+1000,Math.max(a[2],b[2],c[2]));
   const triangle={a,b,c,denominator},bins=water?wet:land;counts[water?'waterTriangles':'landTriangles']++;
   for(let x=Math.floor(minX/size);x<=Math.floor(maxX/size);x++)for(let z=Math.floor(minZ/size);z<=Math.floor(maxZ/size);z++){const key=x+','+z,list=bins.get(key)??[];list.push(triangle);bins.set(key,list);}
  }
 }
 function hit(triangle:Triangle,x:number,z:number){const {a,b,c,denominator:d}=triangle,u=((b[2]-c[2])*(x-c[0])+(c[0]-b[0])*(z-c[2]))/d,v=((c[2]-a[2])*(x-c[0])+(a[0]-c[0])*(z-c[2]))/d;
  return u>=-1e-7&&v>=-1e-7&&u+v<=1+1e-7?a[1]*u+b[1]*v+c[1]*(1-u-v):null;
 }
 return {stats:counts,allows(x:number,z:number){const key=Math.floor(x/size)+','+Math.floor(z/size);
  if(!(wet.get(key)??[]).some(t=>hit(t,x,z)!==null))return false;
  return !(land.get(key)??[]).some(t=>{const y=hit(t,x,z);return y!==null&&y>=waterHeight-.1;});
 }};
}
