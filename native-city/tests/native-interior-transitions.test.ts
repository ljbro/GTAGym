import test from 'node:test';import assert from 'node:assert/strict';
import {STORE_LAYOUT,STORE_STAIRS,storeStepHeight} from '../src/native-interior-video-layout.ts';
import {NATIVE_INTERIORS,interiorSolids,insideSolid} from '../src/native-interior-layout.ts';
import original from '../src/native-interior-tasks.json' with {type:'json'};
import {CityWalk} from '../src/city-walk.ts';
test('expanded store preserves source evidence and forces real aisle turns, not straight W',()=>{
 const task=NATIVE_INTERIORS.find(t=>t.id==='c09-n05')!,source=original.find(t=>t.id===task.id)!;
 assert(task.length>45&&task.length<50);assert.equal(source.length,13.025676109348877);assert.equal(source.source.metricStatus,'measured');assert.equal(task.source.metricStatus,'gameplay-adaptation');assert.deepEqual(task.times,[]);
 const solids=interiorSolids(task),w=new CityWalk((x,z)=>solids.some(s=>insideSolid(s,x,z)),storeStepHeight);w.active=true;[w.x,w.z]=task.points[0];w.yaw=0;w.resetMotion();
 for(let i=0;i<800;i++)w.step(new Set(['KeyW']),.025);
 assert(w.z<-3,'shelf physically stops forward-only movement');assert(w.z>STORE_LAYOUT.front,'can enter the door first');
 [w.x,w.z]=task.points[0];w.resetMotion();let steps=0;
 for(const p of task.points.slice(1))while(Math.hypot(w.x-p[0],w.z-p[1])>.12){assert(++steps<5000,JSON.stringify({position:[w.x,w.z],target:p}));w.yaw=Math.atan2(p[0]-w.x,p[1]-w.z);w.step(new Set(['KeyW']),.025);}
 assert.equal(w.feetY,.48);assert.equal(w.jumps,0);
});
test('store starts outside facade, ends on first stair treads, no invented upstairs route',()=>{
 const task=NATIVE_INTERIORS.find(t=>t.id==='c09-n05')!,s=STORE_STAIRS;
 assert(task.points[0][1]<STORE_LAYOUT.front);
 assert.equal(storeStepHeight(...task.points[0] as [number,number]),0);
 assert.equal(storeStepHeight(...task.points.at(-1)! as [number,number]),.48);
 assert(task.points.at(-1)![1]<s.endZ);
});
test('each stair tread and landing uses exact physical height without discontinuities over 16cm',()=>{
 const s=STORE_STAIRS;
 for(let i=0;i<s.count;i++)assert.equal(storeStepHeight(1,s.startZ+(i+.5)*s.tread),(i+1)*s.rise);
 assert.equal(storeStepHeight(1,s.landingEnd-.1),1.92);
 assert.equal(storeStepHeight(s.maxX+.1,12),0);
 let previous=0;for(let z=9.8;z<15.5;z+=.025){const h=storeStepHeight(1,z);assert(h-previous<=s.rise+1e-9);assert(h>=previous);previous=h;}
});
test('stairwell confines feet within supported treads; warehouse exit has an unobstructed loading bay',()=>{
 const store=NATIVE_INTERIORS.find(t=>t.id==='c09-n05')!,solids=interiorSolids(store);
 for(let z=10;z<15.4;z+=.1){assert(solids.some(s=>insideSolid(s,STORE_STAIRS.minX-.1,z)));assert(solids.some(s=>insideSolid(s,STORE_STAIRS.maxX+.1,z)));assert(!solids.some(s=>insideSolid(s,1.05,z)));}
 const bank=NATIVE_INTERIORS.find(t=>t.id==='c09-n03')!,walls=interiorSolids(bank);
 for(let x=10.8;x<17.4;x+=.1){assert(walls.some(s=>insideSolid(s,x,2.95)));assert(walls.some(s=>insideSolid(s,x,9.95)));assert(!walls.some(s=>insideSolid(s,x,6.44)));}
 assert(walls.some(s=>insideSolid(s,17.9,6.44)),'loading room closes beyond the goal');
 assert(!walls.some(s=>insideSolid(s,14.4,6.44)),'shutter exit goal remains accessible');
});
