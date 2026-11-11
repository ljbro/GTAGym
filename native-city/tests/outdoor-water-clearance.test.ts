import test from 'node:test';
import assert from 'node:assert/strict';
import {renderedWaterClearance} from '../src/outdoor-water-clearance.ts';

const matrix=[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1];
function surface(name:string,x0:number,x1:number,z0:number,z1:number,y:number,translation=0){return {name,getVerticesData:()=>[x0,y,z0,x1,y,z0,x1,y,z1,x0,y,z1],getIndices:()=>[0,1,2,0,2,3],computeWorldMatrix:()=>({m:matrix.map((v,i)=>i===12?translation:v)})};}
test('rendered backdrop grass over logical sea blocks generated water routes',()=>{
 const index=renderedWaterClearance([surface('terrain_water',-100,100,-100,100,-.25),surface('opposite-shore-dsm',0,30,0,30,0)],-.25,[-100,-100,100,100]);
 assert(index.allows(-20,-20));assert(!index.allows(10,10));assert(!index.allows(150,150));assert.equal(index.stats.waterTriangles,2);assert.equal(index.stats.landTriangles,2);
});
test('terrain world transforms are respected and underwater seabed does not block',()=>{
 const index=renderedWaterClearance([surface('terrain_water',-100,100,-100,100,-.25),surface('terrain_land',0,10,0,10,0,40),surface('terrain_seabed',-100,100,-100,100,-8)],-.25,[-100,-100,100,100]);
 assert(index.allows(5,5));assert(!index.allows(45,5));assert(index.allows(-50,-50));
});
