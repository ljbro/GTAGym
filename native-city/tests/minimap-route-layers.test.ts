import test from 'node:test';
import assert from 'node:assert/strict';
import {minimapRouteLayers,drawMinimapRoute} from '../src/minimap-route-layers.ts';
import {minimapGoalMarker,MinimapNavigation} from '../src/minimap-navigation.ts';
import {MINIMAP_FRAME} from '../src/minimap-viewport.ts';
type P=[number,number];
test('complete overlapping route stays purple regardless of old horizon',()=>{
 const route:P[]=[[0,0],[0,80],[0,0],[0,120]],before=JSON.stringify(route);
 const layers=minimapRouteLayers(route,1);assert.deepEqual(layers.active,route);assert.deepEqual(layers.future,[]);assert.equal(layers.distance,280);assert.equal(JSON.stringify(route),before);
});
test('single continuous solid stroke plus outline, no stages or arrowheads',()=>{
 const strokes:number[][][]=[],segments:number[][]=[],dashes:number[][]=[];
 const ctx={save(){},restore(){},setLineDash(d:number[]){dashes.push(d);},beginPath(){segments.length=0;},moveTo(x:number,y:number){segments.push([x,y]);},lineTo(x:number,y:number){segments.push([x,y]);},stroke(){strokes.push(segments.map(p=>[...p]));}};
 drawMinimapRoute(ctx as unknown as CanvasRenderingContext2D,[[0,0],[0,50],[50,50]],{x:0,z:0,scale:1,speed:90});
 assert.equal(strokes.length,2);assert.deepEqual(dashes,[[]]);assert.deepEqual(strokes[0],[[0,-0],[0,-50],[50,-50]]);
 assert.equal((ctx as unknown as CanvasRenderingContext2D).strokeStyle,'#bd79ff');
 assert.deepEqual(minimapRouteLayers([]).active,[]);
});
test('nearby marker follows map projection; off-screen goals stay on the safe rectangle',()=>{
 const f=MINIMAP_FRAME,m=f.markerInset;
 const p=minimapGoalMarker([0,0],[0,10],0,1,0);assert.deepEqual(p,{x:f.playerX,y:f.playerY-10,edge:false});
 for(const yaw of [0,Math.PI/2,Math.PI,Math.PI*1.5])for(const goal of [[0,1e6],[0,-1e6],[1e6,0],[-1e6,0]]){
  const point=minimapGoalMarker([0,0],goal,yaw,1,.65);assert(point.edge);
  assert(point.x>=m-1e-7&&point.x<=f.width-m+1e-7&&point.y>=m-1e-7&&point.y<=f.height-m+1e-7);
  assert(Math.min(Math.abs(point.x-m),Math.abs(point.x-f.width+m),Math.abs(point.y-m),Math.abs(point.y-f.height+m))<1e-7);
 }
 const forward=minimapGoalMarker([0,0],[0,1e6],0,1,.65),back=minimapGoalMarker([0,0],[0,-1e6],0,1,.65);
 assert(forward.y<f.playerY);assert(back.y>f.playerY,'behind perspective horizon must not flip to the front');
 const right=minimapGoalMarker([0,0],[1e6,0],0,1,.4);assert(right.x>160);
});
test('remaining line starts at player, preserves future bends, reverses and rejoins without gates',()=>{
 const route:P[]=[[0,0],[0,100],[100,100]],before=JSON.stringify(route),d=new MinimapNavigation();
 assert.deepEqual(d.update(route,[0,0]).points,route);
 assert.deepEqual(d.update(route,[0,50]).points,[[0,50],[0,100],[100,100]]);
 assert.deepEqual(d.update(route,[0,20]).points,[[0,20],[0,100],[100,100]]);
 assert.deepEqual(d.update(route,[75,100]).points,[[75,100],[100,100]]);
 assert.deepEqual(d.update(route,[75,120]).points,[[75,120],[75,100],[100,100]]);
 assert.deepEqual(d.update(route,[100,100]).points,[[100,100]]);
 assert.equal(JSON.stringify(route),before,'source geometry and scoring data are immutable');
});
test('sideways drift near overlapping roads must not erase the later loop',()=>{
 const route:P[]=[[0,0],[0,100],[5,100],[5,0]],d=new MinimapNavigation();
 d.update(route,[0,0]);d.update(route,[0,40]);
 const result=d.update(route,[4,40]);assert.equal(result.along,40);
 assert.deepEqual(result.points,[[4,40],[0,40],[0,100],[5,100],[5,0]]);
 const overlapping:P[]=[[0,0],[0,80],[0,0],[0,120]],other=new MinimapNavigation();
 other.update(overlapping,[0,0]);assert.equal(other.update(overlapping,[0,40]).along,40);
});
test('restart epoch and route replacement reset projection continuity',()=>{
 const route:P[]=[[0,0],[0,100],[100,100],[100,0],[0,0]],d=new MinimapNavigation();
 d.update(route,[0,0]);d.update(route,[100,0]);assert.equal(d.update(route,[0,0]).along,400);
 assert.equal(d.update(route,[0,0],1).along,0);
 assert.deepEqual(d.update([],[0,0]).points,[]);
 assert.deepEqual(d.update([[3,4]],[0,0]).points,[[0,0],[3,4]]);
 assert.deepEqual(d.update([[3,4],[3,4]],[3,4]).points,[[3,4]]);
});
test('wide corner can be passed without touching the intermediate vertex',()=>{
 const route:P[]=[[0,0],[0,100],[100,100]],d=new MinimapNavigation();
 d.update(route,[0,0]);d.update(route,[0,70]);d.update(route,[15,85]);
 assert.deepEqual(d.update(route,[35,100]).points,[[35,100],[100,100]]);
});
