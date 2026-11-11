import test from 'node:test';
import assert from 'node:assert/strict';
import {moveRelative} from '../scripts/server-eval/move-relative.mjs';

test('relative right/up input supports hover and pointer lock, aircraft pause semantics and zero-delta sync',()=>{
 const original=Object.fromEntries(['window','document','PointerEvent'].map(k=>[k,Object.getOwnPropertyDescriptor(globalThis,k)]));
 try{
  const events=[],updates=[],canvas={dispatchEvent(e){events.push(e);}};
  const w={paused:true,taskFlightPaused:false,flight:{active:true},__evalMousePosition:{x:640,y:360},update(...args){updates.push(args);}};
  globalThis.window={innerWidth:1280,innerHeight:720,__SHENCHENGJI_CITY__:{world:w}};
  globalThis.document={querySelector:()=>canvas,pointerLockElement:null};
  globalThis.PointerEvent=class{constructor(type,props){Object.assign(this,{type},props);}};
  assert.deepEqual(moveRelative({dx:200,dy:40}),{x:640,y:360});
  assert.deepEqual(updates,[[0,true]]);
  assert.deepEqual(events.map(e=>e.type),['pointerenter','pointermove']);
  assert.equal(events[1].movementX,200);assert.equal(events[1].movementY,-40);
  assert.equal(events[0].clientX,640);assert.equal(events[1].clientX,840);
  moveRelative({dx:200,dy:40});assert.equal(events.length,4);assert.equal(updates.length,2);
  assert.equal(events[3].movementX,200);assert.equal(events[3].movementY,-40);
  moveRelative({dx:0,dy:0});assert.equal(events.length,4);assert.equal(updates.length,2);
  document.pointerLockElement=canvas;
  moveRelative({dx:-640,dy:360});assert.equal(events.length,5);assert.equal(events[4].movementX,-640);
  moveRelative({dx:-640,dy:360});assert.equal(events.length,6);assert.equal(events[5].movementX,-640);
  assert.deepEqual(w.__evalMousePosition,{x:640,y:360});
  w.__evalMousePosition={x:1279,y:719};
  moveRelative({dx:0,dy:0});assert.equal(events.length,6);assert.deepEqual(w.__evalMousePosition,{x:640,y:360});
  const checkpoint=structuredClone(w.__evalMousePosition);
  assert.throws(()=>moveRelative({dx:641,dy:360}),/outside displacement/);
  assert.throws(()=>moveRelative({dx:-640,dy:-361}),/outside displacement/);
  w.taskFlightPaused=true;assert.throws(()=>moveRelative({dx:-630,dy:360}),/paused/);
  w.taskFlightPaused=false;w.flight.active=false;assert.throws(()=>moveRelative({dx:-630,dy:360}),/paused/);
  w.paused=false;w.nativeFlightLoading=true;assert.throws(()=>moveRelative({dx:-630,dy:360}),/loading/);
  assert.equal(events.length,6);assert.deepEqual(w.__evalMousePosition,checkpoint);
 }finally{
  for(const [k,d] of Object.entries(original)){if(d)Object.defineProperty(globalThis,k,d);else delete globalThis[k];}
 }
});
