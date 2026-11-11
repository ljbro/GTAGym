import test from 'node:test';
import assert from 'node:assert/strict';
import {NavigationPolicePursuit} from '../src/offmap-navigation-police.ts';

test('stationary capture depends on first segment, not untravelled route suffix',()=>{
 const variants=[[[0,0],[0,5]],[[0,0],[0,5],[300,5],[300,600]],[[0,0],[0,5],[-400,5],[-400,-900]]];
 for(const blocked of [()=>false,()=>true,(p:{x:number;z:number})=>p.z>80&&p.z<90]){
  const results=variants.map(points=>{
   const police=new NavigationPolicePursuit({player:{spawn:{position:[0,0,0],yaw:0}},navigation:{path:points.map(p=>[p[0],0,-p[1]]),mode:'drive',category:'escape',indoors:false}} as any,20);
   for(let i=0;i<1200&&!police.capturedBy;i++){
    police.step(.05,{x:0,y:0,z:0},0,0,blocked,()=>0);
    if(!police.units.length)police.ensureMinimum(2);
   }
   // safeSeconds depends on total route length but does not control capture.
   return {capturedAt:police.capturedAt,units:police.units,events:police.events,spawned:police.spawned,retired:police.retired};
  });
  assert.deepEqual(results[0],results[1]);assert.deepEqual(results[0],results[2]);
 }
});
