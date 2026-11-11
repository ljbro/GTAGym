import test from 'node:test';
import assert from 'node:assert/strict';
import {advanceFrames} from '../scripts/server-eval/advance-frames.mjs';

function fixture(){
 const events=[],s={active:true,complete:false,failed:false,elapsed:0};
 const w={paused:false,taskFlightPaused:false,nativeFlightLoading:false,nativeFlightTransitionId:0,
  flight:{active:false},keys:new Set(),engine:{},time:0,animations:0,
  scene:{onBeforeAnimationsObservable:{notifyObservers(){}},onAfterAnimationsObservable:{notifyObservers(){}},_animate(){w.animations++;}},
  update(dt){w.time+=dt;s.elapsed+=dt;},
 };
 globalThis.window={__SHENCHENGJI_CITY__:{world:w,stats:{nativeTask:s}},dispatchEvent(e){events.push(e);if(e.code!=='KeyF')w.keys.add(e.code);}};
 globalThis.document={querySelector:()=>({})};
 globalThis.KeyboardEvent=class {constructor(type,props){Object.assign(this,{type},props);}};
 return {w,s,events};
}
const step=(options={})=>advanceFrames({frames:60,keys:['w','f'],dx:0,dy:0,...options});
test('NPC vehicle render readiness waits without consuming action, animation or game time',async()=>{
 const {w,s}=fixture();w.vehicleBoardingLoading=true;let during;
 setTimeout(()=>{during={elapsed:s.elapsed,time:w.time,animations:w.animations};w.vehicleBoardingLoading=false;},35);
 assert.equal(await step(),60);assert.deepEqual(during,{elapsed:0,time:0,animations:0});assert(Math.abs(s.elapsed-1)<1e-9);
 w.vehicleBoardingLoading=true;
 await assert.rejects(step({transitionTimeoutMs:20}),/Vehicle boarding timed out/);assert(Math.abs(s.elapsed-1)<1e-9);
});
test('aircraft advances while ground is paused; real menus still reject',async()=>{
 const {w,s}=fixture();w.paused=true;w.flight.active=true;
 assert.equal(await step(),60);assert(Math.abs(s.elapsed-1)<1e-9);
 w.taskFlightPaused=true;await assert.rejects(step(),/Unexpected paused/);
 w.flight.active=false;w.taskFlightPaused=false;await assert.rejects(step(),/Unexpected paused/);
 assert.equal(w.animations,60);
});
test('delayed boarding consumes no frames/time and restores levels, not toggle edges',async()=>{
 const {w,s,events}=fixture();w.nativeFlightLoading=true;w.nativeFlightTransitionId=1;w.paused=true;w.taskFlightPaused=true;
 let during;
 setTimeout(()=>{during={elapsed:s.elapsed,time:w.time,animations:w.animations};w.flight.active=true;w.nativeFlightLoading=false;w.taskFlightPaused=false;},40);
 assert.equal(await step(),60);assert.deepEqual(during,{elapsed:0,time:0,animations:0});
 assert(Math.abs(s.elapsed-1)<1e-9);assert(w.keys.has('KeyW'));assert(events.every(e=>e.repeat));assert.equal(events.length,2);
 await step();assert.equal(events.length,2,'no redundant restoration across rounds');
});
test('cached boarding restores input even if transition completed before evaluate',async()=>{
 const {w,events}=fixture();w.nativeFlightTransitionId=1;w.flight.active=true;w.paused=true;
 await step({keys:['Numpad5','Shift','f','v','g']});
 assert.deepEqual(events.map(e=>e.code),['Numpad5','ShiftLeft','KeyF','KeyV','KeyG']);
 assert(events.every(e=>e.repeat));
});
test('transition during chunk resumes all remaining frames',async()=>{
 const {w,s}=fixture();const update=w.update.bind(w);let count=0;
 w.update=dt=>{update(dt);if(++count===3){w.nativeFlightLoading=true;w.nativeFlightTransitionId++;w.paused=true;setTimeout(()=>{w.nativeFlightLoading=false;w.flight.active=true;},20);}};
 assert.equal(await step(),60);assert.equal(count,60);assert(Math.abs(s.elapsed-1)<1e-9);
});
test('boarding failure stops without advancing or restoring inputs',async()=>{
 const {w,s,events}=fixture();w.nativeFlightLoading=true;w.paused=true;
 setTimeout(()=>{s.active=false;s.failed=true;w.nativeFlightLoading=false;},20);
 assert.equal(await step(),0);assert.equal(s.elapsed,0);assert.deepEqual(events,[]);
});
test('stuck loader times out rather than consuming the action or hanging',async()=>{
 const {w,s}=fixture();w.nativeFlightLoading=true;
 await assert.rejects(step({transitionTimeoutMs:20}),/boarding timed out/);assert.equal(s.elapsed,0);
});
