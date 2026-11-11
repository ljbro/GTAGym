import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {NodeIO} from '@gltf-transform/core';
import {ALL_EXTENSIONS} from '@gltf-transform/extensions';
import {MeshoptDecoder} from 'meshoptimizer';
import {mountainHeightAt} from '../src/city-mountains.ts';
import {terrainHeight,isCandidateGroundSlab} from '../src/landmark-details.ts';
import {RoadGraph} from '../src/navigation.ts';
import {reviewedNativeRoadRoute} from '../src/native-road-quality.ts';
const root=new URL('../../',import.meta.url),read=(p:string)=>JSON.parse(fs.readFileSync(new URL(p,root),'utf8'));
const graph=new RoadGraph([],read('city/navigation.json'));
const points=reviewedNativeRoadRoute(graph,'c03-n01',27)!.points;
const detail=read('city/landmark-detail.json'),grid=read(detail.terrain.url.slice(1)).grid;
const regions=['manifest.json','near-manifest.json'].map(file=>{const m=read('city/mountain-relief/'+file),b=fs.readFileSync(new URL('city/mountain-relief/'+m.file,root));return {grid:m.grid,data:new Float32Array(b.buffer,b.byteOffset,b.byteLength/4)};});
test('c03-n01 route and 6m verge are on flat terrain, including both vehicle spawns',()=>{
 for(let i=1;i<points.length;i++){
  const a=points[i-1],b=points[i],steps=Math.ceil(Math.hypot(b[0]-a[0],b[1]-a[1])/2);
  for(let k=0;k<=steps;k++)for(const dx of [-6,0,6])for(const dz of [-6,0,6]){
   const x=a[0]+(b[0]-a[0])*k/steps+dx,z=a[1]+(b[1]-a[1])*k/steps+dz;
   assert(terrainHeight(grid,x,z)<.01);for(const r of regions)assert(mountainHeightAt(r.data,r.grid,x,z)<.01);
  }
 }
});
test('actual candidate GLB buried the old spawn; replacement road has no body-height terrain surfaces',async()=>{
 await MeshoptDecoder.ready;
 const manifest=read('city/landmark-candidates.json');
 const doc=await new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({'meshopt.decoder':MeshoptDecoder}).read(new URL(manifest.asset.slice(1),root).pathname);
 type P=[number,number,number];
 const triangles:{name:string;a:P;b:P;c:P;minX:number;maxX:number;minZ:number;maxZ:number}[]=[];
 for(const node of doc.getRoot().listNodes()){
  const mesh=node.getMesh();if(!mesh)continue;const m=node.getWorldMatrix();
  const primitives=mesh.listPrimitives().map(prim=>{
   const attr=prim.getAttribute('POSITION')!;
   const v=Array.from({length:attr.getCount()},(_,i)=>{const p=attr.getElement(i,[]);return [m[0]*p[0]+m[4]*p[1]+m[8]*p[2]+m[12],m[1]*p[0]+m[5]*p[1]+m[9]*p[2]+m[13],-(m[2]*p[0]+m[6]*p[1]+m[10]*p[2]+m[14])] as P;});
   return {v,indices:prim.getIndices()?.getArray()??v.map((_,i)=>i)};
  });
  let lo=Infinity,hi=-Infinity;for(const {v} of primitives)for(const p of v){lo=Math.min(lo,p[1]);hi=Math.max(hi,p[1]);}
  if(isCandidateGroundSlab(node.getName(),hi-lo,manifest))continue;
  for(const {v,indices} of primitives)for(let i=0;i<indices.length;i+=3){
   const a=v[indices[i]],b=v[indices[i+1]],c=v[indices[i+2]];
   if(Math.min(a[1],b[1],c[1])>2.5||Math.max(a[1],b[1],c[1])<.14)continue;
   triangles.push({name:node.getName(),a,b,c,minX:Math.min(a[0],b[0],c[0]),maxX:Math.max(a[0],b[0],c[0]),minZ:Math.min(a[2],b[2],c[2]),maxZ:Math.max(a[2],b[2],c[2])});
  }
 }
 function hits(x:number,z:number){return triangles.flatMap(t=>{
  if(x<t.minX||x>t.maxX||z<t.minZ||z>t.maxZ)return [];
  const {a,b,c}=t,d=(b[2]-c[2])*(a[0]-c[0])+(c[0]-b[0])*(a[2]-c[2]);if(Math.abs(d)<1e-8)return [];
  const u=((b[2]-c[2])*(x-c[0])+(c[0]-b[0])*(z-c[2]))/d,v=((c[2]-a[2])*(x-c[0])+(a[0]-c[0])*(z-c[2]))/d,y=u*a[1]+v*b[1]+(1-u-v)*c[1];
  return u>=0&&v>=0&&u+v<=1&&y>.14&&y<2.5?[{name:t.name,y}]:[];
 });}
 assert(hits(3036.8,1920.7).some(h=>h.name==='landmark_bijia_park'&&h.y>1.3),'must detect old screenshot regression');
 for(let i=1;i<points.length;i++){
  const a=points[i-1],b=points[i],length=Math.hypot(b[0]-a[0],b[1]-a[1]),steps=Math.ceil(length/2),fx=(b[0]-a[0])/length,fz=(b[1]-a[1])/length;
  for(let k=0;k<=steps;k++)for(const front of [-2.5,0,2.5])for(const side of [-1.1,0,1.1]){
   const x=a[0]+(b[0]-a[0])*k/steps+fx*front+fz*side,z=a[1]+(b[1]-a[1])*k/steps+fz*front-fx*side;
   assert.deepEqual(hits(x,z),[],`rendered geometry must not bury car at ${x},${z}`);
  }
 }
});
