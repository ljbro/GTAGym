import test from 'node:test';
import assert from 'node:assert/strict';
import {MinimapWalkRoute} from '../src/minimap-walk-route.ts';
import {MinimapTargetRoute} from '../src/minimap-target-route.ts';
import {RoadGraph} from '../src/navigation.ts';
import type {V2} from '../src/city-types.ts';
const length=(p:V2[])=>p.slice(1).reduce((n,q,i)=>n+Math.hypot(q[0]-p[i][0],q[1]-p[i][1]),0);
test('nearby pedestrians stay connected directly instead of detouring onto a road',()=>{
 const graph=new RoadGraph([],{nodes:[[0,0],[40,0],[40,40]],edges:[[0,1],[1,2]]});
 const a:V2=[15,16],b:V2=[16,16],walk=new MinimapWalkRoute({height:()=>0,clear:()=>true});
 assert(length(graph.route(a,b))>30);
 const nav=new MinimapTargetRoute();assert.deepEqual(nav.update(a,b,'walk',0,(p,q)=>walk.plan(p,q),(p,q)=>walk.clear(p,q)),[a,b]);
 assert.deepEqual(nav.update([15.2,16],[16.2,16],'walk',100,(p,q)=>walk.plan(p,q),(p,q)=>walk.clear(p,q)),[[15.2,16],[16.2,16]]);
});
test('pedestrian route bends around a wall rather than passing through it',()=>{
 const walk=new MinimapWalkRoute({height:()=>0,clear:(x,z)=>!(x>=4&&x<=6&&z>=-2&&z<=2)});
 const p=walk.plan([0,0],[10,0]);assert(p.length>2);assert(p.every((q,i)=>!i||walk.clear(p[i-1],q)));assert(length(p)<18);
});
test('impassable height edges and enclosed targets do not get invented straight lines',()=>{
 const cliff=new MinimapWalkRoute({height:x=>x>5?4:0,clear:()=>true});assert(!cliff.clear([0,0],[10,0]));assert.deepEqual(cliff.plan([0,0],[10,0]),[]);
 const wall=new MinimapWalkRoute({height:()=>0,clear:(x,z)=>Math.hypot(x-10,z)>2||Math.hypot(x-10,z)<1});assert.deepEqual(wall.plan([0,0],[10,0]),[]);
});
test('cached moving-target endpoint is checked after the target rounds a wall',()=>{
 const walk=new MinimapWalkRoute({height:()=>0,clear:(x,z)=>!(x>=4&&x<=6&&z>=-2&&z<=2)}),nav=new MinimapTargetRoute();
 const first=nav.update([0,0],[3,0],'walk',0,(a,b)=>walk.plan(a,b),(a,b)=>walk.clear(a,b));assert.equal(first.length,2);
 assert.deepEqual(nav.update([0,0],[7,0],'walk',100,(a,b)=>walk.plan(a,b),(a,b)=>walk.clear(a,b)),[]);
 const after=nav.update([0,0],[7,0],'walk',600,(a,b)=>walk.plan(a,b),(a,b)=>walk.clear(a,b));assert(after.length>2);
});
