import test from 'node:test';import assert from 'node:assert/strict';
import {BoatWake} from '../src/native-boat-wake.ts';
test('stationary or grounded boats emit no foam even with throttle/speed set',()=>{
 const w=new BoatWake(1.2,3.15);for(let i=0;i<120;i++)w.step(0,0,0,8,1/60);assert.equal(w.patches.length,0);
 for(let i=0;i<120;i++)w.step(0,i/10,0,8,1/60,true);assert.equal(w.patches.length,0);
});
test('bow splits, stern churns, and old foam stays on the travelled world path through a turn',()=>{
 const w=new BoatWake(1.2,3.15);for(let i=0;i<120;i++)w.step(0,i*8/60,0,8,1/60);
 assert(w.patches.some(p=>p.x>1));assert(w.patches.some(p=>p.x< -1));assert(w.patches.some(p=>p.vx===0));
 const old=w.patches[0],x=old.x,z=old.z;w.step(.1,16,Math.PI/2,8,1/60);
 assert(Math.abs(old.x-x)<.02);assert.equal(old.z,z);assert.equal(old.yaw,0);
 const paused=JSON.stringify(w.patches);w.step(.1,16,Math.PI/2,8,0);assert.equal(JSON.stringify(w.patches),paused);
 for(let i=0;i<400;i++)w.step(.1,16,0,0,1/60);assert.equal(w.patches.length,0);
});
test('foam strength scales with speed, particle count is bounded, reset/teleport removes stale trails',()=>{
 const slow=new BoatWake(1.2,3.15),fast=new BoatWake(1.2,3.15);
 for(let i=0;i<3600;i++){slow.step(0,i/60,0,1,1/60);fast.step(0,i*8/60,0,8,1/60);}
 assert(fast.patches.length<=320);assert(fast.patches.at(-1)!.strength>slow.patches.at(-1)!.strength);
 fast.step(1000,1000,0,8,1/60);assert.equal(fast.patches.length,0);slow.reset();assert.equal(slow.patches.length,0);
});
test('route length is half the previous variant, while keeping the boat spawn',async()=>{
 const {WATER_TRANSFER_SPECS}=await import('../src/native-water-transfer.ts');
 assert.deepEqual(WATER_TRANSFER_SPECS.map(s=>s.path.length),[450,525]);
 for(const s of WATER_TRANSFER_SPECS){const a=s.path.points[0],b=s.boatSpawn!;assert(Math.abs(Math.hypot(a[0]-b[0],a[1]-b[1])-60)<1e-6);}
});
test('swimmer ripples remain short, faint and narrow rather than motor foam',()=>{
 const w=new BoatWake(.32,.55,true);for(let i=0;i<600;i++)w.step(0,i*2.4/60,0,2.4,1/60);
 assert(w.patches.length>0&&w.patches.length<=12);assert(w.patches.every(p=>p.life<=1.25&&p.strength<=.18&&p.width<.4));
});
