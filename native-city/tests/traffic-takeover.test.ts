import test from 'node:test';
import assert from 'node:assert/strict';
import {NullEngine,Scene,MeshBuilder,PBRMaterial} from '@babylonjs/core';
import {CityTraffic} from '../src/traffic.ts';
import type {RoadGraph} from '../src/navigation.ts';

test('mission parking survives streaming, does not move, and takeover removes AI and instance',()=>{
 const engine=new NullEngine(),scene=new Scene(engine);
 try{
  const source=MeshBuilder.CreateBox('traffic-source',{},scene);source.material=new PBRMaterial('carpaint',scene);
  const graph={nodes:[[0,0],[0,100]],edges:[new Map([[1,100]]),new Map([[0,100]])],nearest:()=>0} as unknown as RoadGraph;
  const traffic=new CityTraffic(graph,[source],scene);
  const car=traffic.park({x:0,z:80,yaw:0,group:2},'c01-n17');
  traffic.update(.1,0,0);assert.equal(car.z,80);assert.equal(car.actualSpeed,0);
  assert.equal(traffic.meshes[2][0].thinInstanceCount,1);
  traffic.place(2000,0);assert(traffic.cars.includes(car),'mission parked cars must not despawn');
  assert(traffic.take(car));assert(!traffic.take(car),'same AI cannot be acquired twice');
  traffic.update(0,2000,0);assert(!traffic.meshes[2][0].isEnabled());
  traffic.park({x:0,z:80,yaw:0,group:2},'c01-n17');traffic.removeMission('c01-n17');assert.equal(traffic.cars.length,0);
 }finally{scene.dispose();engine.dispose();}
});
