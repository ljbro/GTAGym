import test from 'node:test';
import assert from 'node:assert/strict';
import {MinimapRejoin} from '../src/minimap-rejoin.ts';
import {MinimapNavigation} from '../src/minimap-navigation.ts';
import type {V2} from '../src/city-types.ts';

test('clear road retains direct connector without altering original future bends',()=>{
 const nav=new MinimapNavigation(),planner=new MinimapRejoin({blocked:()=>false,height:()=>0});
 const route:V2[]=[[0,0],[0,80],[80,80]],saved=JSON.stringify(route);
 assert.deepEqual(nav.update(route,[6,20],0,(a,b)=>planner.connect(a,b)).points,[[6,20],[0,20],[0,80],[80,80]]);
 assert.equal(JSON.stringify(route),saved);
});
test('rejoin detours around water/building and validates every smoothed segment',()=>{
 const planner=new MinimapRejoin({blocked:(x,z)=>x>12&&x<30&&Math.abs(z)<12,height:()=>0});
 const p=planner.connect([0,0],[42,0]);assert(p&&p.length>2);assert.deepEqual(p[0],[0,0]);assert.deepEqual(p.at(-1),[42,0]);
 for(let i=1;i<p.length;i++)assert(planner.clear(p[i-1],p[i]));
 const cached=planner.connect([1,0],[43,0]);assert(cached);for(let i=1;i<cached.length;i++)assert(planner.clear(cached[i-1],cached[i]));
});
test('impassable water strip produces no fake shortcut; road suffix remains visible',()=>{
 const planner=new MinimapRejoin({blocked:(x)=>x>10&&x<20,height:()=>0});
 assert.equal(planner.connect([0,0],[30,0]),null);
 const nav=new MinimapNavigation(),route:V2[]=[[30,-20],[30,40],[60,40]];
 assert.deepEqual(nav.update(route,[0,0],0,(a,b)=>planner.connect(a,b)).points,[[30,0],[30,40],[60,40]]);
});
test('bridge deck edges cannot be used as ramps; actual gentle ramp is allowed',()=>{
 const cliff=new MinimapRejoin({blocked:()=>false,height:x=>x>10?8:0});
 assert(!cliff.clear([0,0],[20,0]));assert.equal(cliff.connect([0,0],[20,0]),null);
 const ramp=new MinimapRejoin({blocked:()=>false,height:x=>x*.15});assert(ramp.clear([0,0],[30,0]));
 const step=new MinimapRejoin({blocked:()=>false,height:x=>x>10?.8:0});assert(!step.clear([0,0],[20,0]),'coarse navigation must not accept a step rejected by vehicle physics');
});
test('car clearance rejects a pedestrian-sized gap and failed plans do not leak across epochs',()=>{
 let shut=true;
 const p=new MinimapRejoin({blocked:(x,z)=>shut&&x>10&&x<20&&Math.abs(z)>.6,height:()=>0});
 assert.equal(p.connect([0,0],[30,0],0),null);shut=false;
 assert.deepEqual(p.connect([0,0],[30,0],1),[[0,0],[30,0]]);
});

test('blocked nearest join uses another reachable point and keeps the route connected',()=>{
 const planner=new MinimapRejoin({blocked:(x,z)=>Math.hypot(x-30,z)<5,height:()=>0});
 const route:V2[]=[[30,-100],[30,100],[100,100]],nav=new MinimapNavigation();
 const result=nav.update(route,[0,0],0,undefined,(a,c,r)=>planner.connectRoute(a,c,r,0,Math.PI/2));
 assert(result.connector.length>=2);assert.deepEqual(result.points[0],[0,0]);
 assert(Math.abs(result.connector.at(-1)![1])>5,'must not cling to blocked nearest projection');
 assert.deepEqual(result.points.at(-1),[100,100]);
 for(let i=1;i<result.connector.length;i++)assert(planner.clear(result.connector[i-1],result.connector[i],i===1));
});

test('touching a safety margin allows outward egress, never driving through an obstacle',()=>{
 const p=new MinimapRejoin({blocked:(x,z)=>Math.hypot(x,z)<1,height:()=>0});
 assert(!p.clear([1.6,0],[10,0]));assert(p.clear([1.6,0],[10,0],true));
 assert(!p.clear([1.6,0],[-10,0],true));assert(!p.clear([0,0],[10,0],true));
 const wall=new MinimapRejoin({blocked:x=>x<0,height:()=>0});
 assert(!wall.clear([.5,0],[.5,20],true),'cannot travel along an overlapping margin forever');
 const route:V2[]=[[12,-30],[12,40]],nav=new MinimapNavigation();
 const result=nav.update(route,[1.6,0],0,undefined,(a,c,r)=>p.connectRoute(a,c,r));
 assert(result.connector.length>1);assert.deepEqual(result.points[0],[1.6,0]);
});

test('connector is spliced at its first road contact, removing a new backwards fold',()=>{
 const route:V2[]=[[0,0],[0,100],[100,100]],nav=new MinimapNavigation();
 const result=nav.update(route,[-20,20],0,undefined,(_a,c)=>({
  points:[[-20,20],[0,40],[10,40],[10,80],[0,80]],
  join:{...c[0],point:[0,80],along:80},
 }));
 assert.deepEqual(result.points,[[-20,20],[0,40],[0,100],[100,100]]);
 assert.deepEqual(result.connector,[[-20,20],[0,40]]);
});

test('cached connector consumes passed vertices instead of pointing backwards',()=>{
 const p=new MinimapRejoin({blocked:(x,z)=>x>12&&x<30&&Math.abs(z)<12,height:()=>0});
 const route:V2[]=[[42,-40],[42,60]],nav=new MinimapNavigation();
 const update=(a:V2)=>nav.update(route,a,0,undefined,(a,c,r)=>p.connectRoute(a,c,r));
 const first=update([0,0]);assert(first.connector.length>1);
 const near:V2=[first.connector[1][0],first.connector[1][1]];
 const next=update(near);assert.deepEqual(next.points[0],near);
 for(let i=1;i<next.connector.length;i++)assert(p.clear(next.connector[i-1],next.connector[i],i===1));
 assert(!next.connector.slice(1).some(q=>Math.hypot(q[0],q[1])<.01));
});

test('new rejoin does not erase intentional future loops while driving on the road',()=>{
 const route:V2[]=[[0,0],[0,100],[5,100],[5,0]],p=new MinimapRejoin({blocked:()=>false,height:()=>0}),nav=new MinimapNavigation();
 const saved=JSON.stringify(route),update=(a:V2,epoch=0)=>nav.update(route,a,epoch,undefined,(a,c,r)=>p.connectRoute(a,c,r,epoch));
 update([0,0]);const result=update([0,40]);
 assert.deepEqual(result.points,[[0,40],[0,100],[5,100],[5,0]]);
 assert.equal(JSON.stringify(route),saved);
 assert.deepEqual(update([0,0],1).points,route);
});

test('passing a cached join in a parallel lane never points back to that old join',()=>{
 const p=new MinimapRejoin({blocked:()=>false,height:()=>0}),nav=new MinimapNavigation(),route:V2[]=[[0,0],[0,200],[100,200]];
 const update=(a:V2)=>nav.update(route,a,0,undefined,(a,c,r)=>p.connectRoute(a,c,r));
 update([10,20]);const next=update([10,30]);
 assert(next.connector.at(-1)![1]>=30,'road join must advance with a car in an offset lane');
 assert.deepEqual(next.points.at(-1),[100,200]);
});
