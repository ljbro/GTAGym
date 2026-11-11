import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createOffmapMouse,releaseOffmapPointerLock} from '../src/offmap-mouse.ts';

function fixture(){
 const oldDocument=Object.getOwnPropertyDescriptor(globalThis,'document'),oldWindow=Object.getOwnPropertyDescriptor(globalThis,'window');
 const doc=Object.assign(new EventTarget(),{pointerLockElement:null as any,exitPointerLock(){exits++;}});
 const win=new EventTarget(),canvas=Object.assign(new EventTarget(),{focus(){},async requestPointerLock(){lock();}});
 Object.defineProperty(globalThis,'document',{value:doc,configurable:true});Object.defineProperty(globalThis,'window',{value:win,configurable:true});
 let paused=false,available=true,unlocks=0,exits=0;
 function lock(){doc.pointerLockElement=canvas;doc.dispatchEvent(new Event('pointerlockchange'));}
 function lost(){doc.pointerLockElement=null;doc.dispatchEvent(new Event('pointerlockchange'));}
 const mouse=createOffmapMouse(canvas as any,{available:()=>available,paused:()=>paused,look(){},message(){},unlock(){unlocks++;paused=true;}});
 return {doc,mouse,lock,lost,get paused(){return paused;},set paused(v){paused=v;},get unlocks(){return unlocks;},get exits(){return exits;},set available(v:boolean){available=v;},
  release:()=>releaseOffmapPointerLock(doc as any),
  dispose(){mouse.dispose();for(const [name,desc] of [['document',oldDocument],['window',oldWindow]] as const){if(desc)Object.defineProperty(globalThis,name,desc);else Reflect.deleteProperty(globalThis,name);}}
 };
}
test('late programmatic unlock after boarding resumes does not re-pause',async()=>{
 const f=fixture();try{
  await f.mouse.capture();f.paused=true;f.release();
  await Promise.resolve();f.paused=false;f.lost();
  assert.equal(f.paused,false);assert.equal(f.unlocks,0);assert.equal(f.exits,1);
  f.lock();f.lost();assert.equal(f.unlocks,1);assert.equal(f.paused,true,'later genuine unlock must still pause');
 }finally{f.dispose();}
});
test('early programmatic event during boarding and repeated sync remain harmless',()=>{
 const f=fixture();try{f.lock();f.paused=true;f.release();f.mouse.sync();f.release();assert.equal(f.exits,1);f.lost();assert.equal(f.unlocks,0);f.paused=false;assert.equal(f.paused,false);}finally{f.dispose();}
});
test('sync releases caused by unavailable or paused controller do not notify user unlock',()=>{
 const f=fixture();try{for(const cause of ['paused','unavailable']){f.lock();if(cause==='paused')f.paused=true;else f.available=false;f.mouse.sync();f.paused=false;f.available=true;f.lost();assert.equal(f.unlocks,0);assert.equal(f.paused,false);}}finally{f.dispose();}
});
test('no-lock release does not suppress a future user unlock',()=>{
 const f=fixture();try{f.release();assert.equal(f.exits,0);f.lock();f.lost();assert.equal(f.unlocks,1);assert.equal(f.paused,true);}finally{f.dispose();}
});
test('fresh acquire clears a coalesced old release marker',async()=>{
 const f=fixture();try{f.lock();f.release();f.doc.pointerLockElement=null;await f.mouse.capture();f.lost();assert.equal(f.unlocks,1);}finally{f.dispose();}
});
test('queued acquisition notification does not consume an outstanding release',()=>{
 const f=fixture();try{f.lock();f.release();f.lock();f.lost();assert.equal(f.unlocks,0);}finally{f.dispose();}
});
test('failed release does not leave a stale suppression marker',()=>{
 const f=fixture();try{f.lock();f.doc.exitPointerLock=()=>{throw Error('release failed');};assert.throws(f.release,/release failed/);f.lost();assert.equal(f.unlocks,1);}finally{f.dispose();}
});
test('disposed controller ignores pending lock-loss event',()=>{
 const f=fixture();try{f.lock();f.mouse.dispose();f.lost();assert.equal(f.unlocks,0);}finally{f.dispose();}
});
test('native task and Esc menu release through the intentional-release helper',()=>{
 for(const file of ['native-task-system.ts','main.ts']){
  const source=fs.readFileSync(new URL('../src/'+file,import.meta.url),'utf8');
  assert(source.includes('releaseOffmapPointerLock();'));assert(!source.includes('document.exitPointerLock('),file+' bypasses the release marker');
 }
});
