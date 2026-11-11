import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import {createHash} from 'node:crypto';
import {NativeBoatMotion,boatPoint,YACHT} from '../src/native-boat-motion.ts';import {annotationTurns,nativeBends} from '../src/native-annotation-route.ts';
import {inRing} from '../src/driving.ts';import {waterWorld} from '../src/native-water-motion.ts';
const root=new URL('../../',import.meta.url),read=(p:string)=>JSON.parse(fs.readFileSync(new URL(p,root),'utf8')),specs=read('native-city/src/native-boat-routes.json');
const run=(m:NativeBoatMotion,keys:string[],seconds:number)=>{for(let i=0;i<Math.ceil(seconds/.025);i++)m.step(new Set(keys),.025);};
test('swim-to-yacht and swim-then-board have distinct completion rules',()=>{
 const a=new NativeBoatMotion(specs[0],()=>true),b=new NativeBoatMotion(specs[2],()=>true);
 assert.match(b.interact(),/Stern/i);assert.equal(b.mode,'swim');assert(!b.canFinish());
 for(const m of [a,b]){run(m,['KeyW','ShiftLeft'],m.spec.path.length/2.4);assert(Math.hypot(m.x-m.spec.path.points[1][0],m.z-m.spec.path.points[1][1])<.1);}
 assert(a.canFinish());assert(!b.canFinish(),'F boarding is required, not just arrival');
 b.swimmer.depth=1;assert.match(b.interact(),/Rise to the surface/i);b.swimmer.depth=0;assert.match(b.interact(),/board/i);assert.equal(b.mode,'boarding');assert(!b.canFinish());
 run(b,['KeyW'],1);assert.equal(b.boat.speed,0);assert(!b.canFinish());run(b,[],1.2);assert.equal(b.mode,'boarding');assert(b.deckTransfer);assert(!b.canFinish());for(let n=0;n<110&&b.mode==='boarding';n++){b.step(new Set(['KeyW']),.025);assert.equal(b.boat.speed,0);}assert.equal(b.mode,'boat');assert(b.canFinish());
});
test('F boarding animation, hull collision, departure braking and reverse transition work',()=>{
 const m=new NativeBoatMotion(specs[1],()=>true);run(m,['KeyW'],4);
 assert(m.hullBlocks(m.boat.x,m.boat.z));assert(Math.hypot(m.swimmer.x-m.boat.x,m.swimmer.z-m.boat.z)>YACHT.halfLength);
 m.reset();m.interact();run(m,[],4.8);assert.equal(m.mode,'boat');assert(!m.canFinish());
 run(m,['KeyW'],3);assert(m.boat.speed>4);assert.match(m.interact(),/(?:complete|full) stop/i);assert.equal(m.mode,'boat');
 run(m,['Space'],2);assert.equal(m.boat.speed,0);m.interact();run(m,[],4.5);assert.equal(m.mode,'swim');assert.equal(m.swimmer.depth,0);assert(!m.hullBlocks(m.x,m.z));
 // Swimming below the hull and resurfacing must stop safely, not trap descent.
 m.swimmer.x=m.boat.x;m.swimmer.z=m.boat.z;m.swimmer.depth=1.5;run(m,['Space'],1);assert(m.swimmer.depth>=1.2);const depth=m.swimmer.depth;run(m,['ControlLeft'],.1);assert(m.swimmer.depth>depth);
});
test('drive task rejects swimming to the endpoint, succeeds only driving and resets fully',()=>{
 const m=new NativeBoatMotion(specs[1],()=>true),end=m.spec.path.points.at(-1)!;
 [m.swimmer.x,m.swimmer.z]=end;assert(!m.canFinish());m.reset();m.interact();run(m,[],4.8);
 for(let n=0;n<2000&&!m.canFinish();n++)m.step(new Set(['KeyW']),.025);assert(m.canFinish());
 m.reset();assert.equal(m.mode,'swim');assert(!m.boarded);assert.equal(m.boat.speed,0);assert.equal(m.swimmer.depth,0);assert.equal(m.x,m.spec.path.points[0][0]);
});
test('boat footprint cannot cross shore and physics are invariant to frame subdivision',()=>{
 const s=specs[1],boundary=boatPoint({x:s.path.points[0][0],z:s.path.points[0][1],yaw:Math.atan2(s.path.forward[0],s.path.forward[1])},0,25);
 const sea=(x:number,z:number)=>(x-boundary.x)*s.path.forward[0]+(z-boundary.z)*s.path.forward[1]<0;
 const a=new NativeBoatMotion(s,sea),b=new NativeBoatMotion(s,sea);for(const m of [a,b]){m.interact();run(m,[],4.8);}
 for(let i=0;i<100;i++)a.step(new Set(['KeyW']),.01);for(let i=0;i<10;i++)b.step(new Set(['KeyW']),.1);
 assert(Math.hypot(a.x-b.x,a.z-b.z)<.05);run(a,['KeyW'],30);const nose=boatPoint(a.boat,0,YACHT.halfLength);assert(sea(nose.x,nose.z));
});

test('helm transfer is continuous, locks driving, and reset clears the on-deck phase',()=>{
 const m=new NativeBoatMotion(specs[1],()=>true);m.interact();run(m,[],2.15);assert(m.deckTransfer);
 let last=m.deckTransfer.local,maxStep=0,n=0;
 while(m.mode==='boarding'&&n++<120){const d=m.deckTransfer;m.step(new Set(['KeyW','KeyD']),.025);assert.equal(m.boat.speed,0);const now=m.deckTransfer;if(now){maxStep=Math.max(maxStep,Math.hypot(...now.local.map((v,i)=>v-last[i])));last=now.local;}if(d)assert(Math.abs(d.local[0])<1.3);}
 assert.equal(m.mode,'boat');assert(maxStep<.13);assert(m.boarded);
 m.interact();run(m,[],.5);assert(m.deckTransfer);m.reset();assert.equal(m.deckTransfer,null);assert.equal(m.mode,'swim');assert(!m.boarded);
});
