import test from 'node:test';
import assert from 'node:assert/strict';
import {applyCityCameraLook,cockpitLookDirection,handleCityCameraKey,updateDrivingCameraLook} from '../src/city-camera-look.ts';
function make(){return {paused:false,taskFlightPaused:false,observer:{active:false},flight:null as null|{active:boolean;look:(x:number,y:number)=>void},taskVehicle:null as null|{look:(x:number,y:number)=>void},walk:null as null|{active:boolean;look:(x:number,y:number)=>void},cameraYaw:0,cameraPitch:.22,viewReturn:0};}
test('driving mouse turns yaw and pitch, deferring auto-recenter without changing steering',()=>{
 const w=make();applyCityCameraLook(w,100,50);assert.equal(w.cameraYaw,.5);assert.equal(w.cameraPitch,.32);assert.equal(w.viewReturn,2);
 applyCityCameraLook(w,0,100000);assert.equal(w.cameraPitch,1.15);applyCityCameraLook(w,0,-100000);assert.equal(w.cameraPitch,-.55);
 const saved={...w};applyCityCameraLook(w,NaN,2);assert.deepEqual(w,saved);
});
test('walking, water and flight route each delta to only the active controller',()=>{
 const w=make(),calls:string[]=[];
 w.walk={active:true,look:()=>calls.push('walk')};applyCityCameraLook(w,10,20);
 w.taskVehicle={look:()=>calls.push('water')};applyCityCameraLook(w,10,20);
 w.flight={active:true,look:()=>calls.push('flight')};w.observer.active=true;w.paused=true;applyCityCameraLook(w,10,20);
 assert.deepEqual(calls,['walk','water','flight']);assert.equal(w.cameraYaw,0);
 w.taskFlightPaused=true;applyCityCameraLook(w,10,20);assert.equal(calls.length,3);
});
test('pause and drone observer do not rotate ordinary driving or walking',()=>{
 const w=make();w.paused=true;applyCityCameraLook(w,10,20);w.paused=false;w.observer.active=true;applyCityCameraLook(w,10,20);assert.equal(w.cameraYaw,0);assert.equal(w.cameraPitch,.22);
});
test('cockpit view follows both horizontal and vertical mouse motion',()=>{
 assert.deepEqual(cockpitLookDirection(0,.22),{x:0,y:-0,z:8});
 const side=cockpitLookDirection(Math.PI/2,.22);assert(Math.abs(side.x-8)<1e-9);assert(Math.abs(side.z)<1e-9);
 assert(cockpitLookDirection(0,.7).y<0);assert(cockpitLookDirection(0,-.2).y>0);
});
test('driving recenter waits for mouse idle, respects pause/stationary/rear view and follows shortest angle',()=>{
 const w={...make(),drag:false};w.cameraYaw=Math.PI*2-.6;w.cameraPitch=.8;w.viewReturn=2;
 updateDrivingCameraLook(w,1,0,20);assert.equal(w.cameraYaw,Math.PI*2-.6);assert.equal(w.viewReturn,1);
 updateDrivingCameraLook(w,1.5,0,20);assert(w.cameraYaw>Math.PI*2-.6);assert(w.cameraPitch<.8);
 const before=w.cameraYaw;updateDrivingCameraLook(w,1,0,0);assert.equal(w.cameraYaw,before);
 updateDrivingCameraLook(w,1,0,20,true);assert.equal(w.cameraYaw,before);
 w.paused=true;updateDrivingCameraLook(w,1,0,20);assert.equal(w.cameraYaw,before);
});
test('V cycles the active controller once; C only holds rear view and never switches mode',()=>{
 let cycles=0;const w={...make(),walkFirstPerson:false,keys:new Set<string>(),toggleDrivingView:()=>cycles++};
 assert(handleCityCameraKey(w,'KeyV'));assert.equal(cycles,1);handleCityCameraKey(w,'KeyV',true);assert.equal(cycles,1);
 handleCityCameraKey(w,'KeyC');assert(w.keys.has('KeyC'));assert.equal(cycles,1);w.keys.delete('KeyC');
 w.walk={active:true,look:()=>{}};handleCityCameraKey(w,'KeyV');assert(w.walkFirstPerson);
 w.paused=true;handleCityCameraKey(w,'KeyV');assert(w.walkFirstPerson);
 assert.equal(handleCityCameraKey(w,'KeyO'),false);
});
