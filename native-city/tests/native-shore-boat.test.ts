import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import {createHash} from 'node:crypto';
import {NativeShoreBoatMotion} from '../src/native-shore-boat-motion.ts';import {CityCollision,inRing} from '../src/driving.ts';import {annotationTurns,nativeBends} from '../src/native-annotation-route.ts';
const root=new URL('../../',import.meta.url),read=(p:string)=>JSON.parse(fs.readFileSync(new URL(p,root),'utf8')),spec=read('native-city/src/native-shore-boat-routes.json')[0],city=read('city/city.json'),collision=new CityCollision(city);
const land=(x:number,z:number)=>city.land.some((p:any)=>inRing(x,z,p[0])&&!p.slice(1).some((r:any)=>inRing(x,z,r))),env={land,heightAt:()=>0,blocked:(x:number,z:number)=>land(x,z)&&collision.blocked(x,z)};
const run=(m:NativeShoreBoatMotion,keys:string[],seconds:number)=>{for(let i=0;i<Math.ceil(seconds/.025);i++)m.step(new Set(keys),.025);};
function approach(m:NativeShoreBoatMotion){const end=spec.path.points.at(-1),modes=new Set([m.mode]);let n=0,maxStep=0;
 while(Math.hypot(m.x-end[0],m.z-end[1])>.3&&n++<4000){const [x,z]=[m.x,m.z];m.step(new Set(['KeyW','ShiftLeft']),.025);maxStep=Math.max(maxStep,Math.hypot(m.x-x,m.z-z));modes.add(m.mode);assert(!m.canFinish());}
 assert(n<4000,'Cannot reach boat from land');assert.deepEqual([...modes],['walk','swim']);assert(maxStep<.11);return m;
}
test('walk, wade, swim, F side boarding are continuous and arrival alone is rejected',()=>{
 const m=approach(new NativeShoreBoatMotion(spec,env));assert(!m.canFinish());assert.equal(m.mode,'swim');
 m.shore.swimmer.depth=1;assert.match(m.interact(),/Rise to the surface/i);assert.equal(m.mode,'swim');m.shore.swimmer.depth=0;
 assert.match(m.interact(),/side.*boat/i);assert.equal(m.mode,'boarding');run(m,[],1);assert(!m.canFinish());
 const pose=m.boat.transitionPose!;assert(pose.physicalPosition.y>=spec.waterHeight+m.boat.fit.railHeight,'Feet must cross above inflated side tube');
 run(m,[],1.2);assert.equal(m.mode,'boarding');assert(!m.canFinish());run(m,[],2.6);assert.equal(m.mode,'boat');assert(m.canFinish());assert(m.boat.boarded);assert.equal(m.boat.spec.craft,'zodiac');
 m.reset();assert.equal(m.mode,'walk');assert(!m.canFinish());assert(!m.boat.boarded);assert.equal(m.x,spec.path.points[0][0]);
});
test('small boat hull collision, distant F rejection and returning to shore work',()=>{
 const m=new NativeShoreBoatMotion(spec,env);run(m,['KeyW','ShiftLeft'],20);assert.equal(m.mode,'swim');assert.match(m.interact(),/side.*boat/i);assert.equal(m.mode,'swim');
 m.reset();approach(m);const p=m.boat.boat,sw=m.shore.swimmer;sw.yaw=Math.atan2(p.x-sw.x,p.z-sw.z);run(m,['KeyW'],3);assert(!m.boat.hullBlocks(m.x,m.z),'Swimmer entered hull');
 m.reset();approach(m);m.interact();run(m,[],4.8);m.interact();run(m,[],4.5);assert.equal(m.mode,'swim');assert(!m.canFinish());
 sw.yaw=Math.atan2(spec.path.points[0][0]-m.x,spec.path.points[0][1]-m.z);run(m,['KeyW','ShiftLeft'],65);assert.equal(m.mode,'walk');assert(land(m.x,m.z));assert(!m.canFinish(),'Walking back to land must not complete boarding objective');
});
