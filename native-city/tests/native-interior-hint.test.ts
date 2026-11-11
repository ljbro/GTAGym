import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {InteriorHint,INTERIOR_HINT_TEXT,interiorHintCandidate} from '../src/native-interior-hint.ts';
import {InteriorMission} from '../src/native-interior-mission.ts';
import {WarehouseShutter} from '../src/native-warehouse-shutter.ts';
const origin={x:100,y:3,z:200};
const actor=(x:number,z:number)=>({active:true,x:x+origin.x,z:z+origin.z,feetY:3,airborne:false,traversing:false});
const site=(id:string)=>({mission:new InteriorMission(id,origin),shutter:new WarehouseShutter(origin),interactionHint:new InteriorHint()});
const hint=(s:ReturnType<typeof site>,a:ReturnType<typeof actor>,dt=0,enabled=true)=>s.interactionHint.step(interiorHintCandidate(s.mission,s.shutter,a),dt,enabled);
test('first encounter only; lingering, leaving, returning and expiry do not retrigger',()=>{
 const h=new InteriorHint();
 assert.equal(h.step(null,1),'');
 assert.equal(h.step('safe',.02),INTERIOR_HINT_TEXT.safe);
 assert.equal(h.step(null,4),INTERIOR_HINT_TEXT.safe);
 assert.equal(h.step('safe',4),'');
 assert.equal(h.step(null,1),'');
 assert.equal(h.step('safe',1),'');
 assert.equal(h.step('shutter',.02),INTERIOR_HINT_TEXT.shutter);
 assert.equal(new InteriorHint().step('safe',0),INTERIOR_HINT_TEXT.safe);
});
test('pause does not consume encounters or advance the hint timer',()=>{
 const h=new InteriorHint();assert.equal(h.step('cover',100,false),'');assert.deepEqual(h.snapshot.seen,[]);
 h.step('cover',.02);const before=h.snapshot;h.step('cover',100,false);assert.deepEqual(h.snapshot,before);
 assert.equal(h.step(null,0),INTERIOR_HINT_TEXT.cover);
});
test('bank safe and shutter each get one hint; no keys are required at spawn',()=>{
 const s=site('c09-n01');s.shutter.ready=true;
 assert.equal(hint(s,actor(1,-17)),'');
 assert.equal(hint(s,actor(-13.2,7.6)),INTERIOR_HINT_TEXT.safe);
 assert.equal(hint(s,actor(-13.2,7.6),8),'');
 assert(s.mission.interact(actor(-13.2,7.6)),'expiration must not disable E');
 assert.equal(hint(s,actor(9,6.44)),INTERIOR_HINT_TEXT.shutter);
 assert(s.shutter.interact(actor(9,6.44)));
 assert.equal(hint(s,actor(9,6.44),8),'');
});
test('cover hint requires the correct wall side and floor; Q still works after expiry',()=>{
 const s=site('c09-n02');
 assert.equal(hint(s,actor(5,17.5)),'');
 assert.equal(hint(s,{...actor(5,20.8),feetY:5}),'');
 assert.equal(hint(s,actor(5,20.8)),INTERIOR_HINT_TEXT.cover);
 assert.equal(hint(s,actor(5,20.8),8),'');
 assert(s.mission.takeCover({...actor(5,20.8),enterCover:()=>true}));
 s.mission.step({...actor(5,20.8),coverCrouched:false});
 assert.equal(hint(s,actor(5,20.8)),'','standing again must not repeat the hint');
});
