import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {CityCollision} from '../src/driving.ts';
import {RoadGraph} from '../src/navigation.ts';
import {NavigationPolicePursuit,policeSectorPolygon,policeSectorOrigin,insidePoliceSector} from '../src/offmap-navigation-police.ts';
import {minimapPointVisible,minimapVisibleWidth} from '../src/minimap-viewport.ts';
const p={x:0,y:0,z:0},task={player:{spawn:{position:[0,0,0],yaw:0}},navigation:{path:[[0,0,0],[0,0,-1000]],mode:'drive',category:'escape'}} as any;
const visible=(q:typeof p,player:typeof p,yaw:number,speed:number)=>minimapPointVisible(q.x-player.x,player.z-q.z,-yaw,minimapVisibleWidth({speed}),.4+Math.min(1,Math.abs(speed)/28)*.25);
const create=()=>new NavigationPolicePursuit(task,20,{mode:'minimap',visible});
for(const mode of ['walk','drive','boat'])test(`${mode} opening pair is 20% closer; timed and empty-radar additions keep their distance`,()=>{
 let ready=false;
 const make=()=>new NavigationPolicePursuit({...task,navigation:{...task.navigation,mode:mode==='walk'?'walk':'drive'}},mode==='boat'?16:20,{
  mode:'minimap',visible:(q,p)=>Math.hypot(q.x-p.x,q.z-p.z)<=100,ready:()=>ready,
 });
 const n=make(),step=()=>{
  for(const u of n.units){u.position={...n.events.find(e=>e.id===u.id)!.position};u.speed=0;}
  n.step(.1,p,0,0,()=>false,()=>0);
 };
 // Asset loading may delay the opening pair beyond the first timed addition.
 for(let i=0;i<110;i++)step();ready=true;
 for(let i=0;i<20;i++)step();
 assert.equal(n.spawned,3);
 const distance=(index:number)=>Math.hypot(n.events[index].position.x,n.events[index].position.z);
 assert(Math.abs(distance(0)-75.2)<.02);assert(Math.abs(distance(1)-75.2)<.02);
 assert(Math.abs(distance(2)-94)<.02,'10-second addition remains at the original edge');
 assert(n.units.every(u=>!insidePoliceSector(u,p)),'opening is outside capture range');
 n.units=[];for(let i=0;i<7;i++)step();assert.equal(n.spawned,5);
 assert(Math.abs(distance(3)-94)<.02);assert(Math.abs(distance(4)-94)<.02);
 const restarted=make();restarted.step(.1,p,0,0,()=>false,()=>0);
 assert(Math.abs(Math.hypot(restarted.events[0].position.x,restarted.events[0].position.z)-75.2)<.02);
});
for(const [mode,playerSpeed,expected] of [['walk',20,3.8],['drive',20,23],['boat',16,18.4]] as const){
 test(`${mode} pursuer reaches its configured speed on a clear straight approach`,()=>{
  const n=new NavigationPolicePursuit({...task,navigation:{...task.navigation,mode:mode==='walk'?'walk':'drive'}},playerSpeed,{mode:'minimap',visible:()=>true});
  n.units.push({id:'speed-test',position:{x:0,y:0,z:220},yaw:0,speed:0,cursor:0,bornAt:0,scheduledAt:0,stuckSeconds:0,kind:mode==='walk'?'foot':'vehicle'});
  for(let i=0;i<60;i++)n.step(.1,p,0,0,()=>false,()=>0);
  assert(Math.abs(n.units[0].speed-expected)<1e-6,`${n.units[0].speed} != ${expected}`);
  const before=n.units[0].position.z;n.step(.1,p,0,0,()=>true,()=>0);
  assert.equal(n.units[0].position.z,before,'blocked pursuers still stop without moving through geometry');
  assert.equal(n.units[0].speed,0);
 });
}
test('empty radar queues one pair; safe front and side spawn and approach the player',()=>{
 const n=create();for(let i=0;i<7;i++)n.step(.1,p,0,0,()=>false,()=>0);
 assert.equal(n.spawned,2);assert.equal(n.events.length,2);
 assert(n.events[0].position.z< -35,'front, not rear trail');assert(n.events[1].position.x< -35,'left flank');
 for(const event of n.events){assert(visible(event.position,p,0,0));assert(Math.hypot(event.position.x,event.position.z)>35);}
 for(const u of n.units){const born=n.events.find(e=>e.id===u.id)!.position;assert(Math.hypot(u.position.x,u.position.z)<Math.hypot(born.x,born.z));}
 assert.equal(n.snapshot().nextSpawnAt,10);assert.equal(n.snapshot().rules.intervalSeconds,10);
});
test('visible police still receive exactly one timed addition at 10/20/30 seconds',()=>{
 const n=create();for(let i=0;i<7;i++)n.step(.1,p,0,0,()=>false,()=>0);
 for(let i=0;i<320;i++){
  for(const u of n.units){u.position={...n.events.find(e=>e.id===u.id)!.position};u.speed=0;}
  n.step(.1,p,0,0,()=>false,()=>0);
 }
 assert.equal(n.spawned,5);assert.deepEqual(n.events.slice(2).map(e=>e.scheduledAt),[10,20,30]);
 assert.equal(n.snapshot().pendingSpawns,0);assert.equal(n.capturedBy,null);
});
test('police outside rectangular radar trigger visible reinforcements within retirement distance',()=>{
 const n=create();for(let i=0;i<7;i++)n.step(.1,p,0,0,()=>false,()=>0);
 for(const u of n.units){u.position={x:220,y:0,z:0};u.yaw=-Math.PI/2;u.speed=0;assert(!visible(u.position,p,0,0));assert(policeSectorPolygon(u).every(q=>!visible(q,p,0,0)));}
 for(let i=0;i<7;i++)n.step(.1,p,0,0,()=>false,()=>0);
 assert.equal(n.spawned,4);assert(n.events[2].position.x>35,'right flank is also used');
 // The off-centre rectangular map has little room behind a stationary player.
 // A clipped rear candidate must fall back to a visible direction, not spawn off-map.
 for(const event of n.events.slice(2))assert(visible(event.position,p,0,0),'refills stay inside the actual rectangular radar');
});
test('rear reinforcement remains available when the radar has visible rear coverage',()=>{
 const broadRadar=(q:typeof p,player:typeof p)=>Math.hypot(q.x-player.x,q.z-player.z)<=150;
 const n=new NavigationPolicePursuit(task,20,{mode:'minimap',visible:broadRadar});
 for(let i=0;i<7;i++)n.step(.1,p,0,0,()=>false,()=>0);
 for(const u of n.units){u.position={x:220,y:0,z:0};u.yaw=-Math.PI/2;u.speed=0;assert(policeSectorPolygon(u).every(q=>!broadRadar(q,p)));}
 for(let i=0;i<7;i++)n.step(.1,p,0,0,()=>false,()=>0);
 assert.equal(n.spawned,4);assert(n.events[3].position.z>35,'rear remains available when visible');
 for(const event of n.events.slice(2))assert(broadRadar(event.position,p));
});
test('blocked sites queue only the initial pair plus one per timer, never a pair per frame',()=>{
 const n=create();for(let i=0;i<200;i++)n.step(.1,p,0,0,()=>true,()=>0);
 assert.equal(n.spawned,0);assert.equal(n.snapshot().pendingSpawns,4);
 for(let i=0;i<22;i++)n.step(.1,p,0,0,()=>false,()=>0);
 assert.equal(n.spawned,4);assert.equal(n.snapshot().pendingSpawns,0);
});
test('empty-radar refill does not postpone the timer; coincident refill/timer does not duplicate',()=>{
 const n=create();
 const step=()=>{for(const u of n.units){u.position={...n.events.find(e=>e.id===u.id)!.position};u.speed=0;}n.step(.1,p,0,0,()=>false,()=>0);};
 for(let i=0;i<80;i++)step();
 n.units=[];step();assert.equal(n.spawned,3,'empty radar refills in the very next frame');
 for(let i=0;i<19;i++)step();
 assert.equal(n.spawned,5);assert.equal(n.events.at(-1)!.scheduledAt,10);
 for(let i=0;i<99;i++)step();
 n.units=[];step();assert.equal(n.spawned,6);assert.equal(n.events.at(-1)!.scheduledAt,20);
 assert.equal(n.snapshot().pendingSpawns,0,'timed spawn also satisfies the empty-radar safeguard');
 const before=n.snapshot();n.step(0,p,0,0,()=>false,()=>0);assert.equal(n.elapsed,before.elapsed);
 assert.equal(n.nextSpawnAt,30);const restarted=create();assert.equal(restarted.elapsed,0);assert.equal(restarted.nextSpawnAt,10);
});
for(const mode of ['walk','drive','boat'])test(`${mode} escape keeps timed additions through 180 seconds`,()=>{
 const n=new NavigationPolicePursuit({...task,navigation:{...task.navigation,mode:mode==='walk'?'walk':'drive'}},mode==='boat'?16:20,{mode:'minimap',visible});
 for(let i=0;i<1800;i++){
  for(const u of n.units){u.position={...n.events.find(e=>e.id===u.id)!.position};u.speed=0;}
  n.step(.1,p,0,0,()=>false,()=>0);
 }
 assert.equal(n.spawned,20);assert.deepEqual(n.events.slice(2).map(e=>e.scheduledAt),Array.from({length:18},(_,i)=>(i+1)*10));
});
test('model readiness defers spawning, preserving requests until an officer can be visible',()=>{
 let ready=false;const n=new NavigationPolicePursuit(task,20,{mode:'minimap',visible,ready:()=>ready});
 for(let i=0;i<110;i++)n.step(.1,p,0,0,()=>false,()=>0);
 assert.equal(n.spawned,0);assert.equal(n.snapshot().pendingSpawns,3);
 ready=true;for(let i=0;i<20;i++)n.step(.1,p,0,0,()=>false,()=>0);
 assert.equal(n.spawned,3);assert.equal(n.snapshot().pendingSpawns,0);
});
test('blocked preferred front falls back to a safe side, respects terrain height',()=>{
 const n=create();for(let i=0;i<7;i++)n.step(.1,p,0,0,q=>q.z< -30,()=>0);
 assert.equal(n.spawned,2);assert(n.events.every(e=>e.position.z>=-30));
 const cliff=create();for(let i=0;i<15;i++)cliff.step(.1,p,0,0,()=>false,()=>20);
 assert.equal(cliff.spawned,0);
});
test('radar visibility follows perspective, heading and speed rather than a fixed radius',()=>{
 assert(!visible({x:150,y:0,z:0},p,0,0));assert(visible({x:150,y:0,z:0},p,0,30));
 assert(visible({x:0,y:0,z:-160},p,0,0));assert(!visible({x:0,y:0,z:160},p,0,0));
 assert(visible({x:0,y:0,z:160},p,Math.PI,0));
});
test('walking escape uses running officers, a human footprint and matching body-front sector',()=>{
 const n=new NavigationPolicePursuit({...task,navigation:{...task.navigation,mode:'walk'}},20,{mode:'minimap',visible:(q,p,yaw,speed)=>minimapPointVisible(q.x-p.x,p.z-q.z,-yaw,minimapVisibleWidth({walking:true,speed}),.4)});
 const radii:number[]=[];for(let i=0;i<60;i++)n.step(.1,p,0,0,(_q,r)=>{radii.push(r);return false;},()=>0);
 assert.equal(n.units.length,2);assert(n.units.every(u=>u.kind==='foot'&&u.speed>3.7&&u.speed<=3.8));assert(radii.every(r=>r===.35));
 const unit=n.units[0],origin=policeSectorOrigin(unit);assert(Math.abs(Math.hypot(origin.x-unit.position.x,origin.z-unit.position.z)-.4)<1e-6);
 for(const point of policeSectorPolygon(unit).slice(1))assert(insidePoliceSector(unit,point));
 for(let i=0;i<600&&!n.capturedBy;i++)n.step(.1,p,0,0,()=>false,()=>0);
 assert(n.capturedBy,'officers can run to a stationary player and capture after holding their sector');
});
test('native city c05-n10 spawns a visible pair on collision-clear land and approaches',()=>{
 const read=(path:string)=>JSON.parse(fs.readFileSync(new URL('../../'+path,import.meta.url),'utf8'));
 const city=read('city/city.json'),collision=new CityCollision(city),graph=new RoadGraph(city.roads,read('city/navigation.json'));
 const [route]=read('native-city/src/native-police-escape-routes.json'),[a,b]=route.path.points;
 const player={x:a[0],y:0,z:-a[1]},yaw=-Math.atan2(b[0]-a[0],b[1]-a[1]);
 const n=new NavigationPolicePursuit({player:{spawn:{position:[player.x,0,player.z],yaw}},navigation:{path:route.path.points.map(([x,z]:number[])=>[x,0,-z]),mode:'drive',category:'escape'}} as any,20,{
  mode:'minimap',visible,snap:q=>{const near=collision.nearest(q.x,-q.z);return near&&near.d<24?{x:near.x,y:0,z:-near.z}:q;},
  approach:(a,b)=>graph.route([a.x,-a.z],[b.x,-b.z]).map(([x,z])=>({x,y:0,z:-z})),
 });
 for(let i=0;i<20;i++)n.step(.1,player,yaw,0,q=>collision.blocked(q.x,-q.z),()=>0);
 assert.equal(n.spawned,2);assert(n.events.every(e=>visible(e.position,player,yaw,0)&&!collision.blocked(e.position.x,-e.position.z)));
 assert(n.events.some(e=>(e.position.x-player.x)*-Math.sin(yaw)+(e.position.z-player.z)*-Math.cos(yaw)>-8),'not rear-only');
 for(let i=0;i<500&&!n.capturedBy;i++)n.step(.1,player,yaw,0,q=>collision.blocked(q.x,-q.z),()=>0);
 assert(n.capturedBy,'stationary player can be reached by new approach logic');
});
