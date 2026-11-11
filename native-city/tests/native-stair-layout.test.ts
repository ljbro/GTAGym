import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import {createHash} from 'node:crypto';
import {makeStairLayout,stairFloor,findStairLayout} from '../src/native-stair-layout.ts';
import {annotationTurns,nativeBends} from '../src/native-annotation-route.ts';
const root=new URL('../../',import.meta.url),read=(p:string)=>JSON.parse(fs.readFileSync(new URL(p,root),'utf8')),specs=read('native-city/src/native-stair-routes.json');
test('stair routes have continuous support and <=16cm risers in both directions',()=>{
 for(const s of specs)for(const yaw of [0,.9,Math.PI]){
  const p=makeStairLayout(s,100,100,.02,yaw);let last=stairFloor(p,...p.points[0])!;
  assert(Math.abs(last-(.02+s.heights[0]))<1e-8);
  for(let i=1;i<p.points.length;i++){const a=p.points[i-1],b=p.points[i],n=Math.ceil(Math.hypot(b[0]-a[0],b[1]-a[1])/.02);for(let j=1;j<=n;j++){const h=stairFloor(p,a[0]+(b[0]-a[0])*j/n,a[1]+(b[1]-a[1])*j/n);assert(h!==null,'unsupported route');assert(Math.abs(h!-last)<=.16001,'oversized riser');last=h!;}}
  assert(Math.abs(last-(.02+s.heights.at(-1)))<1e-8);assert.equal(stairFloor(p,-1000,-1000),null);
 }
});
test('stair placement rejects occupied ground, roads and steep terrain',()=>{
 const nodes:[number,number][]=[[0,0]],checks={blocked:()=>false,heightAt:()=>0,roadAt:()=>null};assert(findStairLayout(specs[0],nodes,checks));
 assert.throws(()=>findStairLayout(specs[0],nodes,{...checks,blocked:()=>true}));assert.throws(()=>findStairLayout(specs[0],nodes,{...checks,heightAt:(x:number,z:number)=>x+z}));
 assert.throws(()=>findStairLayout(specs[0],nodes,{...checks,roadAt:()=>({d:0,road:{width:10}})}));
});
