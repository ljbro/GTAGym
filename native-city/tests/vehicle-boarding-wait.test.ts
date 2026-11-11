import test from 'node:test';
import assert from 'node:assert/strict';
import {waitForVehicleBoarding} from '../src/vehicle-boarding-wait.ts';
test('a never-settling preparation releases the caller lock on timeout',async()=>{
 let busy=true;
 try{await assert.rejects(waitForVehicleBoarding(new Promise(()=>{}),new AbortController().signal,10),/timed out/);}
 finally{busy=false;}
 assert.equal(busy,false);
 assert.equal(await waitForVehicleBoarding(Promise.resolve('retry'),new AbortController().signal,50),'retry');
});
test('task switch cancels promptly and a late result cannot take control',async()=>{
 const controller=new AbortController();let resolve!:(v:string)=>void,committed=false;
 const pending=waitForVehicleBoarding(new Promise<string>(r=>resolve=r),controller.signal).then(()=>{committed=true;});
 controller.abort(new Error('task switched'));await assert.rejects(pending,/task switched/);
 resolve('late');await Promise.resolve();assert.equal(committed,false);
});
test('failure and already-aborted waits settle without a dangling rejection',async()=>{
 const c=new AbortController();c.abort(new Error('cancelled'));
 await assert.rejects(waitForVehicleBoarding(Promise.reject(new Error('late error')),c.signal),/cancelled/);
 await assert.rejects(waitForVehicleBoarding(Promise.reject(new Error('GPU failed')),new AbortController().signal),/GPU failed/);
});
