import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import {createHash} from 'node:crypto';
import {NativeWaterMotion,diveFloor,waterWorld} from '../src/native-water-motion.ts';
import {annotationTurns,nativeBends} from '../src/native-annotation-route.ts';
import {inRing} from '../src/driving.ts';
import {diveEntranceBoxes} from '../src/native-dive-entrance.ts';
const read=(p:string)=>JSON.parse(fs.readFileSync(new URL('../../'+p,import.meta.url),'utf8'));
const spec=read('native-city/src/native-water-routes.json')[0];
test('swimmer moves freely, dives and surfaces; shallow floor and entrance piers remain solid',()=>{
 const m=new NativeWaterMotion(spec,()=>true),step=(keys:string[],seconds:number)=>{for(let i=0;i<seconds*40;i++)m.step(new Set(keys),.025);};
 step(['ControlLeft'],10);assert(m.depth<=spec.shallowFloorDepth-1.5+.001);
 step(['Space'],10);assert.equal(m.depth,0);
 const yaw=m.yaw;m.look(40,10);assert(m.yaw>yaw);m.reset();
 step(['KeyW','ShiftLeft'],spec.path.length/2.4);assert(Math.hypot(m.x-spec.path.points[1][0],m.z-spec.path.points[1][1])<.07);
 assert(!m.canFinish(),'surface arrival must not complete a deep dive');
 // Descend on the approach side, not straight through the entrance lintel.
 m.reset();step(['KeyW','ShiftLeft'],(spec.path.length-2)/2.4);step(['ControlLeft'],(6-m.depth)/1.2);
 assert(m.canFinish());assert(Math.abs(m.depth-6)<.04);
 const [px,pz]=waterWorld(spec,2.8,spec.path.length);assert(!m.clear(px,pz,6));
 assert(m.clear(...waterWorld(spec,0,spec.path.length),6));
 step(['ControlLeft'],10);assert(m.y>=diveFloor(spec,m.x,m.z)+1.5-.001);
});
test('swimming integration is frame-rate stable, freezeable, and respects non-water boundaries',()=>{
 const a=new NativeWaterMotion(spec,()=>true),b=new NativeWaterMotion(spec,()=>true),keys=new Set(['KeyW','ShiftLeft']);
 for(let i=0;i<100;i++)a.step(keys,.01);for(let i=0;i<10;i++)b.step(keys,.1);
 assert(Math.hypot(a.x-b.x,a.z-b.z)<1e-8);const before=[a.x,a.z,a.depth];a.step(new Set(['ControlLeft']),0);assert.deepEqual([a.x,a.z,a.depth],before);
 const blocked=new NativeWaterMotion(spec,()=>false),start=[blocked.x,blocked.z];blocked.step(keys,.2);assert.deepEqual([blocked.x,blocked.z],start);
});
test('c06-n02 service portal has an open passage and solid walls, roof and rear closure',()=>{
 const m=new NativeWaterMotion(spec,()=>true),L=spec.path.length,floor=diveFloor(spec,...waterWorld(spec,0,L));
 for(let v=L-2;v<L+8;v+=.2)assert(m.clear(...waterWorld(spec,0,v),6),'central opening remains usable');
 for(const [u,v,depth] of [[4,L,6],[2.3,L+4,6],[0,L+9,6],[0,L+4,3.5]])assert(!m.clear(...waterWorld(spec,u,v),depth),'visible solid cannot be swum through');
 assert(m.clear(...waterWorld(spec,10,L-15),6),'no corridor walls added to the open approach');
 const boxes=diveEntranceBoxes(floor,L);
 assert(boxes.every(b=>b.y+b.height/2<spec.waterHeight),'whole entrance stays submerged');
 const foundation=boxes.find(b=>b.name==='foundation')!;
 assert(foundation.y-foundation.height/2<floor);assert.equal(foundation.y+foundation.height/2,floor);
 assert(boxes.filter(b=>b.name==='headwall'||b.name==='passage-wall').every(b=>Math.abs(b.y-b.height/2-floor)<1e-8),'walls meet the founded slab');
});
