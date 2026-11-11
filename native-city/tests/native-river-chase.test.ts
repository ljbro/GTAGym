import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import {createHash} from 'node:crypto';import {NodeIO} from '@gltf-transform/core';
import {floodLayout} from '../src/native-flood-layout.ts';import {nativeBends} from '../src/native-annotation-route.ts';
import {nativeDriveFootprintClear,NATIVE_DRIVE_ASSIGNMENTS,NATIVE_TARGET_VEHICLES} from '../src/native-drive-vehicle-spec.ts';
import {createTrailerState,stepTrailer,trailerSweepClear} from '../src/native-semi-articulation.ts';import {stepCar,manualSteeringInput,CityCollision,inRing,closest} from '../src/driving.ts';
import {driveCarRoute} from '../../tests/car-route-driver.ts';
import {riverChaseTail} from '../src/native-river-chase-extension.ts';
const read=(p:string)=>JSON.parse(fs.readFileSync(new URL('../../'+p,import.meta.url),'utf8')),route=read('native-city/src/native-river-chase-routes.json')[0],layout=floodLayout(route);
test('channel and overhanging crowns are vegetation-free while distant landscape stays',()=>{
 for(let distance=0;distance<=route.path.length;distance+=5){
  const p=layout.pointAt(distance);assert(layout.vegetationReserved(p.x,p.z));
  const edge=layout.pointAt(distance,40);assert(layout.vegetationReserved(edge.x,edge.z,8),'overhanging crown');
 }
 assert(!layout.vegetationReserved(0,0,10));
 const outside=layout.pointAt(200,130);assert(!layout.vegetationReserved(outside.x,outside.z,5));
 const other=floodLayout(read('native-city/src/native-flood-escape-routes.json')[0]);
 assert(!other.vegetationReserved(...other.points[1]),'other flood tasks retain their existing planting');
});
test('continuous dry lane, side stream and both supported bridges leave all rig travel clear',()=>{
 const city=read('city/city.json'),collision=new CityCollision(city),a=route.path.points[0],b=route.path.points[1],state={x:a[0],z:a[1],yaw:Math.atan2(b[0]-a[0],b[1]-a[1]),speed:0,steer:0,distance:0},trailer=createTrailerState(state),blocked=(x:number,z:number)=>layout.blocked(x,z)||(layout.floorAt(x,z)===null&&collision.blocked(x,z));
 const wet=layout.pointAt(60,-9);assert(layout.water(wet.x,wet.z));assert(blocked(wet.x,wet.z));assert(!blocked(state.x,state.z));
 for(const br of [route.channel.bridge,...route.channel.additionalBridges]){assert(br.height>6);for(let u=-90;u<=90;u+=2)for(let v=-8;v<=8;v+=2){const x=br.point[0]+Math.cos(br.yaw)*u+Math.sin(br.yaw)*v,z=br.point[1]-Math.sin(br.yaw)*u+Math.cos(br.yaw)*v,n=collision.nearest(x,z);assert(!n||n.d>n.road.width/2+4,'bridge covers native road');const rings=collision.bCells.get(Math.floor(x/90)+','+Math.floor(z/90))??[];assert(!rings.some(r=>inRing(x,z,r)||r.some((p,i)=>closest(x,z,p,r[(i+1)%r.length]).d<10)),'bridge covers building');}}
 const driven=driveCarRoute(route.path.points,state,(input,dt)=>{const before={...trailer},limit=manualSteeringInput(1,state.speed);stepCar(state,{...input,steer:Math.max(-limit,Math.min(limit,input.steer))},dt);assert(nativeDriveFootprintClear(state.x,state.z,state.yaw,'semi-tractor',blocked));stepTrailer(trailer,state);assert(trailerSweepClear(before,trailer,blocked));assert.equal(layout.floorAt(state.x,state.z),.18);},route.path.testDriveProfile);assert(driven.complete);assert.equal(driven.visited.length,route.path.points.length-2);
});
test('the new channel footprint avoids native roads and buildings',()=>{
 const collision=new CityCollision(read('city/city.json')),points=layout.points;
 for(let i=3;i<points.length;i++){
  const a=points[i-1],b=points[i],length=Math.hypot(b[0]-a[0],b[1]-a[1]),s=(b[0]-a[0])/length,c=(b[1]-a[1])/length;
  for(let t=0;t<=length;t+=2)for(let u=-26;u<=26;u+=2){
   const x=a[0]+s*t+c*u,z=a[1]+c*t-s*u,n=collision.nearest(x,z);
   if(n&&!['footway','path','cycleway','steps','pedestrian'].includes(n.road.kind))assert(n.d>n.road.width/2+4,'channel crosses a native road');
   const rings=collision.bCells.get(Math.floor(x/90)+','+Math.floor(z/90))??[];
   assert(!rings.some(r=>inRing(x,z,r)||r.some((p,j)=>closest(x,z,p,r[(j+1)%r.length]).d<3)),'channel crosses a building');
  }
 }
});
test('red sedan is a licensed variant with independent axle origins',async()=>{
 const p=read('assets/task-vehicles/sedan-red.provenance.json');assert.equal(p.source.license,'CC0-1.0');for(const item of [p.source,p.output])assert.equal(createHash('sha256').update(fs.readFileSync(new URL('../../assets/task-vehicles/'+item.file,import.meta.url))).digest('hex'),item.sha256);
 const d=await new NodeIO().read(new URL('../../assets/task-vehicles/sedan-red.glb',import.meta.url).pathname);assert.equal(d.getRoot().listNodes().filter(n=>/^wheel_/.test(n.getName())).length,3);assert.deepEqual(d.getRoot().listMaterials().find(m=>m.getName()==='Red')!.getBaseColorFactor(),[.58,.022,.018,1]);
});
