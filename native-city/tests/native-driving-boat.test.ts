import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import {createHash} from 'node:crypto';
import {NativeBoatMotion,boatPoint} from '../src/native-boat-motion.ts';import {waterRegionContains,waterLocal} from '../src/native-water-motion.ts';import {CityCollision,inRing} from '../src/driving.ts';import {annotationTurns,nativeBends} from '../src/native-annotation-route.ts';
import {driveBoatRoute} from '../../tests/boat-route-driver.ts';
const root=new URL('../../',import.meta.url),read=(p:string)=>JSON.parse(fs.readFileSync(new URL(p,root),'utf8')),specs=read('native-city/src/native-driving-boat-routes.json'),city=read('city/city.json'),collision=new CityCollision(city);
const sea=(x:number,z:number)=>!city.land.some((p:any)=>inRing(x,z,p[0])&&!p.slice(1).some((h:any)=>inRing(x,z,h)));
test('curved route boat starts aboard, physically steers through every annotated vertex and completes',()=>{
 for(const s of specs){const m=new NativeBoatMotion(s,sea);assert.equal(m.mode,'boat');assert(m.boarded);assert.equal(m.x,s.path.points[0][0]);const r=driveBoatRoute(m);assert(r.complete,s.id);assert(r.ticks<10000);assert(r.maxStep<.201);assert.deepEqual(r.visited,s.path.points.slice(1,-1).map((_:unknown,i:number)=>i+1));
  m.reset();assert.equal(m.mode,'boat');assert.equal(m.speed,0);assert(!m.canFinish());assert.equal(m.x,s.path.points[0][0]);
 }
});
test('curved route rejects swim arrival, preserves F reboarding and bounds protect the full hull',()=>{
 for(const s of specs){const m=new NativeBoatMotion(s,sea);
  const beyond=s.path.points.find((p:number[])=>Math.abs(waterLocal(s,p[0],p[1])[0])>50);[m.boat.x,m.boat.z]=beyond;
  m.interact();for(let i=0;i<180;i++)m.step(new Set(),.025);assert.equal(m.mode,'swim');const p=m.boardingPoint;assert(Math.hypot(m.x-p.x,m.z-p.z)<.001);
  m.step(new Set(['KeyW']),.1);assert(Math.hypot(m.x-p.x,m.z-p.z)>.1,'Swimming after a turn must not be trapped in the legacy strip');m.step(new Set(['KeyS']),.1);
  m.interact();for(let i=0;i<192;i++)m.step(new Set(),.025);assert.equal(m.mode,'boat');
  m.mode='swim';[m.swimmer.x,m.swimmer.z]=s.path.points.at(-1);assert(!m.canFinish());m.reset();
  m.boat.x=s.region.maxX-m.fit.length/2-1;m.boat.z=(s.region.minZ+s.region.maxZ)/2;m.boat.yaw=Math.PI/2;
  for(let i=0;i<400;i++)m.step(new Set(['KeyW']),.025);const nose=boatPoint(m.boat,0,m.fit.length/2);assert(waterRegionContains(s,nose.x,nose.z));assert.equal(m.boat.speed,0);
 }
});
