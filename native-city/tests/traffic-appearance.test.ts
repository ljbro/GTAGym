import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {NullEngine,Scene,MeshBuilder,PBRMaterial,Vector3} from '@babylonjs/core';
import {trafficWheelMatrix,trafficWheelTravel} from '../src/traffic-appearance.ts';
import {CityTraffic} from '../src/traffic.ts';
import type {RoadGraph} from '../src/navigation.ts';
const wheel={center:[.8,.35,1.4] as [number,number,number],radius:.35,front:true};
test('wheel rotates about its own axle, signed travel freezes on pause and teleport',()=>{
 const center=Vector3.FromArray(wheel.center),m=trafficWheelMatrix(wheel,3);
 assert(Vector3.Distance(Vector3.TransformCoordinates(center,m),center)<1e-6);
 assert.equal(trafficWheelTravel({x:0,z:0},{x:0,z:1,yaw:0},.1),1);
 assert.equal(trafficWheelTravel({x:0,z:1},{x:0,z:0,yaw:0},.1),-1);
 assert.equal(trafficWheelTravel({x:0,z:0},{x:0,z:1,yaw:0},0),0);
 assert.equal(trafficWheelTravel({x:0,z:0},{x:0,z:100,yaw:0},.1),0);
});
test('two templates keep independent finite instance matrices and parking freezes wheels',()=>{
 const engine=new NullEngine(),scene=new Scene(engine);
 try{
  const modern=MeshBuilder.CreateBox('modern-wheel',{},scene),retro=MeshBuilder.CreateBox('retro-wheel',{},scene);
  modern.material=new PBRMaterial('carpaint',scene);retro.material=new PBRMaterial('retro-painted-body',scene);
  modern.metadata={gltf:{extras:{trafficWheel:wheel}}};retro.metadata={gltf:{extras:{trafficWheel:wheel}}};
  const graph={nodes:[[0,0],[0,100]],edges:[new Map([[1,100]]),new Map([[0,100]])],nearest:()=>0} as unknown as RoadGraph;
  const traffic=new CityTraffic(graph,[modern],scene,()=>0,()=>true,[retro]);
  const car=traffic.park({x:0,z:20,yaw:0,group:2});
  traffic.park({x:8,z:20,yaw:0,group:0});traffic.update(0,0,0);
  assert.equal(traffic.meshes[2][0].thinInstanceCount,1);assert(traffic.meshes[2][0].name.includes('retro'));
  const matrix=traffic.meshes[2][0].thinInstanceGetWorldMatrices()[0];assert([...matrix.asArray()].every(Number.isFinite));
  const before=Array.from(matrix.asArray());traffic.update(0,0,0);assert.deepEqual(Array.from(traffic.meshes[2][0].thinInstanceGetWorldMatrices()[0].asArray()),before);
  assert(traffic.take(car));traffic.update(0,0,0);assert(!traffic.meshes[2][0].isEnabled());
 }finally{scene.dispose();engine.dispose();}
});
test('shipped CC0 cars fit existing collision envelope with four independent wheel axles',()=>{
 const manifest=JSON.parse(fs.readFileSync(new URL('../../city/npc-vehicles/manifest.json',import.meta.url),'utf8'));
 for(const m of manifest.sources){
  assert.equal(m.license,'CC0-1.0');assert(m.triangles<50000&&m.meshes<=24&&m.bytes<2*1024*1024);
  assert.equal(m.wheels.length,4);assert.equal(m.wheels.filter((w:{front:boolean})=>w.front).length,2);
  assert(m.bounds.min[1]>-.001);assert(Math.abs(m.bounds.max[2]-m.bounds.min[2]-4.9)<.01);
  const b=fs.readFileSync(new URL('../../'+m.output,import.meta.url));assert.equal(b.toString('ascii',0,4),'glTF');
  const gltf=JSON.parse(b.subarray(20,20+b.readUInt32LE(12)).toString());
  assert(gltf.nodes.some((n:{extras?:{trafficWheel?:unknown}})=>n.extras?.trafficWheel));assert(gltf.images.length>0);
 }
});
