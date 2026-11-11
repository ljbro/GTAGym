import test from 'node:test';import assert from 'node:assert/strict';
import {NativeShoreBoatMotion} from '../src/native-shore-boat-motion.ts';
import {NativeBoatMotion,boatPoint} from '../src/native-boat-motion.ts';
import {WATER_TRANSFER_SPECS} from '../src/native-water-transfer.ts';
import {loadWaterExpertEnvironment} from './water-expert-environment.ts';
import {fileURLToPath} from 'node:url';
const {env}=await loadWaterExpertEnvironment(fileURLToPath(new URL('../../',import.meta.url)));
for(const spec of WATER_TRANSFER_SPECS){
 for(const [name,u,v] of [['left',-2.8,0],['right',2.8,0],['bow',0,4.3],['stern',0,-4.3],['touching-side',1.44,0],['corner',1.5,3.6]] as const){
  test(spec.id+' F boards from '+name+' without teleporting through hull',()=>{
   const m=new NativeShoreBoatMotion(spec,env),p=boatPoint(m.boat.boat,u,v);
   m.shore.mode='swim';m.shore.walker.active=false;Object.assign(m.shore.swimmer,p,{depth:0});
   // This is the old failure: normal proximity to boat, outside tiny left spot.
   const old=m.boat.boardingPoint;assert(Math.hypot(p.x-old.x,p.z-old.z)>.75);
   m.interact();assert(m.boat.boardingApproach||m.mode==='boarding');
   const start={x:m.x,y:m.y,z:m.z};assert(Math.hypot(m.x-p.x,m.z-p.z)<1e-6);
   let last=start,n=0;
   while(m.mode!=='boat'&&n++<1200){
    if(m.mode==='swim')assert(!m.boat.hullBlocks(m.x,m.z));
    m.step(new Set(['KeyW']),1/60);
    // Swim exposes waterline, climb exposes feet, boat exposes hull center;
    // compare horizontal character motion before the seated reference switch.
    if(m.mode!=='boat')assert(Math.hypot(m.x-last.x,m.z-last.z)<.14,'Continuous approach/climb/seat transfer');
    if(m.mode!=='boat')assert.equal(m.boat.boat.speed,0);
    last={x:m.x,y:m.y,z:m.z};assert(!m.canFinish());
   }
   assert.equal(m.mode,'boat');assert(m.boat.boarded);assert(!m.boat.boardingApproach);
   m.interact();for(let k=0;k<300;k++)m.step(new Set(),1/60);
   assert.equal(m.mode,'swim');assert(!m.boat.hullBlocks(m.x,m.z),'Exit on selected side, outside hull');
   m.interact();for(let k=0;k<400;k++)m.step(new Set(),1/60);assert.equal(m.mode,'boat');
   m.reset();assert.equal(m.mode,'walk');assert(!m.boat.boardingApproach);
  });
 }
 test(spec.id+' distant, deep and obstructed boarding remain rejected; reset cancels approach',()=>{
  const m=new NativeShoreBoatMotion(spec,env);assert.match(m.interact(),/enter.*water/i);
  m.shore.mode='swim';Object.assign(m.shore.swimmer,boatPoint(m.boat.boat,7,0));m.interact();assert(!m.boat.boardingApproach);
  Object.assign(m.shore.swimmer,boatPoint(m.boat.boat,2.5,0),{depth:1});m.interact();assert(!m.boat.boardingApproach);
  m.shore.swimmer.depth=0;m.interact();assert(m.boat.boardingApproach);m.reset();assert(!m.boat.boardingApproach);assert.equal(m.mode,'walk');
  const blocked=new NativeBoatMotion(spec,()=>false);Object.assign(blocked.swimmer,boatPoint(blocked.boat,2.5,0));blocked.interact();assert(!blocked.boardingApproach);assert.equal(blocked.mode,'swim');
 });
}
