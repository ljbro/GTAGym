import test from 'node:test';
import assert from 'node:assert/strict';
import {shortNativeWalkRoute,reviewedNativeWalkRoute} from '../src/native-walk-route.ts';
import {nativeBends} from '../src/native-annotation-route.ts';
import {RoadGraph} from '../src/navigation.ts';
import fs from 'node:fs';

test('reviewed M03 walks follow real edges without returning to the opposite lane',()=>{
 const graph=new RoadGraph([],JSON.parse(fs.readFileSync(new URL('../../city/navigation.json',import.meta.url),'utf8')));
 for(const id of ['c02-n01','c02-n04']){
  const route=reviewedNativeWalkRoute(id)!,points=route.points,bends=nativeBends(points).turns;
  assert(Math.abs(route.length-100)<1e-6);assert.equal(bends.length,2);
  assert(bends.every(t=>Math.abs(t.degrees)<115));assert(bends[1].distance-bends[0].distance>18);
  assert(Math.hypot(points[0][0]-points.at(-1)![0],points[0][1]-points.at(-1)![1])>70);
  for(let i=1;i<points.length;i++){
   const a=points[i-1],b=points[i],n=Math.ceil(Math.hypot(b[0]-a[0],b[1]-a[1]));
   for(let j=0;j<=n;j++)assert(graph.nearestEdge([a[0]+(b[0]-a[0])*j/n,a[1]+(b[1]-a[1])*j/n]).d<.01);
  }
  points[0][0]=99999;assert.notEqual(reviewedNativeWalkRoute(id)!.points[0][0],99999);
 }
 assert.equal(reviewedNativeWalkRoute('c02-n03'),null);
});

const length=(points:number[][])=>points.slice(1).reduce((s,p,i)=>s+Math.hypot(p[0]-points[i][0],p[1]-points[i][1]),0);
test('100 metre native road section retains a real corner without scaling the map',()=>{
 const source:[number,number][]=[[0,0],[0,400],[200,400],[200,900]],before=JSON.stringify(source);
 const route=shortNativeWalkRoute(source);
 assert.equal(length(route.points),100);assert.equal(route.length,100);
 assert.deepEqual(route.points,[[0,365],[0,400],[65,400]]);
 assert.deepEqual(route.turns,[[0,400]]);assert.deepEqual(route.turnDirections,['right']);
 assert.equal(JSON.stringify(source),before);
});
test('no phantom checkpoints after the shortened endpoint',()=>{
 const route=shortNativeWalkRoute([[0,0],[0,20],[20,20],[20,60],[60,60],[60,200]]);
 assert.equal(length(route.points),100);
 assert.deepEqual(route.turnDirections,['right','left','right']);
 assert.deepEqual(route.points.at(-1),[40,60]);
 assert.equal(route.turns.length,3);
});
test('straight native road and shorter source remain continuous with no duplicate points',()=>{
 for(const source of [[[0,0],[0,0],[0,500]],[[0,0],[30,40]]] as [number,number][][]){
  const route=shortNativeWalkRoute(source);
  assert.equal(route.length,Math.min(100,length(source)));
  assert.equal(length(route.points),route.length);assert.equal(route.turns.length,0);
 }
});
test('cut at a corner does not create a turn checkpoint at the endpoint',()=>{
 const route=shortNativeWalkRoute([[0,0],[0,35],[65,35],[65,100]]);
 assert.equal(route.length,100);assert.deepEqual(route.turns,[[0,35]]);
 assert.deepEqual(route.points.at(-1),[65,35]);
});
