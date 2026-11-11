import test from 'node:test';
import assert from 'node:assert/strict';
import {NullEngine,Scene,MeshBuilder,TransformNode} from '@babylonjs/core';
import {fitCandidateBuildingToFootprint,SHANGHAI_HOTEL_FIT as fit} from '../src/candidate-building-fit.ts';
import {inRing} from '../src/driving.ts';
import {readFileSync} from 'node:fs';

test('hotel candidate fits retained solid footprint, preserves height and other buildings',()=>{
 const engine=new NullEngine(),scene=new Scene(engine);
 try{
  const parent=new TransformNode('gltf-root',scene);parent.position.set(3198,0,517);parent.rotation.y=.2;
  const hotel=MeshBuilder.CreateBox(fit.prefix+'concrete',{width:48,height:30,depth:54},scene);hotel.parent=parent;hotel.position.y=15;
  const other=MeshBuilder.CreateBox('other-building',{},scene);other.position.x=3250;other.computeWorldMatrix(true);
  const result=fitCandidateBuildingToFootprint([hotel,other]);assert(result&&result.scale<1);
  const b=hotel.getBoundingInfo().boundingBox;
  assert(b.minimumWorld.x>=fit.minX-1e-3&&b.maximumWorld.x<=fit.maxX+1e-3);
  assert(b.minimumWorld.z>=fit.minZ-1e-3&&b.maximumWorld.z<=fit.maxZ+1e-3);
  assert(Math.abs(b.maximumWorld.y-30)<1e-3&&Math.abs(b.minimumWorld.y)<1e-3);
  assert.equal(other.position.x,3250);assert.equal(fitCandidateBuildingToFootprint([hotel]),null);
  const data=JSON.parse(readFileSync(new URL('../../city/city.json',import.meta.url),'utf8'));
  const ring=data.buildings.find((b:{id:string})=>b.id==='way/616351239').rings[0];
  for(const x of [fit.minX,fit.maxX])for(const z of [fit.minZ,fit.maxZ])assert(inRing(x,z,ring));
 }finally{scene.dispose();engine.dispose();}
});
