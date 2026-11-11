import test from 'node:test';
import assert from 'node:assert/strict';
import {CityCollision,inRing} from '../native-city/src/driving.ts';
import {installRealtimeGeometry} from '../scripts/server-eval/realtime-geometry.mjs';

const rectangle=(x,z,w,d)=>[[x-w/2,z-d/2],[x+w/2,z-d/2],[x+w/2,z+d/2],[x-w/2,z+d/2],[x-w/2,z-d/2]];
test('long interior footprint index preserves exact boundaries and fallback',()=>{
 const ring=Array.from({length:3001},(_,i)=>{const a=i/3000*Math.PI*2,r=120+30*Math.sin(a*9);return [Math.cos(a)*r,Math.sin(a)*r];});
 const site={long:true,ribbon:{ring},contains(x,z){return this.long?inRing(x,z,this.ribbon.ring):x===7&&z===9;}};
 const data={roads:[],buildings:[],land:[],water:[],landmarks:[]};
 const previous=globalThis.window;globalThis.window={__SHENCHENGJI_CITY__:{world:{collision:new CityCollision(data),nativeFootSite:site}}};
 try{
  assert.equal(installRealtimeGeometry().interiorEdges,ring.length);
  for(const [x,z]of ring)for(const delta of [-1e-8,0,1e-8])assert.equal(site.contains(x+delta,z-delta),inRing(x+delta,z-delta,ring));
  for(let i=0;i<10000;i++){const x=i%100*4-200,z=Math.floor(i/100)*4-200;assert.equal(site.contains(x,z),inRing(x,z,ring));}
  site.long=false;assert.equal(site.contains(7,9),true);assert.equal(site.contains(0,0),false);
 }finally{globalThis.window=previous;}
});
test('indexed collision matches the original on roads, facades, holes, water and boundaries',()=>{
 const shore=Array.from({length:2001},(_,i)=>{const t=i/2000*Math.PI*2,r=900+150*Math.cos(t*7);return [Math.cos(t)*r,Math.sin(t)*r];});
 const data={roads:[{points:[[-1200,0],[1200,0]],width:14}],buildings:[{rings:[rectangle(23,18,10,10)]}],
  land:[[shore,rectangle(-60,80,30,25)]],water:[{rings:[rectangle(60,80,35,45),rectangle(60,80,8,8)]}],
  landmarks:[{id:'civic',x:-230,z:-170,height:10}]};
 const collision=new CityCollision(data),original=collision.blocked.bind(collision);
 const old=globalThis.window;globalThis.window={__SHENCHENGJI_CITY__:{world:{collision}}};
 try{
  installRealtimeGeometry();let state=94;const random=()=>{state=(1664525*state+1013904223)>>>0;return state/4294967296;};
  const points=[...shore,...data.buildings[0].rings[0],...data.land[0][1],...data.water[0].rings.flat()];
  for(let i=0;i<12000;i++)points.push([(random()-.5)*2400,(random()-.5)*2400]);
  for(const [x,z]of [...points,...points.slice(0,100).map(([x,z])=>[x+1e-8,z-1e-8]),[29.15,18],[29.15-1e-8,18]])for(const allow of [false,true])
   assert.equal(collision.blocked(x,z,allow),original(x,z,allow),JSON.stringify({x,z,allow}));
  data.landmarks.push({id:'late',x:400,z:350,height:3});assert.equal(collision.blocked(400,350),original(400,350));
 }finally{globalThis.window=old;}
});
test('stair rail broad phase preserves exact segment and room predicates',()=>{
 const data={roads:[],buildings:[],land:[[rectangle(0,0,4000,4000)]],water:[],landmarks:[]};
 const rails=Array.from({length:600},(_,i)=>({a:[i*.2-60,Math.sin(i*.2)*10],b:[i*.2-59.8,Math.sin(i*.2+.2)*10]}));
 const room={x:4,z:2,w:3.6,d:3.4,yaw:.8};
 const original=(x,z)=>{const dx=x-room.x,dz=z-room.z,c=Math.cos(room.yaw),s=Math.sin(room.yaw);
  if(Math.abs(dx*c-dz*s)<room.w/2+.08&&Math.abs(dx*s+dz*c)<room.d/2+.08)return true;
  return rails.some(({a,b})=>{const dx=b[0]-a[0],dz=b[1]-a[1],t=Math.max(0,Math.min(1,((x-a[0])*dx+(z-a[1])*dz)/(dx*dx+dz*dz)));return Math.hypot(x-a[0]-dx*t,z-a[1]-dz*t)<.1;});};
 const site={rails,layout:{room}},old=globalThis.window;globalThis.window={__SHENCHENGJI_CITY__:{world:{collision:new CityCollision(data),nativeFootSite:site}}};
 try{
  assert.equal(installRealtimeGeometry().stairRails,600);
  for(let i=0;i<8000;i++){const x=(i%200)*.7-70,z=Math.floor(i/200)*.7-14;assert.equal(site.blocked(x,z),original(x,z));}
  for(const {a}of rails)for(const offset of [0,.099,.1,.101])assert.equal(site.blocked(a[0],a[1]+offset),original(a[0],a[1]+offset));
 }finally{globalThis.window=old;}
});
