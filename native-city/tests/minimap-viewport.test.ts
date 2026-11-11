import test from 'node:test';
import assert from 'node:assert/strict';
import {MINIMAP_FRAME,minimapProject,minimapPointVisible,minimapVisibleWidth} from '../src/minimap-viewport.ts';

test('rectangular visibility matches the rendered frame, including corners and behind player',()=>{
 const f=MINIMAP_FRAME;
 assert.equal(f.width/f.height,1.5);
 assert(minimapPointVisible(150,150,0,320,0));
 assert(!minimapPointVisible(0,-50,0,320,0));
 assert(minimapPointVisible(0,0,0,320,.65));
 assert(!minimapPointVisible(0,-1e6,0,320,.65));
 const p=minimapProject(0,0,0,1,0);assert.equal(p.x,f.playerX);assert.equal(p.y,f.playerY);
});

test('driving matches OffMapBench 250–550m speed-dependent width, including reversing',()=>{
 for(const [speed,width] of [[0,250],[10,320],[-10,320],[30,460],[100,550]])assert.equal(minimapVisibleWidth({speed}),width);
});
test('walking matches OffMapBench 175–205m; no stale car-speed zoom after exiting',()=>{
 for(const [speed,width] of [[0,175],[3,187],[7.5,205],[50,205]])assert.equal(minimapVisibleWidth({walking:true,speed}),width);
});
test('flight uses AGL height not speed, indoor viewport takes precedence',()=>{
 for(const [flightAltitude,width] of [[-1,600],[0,600],[100,760],[875,2000],[3000,2000]])assert.equal(minimapVisibleWidth({flightAltitude,speed:100}),width);
 assert.equal(minimapVisibleWidth({indoors:true,flightAltitude:100,speed:40}),46);
});
test('missing or nonfinite telemetry never produces an invalid scale',()=>{
 assert.equal(minimapVisibleWidth({}),250);
 assert.equal(minimapVisibleWidth({speed:NaN}),250);
 assert.equal(minimapVisibleWidth({speed:Infinity,walking:true}),175);
 assert.equal(minimapVisibleWidth({flightAltitude:NaN}),600);
});
