import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {CityCollision,closest} from '../src/driving.ts';
import {NATIVE_DRIVE_ASSIGNMENTS,NATIVE_TARGET_VEHICLES} from '../src/native-drive-vehicle-spec.ts';
import type {V2} from '../src/city-types.ts';
const root=new URL('../../',import.meta.url),read=(p:string)=>JSON.parse(fs.readFileSync(new URL(p,root),'utf8'));
const [route]=read('native-city/src/native-coastal-chase-routes.json'),city=read('city/city.json'),collision=new CityCollision(city);
test('c04-n13 uses a real coastal fast road, not an arbitrary downtown straight',()=>{
 assert.equal(route.id,'c04-n13');assert.equal(route.category,'chase');assert.equal(route.mode,'drive');
 assert.deepEqual(route.expectedTurns,[]);assert(route.path.length>1200);
 const coast=city.coast.flatMap((r:V2[])=>r.slice(1).map((p,i)=>[r[i],p]));
 let maxCoastDistance=0;const roads=new Set<string>();
 for(let i=1;i<route.path.points.length;i++){
  const a=route.path.points[i-1],b=route.path.points[i],length=Math.hypot(b[0]-a[0],b[1]-a[1]),yaw=Math.atan2(b[0]-a[0],b[1]-a[1]);
  for(let k=0,n=Math.ceil(length);k<=n;k++){
   const x=a[0]+(b[0]-a[0])*k/n,z=a[1]+(b[1]-a[1])*k/n,near=collision.nearest(x,z);
   assert(near&&near.d<3);assert(['trunk','motorway'].includes(near.road.kind));assert(near.road.width>=6);
   if(near.road.oneway)assert(Math.cos(yaw-near.yaw)>.5,'must follow native one-way direction');
   const distance=Math.min(...coast.map(([a,b]:[V2,V2])=>closest(x,z,a,b).d));
   assert(distance<=500);maxCoastDistance=Math.max(maxCoastDistance,distance);roads.add(near.road.name);
  }
 }
 assert(roads.has("Binhe Boulevard")||roads.has("Binhai Boulevard"));
 console.log(JSON.stringify({id:route.id,roads:[...roads],maxCoastDistance,length:route.path.length}));
});
test('c04-n13 retains SUV player and a separately instantiated moving SUV target',()=>{
 assert.equal(NATIVE_DRIVE_ASSIGNMENTS[route.id].kind,'baller');assert.equal(NATIVE_TARGET_VEHICLES[route.id],'baller');
 const source=read('tasks/catalog.json').find((t:any)=>t.id===route.id);
 assert.equal(source.category,route.category);assert.equal(source.vehicle,'suv');assert.equal(source.setting,'highway');assert.equal(source.indoors,false);
 const provenance=read('assets/task-vehicles/baller.provenance.json');assert(provenance);
});
