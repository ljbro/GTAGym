import test from 'node:test';
import assert from 'node:assert/strict';
import {makePickupClimbLayout,pickupWorld,pickupLocal,pickupFloor,findPickupClimbLayout} from '../src/native-pickup-climb-layout.ts';
import {linkPosition,walkTraversalPose} from '../src/native-walk-traversal.ts';
test('mantle has stable ledge contacts, smooth junctions and reversible safe motion',()=>{
 for(const yaw of [0,.7,-1.8])for(const link of makePickupClimbLayout(0,0,.015,yaw).links){
  assert(link.mantleGrip);assert.deepEqual(linkPosition(link,0),link.from);assert.deepEqual(linkPosition(link,1),link.to);
  const reverse={...link,from:link.to,to:link.from};
  for(let i=0;i<=100;i++){
   const t=i/100,p=linkPosition(link,t),r=linkPosition(reverse,1-t);
   assert(Math.hypot(p.x-r.x,p.y-r.y,p.z-r.z)<1e-9);
   const state=walkTraversalPose(link,t,p,yaw)!;
   assert.deepEqual(state.mantleContact!.point,link.mantleGrip);
   assert(state.mantleContact!.weight>=0&&state.mantleContact!.weight<=1);
  }
  for(const t of [.14,.46,.80]){
   const a=linkPosition(link,t-.00001),b=linkPosition(link,t+.00001);
   assert(Math.hypot(a.x-b.x,a.y-b.y,a.z-b.z)<1e-7,'junction must ease to zero velocity');
  }
 }
});
test('pickup climbing surfaces and links stay aligned at arbitrary city headings',()=>{
 for(const yaw of [0,.7,-1.88675,Math.PI])for(const side of [-1,1]){
  const p=makePickupClimbLayout(-718,505,.015,yaw,side);
  for(const [u,v] of [[0,1.7],[0,3.65],[2,6]]){const [x,z]=pickupWorld(p,u,v),local=pickupLocal(p,x,z);assert(Math.hypot(local[0]-u,local[1]-v)<1e-10);}
  assert.equal(p.links.length,2);assert(p.links.every(l=>l.kind==='climb'&&l.to.y-l.from.y<1.5));
  for(const l of p.links)assert(Math.abs(pickupFloor(p,l.to.x,l.to.z)!-l.to.y)<1e-10);
  assert.equal(pickupFloor(p,...pickupWorld(p,0,0)),null,'cab must not become hood support');
  assert.equal(pickupFloor(p,...p.goal),p.roofY);
 }
});
test('pickup compound placement rejects occupied land, native roads and uneven terrain',()=>{
 const points:[number,number][]=[[0,-20],[0,0]],before=JSON.stringify(points);
 const p=findPickupClimbLayout(points,{blocked:()=>false,heightAt:()=>0});assert(p.y===.015);assert.equal(JSON.stringify(points),before);
 assert.throws(()=>findPickupClimbLayout(points,{blocked:()=>true,heightAt:()=>0}));
 assert.throws(()=>findPickupClimbLayout(points,{blocked:()=>false,heightAt:()=>0,roadAt:()=>({d:0,road:{width:8}})}));
 assert.throws(()=>findPickupClimbLayout(points,{blocked:()=>false,heightAt:(x,z)=>x+z}));
});
