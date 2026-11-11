import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import {createHash} from 'node:crypto';
import {hillLayout} from '../src/native-hill-layout.ts';import {farmRoadGrid} from '../src/native-farm-layout.ts';import {nativeBends,annotationTurns} from '../src/native-annotation-route.ts';
import {CityCollision,stepCar,manualSteeringInput} from '../src/driving.ts';import {nativeDriveFootprintClear,NATIVE_DRIVE_ASSIGNMENTS,NATIVE_TARGET_VEHICLES} from '../src/native-drive-vehicle-spec.ts';import {NativeNpcObjective,npcRules} from '../src/native-npc-objective.ts';import {driveCarRoute} from '../../tests/car-route-driver.ts';
const read=(p:string)=>JSON.parse(fs.readFileSync(new URL('../../'+p,import.meta.url),'utf8')),route=read('native-city/src/native-hill-chase-routes.json')[0];
test('hill road and collision height share triangles, including corner joins',()=>{
 const h=hillLayout(route,()=>0),g=farmRoadGrid(route.path.points,h.heightAt,16,h.grid);
 for(let i=0;i<g.indices.length;i+=3){const p=g.indices.slice(i,i+3).map(k=>g.positions.slice(k*3,k*3+3)),x=(p[0][0]+p[1][0]+p[2][0])/3,z=(p[0][2]+p[1][2]+p[2][2])/3,y=(p[0][1]+p[1][1]+p[2][1])/3;assert(Math.abs(y-h.heightAt(x,z)-.06)<1e-5);}
 assert.equal(h.floorAt(h.grid.x0-1,h.grid.z0-1),null);assert.equal(h.heightAt(h.grid.x0-1,h.grid.z0-1),0);assert(h.bridgeBase>3);assert(!h.blocked(h.bridge.x,h.bridge.z));
 for(const sign of [-1,1])assert(h.blocked(h.bridge.x+Math.cos(h.bridge.yaw)*17*sign,h.bridge.z-Math.sin(h.bridge.yaw)*17*sign));
});

test('hill road keeps vegetation outside the driving and camera corridor',()=>{
 const h=hillLayout(route,()=>0);
 for(let i=1;i<route.path.points.length;i++){
  const a=route.path.points[i-1],b=route.path.points[i],len=Math.hypot(b[0]-a[0],b[1]-a[1]);
  for(let d=0;d<=len;d+=2){
   const x=a[0]+(b[0]-a[0])*d/len,z=a[1]+(b[1]-a[1])*d/len;
   assert(h.floorAt(x,z)!==null);assert(h.vegetationReserved(x,z));
   const nx=-(b[1]-a[1])/len,nz=(b[0]-a[0])/len;
   for(const sign of [-1,1])assert(h.vegetationReserved(x+nx*18*sign,z+nz*18*sign,5));
  }
 }
 assert(!h.vegetationReserved(10000,10000,5));
});
