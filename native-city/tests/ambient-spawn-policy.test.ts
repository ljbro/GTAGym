import test from 'node:test';
import assert from 'node:assert/strict';
import {NullEngine,Scene} from '@babylonjs/core';
import {RoadGraph} from '../src/navigation.ts';
import {CityTraffic} from '../src/traffic.ts';
import {CityPedestrians} from '../src/pedestrians.ts';
import {CityEbikes} from '../src/city-ebikes.ts';
import {ambientSpawnAllowed} from '../src/ambient-spawn-policy.ts';

function fixture(){
 const engine=new NullEngine(),scene=new Scene(engine);
 const nodes:[number,number][]=[],edges:number[][]=[];
 for(let z=-800;z<=800;z+=80)for(let x=-800;x<=1600;x+=80){
  const i=nodes.length;nodes.push([x,z]);if(x>-800)edges.push([i-1,i]);if(z>-800)edges.push([i-31,i]);
 }
 const graph=new RoadGraph([],{nodes,edges});
 return {scene,graph,dispose(){scene.dispose();engine.dispose();}};
}
const distance=(p:{x:number;z:number},x=0,z=0)=>Math.hypot(p.x-x,p.z-z);

test('ambient exclusion checks final finite position, not heading or source node',()=>{
 for(const direction of [-1,1]){
  assert(!ambientSpawnAllowed(179*direction,0,0,0,'vehicle'));
  assert(!ambientSpawnAllowed(0,99*direction,0,0,'pedestrian'));
 }
 assert(ambientSpawnAllowed(180,0,0,0,'vehicle'));
 assert(ambientSpawnAllowed(100,0,0,0,'pedestrian'));
 assert(!ambientSpawnAllowed(NaN,0,0,0,'vehicle'));
});
test('car streaming retains nearby object identities and positions, only supplements far away',()=>{
 const f=fixture();try{
  const cars=new CityTraffic(f.graph,[],f.scene);cars.place(0,0);
  assert(cars.cars.length>0);assert(cars.cars.every(c=>distance(c)>=180));
  const old=new Set(cars.cars),near=cars.cars.filter(c=>distance(c,451)<250),poses=near.map(c=>({c,x:c.x,z:c.z}));
  assert(near.length>0);cars.update(0,451,0);
  for(const {c,x,z} of poses){assert(cars.cars.includes(c),'do not remove visible car');assert.equal(c.x,x);assert.equal(c.z,z);}
  assert(cars.cars.filter(c=>!old.has(c)).every(c=>distance(c,451)>=180));
  assert(cars.cars.length<=40);
  cars.place(1100,0);assert(cars.cars.every(c=>distance(c,1100)<650));
 }finally{f.dispose();}
});
test('walkers retain their slots/progress on the 220m boundary and new walkers spawn beyond 100m',()=>{
 const f=fixture();try{
  const people=new CityPedestrians(f.scene);
  for(let z=-350;z<=350;z+=35)for(let x=-500;x<=1200;x+=100)people.paths.push([x,z,x+90,z]);
  people.place(0,0);assert(people.people.length>0);assert(people.people.every(p=>distance(p)>=100));
  const old=new Set(people.people),near=people.people.filter(p=>distance(p,221)<200),poses=near.map(p=>({p,x:p.x,z:p.z,t:p.t}));
  assert(near.length>0);people.update(0,221,0);
  for(const {p,x,z,t} of poses){assert(people.people.includes(p));assert.equal(p.x,x);assert.equal(p.z,z);assert.equal(p.t,t);}
  assert(people.people.filter(p=>!old.has(p)).every(p=>distance(p,221)>=100));
  assert.equal(new Set(people.people.map(p=>p.slot)).size,people.people.length);assert(people.people.length<=56);
 }finally{f.dispose();}
});
test('riders use final interpolated lane position; remote camera never moves the protected area',()=>{
 const f=fixture();try{
  const bikes=new CityEbikes(f.scene,()=>0);bikes.helmetPalette=Array.from({length:3},()=>[1,1,1]);bikes.palette=Array.from({length:11},()=>[1,1,1]);bikes.riderPalette=Array.from({length:7},()=>[1,1,1]);bikes.attachGraph(f.graph,()=>true);bikes.place(0,0);
  assert(bikes.riders.length>0);assert(bikes.riders.every(r=>distance(r)>=180));
  bikes.update(0,0,0,false,true);
  const old=new Set(bikes.riders),poses=bikes.riders.map(r=>({r,x:r.x,z:r.z}));
  bikes.update(0,1200,0,true,true,0,0);
  for(const {r,x,z} of poses){assert(bikes.riders.includes(r));assert.equal(r.x,x);assert.equal(r.z,z);}
  bikes.update(0,1200,0,true,true,451,0);
  for(const {r,x,z} of poses.filter(p=>distance(p,451)<650)){assert(bikes.riders.includes(r));assert.equal(r.x,x);assert.equal(r.z,z);}
  assert(bikes.riders.filter(r=>!old.has(r)).every(r=>distance(r,451)>=180));assert(bikes.riders.length<=18);
 }finally{f.dispose();}
});
test('existing ambient actors may approach the player normally without deletion or position snaps',()=>{
 const f=fixture();try{
  const cars=new CityTraffic(f.graph,[],f.scene);cars.place(0,0);
  const car=cars.cars[0],px=car.x+10,pz=car.z,oldX=car.x,oldZ=car.z;
  cars.place(px,pz);assert(cars.cars.includes(car));cars.update(.1,px,pz);
  assert(cars.cars.includes(car));assert(distance(car,oldX,oldZ)<=car.speed*.1+.01);
  const people=new CityPedestrians(f.scene);people.paths=[[150,0,250,0]];people.place(0,0);
  const person=people.people[0];assert(person);const saved={x:person.x,z:person.z};
  people.place(person.x+1,person.z);assert(people.people.includes(person));people.update(.1,saved.x+1,saved.z);
  assert(people.people.includes(person));assert(distance(person,saved.x,saved.z)<=person.speed*.1+.001);
 }finally{f.dispose();}
});
test('long edges cannot interpolate a new rider into the player, even if both nodes are distant',()=>{
 const f=fixture();try{
  const graph=new RoadGraph([],{nodes:[[-400,0],[400,0]],edges:[[0,1]]});
  // Two choices are required by population seeding. Both choices deliberately
  // refer to the same endpoint here to force the old near-player midpoint bug.
  graph.edges[0].set(0,1);graph.edges[1].set(1,1);
  const bikes=new CityEbikes(f.scene,()=>0);bikes.attachGraph(graph,()=>true);bikes.helmetPalette=[[1,1,1]];
  (bikes as any).random=()=>.5;
  // Sorted insertion order for from=1: first neighbour is 0.
  graph.edges[1]=new Map([[1,1],[0,800]]);
  bikes.place(0,0);assert.equal(bikes.riders.length,0,'midpoint is within 180m, leave slot empty');
 }finally{f.dispose();}
});
test('no safe candidates leaves empty slots rather than spawning close or inside geometry',()=>{
 const f=fixture();try{
  const cars=new CityTraffic(f.graph,[],f.scene);cars.staticClear=()=>false;cars.place(0,0);assert.equal(cars.cars.length,0);
  const bikes=new CityEbikes(f.scene,()=>0);bikes.attachGraph(f.graph,()=>true);bikes.staticClear=()=>false;bikes.place(0,0);assert.equal(bikes.riders.length,0);
  const walkers=new CityPedestrians(f.scene,()=>0,()=>true);walkers.paths=[[150,0,200,0]];walkers.place(0,0);assert.equal(walkers.people.length,0);
 }finally{f.dispose();}
});
