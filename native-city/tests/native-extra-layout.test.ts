import test from 'node:test';
import assert from 'node:assert/strict';
import {EXTRA_LAYOUTS,EXTRA_INTERIOR_TASKS,extraFloorAt,extraBodyBlocked,extraMapPlan,EXTRA_SIGN_HEIGHT} from '../src/native-extra-layout.ts';
import {CityWalk} from '../src/city-walk.ts';
import {inRing} from '../src/driving.ts';

for(const e of EXTRA_LAYOUTS){
 test(`${e.id}: real walking and running can traverse the full authored route`,()=>{
  for(const keys of [new Set(['KeyW']),new Set(['KeyW','ShiftLeft'])]){
   const w=new CityWalk((x,z,y)=>extraBodyBlocked(e,x,z,y,0),(x,z)=>extraFloorAt(e,x,z,0)??0,{floorAt:(x,z,y)=>extraFloorAt(e,x,z,y)??0,ladders:[]});
   w.active=true;[w.x,w.z]=e.points[0];w.y=0;
   for(const [i,p] of e.points.entries()){
    let n=0;for(;n<2000&&Math.hypot(w.x-p[0],w.z-p[1])>.09;n++){
     w.yaw=Math.atan2(p[0]-w.x,p[1]-w.z);const old=w.y;w.step(keys,1/60);
     assert(Math.abs(w.y-old)<=.181,'no teleport between floors');
    }
    assert(n<2000,`blocked before waypoint ${i}: ${w.x},${w.z},${w.y}`);
   }
   assert(Math.abs(w.feetY-e.goalY)<.01);assert(w.grounded);assert.equal(w.jumps,0);
  }
 });
 test(`${e.id}: closed decoy doors have matching collision and minimap geometry`,()=>{
  const decoys=e.doors.filter(d=>d.decoy);assert(decoys.length>=3);
  for(const d of decoys){
   assert(!d.open);assert(extraBodyBlocked(e,d.x,d.z,d.y));
   assert(extraMapPlan(e,d.y).doors.some(r=>inRing(d.x,d.z,r)));
  }
 });
 test(`${e.id}: ground-floor reachable space is enclosed`,()=>{
  const step=.4,start=e.points[0],seen=new Set<string>(),queue=[[0,0]];
  for(let i=0;i<queue.length;i++){
   const [gx,gz]=queue[i],key=gx+','+gz;if(seen.has(key))continue;seen.add(key);
   const x=start[0]+gx*step,z=start[1]+gz*step;
   if(extraBodyBlocked(e,x,z,0))continue;
   assert(x>=e.bounds.minX&&x<=e.bounds.maxX&&z>=e.bounds.minZ&&z<=e.bounds.maxZ,'escape through exterior wall');
   for(const [dx,dz] of [[1,0],[-1,0],[0,1],[0,-1]])if(!seen.has((gx+dx)+','+(gz+dz)))queue.push([gx+dx,gz+dz]);
  }
  assert(seen.size>100);
 });
}
test('factory floor selection and map distinguish the stacked floors',()=>{
 const e=EXTRA_LAYOUTS.find(s=>s.id==='c09-n08')!,[x,z]=e.points.at(-1)!;
 assert.equal(extraFloorAt(e,x,z,.45),0);assert.equal(extraFloorAt(e,x,z,4),3.6);
 assert.notDeepEqual(extraMapPlan(e,0),extraMapPlan(e,3.6));
 assert.equal(extraMapPlan(e,0).floors.length,1);assert.equal(extraMapPlan(e,3.6).floors.length,4);
 assert(extraBodyBlocked(e,x,z,2),'upper slab cannot be crossed horizontally');
});
test('source layouts and video adaptation have explicit provenance and no invented measurement',()=>{
 for(const t of EXTRA_INTERIOR_TASKS){assert.match(t.source.sha256,/^[a-f0-9]{64}$/);assert.equal(t.source.metricStatus,'source-layout-adaptation');assert.equal(t.mode,'walk');}
 assert.equal(EXTRA_INTERIOR_TASKS.filter(t=>t.source.video).length,1);
});
test('all in-world signs in the three new interiors are English only',()=>{
 const signs=EXTRA_LAYOUTS.flatMap(e=>e.signs);assert.equal(signs.length,18);
 for(const s of signs)assert.match(s.text,/^[A-Z][A-Z /]*$/);
 for(const text of ['STAIRS','WORKSHOP','VAULT','SECURITY','SAFE AREA','EMERGENCY'])assert(signs.some(s=>s.text===text));
});
test('signboards clear heads and door headers without clipping through the ceiling',()=>{
 for(const e of EXTRA_LAYOUTS)for(const s of e.signs){
  const floor=extraFloorAt(e,s.x,s.z,s.y)??0,bottom=s.y-EXTRA_SIGN_HEIGHT/2,top=s.y+EXTRA_SIGN_HEIGHT/2;
  assert(bottom-floor>=2.7,`${e.id} ${s.text}: head clearance`);
  const ceiling=[...e.ceilings,...e.floors].filter(c=>c.y>s.y&&Math.abs(s.x-c.x)<=c.w/2&&Math.abs(s.z-c.z)<=c.d/2).sort((a,b)=>a.y-b.y)[0];
  assert(ceiling&&top<=ceiling.y-.03,`${e.id} ${s.text}: ceiling clearance`);
  for(const d of e.doors.filter(d=>Math.hypot(d.x-s.x,d.z-s.z)<.4))assert(bottom>d.y+d.h+.07,`${s.text}: above door header`);
 }
 const clinic=EXTRA_LAYOUTS.find(e=>e.id==='c09-n07')!;
 assert(clinic.signs.every(s=>s.y===3.05));
});
test('bank staff portal and archive T-junction no longer have unrendered gaps',()=>{
 const e=EXTRA_LAYOUTS.find(s=>s.id==='c09-n06')!;
 for(const z of [-13.45,-10.5,-10,-9.75])for(const y of [.3,1.6,3])assert(extraBodyBlocked(e,-17.5,z,y,0,.1),`${z},${y}`);
 for(const y of [.3,1.6,3])assert(extraBodyBlocked(e,6,2.075,y,0,.1),'15 cm T-junction');
 assert(!extraBodyBlocked(e,-17.5,-12,0,0),'real doorway stays open');
});
test('clinic portal side strips and lintels seal the full grid opening',()=>{
 const e=EXTRA_LAYOUTS.find(s=>s.id==='c09-n07')!;
 for(const d of e.doors){const c=Math.cos(d.yaw??0),s=Math.sin(d.yaw??0);
  for(const u of [-1.82,-1.7,1.7,1.82])for(const y of [.3,1.6,3])assert(extraBodyBlocked(e,d.x+c*u,d.z-s*u,y,0,.1),d.name);
  if(d.open)assert(!extraBodyBlocked(e,d.x,d.z,0,0),d.name+' remains passable');
 }
});
