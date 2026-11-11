import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import {createHash} from 'node:crypto';
import {NativeBoatMotion,type BoatSpec} from '../src/native-boat-motion.ts';
import {channelBank,channelContains,waterChannelPath} from '../src/native-water-channel.ts';
import {annotationTurns,nativeBends} from '../src/native-annotation-route.ts';
import {inRing} from '../src/driving.ts';import {NavigationPolicePursuit} from '../src/offmap-navigation-police.ts';
import {driveBoatRoute} from '../../tests/boat-route-driver.ts';
const root=new URL('../../',import.meta.url),read=(p:string)=>JSON.parse(fs.readFileSync(new URL(p,root),'utf8'));
const routes=read('native-city/src/native-water-escape-routes.json'),city=read('city/city.json');
for(const r of routes){
 const route=r as BoatSpec,channel=waterChannelPath(route),sea=(x:number,z:number)=>channelContains(channel,r.channelHalfWidth,x,z)&&!city.land.some((p:number[][][])=>inRing(x,z,p[0] as any)&&!p.slice(1).some(h=>inRing(x,z,h as any)));
 test(`${r.id}: ordinary jet-ski steering reaches endpoint while real water pursuers stay in the channel`,()=>{
  const boat=new NativeBoatMotion(route,sea),p=route.path.points[0];
  const police=new NavigationPolicePursuit({player:{spawn:{position:[p[0],r.waterHeight,-p[1]],yaw:-boat.yaw}},navigation:{path:route.path.points.map(p=>[p[0],r.waterHeight,-p[1]]),mode:'boat',category:'escape'}}as any,16);
  let maxPolice=0;
  const result=driveBoatRoute(boat,()=>{
   police.step(.025,{x:boat.x,y:r.waterHeight,z:-boat.z},-boat.yaw,boat.speed,p=>!sea(p.x,-p.z),()=>r.waterHeight);if(!police.units.length)police.ensureMinimum(2);maxPolice=Math.max(maxPolice,police.units.length);
   assert.equal(police.capturedBy,null);for(const u of police.units){assert(sea(u.position.x,-u.position.z));assert.equal(u.position.y,r.waterHeight);}
  });
  assert(result.complete);assert.equal(result.visited.length,r.path.points.length-2);assert(result.maxStep<.401);assert(maxPolice>=2);
  boat.mode='swim';assert.equal(boat.canFinish(),false);boat.reset();assert.equal(boat.mode,'boat');assert(!boat.canFinish());
 });
 test(`${r.id}: banks block boat/swimmer and F boarding remains available`,()=>{
  const boat=new NativeBoatMotion(route,sea),p=boat.boardingPoint;
  assert.match(boat.interact(),/enter(?:ing)? (?:the )?water/i);for(let i=0;i<80;i++)boat.step(new Set(),.025);assert.equal(boat.mode,'swim');assert(Math.hypot(boat.x-p.x,boat.z-p.z)<.01);
  assert.match(boat.interact(),/board/i);for(let i=0;i<90;i++)boat.step(new Set(),.025);assert.equal(boat.mode,'boat');
  const [x,z]=route.path.points[0],right=route.path.right;
  assert(!boat.swimmer.clear(x+right[0]*(r.channelHalfWidth+2),z+right[1]*(r.channelHalfWidth+2)));
  boat.boat.yaw+=Math.PI/2;for(let i=0;i<300;i++)boat.step(new Set(['KeyW']),.025);assert(sea(boat.x,boat.z));assert.equal(boat.boat.speed,0);
 });
}
