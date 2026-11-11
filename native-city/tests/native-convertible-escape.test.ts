import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
import {CityCollision,closest} from '../src/driving.ts';
import {NavigationPolicePursuit} from '../src/offmap-navigation-police.ts';
import {NATIVE_DRIVE_ASSIGNMENTS} from '../src/native-drive-vehicle-spec.ts';
import type {V2} from '../src/city-types.ts';
const root=new URL('../../',import.meta.url),read=(p:string)=>JSON.parse(fs.readFileSync(new URL(p,root),'utf8'));
const [route]=read('native-city/src/native-convertible-escape-routes.json'),collision=new CityCollision(read('city/city.json'));
test('c05-n09 retains all 22 turns, convertible role and no accidental early goal encounter',()=>{
 assert.equal(route.id,'c05-n09');assert.equal(route.category,'escape');assert.equal(route.expectedTurns.length,22);
 assert.equal(NATIVE_DRIVE_ASSIGNMENTS[route.id].kind,'convertible');assert(route.path.length>11000);
 const points=route.path.points as V2[],goal=points.at(-1)!;let remaining=0;
 for(let i=points.length-2;i>=0;i--){remaining+=Math.hypot(points[i+1][0]-points[i][0],points[i+1][1]-points[i][1]);if(remaining>200)assert(closest(...goal,points[i],points[i+1]).d>65,'route passes through its endpoint prematurely');}
});
test('c05-n09 initial stationary car is capturable, not protected by failed police spawning',()=>{
 const points=route.path.points as V2[],[p,q]=points,yaw=Math.atan2(q[0]-p[0],q[1]-p[1]);
 const police=new NavigationPolicePursuit({player:{spawn:{position:[p[0],0,-p[1]],yaw:-yaw}},navigation:{path:points.map(p=>[p[0],0,-p[1]]),mode:'drive',category:'escape',indoors:false}} as any,20);
 for(let i=0;i<1200&&!police.capturedBy;i++){police.step(.05,{x:p[0],y:0,z:-p[1]},-yaw,0,p=>collision.blocked(p.x,-p.z),()=>0);if(!police.units.length)police.ensureMinimum(2);}
 // Capture at roughly 8 seconds can precede the ten-second reinforcement.
 assert(police.spawned>0);assert(police.capturedBy);console.log(JSON.stringify({id:route.id,stationaryCapturedAt:police.capturedAt,spawned:police.spawned}));
});
