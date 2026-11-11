import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import type {V2} from '../src/city-types.ts';
import {removeClosedRoadLoops} from '../src/native-route-loop-removal.ts';
import {RoadGraph} from '../src/navigation.ts';
import {CityCollision} from '../src/driving.ts';

test('remove nested road excursions without cutting new edges or changing endpoints',()=>{
 const source:V2[]=[[0,0],[10,0],[10,10],[0,10],[10,0],[20,0],[20,10],[10,10],[20,10],[20,0],[30,0]],copy=JSON.stringify(source);
 const result=removeClosedRoadLoops(source);
 assert.deepEqual(result.points,[[0,0],[10,0],[20,0],[30,0]]);assert.equal(result.length,30);assert.deepEqual(result.turnDirections,[]);assert(result.removedMetres>0);assert.equal(JSON.stringify(source),copy);
});
test('nearby parallel roads and geometric crossings are not treated as equal graph nodes',()=>{
 const p:V2[]=[[0,0],[10,0],[10,5],[0,.001],[-1,5],[15,-5]];
 assert.deepEqual(removeClosedRoadLoops(p).points,p);assert.equal(removeClosedRoadLoops(p).removedMetres,0);
 assert.deepEqual(removeClosedRoadLoops([]).points,[]);assert.deepEqual(removeClosedRoadLoops([[0,0]]).points,[[0,0]]);
});
test('c01-n05 loses its 502m loop, retains native edges and the same start/goal',()=>{
 const data=JSON.parse(fs.readFileSync(new URL('../../city/navigation.json',import.meta.url),'utf8')),g=new RoadGraph([],data);
 // Original deterministic seed-322 route: preserve as a regression witness.
 const ids=[33415,33414,30645,29876,29875,29874,29873,29872,34078,29755,34077,29785,34076,34075,29799,29781,29780,34088,30664,30663,30662,30661,30660,27313,27312,33439,27303,33438,33437,30650,30649,30648,29880,29881,21951,21950,21949,21948,33446,30658,30659,27302,27313,30660,30661,30662,30663,30664,34088,34069,34068,34067,7338,7337,7336,7335,7334,7333,7332,7331,7330,7329,7328,35434,35433,35432,7427,7426];
 const original=ids.map(id=>g.nodes[id]),r=removeClosedRoadLoops(original),retained=r.points.map(p=>g.nearest(p));
 assert.deepEqual(r.points[0],[3336.8,2455.4]);assert.deepEqual(r.points.at(-1),[4213.6,2382.1]);
 assert.equal(new Set(retained).size,retained.length);assert.equal(retained.length,37);
 assert(Math.abs(r.length-985.8425719815074)<1e-6);assert(Math.abs(r.removedMetres-502.3441714850072)<1e-6);
 assert.equal(r.turnDirections.map(t=>t==='left'?'L':'R').join(''),'LRLRR');
 for(let i=1;i<retained.length;i++){
  assert(g.edges[retained[i-1]].has(retained[i]),'retained points must be a connected native road edge');
  assert(ids.some((id,j)=>id===retained[i-1]&&ids[j+1]===retained[i]),'no new road segment may be introduced');
 }
 const collision=new CityCollision(JSON.parse(fs.readFileSync(new URL('../../city/city.json',import.meta.url),'utf8')));
 for(let i=1;i<r.points.length;i++){const a=r.points[i-1],b=r.points[i],steps=Math.ceil(Math.hypot(b[0]-a[0],b[1]-a[1])/2);for(let j=0;j<=steps;j++)assert(!collision.blocked(a[0]+(b[0]-a[0])*j/steps,a[1]+(b[1]-a[1])*j/steps),'route must not cut across a building');}
});
