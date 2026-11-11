import test from 'node:test';
import assert from 'node:assert/strict';
import {ladderContacts,linkPosition,walkTraversalPose,type WalkLink} from '../src/native-walk-traversal.ts';
import {CityWalk} from '../src/city-walk.ts';
const link:WalkLink={id:'roof-ladder',kind:'ladder',from:{x:0,y:0,z:-2.63},to:{x:0,y:5,z:2},top:5,duration:9,
 ladder:{plane:{x:0,y:0,z:-2.15},outward:{x:0,z:-1},bodyOffset:.48,rungSpacing:.3,firstRungY:.3}};
test('ladder body stays outside the rungs; reverse motion retraces the same supported path',()=>{
 const reverse={...link,from:link.to,to:link.from};
 for(let i=0;i<=100;i++){
  const t=i/100,p=linkPosition(link,t),q=linkPosition(reverse,1-t);
  assert(Math.hypot(p.x-q.x,p.y-q.y,p.z-q.z)<1e-8);
  if(t>=.12&&t<=.78)assert.equal(p.z,-2.63);
  if(p.z>-.001)assert(p.y>=5,'wall is crossed only above roof');
 }
 assert.deepEqual(linkPosition(link,0),link.from);assert.deepEqual(linkPosition(link,1),link.to);
});
test('offset trigger aligns to ladder instead of lifting vertically away from it',()=>{
 const offset={...link,from:{x:.7,y:0,z:-3.2}};
 assert.deepEqual(linkPosition(offset,0),offset.from);
 const aligned=linkPosition(offset,.12);assert.equal(aligned.x,0);assert.equal(aligned.z,-2.63);assert.equal(aligned.y,0);
});
test('rung contacts hold during stance and alternate during swing',()=>{
 const a=ladderContacts(link.ladder!,.6),b=ladderContacts(link.ladder!,.66);
 assert.equal(a.leftFoot.y,b.leftFoot.y,'planted foot does not slide with body');
 const c=ladderContacts(link.ladder!,.48);
 assert.notEqual(c.leftFoot.y,c.rightFoot.y);assert.notEqual(c.leftHand.y,c.rightHand.y);
 for(const p of Object.values(c))assert(Number.isFinite(p.y)&&p.z<0);
});
test('ascent and descent face the ladder, not the horizontal travel direction',()=>{
 for(const l of [link,{...link,from:link.to,to:link.from}]){
  const pose=walkTraversalPose(l,.5,linkPosition(l,.5),Math.PI)!;
  assert(Math.abs(pose.bodyYaw)<1e-8);assert.equal(pose.ladderContacts?.weight,1);
 }
 assert.equal(walkTraversalPose(link,1,link.to,0)?.ladderContacts?.weight,0);
});
test('legacy roof links use automatic mounting, W/S control and preserve contacts and completion IDs',()=>{
 const w=new CityWalk(()=>false,(_x,z)=>z>-.1?5:0);Object.assign(w,{active:true,x:0,z:-3.1,yaw:0});
 w.links=[link,{...link,id:'roof-down',from:link.to,to:link.from}];w.traversalClear=p=>p.z<0||p.y>=5;
 w.step(new Set(['KeyW']),.02);assert(w.traversing);assert(w.ladder);
 for(let i=0;i<50;i++)w.step(new Set(['KeyW']),.02);
 const middle=w.y;assert(w.traversalPose?.ladderContacts);for(let i=0;i<100;i++)w.step(new Set(),.02);assert.equal(w.y,middle);
 for(let i=0;i<500&&w.traversing;i++)w.step(new Set(['KeyW']),.02);
 assert(!w.traversing);assert(w.completedLinks.has(link.id));assert.equal(w.feetY,5);assert.equal(w.z,2);assert.equal(w.traversalPose,null);
 for(let i=0;i<40;i++)w.step(new Set(),.02);
 w.step(new Set(['KeyS']),.02);assert.equal(w.ladder?.phase,'enter');
 for(let i=0;i<500&&w.traversing;i++)w.step(new Set(['KeyS','ShiftLeft']),.02);
 assert.equal(w.y,0);assert.equal(w.z,-2.63);assert(w.completedLinks.has('roof-down'));assert.equal(w.traversalPose,null);
});
test('slide contacts hold the side rails while moving continuously instead of stepping rungs',()=>{
 const a=ladderContacts(link.ladder!,1.2,true),b=ladderContacts(link.ladder!,1.1,true);
 assert.equal(Math.abs(a.leftHand.x),.43);assert.equal(Math.abs(a.rightHand.x),.43);
 for(const key of ['leftHand','rightHand','leftFoot','rightFoot'] as const){assert(Math.abs(a[key].y-b[key].y-.1)<1e-8);assert.equal(a[key].x,b[key].x);assert.equal(a[key].z,b[key].z);}
});
