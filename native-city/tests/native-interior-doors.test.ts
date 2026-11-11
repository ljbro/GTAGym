import test from 'node:test';import assert from 'node:assert/strict';
import {InteriorPushDoor,interiorPushDoorSpecs,PUSH_DOOR_SECONDS} from '../src/native-interior-doors.ts';
import {NATIVE_INTERIORS,interiorSolids,insideSolid} from '../src/native-interior-layout.ts';
import {EXTRA_LAYOUTS,extraFloorAt,extraBodyBlocked} from '../src/native-extra-layout.ts';
import {CityWalk} from '../src/city-walk.ts';
import {storeStepHeight} from '../src/native-interior-video-layout.ts';
const spec={name:'door',x:0,z:0,y:0,w:2.5,h:2.6,d:.12,yaw:0,locked:false};
const actor={x:0,z:-.5,feetY:0,yaw:0,active:true};const forward=new Set(['KeyW']);
test('initially closed; forward push animates gradually; release/pause freezes and resume continues',()=>{
 const d=new InteriorPushDoor(spec);assert(d.blocked(0,0,0));assert.equal(d.progress,0);
 d.step(actor,forward,.1);assert(d.progress>0&&d.progress<1);const p=d.progress;
 for(let i=0;i<120;i++){d.step(actor,new Set(),1/60);d.step(actor,forward,0);}assert.equal(d.progress,p);
 d.step(actor,forward,.1);assert(d.progress>p);for(let i=0;i<120;i++)d.step(actor,forward,1/60);
 assert.equal(d.progress,1);assert(!d.blocked(0,0,0));d.reset();assert.equal(d.progress,0);assert(d.blocked(0,0,0));
});
test('no speed threshold deadlock; no opening from far away, wrong floor, away-facing, airborne or backward inputs',()=>{
 const d=new InteriorPushDoor(spec);
 for(const a of [{...actor,z:-3},{...actor,feetY:3.6},{...actor,yaw:Math.PI},{...actor,airborne:true},{...actor,traversing:true},{...actor,active:false}])d.step(a,forward,.1);
 for(const keys of [new Set(['KeyS']),new Set(['KeyA']),new Set(['KeyW','KeyS'])])d.step(actor,keys,.1);
 assert.equal(d.progress,0);d.step({...actor},forward,.1);assert(d.progress>0,'blocked walker can still push with zero displacement');
});
test('opening direction is away from either approach and locked decoys never move',()=>{
 for(const side of [-1,1]){const d=new InteriorPushDoor(spec),a={...actor,z:side*.5,yaw:side<0?0:Math.PI};d.step(a,forward,.1);assert(d.leaves.every(l=>l.z*side<0));}
 const locked=new InteriorPushDoor({...spec,locked:true});for(let i=0;i<600;i++)locked.step(actor,forward,1/60);assert.equal(locked.progress,0);assert(locked.blocked(0,0,0));
 assert.equal(PUSH_DOOR_SECONDS,1.4);
});
for(const task of NATIVE_INTERIORS.filter(t=>t.mode==='walk'))test(task.id+' authored route remains traversable while pushing real doors; decoys stay locked',()=>{
 const doors=interiorPushDoorSpecs(task).map(d=>new InteriorPushDoor(d));assert(doors.some(d=>d.spec.locked));
 const extra=EXTRA_LAYOUTS.find(e=>e.id===task.id),solids=interiorSolids(task);
 const blocked=(x:number,z:number,y:number)=>(extra?extraBodyBlocked(extra,x,z,y,0):solids.some(s=>insideSolid(s,x,z,0)))||doors.some(d=>d.blocked(x,z,y,0));
 const floor=(x:number,z:number,y=0)=>extra?extraFloorAt(extra,x,z,y)??0:task.theme==='store'?storeStepHeight(x,z):0;
 const w=new CityWalk(blocked,(x,z)=>floor(x,z),{floorAt:floor,ladders:[]});w.active=true;[w.x,w.z]=task.points[0];w.y=0;
 for(const [i,p] of task.points.entries()){
  let n=0;for(;n<2200&&Math.hypot(w.x-p[0],w.z-p[1])>.09;n++){
   w.yaw=Math.atan2(p[0]-w.x,p[1]-w.z);w.step(forward,1/60);
   for(const d of doors)d.step({x:w.x,z:w.z,feetY:w.feetY,yaw:w.yaw,active:true,airborne:w.airborne,traversing:w.traversing},forward,1/60);
  }
  assert(n<2200,`${task.id} waypoint ${i} stuck at ${w.x},${w.z}; doors=${JSON.stringify(doors.map(d=>d.snapshot))}`);
 }
 for(const d of doors.filter(d=>d.spec.locked))assert.equal(d.progress,0);
});
