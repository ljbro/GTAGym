import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {NodeIO} from '@gltf-transform/core';
import {ALL_EXTENSIONS} from '@gltf-transform/extensions';
import {MeshoptDecoder} from 'meshoptimizer';
import {Matrix,Mesh,MeshBuilder,NullEngine,Ray,Scene,Vector3,VertexData} from '@babylonjs/core';
import {clearWaterwayGeometry} from '../src/city-waterway-clearance.ts';
import {createCoastalHorizon} from '../src/city-coastal-horizon.ts';
import {clearBoatCamera} from '../src/native-boat-camera.ts';

test('adaptive terrain refinement leaves no internal open edges for false coast walls',()=>{
 const p:number[]=[],ind:number[]=[];for(let z=0;z<=4;z++)for(let x=0;x<=4;x++)p.push(x*70,2,z*70);
 for(let z=0;z<4;z++)for(let x=0;x<4;x++){const a=z*5+x;ind.push(a,a+1,a+5,a+1,a+6,a+5);}
 const g=clearWaterwayGeometry(p,ind,Matrix.Identity(),[{points:[[0,0],[50,40]],waterHeight:-.25}]);
 const edges=new Map<string,{a:number;b:number;count:number}>();
 for(let i=0;i<g.indices.length;i+=3){const [a,b,c]=g.indices.slice(i,i+3);for(const [u,v] of [[a,b],[b,c],[c,a]]){const key=u<v?`${u}:${v}`:`${v}:${u}`,e=edges.get(key);if(e)e.count++;else edges.set(key,{a:u,b:v,count:1});}}
 for(const {a,b,count} of edges.values()){assert(count<=2);if(count===1){const x=g.positions[a*3],z=g.positions[a*3+2],bx=g.positions[b*3],bz=g.positions[b*3+2];assert((x===bx&&(x===0||x===280))||(z===bz&&(z===0||z===280)),'An internal T-junction would be mistaken for a shore');}}
});

test('real c06-n11 far-shore geometry clears the complete waterway and orbit envelope',async()=>{
 await MeshoptDecoder.ready;
 const io=new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({'meshopt.decoder':MeshoptDecoder});
 const doc=await io.read(new URL('../../city/opposite-shore.glb',import.meta.url).pathname);
 const route=JSON.parse(fs.readFileSync(new URL('../src/native-beach-boat-routes.json',import.meta.url),'utf8'))[0];
 const node=doc.getRoot().listNodes().find(n=>n.getMesh())!,primitive=node.getMesh()!.listPrimitives()[0],accessor=primitive.getAttribute('POSITION')!;
 const positions:number[]=[];for(let i=0;i<accessor.getCount();i++)positions.push(...accessor.getElement(i,[]));
 const indices=primitive.getIndices()!.getArray()!;
 const world=Matrix.FromArray(node.getWorldMatrix()).multiply(Matrix.Scaling(1,1,-1));
 const result=clearWaterwayGeometry(positions,indices,world,[{points:route.path.points,waterHeight:route.waterHeight}]);
 assert(result.stats.lowered>0);assert(result.stats.triangles<indices.length/3*1.4,'Bound local refinement cost');
 // All original vertices beyond the local edit radius remain unchanged.
 let preserved=0;for(let i=0;i<positions.length;i+=3)if(Math.abs(positions[i]-result.positions[i])+Math.abs(positions[i+1]-result.positions[i+1])+Math.abs(positions[i+2]-result.positions[i+2])<1e-10)preserved++;
 assert(preserved>accessor.getCount()*.9);
 const engine=new NullEngine(),scene=new Scene(engine),mesh=new Mesh('opposite_shore_terrain',scene),data=new VertexData();
 const worldPositions:number[]=[];for(let i=0;i<result.positions.length;i+=3)Vector3.TransformCoordinates(Vector3.FromArray(result.positions,i),world).toArray(worldPositions,worldPositions.length);
 data.positions=worldPositions;data.indices=result.indices;data.normals=[];VertexData.ComputeNormals(worldPositions,result.indices,data.normals);data.applyToMesh(mesh);mesh.computeWorldMatrix(true);
 const horizon=createCoastalHorizon(scene,mesh,route.waterHeight).mesh;horizon?.computeWorldMatrix(true);
 const blockers=[mesh,...(horizon?[horizon]:[])];let samples=0;
 try{
  const ps=route.path.points;
  for(let i=1;i<ps.length;i++){
   const a=ps[i-1],b=ps[i],dx=b[0]-a[0],dz=b[1]-a[1],length=Math.hypot(dx,dz);
   for(let s=0;s<=length;s+=3)for(const offset of [-15,0,15]){
    const x=a[0]+dx*s/length-dz*offset/length,z=a[1]+dz*s/length+dx*offset/length;
    const ray=new Ray(new Vector3(x,20,z),new Vector3(0,-1,0),40);
    for(const m of blockers){const hit=ray.intersectsMesh(m);assert(!hit.hit||hit.pickedPoint!.y<route.waterHeight-2,`Backdrop blocks route ${i}/${s}/${offset} at ${hit.pickedPoint?.y}`);}
    if(offset===0)for(let angle=0;angle<Math.PI*2;angle+=Math.PI/4){const target=new Vector3(x,1.05,z),eye=target.add(new Vector3(Math.sin(angle)*11,1.7,Math.cos(angle)*11));assert(Vector3.Distance(eye,clearBoatCamera(eye,target,blockers))<1e-5,'Open-water orbit must not collapse');}
    samples++;
   }
  }
  console.log(JSON.stringify({waterwayClearance:result.stats,preserved,samples}));
 }finally{scene.dispose();engine.dispose();}
});

test('boat camera stops before non-pickable ground obstacles and ignores disabled ones',()=>{
 const engine=new NullEngine(),scene=new Scene(engine),wall=MeshBuilder.CreateBox('shore',{width:20,height:20,depth:1},scene);
 wall.position.z=5;wall.isPickable=false;wall.computeWorldMatrix(true);
 const target=new Vector3(0,2,0),eye=new Vector3(0,2,11);
 try{const safe=clearBoatCamera(eye,target,[wall]);assert(safe.z>3.9&&safe.z<4.2);wall.setEnabled(false);assert(clearBoatCamera(eye,target,[wall]).equalsWithEpsilon(eye));}
 finally{scene.dispose();engine.dispose();}
});
