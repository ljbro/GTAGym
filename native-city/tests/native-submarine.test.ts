import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {NativeSubmarineMotion} from '../src/native-submarine-motion.ts';
import {MarineFacilityLayout,SUBMARINE_TASK,MARINE_PIPE} from '../src/native-marine-facility.ts';
import {nativeWaterTiming} from '../src/native-water-timing.ts';
import {loadWaterExpertEnvironment} from './water-expert-environment.ts';
import {fileURLToPath} from 'node:url';
const root=new URL('../../',import.meta.url);
test('surface proximity, pipe wall, back entry and seabed cannot complete',()=>{
 const m=new NativeSubmarineMotion();[m.x,m.z]=m.layout.world(0,115);assert(!m.canFinish());
 m.depth=12;assert(!m.canFinish(),'teleporting inside is not front entry');
 const [x,z]=m.layout.world(4,105);assert(!m.clear(x,z,m.y,m.yaw));
 const p=m.layout.world(0,127);assert(!m.clear(...p,m.y,m.yaw));
 assert(!m.clear(m.x,m.z,-18,m.yaw));
});
test('full hull collision, turn collision, and frame substeps',()=>{
 const m=new NativeSubmarineMotion();[m.x,m.z]=m.layout.world(9,85);m.depth=12;
 for(let i=0;i<100;i++)m.step(new Set(['KeyW']),.25);
 assert(m.layout.local(m.x,m.z)[1]<91.7-3,'bow cannot pass solid intake facade');assert(!m.canFinish());
 const a=new NativeSubmarineMotion(),b=new NativeSubmarineMotion(),keys=new Set(['KeyW','ControlLeft']);
 for(let i=0;i<600;i++)a.step(keys,1/60);for(let i=0;i<40;i++)b.step(keys,.25);
 assert(Math.abs(a.x-b.x)<1e-7);assert(Math.abs(a.depth-b.depth)<1e-7);
 a.reset();assert.equal(a.enteredPipe,false);assert.equal(a.depth,SUBMARINE_TASK.startDepth);
});
test('mouse orbits without steering, pause freezes motion, reset restores third person',()=>{
 const m=new NativeSubmarineMotion(),yaw=m.yaw;m.look(100,10);assert.equal(m.yaw,yaw);assert(m.orbitYaw>0);
 const before=JSON.stringify(m.diagnostics());m.step(new Set(['KeyW','ControlLeft']),0);assert.equal(JSON.stringify(m.diagnostics()),before);
 m.toggleView();assert(m.firstPerson);m.reset();assert(!m.firstPerson);assert.equal(m.orbitYaw,0);
});
test('submarine retains alternating breakwater openings after ordinary water rollback',()=>{
 const layout=new MarineFacilityLayout(SUBMARINE_TASK);
 for(const [v,u] of [[30,12],[58,-12]]){
  assert(!layout.clear(0,-12,v,1.4));assert(layout.clear(u,-12,v,1.4));
  assert(!layout.clear(0,-.5,v,1.4));
 }
 assert.equal(SUBMARINE_TASK.path.points.length,8);
});
test('facility placement stays in the original native bay, not under city land',async()=>{
 const {env}=await loadWaterExpertEnvironment(fileURLToPath(root)),layout=new MarineFacilityLayout(SUBMARINE_TASK);
 for(let u=-50;u<=50;u+=10)for(let v=-10;v<=140;v+=10){const [x,z]=layout.world(u,v);assert(!env.land(x,z),`Land overlaps facility at ${u},${v}`);}
 assert(layout.clear(0,layout.pipeY,MARINE_PIPE.mouth+3,1.4));
 for(const b of layout.boxes.filter(b=>b.name==='pipe-saddle')){assert(b.y+b.h/2<=layout.pipeY-MARINE_PIPE.outer+1e-8,'saddle supports outer pipe, not its interior');assert(b.y-b.h/2<layout.floor(b.u,b.v));}
 assert(!layout.clear(12,-8,120,1.4),'utility pipes are solid');
 const rock=layout.rocks[0];assert(!layout.clear(rock.u,rock.y,rock.v,1.4),'rocks are solid');
 for(const b of layout.boxes.filter(b=>b.name==='support-pile'))assert(b.y-b.h/2<=layout.floor(b.u,b.v)+.01);
});
