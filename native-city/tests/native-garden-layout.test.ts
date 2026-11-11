import test from 'node:test';import assert from 'node:assert/strict';
import city from '../../city/city.json' with {type:'json'};
import {CityCollision} from '../src/driving.ts';
import {findGardenLayout,gardenLocal,gardenWorld,GARDEN_SOLIDS,GARDEN_ROUTE} from '../src/native-garden-layout.ts';
import type {CityData} from '../src/city-types.ts';
import {CityWalk} from '../src/city-walk.ts';
const data=city as unknown as CityData,c=new CityCollision(data);
test('c02-n05 uses a clear real native facade with a 92m, four-corner garden route',()=>{
 const g=findGardenLayout(data,{heightAt:()=>0,blocked:(x,z)=>c.blocked(x,z),roadAt:(x,z)=>c.nearest(x,z)});
 assert(data.buildings.includes(g.building));assert.equal(g.length,92);
 const blocked=(x:number,z:number)=>{const [u,v]=gardenLocal(g,x,z);return c.blocked(x,z)||GARDEN_SOLIDS.some(s=>Math.abs(u-s.x)<s.w/2+.23&&Math.abs(v-s.z)<s.d/2+.23);};
 let total=0;for(let i=1;i<g.points.length;i++){const a=g.points[i-1],b=g.points[i],d=Math.hypot(b[0]-a[0],b[1]-a[1]);total+=d;for(let j=0;j<=Math.ceil(d/.1);j++){const t=j/Math.ceil(d/.1);assert(!blocked(a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t));}}
 assert(Math.abs(total-92)<1e-6);assert.equal(GARDEN_ROUTE.length-2,4);
 const w=new CityWalk(blocked,()=>0);w.active=true;[w.x,w.z]=g.points[0];w.yaw=g.yaw;w.resetMotion();
 for(let i=0;i<1200;i++)w.step(new Set(['KeyW']),.025);
 assert(Math.hypot(w.x-g.points.at(-1)![0],w.z-g.points.at(-1)![1])>20);assert(gardenLocal(g,w.x,w.z)[1]<39);
 [w.x,w.z]=g.points[0];w.resetMotion();let steps=0;
 for(const p of g.points.slice(1))while(Math.hypot(w.x-p[0],w.z-p[1])>.12){assert(++steps<5000);w.yaw=Math.atan2(p[0]-w.x,p[1]-w.z);w.step(new Set(['KeyW']),.025);}
 assert(Math.hypot(w.x-g.points.at(-1)![0],w.z-g.points.at(-1)![1])<.12);
 assert(blocked(...gardenWorld(g,0,4)),'direct shortcut crosses actual planter');
});
test('garden selection rejects occupied, road-covered and sloped plots',()=>{
 const small={...data,buildings:[{height:6,style:'residential',rings:[[[0,0],[40,0],[40,-10],[0,-10],[0,0]]]}]} as CityData;
 assert.throws(()=>findGardenLayout(small,{heightAt:()=>0,blocked:()=>true,roadAt:()=>null}));
 assert.throws(()=>findGardenLayout(small,{heightAt:()=>0,blocked:()=>false,roadAt:()=>({d:0,road:{width:10}})}));
 assert.throws(()=>findGardenLayout(small,{heightAt:(x,z)=>x+z,blocked:()=>false,roadAt:()=>null}));
});
