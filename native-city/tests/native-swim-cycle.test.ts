import test from 'node:test';import assert from 'node:assert/strict';import {swimCycle} from '../src/native-swim-cycle.ts';
test('swimming has alternating arm strokes and flutter kicks, not a static prone pose',()=>{
 const samples=Array.from({length:24},(_,i)=>swimCycle(i*Math.PI/12,1));
 for(const key of ['leftHand','rightHand','leftFoot','rightFoot'] as const){const ys=samples.map(s=>s[key].up);assert(Math.max(...ys)-Math.min(...ys)>.2);for(const s of samples)assert(Math.hypot(...Object.values(s[key]))<1);}
 assert(samples.some(s=>s.leftHand.up>0&&s.rightHand.up<0));assert(samples.some(s=>s.rightHand.up>0&&s.leftHand.up<0));
});
test('idle treads upright and transitions to horizontal swimming without discontinuities',()=>{
 assert(swimCycle(0,0).pitch<.2);assert(swimCycle(0,1).pitch>1.4);
 const a=swimCycle(0,1),b=swimCycle(2*Math.PI,1);assert(Math.abs(a.leftHand.forward-b.leftHand.forward)<1e-10);
});
test('both arms have continuous position and velocity at pull/recovery and cycle wrap',()=>{
 const eps=1e-5;
 for(const moving of [0,.5,1])for(const t of [0,.05,.5,.55,1])for(const hand of ['leftHand','rightHand'] as const){
  const phase=t*Math.PI*2,a=swimCycle(phase-eps,moving)[hand],b=swimCycle(phase,moving)[hand],c=swimCycle(phase+eps,moving)[hand];
  for(const axis of ['forward','side','up'] as const){
   assert(Math.abs(c[axis]-a[axis])<eps*4,`${hand} ${axis}: position jump at ${t}`);
   assert(Math.abs((c[axis]-b[axis])/eps-(b[axis]-a[axis])/eps)<.001,`${hand} ${axis}: velocity jump at ${t}`);
  }
 }
});
test('stationary treading animates both legs in opposition without overstretching the rig',()=>{
 const samples=Array.from({length:64},(_,i)=>swimCycle(i*Math.PI/32,0));
 for(const foot of ['leftFoot','rightFoot'] as const){
  assert(Math.max(...samples.map(s=>s[foot].up))-Math.min(...samples.map(s=>s[foot].up))>.19);
  assert(Math.max(...samples.map(s=>s[foot].forward))-Math.min(...samples.map(s=>s[foot].forward))>.27);
 }
 for(const s of samples){assert(Math.abs(s.leftFoot.up+s.rightFoot.up+1.36)<1e-10);for(const key of ['leftFoot','rightFoot','leftHand','rightHand'] as const)assert(Math.hypot(...Object.values(s[key]))<.98);}
});
