import test from 'node:test';
import assert from 'node:assert/strict';
import {CityWalk,type WalkLadder} from '../src/city-walk.ts';
import {descentPrompt} from '../src/native-descent-prompt.ts';
import {nativeTaskRoofHeight} from '../src/native-task-roof-height.ts';
test('c07-n05 support accounts for rendered cap without changing other roofs',()=>{
 assert.equal(nativeTaskRoofHeight('c07-n05',5,0),5.425);
 assert.equal(nativeTaskRoofHeight('c07-n05',5,2),7.425);
 assert.equal(nativeTaskRoofHeight('c07-n04',5,0),5.08);
});
const ladder:WalkLadder={id:'c07-n05-roof-ladder',x:0,z:0,bottom:0,top:5,yaw:0,exit:{x:0,z:.73}};
function setup(){const floor=(_x:number,z:number)=>z>.3?5:0,ladders=[ladder];const w=new CityWalk(()=>false,floor,{floorAt:floor,ladders});w.active=true;w.x=0;w.z=.73;w.resetMotion();return w;}
const step=(w:CityWalk,keys:string[],n=1)=>{for(let i=0;i<n;i++)w.step(new Set(keys),.025);};
test('c07-n05 manual descent waits for S, stops on release, reverses with W and lands',()=>{
 const w=setup();assert.match(descentPrompt(w,[ladder]),/grab.*automatic/i);
 step(w,['KeyS']);assert(w.ladder);step(w,[],30);assert.equal(w.ladder.phase,'climb');
 const top=w.y;step(w,[],60);assert.equal(w.y,top,'must not descend automatically');
 assert.match(descentPrompt(w,[ladder]),/Release the direction keys and stay still/i);
 step(w,['KeyS'],20);const middle=w.y;assert(middle<top);
 step(w,[],30);assert.equal(w.y,middle);
 step(w,['KeyW'],10);assert(w.y>middle);
 step(w,['KeyS'],180);assert.equal(w.y,0);assert(w.grounded&&!w.traversing);
 w.resetMotion();assert.equal(w.ladder,null);
});
test('Space at roof jumps; Space and E while mounted retain grip',()=>{
 const w=setup();step(w,['Space']);assert(w.airborne&&!w.ladder);assert.equal(descentPrompt(w,[ladder]),'');
 w.resetMotion();step(w,['KeyS']);step(w,[],30);step(w,['KeyS'],40);const height=w.y;step(w,['Space','KeyE']);assert(w.ladder&&!w.airborne);assert.equal(w.y,height);
 assert.match(descentPrompt(w,[ladder]),/Release the direction keys and stay still/i);w.active=false;assert.equal(descentPrompt(w,[ladder]),'');
});
