import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import {createHash} from 'node:crypto';
import {CityCollision,closest,stepCar,manualSteeringInput} from '../src/driving.ts';
import {annotationTurns,nativeBends} from '../src/native-annotation-route.ts';
import {NativeNpcObjective,npcRules,routePose} from '../src/native-npc-objective.ts';
import {NATIVE_DRIVE_ASSIGNMENTS,NATIVE_TARGET_VEHICLES,nativeDriveFootprintClear} from '../src/native-drive-vehicle-spec.ts';
import {NavigationPolicePursuit} from '../src/offmap-navigation-police.ts';
import {driveCarRoute} from '../../tests/car-route-driver.ts';import type {V2} from '../src/city-types.ts';
const root=new URL('../../',import.meta.url),read=(p:string)=>JSON.parse(fs.readFileSync(new URL(p,root),'utf8'));
const routes=read('native-city/src/native-motorcycle-routes.json'),city=read('city/city.json'),collision=new CityCollision(city);
for(const route of routes.filter((r:any)=>r.category==='escape'))test(`${route.id}: police can spawn behind the initial stationary rider and capture`,()=>{
 const [p,q]=route.path.points,yaw=Math.atan2(q[0]-p[0],q[1]-p[1]);
 const police=new NavigationPolicePursuit({player:{spawn:{position:[p[0],0,-p[1]],yaw:-yaw}},navigation:{path:route.path.points.map((p:V2)=>[p[0],0,-p[1]]),mode:'drive',category:'escape',indoors:false}} as any,20);
 for(let i=0;i<1200&&!police.capturedBy;i++){police.step(.05,{x:p[0],y:0,z:-p[1]},-yaw,0,p=>collision.blocked(p.x,-p.z),()=>0);if(!police.units.length)police.ensureMinimum(2);}
 assert(police.spawned>0);assert(police.capturedBy,'Escape start must not be a police-free safe spot');
});
test('c05-n14: keyboard-range steering escapes with swept full-body collision checks',()=>{
 const r=routes.find((r:any)=>r.id==='c05-n14'),points=r.path.points as V2[],[a,b]=points;
 const state={x:a[0],z:a[1],yaw:Math.atan2(b[0]-a[0],b[1]-a[1]),speed:0,steer:0,distance:0};
 const police=new NavigationPolicePursuit({player:{spawn:{position:[a[0],0,-a[1]],yaw:-state.yaw}},navigation:{path:points.map(p=>[p[0],0,-p[1]]),mode:'drive',category:'escape',indoors:false}} as any,20);
 const result=driveCarRoute(points,state,(input,dt)=>{
  const limit=manualSteeringInput(1,state.speed),old={...state};
  stepCar(state,{...input,steer:Math.max(-limit,Math.min(limit,input.steer))},dt);
  const n=Math.max(1,Math.ceil(Math.hypot(state.x-old.x,state.z-old.z)/.3));
  for(let k=0;k<=n;k++)assert(nativeDriveFootprintClear(old.x+(state.x-old.x)*k/n,old.z+(state.z-old.z)*k/n,old.yaw+(state.yaw-old.yaw)*k/n,'motorcycle',(x,z)=>collision.blocked(x,z)),'swept rider footprint collided');
  police.step(dt,{x:state.x,y:0,z:-state.z},-state.yaw,state.speed,p=>collision.blocked(p.x,-p.z),()=>0);
  if(!police.units.length)police.ensureMinimum(2);assert.equal(police.capturedBy,null);
 },r.path.testDriveProfile);
 assert(result.complete);assert.equal(result.visited.length,points.length-2);assert(result.maxOffset<16);assert(result.maxStep<.96);assert(police.spawned>=2);
 // This bounds steering to manual reach, not a claim of recorded human input.
});
