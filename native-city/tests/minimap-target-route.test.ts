import test from 'node:test';
import assert from 'node:assert/strict';
import {MinimapTargetRoute} from '../src/minimap-target-route.ts';
import {RoadGraph} from '../src/navigation.ts';
import type {V2} from '../src/city-types.ts';

test('moving-target navigation uses road bends, ends at NPC, and never reveals its future route',()=>{
 const graph=new RoadGraph([],{nodes:[[0,0],[0,100],[100,100],[100,200]],edges:[[0,1],[1,2],[2,3]]});
 const nav=new MinimapTargetRoute();let calls=0;
 const plan=(a:V2,b:V2)=>{calls++;return graph.route(a,b);};
 const first=nav.update([0,0],[40,100],'follow',0,plan);
 assert.deepEqual(first[0],[0,0]);assert.deepEqual(first.at(-1),[40,100]);
 assert(first.some(p=>p[0]===0&&p[1]===100));assert(first.every(p=>p[0]<=40&&p[1]<=100));
 const next=nav.update([0,10],[45,100],'follow',100,plan);
 assert.equal(calls,1);assert.deepEqual(next[0],[0,10]);assert.deepEqual(next.at(-1),[45,100]);
 const updated=nav.update([0,40],[100,120],'follow',500,plan);
 assert.equal(calls,2);assert.deepEqual(updated.at(-1),[100,120]);
 nav.update([0,0],[20,100],'chase',501,plan);assert.equal(calls,3);
 nav.reset();nav.update([0,0],[20,100],'chase',502,plan);assert.equal(calls,4);
});
test('disconnected road graph does not invent a route through buildings',()=>{
 const nav=new MinimapTargetRoute();assert.deepEqual(nav.update([0,0],[50,50],0,0,()=>[]),[]);
});
