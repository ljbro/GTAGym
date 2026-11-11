import test from 'node:test';
import assert from 'node:assert/strict';
import {NATIVE_INTERIORS,interiorSolids,interiorBounds,insideSolid} from '../src/native-interior-layout.ts';
import {roomEnvelopeGaps,interiorRoofSteps} from '../src/native-interior-enclosure.ts';

// Height-aware reference layouts (including stacked floors and door lintels)
// are covered by native-extra-layout.test.ts with the actual CityWalk controller.
for(const t of NATIVE_INTERIORS.filter(t=>!['parking','tunnel','reference'].includes(t.theme)))test(t.id+' cannot walk from the task rooms into the surrounding city',()=>{
 const solids=interiorSolids(t),b=interiorBounds(t),step=.25,start=t.points[0],queue=[[0,0]],seen=new Set(['0,0']);
 // Deliberately use a smaller radius than the real player. No invisible outer
 // bounds in the collision predicate: physical wall geometry must seal it.
 for(let cursor=0;cursor<queue.length;cursor++){
  const [i,j]=queue[cursor],x=start[0]+i*step,z=start[1]+j*step;
  assert(x>=b.minX&&x<=b.maxX&&z>=b.minZ&&z<=b.maxZ,`${t.id} escape at ${x},${z}`);
  for(const [dx,dz] of [[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]]){
   const ni=i+dx,nj=j+dz,key=ni+','+nj;if(seen.has(key))continue;seen.add(key);
   if(!solids.some(s=>insideSolid(s,start[0]+ni*step,start[1]+nj*step,.1)))queue.push([ni,nj]);
  }
 }
 assert(queue.length>20,'spawn not boxed in');
 // Retain the complete route, including the bank shutter exit and return leg.
 for(const p of t.points){const i=Math.round((p[0]-start[0])/step),j=Math.round((p[1]-start[1])/step);assert(queue.some(([a,b])=>a===i&&b===j),`${t.id} unreachable route point ${p}`);}
});
test('shared room boundary keeps doorway open while an external connector gap is sealed',()=>{
 const rooms=[{minX:0,maxX:4,minZ:0,maxZ:4,height:3.5},{minX:4,maxX:6,minZ:1,maxZ:3,height:3.5},{minX:6,maxX:10,minZ:0,maxZ:4,height:3.5}];
 const walls=roomEnvelopeGaps(rooms,[]);
 assert(walls.some(s=>insideSolid(s,5,1)));assert(walls.some(s=>insideSolid(s,5,3)));
 for(const x of [3,4,5,6,7])assert(!walls.some(s=>insideSolid(s,x,2)));
 assert.equal(roomEnvelopeGaps(rooms,walls).length,0,'existing walls are not duplicated');
});
test('warehouse/low corridor ceiling interface is closed above, not across the doorway',()=>{
 for(const t of NATIVE_INTERIORS.filter(t=>t.theme==='bank')){
  const solids=interiorSolids(t),steps=interiorRoofSteps(t,solids);
  for(const z of [0,3,6,10,12,14]){
   const s=steps.find(s=>insideSolid(s,1.1,z,0));assert(s,`${t.id} missing high wall at ${z}`);
   assert.equal(s.y,3.5);assert(Math.abs(s.h-1.1)<1e-8);
  }
  assert(steps.every(s=>s.y!>=3.5));
  assert(!solids.some(s=>insideSolid(s,1.1,13,0)),'warehouse doorway stays passable');
 }
});
test('equal ceilings need no step; existing tall partitions are not duplicated',()=>{
 const rooms=[{minX:0,maxX:4,minZ:0,maxZ:4,height:4.6},{minX:4,maxX:8,minZ:0,maxZ:4,height:3.5}];
 const steps=roomEnvelopeGaps(rooms,[],true);assert.equal(steps.length,1);assert.equal(steps[0].x,4);assert.equal(steps[0].y,3.5);
 assert.deepEqual(roomEnvelopeGaps(rooms.map(r=>({...r,height:3.5})),[],true),[]);
 assert.deepEqual(roomEnvelopeGaps(rooms,[{name:'partition',x:4,z:2,w:.24,d:4.1,h:4.6}],true),[]);
});
