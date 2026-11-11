import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import {createHash} from 'node:crypto';
import {NodeIO} from '@gltf-transform/core';import {getBounds} from '@gltf-transform/functions';
import {NATIVE_DRIVE_VEHICLES} from '../src/native-drive-vehicle-spec.ts';
import {SEMI,createTrailerState,stepTrailer,trailerAxle,trailerFootprintClear,trailerSweepClear,semiHitch} from '../src/native-semi-articulation.ts';
const dir=new URL('../../assets/task-vehicles/',import.meta.url);
test('CC0 semi tractor and original open trailer have self-contained GLBs, true bounds and independent wheels',async()=>{
 const provenance=JSON.parse(fs.readFileSync(new URL('semi.provenance.json',dir),'utf8'));assert.equal(provenance.source.license,'CC0-1.0');assert.equal(provenance.source.author,'WilliWam');
 for(const item of [provenance.source,...provenance.outputs])assert.equal(createHash('sha256').update(fs.readFileSync(new URL(item.file,dir))).digest('hex'),item.sha256);
 const io=new NodeIO();for(const [file,wheels]of [['semi-tractor.glb',6],['semi-trailer.glb',4]]as const){const d=await io.read(new URL(file,dir).pathname),b=getBounds(d.getRoot().listScenes()[0]);assert(Math.abs(b.min[1])<1e-6);assert.equal(d.getRoot().listNodes().filter(n=>/^wheel_[lr][fr]2?$/.test(n.getName())).length,wheels);assert(!d.getRoot().listMaterials().some(m=>m.getName()==='spike'));if(file==='semi-tractor.glb'){const fit=NATIVE_DRIVE_VEHICLES['semi-tractor'];assert(Math.abs(b.max[0]-b.min[0]-fit.width)<1e-6);assert(Math.abs(b.max[2]-b.min[2]-fit.length)<1e-6);}else{assert(Math.abs(b.min[2]+SEMI.rear)<1e-6);assert(Math.abs(b.max[2]-SEMI.front)<1e-6);assert(!d.getRoot().listNodes().some(n=>/roof/i.test(n.getName())));}}
});
test('trailer follows the hitch with a fixed axle distance and cuts inside a turn without snapping',()=>{
 const state=createTrailerState({x:0,z:0,yaw:0});for(let z=0;z<40;z+=.1){stepTrailer(state,{x:0,z,yaw:0});assert.equal(state.yaw,0);}const p0={x:0,z:40,yaw:0};Object.assign(state,createTrailerState(p0));let last=0;
 for(let i=1;i<=300;i++){const a=i/300*Math.PI/2,p={x:30*(1-Math.cos(a)),z:40+30*Math.sin(a),yaw:a};stepTrailer(state,p);const axle=trailerAxle(state),h=semiHitch(p);assert(Math.abs(Math.hypot(axle.x-h.x,axle.z-h.z)-SEMI.axleDistance)<1e-9);assert(Math.abs(state.yaw-last)<.01);last=state.yaw;}
 assert(state.yaw>1.2&&state.yaw<1.5);assert(state.yaw<Math.PI/2);assert(state.travel>40);
 const snapshot={...state};stepTrailer(state,{x:30,z:70,yaw:Math.PI/2});assert.deepEqual(state,snapshot);
});
test('rear and swept trailer collisions cannot be hidden by a clear tractor',()=>{
 const p={x:0,z:0,yaw:0};assert(!trailerFootprintClear(p,(x,z)=>Math.abs(x)<.2&&z<-9));assert(trailerFootprintClear(p,()=>false));
 assert(!trailerSweepClear(p,{x:10,z:0,yaw:0},(x,z)=>Math.abs(x-5)<.12&&Math.abs(z+7)<.5));
 assert(trailerSweepClear(p,{x:0,z:10,yaw:.2},()=>false));
});
