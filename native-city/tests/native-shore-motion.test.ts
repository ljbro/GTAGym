import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import {createHash} from 'node:crypto';
import {NativeShoreMotion,ShoreFloor} from '../src/native-shore-motion.ts';import {waterLocal,waterWorld} from '../src/native-water-motion.ts';import {CityCollision,inRing} from '../src/driving.ts';import {annotationTurns,nativeBends} from '../src/native-annotation-route.ts';
const root=new URL('../../',import.meta.url),read=(p:string)=>JSON.parse(fs.readFileSync(new URL(p,root),'utf8')),city=read('city/city.json'),specs=read('native-city/src/native-shore-routes.json'),collision=new CityCollision(city);
const land=(x:number,z:number)=>city.land.some((p:any)=>inRing(x,z,p[0])&&!p.slice(1).some((h:any)=>inRing(x,z,h))),env={land,heightAt:()=>0,blocked:(x:number,z:number)=>land(x,z)&&collision.blocked(x,z)};
const run=(m:NativeShoreMotion,keys:string[],seconds:number)=>{for(let i=0;i<Math.ceil(seconds/.025);i++)m.step(new Set(keys),.025);};
test('swim -> wade -> dry land succeeds without teleport or automatic completion in water',()=>{
 for(const s of specs){const m=new NativeShoreMotion(s,env);let modes=new Set([m.mode]),maxStep=0,n=0;
  while(!m.canFinish()&&n++<4000){const x=m.x,z=m.z;m.step(new Set(['KeyW','ShiftLeft']),.025);maxStep=Math.max(maxStep,Math.hypot(m.x-x,m.z-z));modes.add(m.mode);if(m.canFinish())assert(land(m.x,m.z));}
  assert(m.canFinish(),s.id+' cannot reach shore');assert.deepEqual([...modes],['swim','walk']);assert(maxStep<.11);assert(m.walker.feetY>0);
  m.walker.step(new Set(['Space']),.025);assert(!m.canFinish(),'airborne player must not complete');run(m,[],1);assert(m.canFinish());
  m.reset();assert.equal(m.mode,'swim');assert(!m.canFinish());assert.equal(m.depth,0);
 }
});
test('wading can return to deep water; underwater arrival and region escapes are rejected',()=>{
 const s=specs[0],m=new NativeShoreMotion(s,env);for(let n=0;n<4000&&m.mode==='swim';n++)m.step(new Set(['KeyW','ShiftLeft']),.025);assert.equal(m.mode,'walk');
 assert(m.depth>1);assert(!m.canFinish());run(m,['KeyS','ShiftLeft'],6);assert.equal(m.mode,'swim');
 const end=s.path.points.at(-1);m.swimmer.x=end[0];m.swimmer.z=end[1];assert(!m.canFinish(),'swimming state on land is not a completion');
 m.reset();run(m,['KeyA','ShiftLeft'],30);assert(Math.abs(waterLocal(s,m.x,m.z)[0])<15.001);
 m.reset();run(m,['ControlLeft'],.5);run(m,['KeyW','ShiftLeft'],60);assert.equal(m.mode,'swim');assert(!m.canFinish());run(m,['Space'],1);run(m,['KeyW','ShiftLeft'],10);assert.equal(m.mode,'walk');
});
