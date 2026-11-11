import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {CityCollision,closest} from '../src/driving.ts';
import {NavigationPolicePursuit} from '../src/offmap-navigation-police.ts';
import type {V2} from '../src/city-types.ts';
const root=new URL('../../',import.meta.url),read=(p:string)=>JSON.parse(fs.readFileSync(new URL(p,root),'utf8'));
const [route]=read('native-city/src/native-police-escape-routes.json');
test('c05-n10 keeps 14 drawn turns without an earlier endpoint intersection',()=>{
 assert.equal(route.id,'c05-n10');assert.equal(route.expectedTurns.length,14);assert.equal(route.path.points.length,152);
 const points=route.path.points as V2[],goal=points.at(-1)!;let remaining=0;
 for(let i=points.length-2;i>=0;i--){remaining+=Math.hypot(points[i+1][0]-points[i][0],points[i+1][1]-points[i][1]);if(remaining>200)assert(closest(...goal,points[i],points[i+1]).d>65,'premature endpoint proximity');}
});
test('c05-n10 stationary player can be reached and captured at its actual city spawn',()=>{
 const points=route.path.points as V2[],[p,q]=points,yaw=Math.atan2(q[0]-p[0],q[1]-p[1]),collision=new CityCollision(read('city/city.json'));
 const police=new NavigationPolicePursuit({player:{spawn:{position:[p[0],0,-p[1]],yaw:-yaw}},navigation:{path:points.map(p=>[p[0],0,-p[1]]),mode:'drive',category:'escape',indoors:false}} as any,20);
 for(let i=0;i<1200&&!police.capturedBy;i++){police.step(.05,{x:p[0],y:0,z:-p[1]},-yaw,0,p=>collision.blocked(p.x,-p.z),()=>0);if(!police.units.length)police.ensureMinimum(2);}
 assert(police.capturedBy);assert(police.spawned>0);
 console.log(JSON.stringify({id:route.id,capturedAt:police.capturedAt,spawned:police.spawned}));
});
