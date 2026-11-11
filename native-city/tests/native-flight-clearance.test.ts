import test from 'node:test';
import assert from 'node:assert/strict';
import {NodeIO} from '@gltf-transform/core';
import {ALL_EXTENSIONS} from '@gltf-transform/extensions';
import {MeshoptDecoder} from 'meshoptimizer';
import {NullEngine,Scene,Mesh,Ray,Vector3,VertexBuffer} from '@babylonjs/core';
import {flightSiteClearanceIndices} from '../src/native-flight-clearance.ts';
import {FLIGHT_DEPARTURE} from '../src/native-flight-route.ts';
import {runwayPoint} from '../src/city-flight-ground.ts';

test('authored park trees clear the physical runway while surrounding trees and paths remain',async()=>{
 await MeshoptDecoder.ready;
 const io=new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({'meshopt.decoder':MeshoptDecoder});
 const doc=await io.read(new URL('../../city/landmark-candidates.glb',import.meta.url).pathname);
 const engine=new NullEngine(),scene=new Scene(engine),cleared:string[]=[];
 let before=0,after=0;
 try{
  for(const node of doc.getRoot().listNodes()){
   const asset=node.getMesh();if(!asset?.getName().startsWith('landmark_central_park_'))continue;
   for(const primitive of asset.listPrimitives()){
    const accessor=primitive.getAttribute('POSITION')!,m=node.getWorldMatrix(),positions:number[]=[];
    for(let i=0;i<accessor.getCount();i++){
     const [x,y,z]=accessor.getElement(i,[]);
     positions.push(m[0]*x+m[4]*y+m[8]*z+m[12],m[1]*x+m[5]*y+m[9]*z+m[13],-(m[2]*x+m[6]*y+m[10]*z+m[14]));
    }
    const indices=primitive.getIndices()!.getArray()!,kept=flightSiteClearanceIndices(positions,indices);
    if(kept.length<indices.length)cleared.push(asset.getName());
    if(/_(leaf|bark)$/.test(asset.getName()))assert.ok(kept.length>0,'trees outside the airfield remain');
    if(/_(park|asphalt|water)$/.test(asset.getName()))assert.equal(kept.length,indices.length,'surrounding ground paths remain');
    const mesh=new Mesh(asset.getName(),scene);mesh.setVerticesData(VertexBuffer.PositionKind,positions);mesh.setIndices(Array.from(indices));mesh.computeWorldMatrix(true);
    const rays:Ray[]=[];
    for(const side of [-7,0,7])for(const height of [2,4.35,7]){
     const start=runwayPoint(FLIGHT_DEPARTURE,-255,side);
     rays.push(new Ray(new Vector3(start.x,height,start.z),new Vector3(Math.sin(FLIGHT_DEPARTURE.yaw),0,Math.cos(FLIGHT_DEPARTURE.yaw)),550));
    }
    before+=rays.filter(ray=>mesh.intersects(ray).hit).length;
    mesh.setIndices(kept);
    if(kept.length)after+=rays.filter(ray=>mesh.intersects(ray).hit).length;
    mesh.dispose();
   }
  }
  assert.ok(cleared.includes('landmark_central_park_leaf'));assert.ok(cleared.includes('landmark_central_park_bark'));
  assert.ok(before>0,'original asset obstructed the aircraft');assert.equal(after,0,'visible and collidable geometry both clear the runway');
 }finally{scene.dispose();engine.dispose();}
});
