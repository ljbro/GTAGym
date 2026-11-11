import test from 'node:test';import assert from 'node:assert/strict';
import original from '../src/native-interior-tasks.json' with {type:'json'};
import {InteriorMission,MERGED_INTERIORS,BANK_EXIT} from '../src/native-interior-mission.ts';
import {BANK_INBOUND} from '../src/native-bank-layout.ts';
import {CityWalk} from '../src/city-walk.ts';
const origin={x:100,y:3,z:200};
const actor=(x:number,z:number)=>({active:true,x:x+origin.x,z:z+origin.z,feetY:origin.y,airborne:false,traversing:false});
test('warehouse cover requires Q behind the crate, not arrival, front face, jump or wrong floor',()=>{
 const m=new InteriorMission('c09-n02',origin),w=new CityWalk(()=>false,()=>origin.y);w.active=true;w.x=origin.x+5;w.z=origin.z+20.8;w.resetMotion();
 assert(!m.ready);m.step(w);assert(!m.ready);assert(!m.interact(w));assert.match(m.coverPrompt(w),/press Q/i);
 for(const p of [[5,17.5],[7,20.8],[-4,5.8]])assert(!m.takeCover({...actor(p[0],p[1]),enterCover:()=>true}));
 for(const invalid of [{active:false},{airborne:true},{traversing:true},{feetY:origin.y+1}])assert(!m.takeCover({...actor(5,20.8),...invalid,enterCover:()=>true}));
 assert(!m.takeCover({...actor(5,20.8),enterCover:()=>false}));assert(!m.ready);
 assert(m.takeCover(w));assert(w.coverCrouched);const start={x:w.x,z:w.z,eye:w.eye.y};for(let i=0;i<16;i++)w.step(new Set(['KeyW']),.025);
 assert.equal(w.crouchBlend,1);assert.equal(w.yaw,Math.PI);assert.equal(w.x,start.x);assert.equal(w.z,start.z);assert(w.eye.y<start.eye-.6);assert(!m.takeCover(w));
 w.resetMotion();m.step(w);assert(!m.ready);assert.match(m.coverPrompt(w),/press Q/i);assert(!w.coverCrouched);assert.equal(w.crouchBlend,0);assert(!new InteriorMission('c09-n02',origin).ready);
});
test('bank requires E at the safe; proximity, remote E, airborne and driving never collect',()=>{
 const m=new InteriorMission('c09-n01',origin),p=original[0].points.at(-1)!;
 m.step(actor(...p as [number,number]));assert(!m.ready);assert(!m.interact(actor(14.4,6.44)));
 for(const invalid of [{active:false},{airborne:true},{traversing:true},{feetY:6}])assert(!m.interact({...actor(p[0],p[1]),...invalid}));
 assert.match(m.prompt(actor(p[0],p[1])),/press E/i);assert(m.interact(actor(p[0],p[1])));assert(m.ready);assert.equal(m.localRoute,BANK_EXIT);assert(!m.interact(actor(p[0],p[1])));
 assert(!new InteriorMission('c09-n01',origin).ready);
});
test('dealer must visit showroom before returning to rear yard',()=>{
 const m=new InteriorMission('c09-n04',origin),a=original.find(t=>t.id==='c09-n04')!,b=original.find(t=>t.id==='c09-n10')!;
 m.step(actor(...b.points.at(-1)! as [number,number]));assert(!m.ready);
 m.step({...actor(...a.points.at(-1)! as [number,number]),active:false});assert(!m.ready);
 m.step(actor(...a.points.at(-1)! as [number,number]));assert(m.ready);assert.deepEqual(m.localRoute!.at(-1),b.points.at(-1));
});
test('merge preserves original ten records, hides only two redundant entries and joins routes continuously',()=>{
 assert.equal(original.length,10);assert.equal(MERGED_INTERIORS.length,8);
 for(const id of ['c09-n09','c09-n10'])assert(!MERGED_INTERIORS.some(t=>t.id===id));
 assert(MERGED_INTERIORS.find(t=>t.id==='c09-n01')!.length>100);
 assert(MERGED_INTERIORS.find(t=>t.id==='c09-n04')!.length>29);
});
test('bank guidance is visible from spawn but never enables remote cash pickup',()=>{
 const m=new InteriorMission('c09-n01',origin);
 for(const [x,z,name] of [[1,-17,"Office"],[8,-7,"Security anteroom"],[8,-2.2,"Equipment room"],[-1.2,2,"Security corridor"],[-8,5.8,"Vault"]] as const){
  assert(m.guidance(actor(x,z)).includes(name));assert(m.guidance(actor(x,z)).includes('cash safe'));
  assert.equal(m.prompt(actor(x,z)),'');assert(!m.interact(actor(x,z)));
 }
 assert.match(m.guidance(actor(-12,7.6)),/CASH/);
 assert(m.interact(actor(-13.2,7.6)));assert.match(m.guidance(actor(-13.2,7.6)),/Stolen money obtained/i);
 assert.equal(m.guidance({...actor(-13.2,7.6),active:false}),'');
 assert.deepEqual(BANK_INBOUND.at(-1),original[0].points.at(-1));
 assert.equal(original[0].rooms!.some(r=>r.id==='equipment-room'),false);
});
