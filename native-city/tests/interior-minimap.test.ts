import test from 'node:test';
import assert from 'node:assert/strict';
import {NATIVE_INTERIORS,interiorSolids,insideSolid,interiorTaskCategory,interiorCompletionRadius} from '../src/native-interior-layout.ts';
import {nativeInteriorMap} from '../src/native-interior-map.ts';
import {mapBox,moveInteriorPlan} from '../src/interior-minimap.ts';
import {inRing} from '../src/driving.ts';

test('three site-owned driving tasks move to outdoor driving without changing arrival radii',()=>{
 assert.deepEqual(NATIVE_INTERIORS.filter(s=>interiorTaskCategory(s)==='outdoor-road').map(s=>s.id),['c01-n01','c01-n02','c01-n03']);
 assert.equal(NATIVE_INTERIORS.filter(s=>interiorTaskCategory(s)==='indoor').length,8);
 for(const s of NATIVE_INTERIORS)assert.equal(interiorCompletionRadius(s.id),s.mode==='drive'?1.5:.9);
 assert.equal(interiorCompletionRadius('c01-n04'),undefined);
});

test('all eleven sites provide their own finite floor plan and obstacle footprints',()=>{
 assert.equal(NATIVE_INTERIORS.length,11);
 for(const task of NATIVE_INTERIORS){
  const solids=interiorSolids(task),plan=nativeInteriorMap(task,solids);
  assert(plan.floors.length,task.id);
  for(const rings of Object.values(plan))for(const ring of rings){assert(ring.length>=4);assert(ring.flat().every(Number.isFinite));}
  for(const s of solids.filter(s=>(s.y??0)<1.9))assert([...plan.walls,...plan.obstacles,...plan.doors].some(r=>inRing(s.x,s.z,r)),`${task.id}: ${s.name}`);
  assert(task.points.every(([x,z])=>plan.floors.some(r=>inRing(x,z,r))),`${task.id} route must lie on authored floors`);
 }
});
test('rotated footprint uses the same local axes as physical collision',()=>{
 const solid={name:'rotated',x:4,z:7,w:3,d:8,h:3,yaw:Math.PI/6},ring=mapBox(solid.x,solid.z,solid.w,solid.d,solid.yaw);
 for(let x=-2;x<10;x+=.31)for(let z=1;z<13;z+=.29)assert.equal(inRing(x,z,ring),insideSolid(solid,x,z,0));
});
test('site translation and rotation transform every layer equally without changing source',()=>{
 const ring=mapBox(0,0,2,4),plan={floors:[ring],walls:[ring],obstacles:[ring],stairs:[ring],doors:[ring]},before=JSON.stringify(plan);
 const moved=moveInteriorPlan(plan,100,200,Math.PI/2);
 assert.equal(JSON.stringify(plan),before);
 for(const rings of Object.values(moved))assert.deepEqual(rings[0][0],[98,201]);
});
