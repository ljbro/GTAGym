import test from 'node:test';
import assert from 'node:assert/strict';
import {MinimapRouteProgress,uncheckedRouteLimit,distanceToTravel} from '../src/minimap-route-progress.ts';
type P=[number,number];
test('lateral movement beside a later return leg never erases the intervening route',()=>{
 const route:P[]=[[0,0],[0,100],[8,100],[8,0],[100,0]],tracker=new MinimapRouteProgress();
 tracker.update(route,[0,0]);tracker.update(route,[0,20]);
 const before=tracker.distance,remaining=tracker.update(route,[7,20]);
 assert.equal(tracker.distance,before);assert.ok(remaining.some(p=>p[0]===0&&p[1]===100));
 assert.ok(remaining.some(p=>p[0]===8&&p[1]===100));
});
test('continuous forward travel consumes segments in order, stationary and reversing do not',()=>{
 const route:P[]=[[0,0],[0,50],[50,50]],tracker=new MinimapRouteProgress();
 for(let z=0;z<=50;z+=5)tracker.update(route,[0,z]);
 for(let x=5;x<=30;x+=5)tracker.update(route,[x,50]);
 assert.equal(tracker.distance,80);
 assert.deepEqual(tracker.update(route,[30,50]),[[30,50],[50,50]]);
 tracker.update(route,[20,50]);assert.equal(tracker.distance,80);
});
test('self crossing, off-route teleport, pause and camera observations cannot skip ahead',()=>{
 const route:P[]=[[0,0],[100,0],[100,100],[0,100],[0,0],[0,-100]],tracker=new MinimapRouteProgress();
 tracker.update(route,[0,0]);tracker.update(route,[5,0]);assert.equal(tracker.distance,5);
 tracker.update(route,[0,-2]);assert.equal(tracker.distance,5);
 tracker.update(route,[100,90]);assert.equal(tracker.distance,5);
 tracker.update(route,[100,95],{paused:true});assert.equal(tracker.distance,5);
});
test('checkpoint cap retains pending nodes; new route/restart resets progress',()=>{
 const route:P[]=[[0,0],[0,50],[0,100]],tracker=new MinimapRouteProgress();
 tracker.update(route,[0,0]);tracker.update(route,[0,40],{limit:25});
 assert.equal(tracker.distance,25);assert.deepEqual(tracker.update(route,[0,40],{limit:25})[0],[0,25]);
 tracker.update(route,[0,45],{limit:Infinity});assert.ok(tracker.distance<=33);
 assert.deepEqual(tracker.update([...route],[0,0])[0],[0,0]);assert.equal(tracker.distance,0);
 tracker.update(route,[0,0]);tracker.update(route,[0,30]);assert.equal(tracker.distance,30);
 tracker.reset();assert.deepEqual(tracker.update(route,[0,0])[0],[0,0]);assert.equal(tracker.distance,0);
});
test('checkpoint distances follow source order, even at repeated coordinates',()=>{
 const route:P[]=[[0,0],[0,10],[10,10],[0,10],[0,20]],turns:P[]=[[0,10],[10,10],[0,10]];
 assert.equal(uncheckedRouteLimit(route,turns,0),10);
 assert.equal(uncheckedRouteLimit(route,turns,1),20);
 assert.equal(uncheckedRouteLimit(route,turns,2),30);
 assert.equal(uncheckedRouteLimit(route,turns,3),Infinity);
 assert.equal(uncheckedRouteLimit(route,[[999,999]],0),0);
});
test('duplicate/empty points are safe and input geometry is unchanged',()=>{
 const tracker=new MinimapRouteProgress(),route:P[]=[[0,0],[0,0],[0,20]];
 assert.deepEqual(tracker.update([],[0,0]),[]);
 tracker.update(route,[0,0]);tracker.update(route,[0,10]);assert.equal(tracker.distance,10);
 assert.deepEqual(route,[[0,0],[0,0],[0,20]]);
});
test('wide lane corner advances without hitting the centreline junction',()=>{
 const route:P[]=[[0,0],[0,100],[100,100]],tracker=new MinimapRouteProgress();
 const options={corridor:32,joinRadius:32};
 for(let z=0;z<=80;z+=5)tracker.update(route,[0,z],options);
 for(let x=5;x<=90;x+=5)tracker.update(route,[x,80],options);
 assert.equal(tracker.distance,190);
 assert.deepEqual(tracker.remaining(),[[90,100],[100,100]]);
});
test('walking around a corner 4 metres off the graph node does not stick',()=>{
 const route:P[]=[[0,0],[0,30],[30,30]],tracker=new MinimapRouteProgress(),options={corridor:6,joinRadius:6};
 for(let z=0;z<=26;z++)tracker.update(route,[0,z],options);
 for(let x=1;x<=25;x++)tracker.update(route,[x,26],options);
 assert.equal(tracker.distance,55);
});
test('swept travel detects a checkpoint even when neither frame is inside its radius',()=>{
 assert.equal(distanceToTravel([0,0],[-20,5],[20,5]),5);
 assert.equal(distanceToTravel([0,0],[20,5],[20,5]),Math.hypot(20,5));
 const tracker=new MinimapRouteProgress(),route:P[]=[[0,0],[0,50],[50,50]];
 tracker.update(route,[0,0]);tracker.update(route,[0,30]);
 tracker.update(route,[25,50],{corridor:32,joinRadius:32});
 assert.equal(tracker.distance,75);
});
test('overlapping return legs are retained until actually travelled in sequence',()=>{
 const tracker=new MinimapRouteProgress(),route:P[]=[[0,0],[0,100],[0,0],[0,100]],options={corridor:32,joinRadius:32};
 for(let z=0;z<=60;z+=5)tracker.update(route,[0,z],options);
 for(let z=55;z>=20;z-=5)tracker.update(route,[0,z],options);
 assert.equal(tracker.distance,60);
 for(let z=25;z<=100;z+=5)tracker.update(route,[0,z],options);
 for(let z=95;z>=0;z-=5)tracker.update(route,[0,z],options);
 assert.equal(tracker.distance,200);
 for(let z=5;z<=50;z+=5)tracker.update(route,[0,z],options);
 assert.equal(tracker.distance,250);
});
test('car-width offset can cross a 1.2 m graph seam between close bends',()=>{
 const route:P[]=[[2300.7,2070.6],[2299.9,2087.8],[2299.1,2099.6],[2297.9,2099.6],[2295.9,2086.1],[2291,2077.6]];
 for(const offset of [4,8,12]){
  const tracker=new MinimapRouteProgress();tracker.update(route,route[0]);let total=0;
  for(let i=1;i<route.length;i++){
   const a=route[i-1],b=route[i],size=Math.hypot(b[0]-a[0],b[1]-a[1]);total+=size;
   for(let k=1;k<=Math.ceil(size);k++){
    const t=k/Math.ceil(size),nx=-(b[1]-a[1])/size,nz=(b[0]-a[0])/size;
    tracker.update(route,[a[0]+(b[0]-a[0])*t+nx*offset,a[1]+(b[1]-a[1])*t+nz*offset],{corridor:32,joinRadius:32});
   }
  }
  assert.ok(total-tracker.distance<1e-6,`progress stuck at ${offset} m offset`);
 }
});
