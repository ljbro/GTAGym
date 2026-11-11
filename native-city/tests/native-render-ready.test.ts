import test from 'node:test';
import assert from 'node:assert/strict';
import {waitForVehicleRendering} from '../src/native-render-ready.ts';
const mesh=(ready:()=>boolean)=>({isDisposed:()=>false,isEnabled:()=>true,isVisible:true,visibility:1,isReady:(complete:boolean)=>{assert.equal(complete,true);return ready();}});
test('parsed and enabled GLB cannot start a task before its opaque body is ready',async()=>{
 let time=0,bodyChecks=0,glassChecks=0;
 const result=await waitForVehicleRendering([mesh(()=>{bodyChecks++;return time>=75;}),mesh(()=>{glassChecks++;return true;})],{now:()=>time,wait:async()=>{time+=25;}});
 assert.equal(time,75);assert.equal(result.checks,4);assert.equal(bodyChecks,4);assert.equal(glassChecks,4);
});
test('GPU timeout and invisible body reject instead of starting an invisible vehicle',async()=>{
 for(const body of [mesh(()=>false),{...mesh(()=>true),isVisible:false},{...mesh(()=>true),visibility:0},{...mesh(()=>true),isEnabled:()=>false}]){
  let time=0;await assert.rejects(waitForVehicleRendering([body],{now:()=>time,wait:async()=>{time+=25;},timeoutMs:50}),/Vehicle body material/i);
 }
});
test('empty, disposed or cancelled models cannot satisfy readiness',async()=>{
 await assert.rejects(waitForVehicleRendering([]),/renderable body mesh/i);
 await assert.rejects(waitForVehicleRendering([{...mesh(()=>true),isDisposed:()=>true}]),/Cancel/i);
 await assert.rejects(waitForVehicleRendering([mesh(()=>true)],{cancelled:()=>true}),/Cancel/i);
});
