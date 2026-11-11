import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import {createHash} from 'node:crypto';
import {NativeBoatMotion,boatPoint} from '../src/native-boat-motion.ts';import {CityCollision,inRing} from '../src/driving.ts';import {annotationTurns,nativeBends} from '../src/native-annotation-route.ts';import {driveBoatRoute} from '../../tests/boat-route-driver.ts';
const root=new URL('../../',import.meta.url),read=(p:string)=>JSON.parse(fs.readFileSync(new URL(p,root),'utf8')),spec=read('native-city/src/native-beach-boat-routes.json')[0],city=read('city/city.json'),collision=new CityCollision(city);
const land=(x:number,z:number)=>city.land.some((p:any)=>inRing(x,z,p[0])&&!p.slice(1).some((h:any)=>inRing(x,z,h))),env={heightAt:()=>0,blocked:(x:number,z:number)=>land(x,z)&&collision.blocked(x,z)},make=()=>new NativeBoatMotion(spec,(x,z)=>!land(x,z),env);
test('driving over the continuous beach raises the hull, reaches all turns, and succeeds only on dry land',()=>{
 const m=make();let last=m.body.bottomY,maxLift=0,maxPitch=0,groundedFrames=0;
 const result=driveBoatRoute(m,()=>{const b=m.body;maxLift=Math.max(maxLift,Math.abs(b.bottomY-last));last=b.bottomY;maxPitch=Math.max(maxPitch,Math.abs(b.pitch));if(b.grounded)groundedFrames++;
  if(m.canFinish())assert(land(m.x,m.z));
 });assert(result.complete,JSON.stringify({result,x:m.x,z:m.z,body:m.body}));assert.deepEqual(result.visited,[1,2,3]);assert(result.maxStep<.201);assert(maxLift<.035);assert(maxPitch>.015&&maxPitch<.251);assert(groundedFrames>20);assert(m.body.bottomY>0);assert(m.speed<=2.6);
 for(const u of [-m.fit.halfWidth,m.fit.halfWidth])for(const v of [-m.fit.length/2,m.fit.length/2]){const p=boatPoint(m.boat,u,v);assert(land(p.x,p.z));assert(m.body.bottomY+v*Math.sin(m.body.pitch)>=m.beach!.at(p.x,p.z));}
 m.mode='swim';[m.swimmer.x,m.swimmer.z]=spec.path.points.at(-1);assert(!m.canFinish());m.reset();assert.equal(m.mode,'boat');assert(!m.canFinish());assert(!m.body.grounded);assert.equal(m.x,spec.path.points[0][0]);
});
test('beach task rejects offshore arrival/unsafe disembarkation and does not allow unrelated dry city land',()=>{
 const m=make(),end=spec.path.points.at(-1),a=spec.path.points.at(-2),f=[end[0]-a[0],end[1]-a[1]],n=Math.hypot(...f);m.boat.yaw=Math.atan2(f[0],f[1]);
 [m.boat.x,m.boat.z]=end.map((v:number,i:number)=>v-f[i]/n*12);assert(!m.canFinish(),'Nose on shore is not the whole hull on land');
 m.boat.x=end[0];m.boat.z=end[1];assert(m.canFinish());assert.match(m.interact(),/safe water|too shallow/i);assert.equal(m.mode,'boat');
 let rejected=0;const r=spec.region;for(let x=r.minX;x<r.maxX;x+=10)for(let z=r.minZ;z<r.maxZ;z+=10)if(land(x,z)&&!m.beach!.isBeach(x,z)){assert(!m.beach!.clear(x,z));rejected++;}assert(rejected>0);
 const terrain=m.beach!;let prev=terrain.at(a[0],a[1]);for(let t=0;t<=n;t+=.1){const h=terrain.at(a[0]+f[0]*t/n,a[1]+f[1]*t/n);assert(Math.abs(h-prev)<.035,'Beach has an elevation step');prev=h;}
});
