import {test} from 'node:test';
import assert from 'node:assert/strict';
import {CityWalk} from '../src/city-walk.ts';
import {linkPosition,type WalkLink} from '../src/native-walk-traversal.ts';
test('Space jumps once while held, lands, and does not pass through walls',()=>{
 const w=new CityWalk((_x,z)=>z>.65,()=>0);w.active=true;let peak=0;
 for(let i=0;i<100;i++){w.step(new Set(['Space','KeyW']),.02);peak=Math.max(peak,w.feetY);}
 assert(peak>.9&&peak<1.2);assert.equal(w.airborne,false);assert.equal(w.feetY,0);assert(w.z<.65);
 w.step(new Set(),.02);w.step(new Set(['Space']),.02);assert(w.airborne);
});
test('Space climbs and vaults only approved clear trajectories',()=>{
 const link:WalkLink={id:'rail',kind:'vault',from:{x:0,y:0,z:0},to:{x:0,y:0,z:2.4},top:1.1,duration:1.2};
 const w=new CityWalk((_x,z)=>z>.9&&z<1.5,()=>0);w.active=true;w.links=[link];
 w.traversalClear=p=>!(p.z>.7&&p.z<1.7&&p.y<1.1);
 for(let i=0;i<100;i++)w.step(new Set(['Space']),.02);
 assert(w.completedLinks.has('rail'));assert.equal(w.z,2.4);assert.equal(w.feetY,0);assert(!w.traversing);
 w.x=w.z=0;w.resetMotion();w.traversalClear=()=>false;w.step(new Set(['Space']),.02);assert(!w.traversing);assert.equal(w.z,0);
});
test('ladder rises outside wall and descends outside wall without entering solid volume',()=>{
 const up:WalkLink={id:'ladder',kind:'ladder',from:{x:0,y:0,z:0},to:{x:0,y:5,z:3},top:5,duration:5,ladder:{plane:{x:0,y:0,z:.48},outward:{x:0,z:-1},bodyOffset:.48,rungSpacing:.3,firstRungY:.3}};
 for(const link of [up,{...up,from:up.to,to:up.from}])for(let i=0;i<=100;i++){const p=linkPosition(link,i/100);assert(p.z<=.001||p.y>=5);}
 const w=new CityWalk(()=>false,(_x,z)=>z>1?5:0);w.active=true;w.links=[up];w.traversalClear=p=>p.z<=.001||p.y>=5;
 w.step(new Set(['KeyW']),.02);assert(w.ladder);
 for(let i=0;i<270&&w.traversing;i++)w.step(new Set(['KeyW']),.02);assert(w.completedLinks.has('ladder'));assert.equal(w.feetY,5);assert.equal(w.z,3);
});
test('exit requires parked car, falls back to clear side, does not move car',()=>{
 const c={x:0,z:0,yaw:0,speed:2},w=new CityWalk(x=>x>0,()=>0);
 assert.equal(w.exitCar(c),false);c.speed=0;assert.equal(w.exitCar(c),true);assert.equal(w.x,-1.9);assert.equal(c.x,0);
});
test('walking cannot cross water/building or a large height step; diagonals normalize',()=>{
 const w=new CityWalk(x=>x>2,()=>0);w.active=true;
 for(let i=0;i<60;i++)w.step(new Set(['KeyD']),.05);assert.ok(w.x<=2);
 const cliff=new CityWalk(()=>false,(_x,z)=>z>1?3:0);cliff.active=true;
 for(let i=0;i<60;i++)cliff.step(new Set(['KeyW']),.05);assert.ok(cliff.z<=1);
 const a=new CityWalk(()=>false,()=>0),b=new CityWalk(()=>false,()=>0);a.active=b.active=true;a.step(new Set(['KeyW']),.05);b.step(new Set(['KeyW','KeyD']),.05);assert.ok(Math.abs(a.distance-b.distance)<1e-8);
});

test('walking reports speed and stops immediately when released for stationary work',()=>{
 const w=new CityWalk(()=>false,()=>0);w.active=true;w.step(new Set(['KeyW']),.05);assert.ok(w.speed>1);w.step(new Set(),.05);assert.equal(w.speed,0);
});

test('exit checks full body width and rejects a bridge-side drop',()=>{
 const car={x:0,z:0,yaw:0,speed:0};
 const w=new CityWalk((x,z)=>x>0&&Math.abs(z)>.1,()=>0);
 assert(w.exitCar(car));assert(w.x<0,'positive door fits a point but not the body');
 const bridge=new CityWalk(()=>false,x=>Math.abs(x)>1.5?0:6);
 assert.equal(bridge.exitCar(car),false);
});
test('entry requires same height and a clear route to a vehicle door',()=>{
 const car={x:0,z:0,yaw:0,speed:0};
 const w=new CityWalk(x=>Math.abs(x-2.5)<.12,()=>0);Object.assign(w,{active:true,x:3.3,z:0});
 assert.equal(w.canEnter(car),false,'cannot enter across a wall');
 const bridge=new CityWalk(()=>false,x=>x>2.5?0:6);Object.assign(bridge,{active:true,x:3,z:0});assert.equal(bridge.canEnter(car),false);
 const clear=new CityWalk(()=>false,()=>0);Object.assign(clear,{active:true,x:2,z:0});assert(clear.canEnter(car));
});
test('walking queries live collision state and follows ramps and steps',()=>{
 let wall=true;const w=new CityWalk((_x,z)=>wall&&z>.8,(_x,z)=>z*.08+(z>2?.15:0));w.active=true;
 for(let i=0;i<25;i++)w.step(new Set(['KeyW']),.05);assert(w.z<.8);
 wall=false;for(let i=0;i<35;i++)w.step(new Set(['KeyW']),.05);assert(w.z>2);assert(w.eye.y>1.8);
});
test('camera zoom stays finite and bounded; diagonal running is normalized',()=>{
 const a=new CityWalk(()=>false,()=>0),b=new CityWalk(()=>false,()=>0);a.active=b.active=true;
 a.step(new Set(['KeyW','ShiftLeft']),.05);b.step(new Set(['KeyW','KeyD','ShiftLeft']),.05);assert(Math.abs(a.distance-b.distance)<1e-7);
 for(let i=0;i<200;i++)a.zoom(1000);assert.equal(a.cameraDistance,7);for(let i=0;i<200;i++)a.zoom(-1000);assert.equal(a.cameraDistance,1.5);
});
