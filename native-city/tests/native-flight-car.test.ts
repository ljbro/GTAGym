import assert from 'node:assert/strict';
import test from 'node:test';
import {NullEngine,Scene,TransformNode,MeshBuilder,PointLight,Vector3,StandardMaterial} from '@babylonjs/core';
import {NativeFlightCar} from '../src/native-flight-car.ts';

test('flight removes car hierarchy and lights from the scene, and restores cached assets without duplicates',()=>{
 const engine=new NullEngine(),scene=new Scene(engine);
 try{
  const car=new TransformNode('car',scene),rig=new TransformNode('lights',scene);
  const body=MeshBuilder.CreateBox('body',{},scene);body.parent=car;
  const trim=new TransformNode('trim',scene);trim.parent=car;
  const wheel=MeshBuilder.CreateBox('wheel',{},scene);wheel.parent=trim;
  const lamp=new PointLight('headlight',Vector3.Zero(),scene);lamp.parent=rig;
  const material=new StandardMaterial('shared',scene);body.material=material;
  const unrelated=MeshBuilder.CreateBox('npc',{},scene);unrelated.material=material;
  const removal=new NativeFlightCar(scene,[car,rig]);
  for(let i=0;i<3;i++){
   removal.setRemoved(true);removal.setRemoved(true);
   assert(removal.removed);
   for(const m of [body,wheel])assert(!scene.meshes.includes(m));
   for(const n of [car,rig,trim])assert(!scene.transformNodes.includes(n));
   assert(!scene.lights.includes(lamp));assert(scene.meshes.includes(unrelated));assert(scene.materials.includes(material));
   // Visibility changes elsewhere must not put removed meshes back in scene.
   car.setEnabled(true);assert(!scene.meshes.includes(body));
   removal.setRemoved(false);removal.setRemoved(false);
   assert(!removal.removed);
   for(const m of [body,wheel])assert.equal(scene.meshes.filter(n=>n===m).length,1);
   for(const n of [car,rig,trim])assert.equal(scene.transformNodes.filter(m=>m===n).length,1);
   assert.equal(scene.lights.filter(n=>n===lamp).length,1);
   assert(body.isEnabled());assert.equal(wheel.parent,trim);assert.equal(body.material,material);
  }
 }finally{scene.dispose();engine.dispose();}
});
