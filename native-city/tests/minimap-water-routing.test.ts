import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {minimapRoutingMode} from '../src/minimap-routing-mode.ts';
import {MinimapRejoin} from '../src/minimap-rejoin.ts';
import {MinimapNavigation} from '../src/minimap-navigation.ts';
import {MinimapTargetRoute} from '../src/minimap-target-route.ts';
import type {V2} from '../src/city-types.ts';
const state={waterController:false,flightActive:false,walking:false,corridor:false};
test('every authored water task stays water before and after boarding / disembarking',()=>{
 let count=0;
 for(const file of ['native-boat-routes','native-driving-boat-routes','native-beach-boat-routes','native-shore-boat-routes','native-shore-routes','native-water-routes','native-water-escape-routes']){
  const tasks=JSON.parse(fs.readFileSync(new URL('../src/'+file+'.json',import.meta.url),'utf8'));
  for(const task of tasks){count++;
   for(const waterController of [false,true])for(const walking of [false,true])assert.equal(minimapRoutingMode(task,{...state,waterController,walking}),'water',task.id);
  }
 }
 assert.equal(count,12);
 for(const vehicle of ['swim','boat'])for(const category of ['follow','chase','escape'])assert.equal(minimapRoutingMode({mode:'drive',category,trainingOutdoor:{vehicle}},{...state,walking:true}),'water');
});
test('routing remains distinct for air, task-built roads, walking and road traffic',()=>{
 assert.equal(minimapRoutingMode({mode:'flight',category:'flight'},state),'air');
 assert.equal(minimapRoutingMode({mode:'drive',category:'chase'},{...state,corridor:true}),'corridor');
 assert.equal(minimapRoutingMode({mode:'walk',category:'follow'},state),'walk');
 assert.equal(minimapRoutingMode({mode:'drive',category:'follow'},state),'road');
});
const water=(x:number,z:number)=>!(x>9&&x<21&&z> -8&&z<8);
test('water rejoin and moving-target guidance go around land instead of drawing across it',()=>{
 const planner=new MinimapRejoin({blocked:(x,z)=>!water(x,z),height:()=>0},0);
 const a:V2=[0,0],b:V2=[30,0];
 assert(!planner.clear(a,b));
 const route=planner.connect(a,b,'water');assert(route&&route.length>2);
 for(let i=1;i<route.length;i++)assert(planner.clear(route[i-1],route[i]));
 const tracking=new MinimapTargetRoute();
 const points=tracking.update(a,b,'water',0,(a,b)=>planner.connect(a,b)??[],(a,b)=>planner.clear(a,b));
 assert(points.length>2);assert.deepEqual(points[0],a);assert.deepEqual(points.at(-1),b);
 const navigation=new MinimapNavigation();
 const result=navigation.update([b,[40,0]],a,0,(a,b)=>planner.connect(a,b));
 for(let i=1;i<result.points.length;i++)assert(planner.clear(result.points[i-1],result.points[i]));
});
test('unreachable water connector fails closed without a land-road fallback',()=>{
 const planner=new MinimapRejoin({blocked:(x)=>x>4,height:()=>0},0);
 const navigation=new MinimapNavigation();
 const result=navigation.update([[30,0],[40,0]],[0,0],0,(a,b)=>planner.connect(a,b));
 assert.deepEqual(result.connector,[]);assert.deepEqual(result.points,[[30,0],[40,0]]);
});
test('water probes do not skip narrow shoreline / hull edges',()=>{
 const planner=new MinimapRejoin({blocked:x=>x>1.1&&x<1.4,height:()=>0},0,.25);
 assert.equal(planner.clear([0,0],[3,0]),false);
});
