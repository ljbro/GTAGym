import test from 'node:test';import assert from 'node:assert/strict';
import {garageLocal,garageWorld,findGaragePlacement} from '../src/native-garage-layout.ts';
test('garage coordinates round-trip with doorway facing the incoming approach',()=>{
 for(const yaw of [0,.5,Math.PI/2,-Math.PI]){const p={origin:[120,-80] as [number,number],yaw},w=garageWorld(p,-6.22,-1.925),l=garageLocal(p,...w);assert(Math.abs(l[0]+6.22)<1e-8);assert(Math.abs(l[1]+1.925)<1e-8);}
 const p=findGaragePlacement([[0,0],[0,100]],{blocked:()=>false,heightAt:()=>0,roadAt:()=>null});
 const door=garageLocal(p,...p.door),goal=garageLocal(p,...p.goal);assert(Math.abs(door[0]+6.22)<1e-8);assert(Math.abs(goal[0]+1.5)<1e-8);assert(Math.abs(goal[1]-door[1])<1e-8);
});
test('garage search rejects water/buildings, road-covered land and unsuitable slopes',()=>{
 const path:[[number,number],[number,number]]=[[0,0],[0,100]],clear={blocked:()=>false,heightAt:()=>0,roadAt:()=>null};
 assert.throws(()=>findGaragePlacement(path,{...clear,blocked:()=>true}),/open (?:space|ground)/i);
 assert.throws(()=>findGaragePlacement(path,{...clear,roadAt:()=>({d:0,road:{width:20}})}),/open (?:space|ground)/i);
 assert.throws(()=>findGaragePlacement(path,{...clear,heightAt:(x,z)=>x+z}),/open (?:space|ground)/i);
 assert.throws(()=>findGaragePlacement(path,{...clear,heightAt:()=>NaN}),/open (?:space|ground)/i);
});
test('garage can choose the opposite shoulder without changing the original route',()=>{
 const path:[[number,number],[number,number]]=[[0,0],[0,100]],before=JSON.stringify(path);
 const p=findGaragePlacement(path,{blocked:x=>x<0,heightAt:()=>1.2,roadAt:()=>null});
 assert(p.origin[0]>0);assert.equal(JSON.stringify(path),before);assert(Math.abs(p.baseY-1.225)<1e-8);
});
