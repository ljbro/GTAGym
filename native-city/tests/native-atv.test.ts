import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {NATIVE_DRIVE_VEHICLES,nativeDriveFootprintClear} from '../src/native-drive-vehicle-spec.ts';
import {ATV_FIT,MOTORCYCLE_FIT} from '../src/native-jetski-pose.ts';
const base=new URL('../../assets/task-vehicles/',import.meta.url);
const read=(f:string)=>fs.readFileSync(new URL(f,base));
test('ATV is the licensed four-wheel source, with retained source and reproducible output hashes',()=>{
 const proof=JSON.parse(read('atv.provenance.json').toString()),evidence=JSON.parse(read('sources/atv-license-evidence.json').toString());
 assert.equal(proof.license,'cc0-1.0');assert.equal(evidence.license.slug,proof.license);assert.equal(evidence.id,'28242');assert.equal(proof.aiGenerated,true);
 assert.equal(createHash('sha256').update(read('sources/atv.glb')).digest('hex'),proof.sourceSha256);
 const bytes=read('atv.glb');assert.equal(createHash('sha256').update(bytes).digest('hex'),proof.output.sha256);
 const gltf=JSON.parse(bytes.subarray(20,20+bytes.readUInt32LE(12)).toString());
 const wheels=gltf.nodes.filter((n:any)=>/^wheel-[lr][fr]$/.test(n.name));
 assert.equal(wheels.length,4);assert.equal(new Set(wheels.map((n:any)=>n.translation.join(','))).size,4);
 for(const w of wheels)assert(w.children.length>=3,'tyre, rim and hub remain under their own pivot');
 assert.equal(gltf.meshes.length,18);assert.equal(proof.output.bounds.min[1],0);
});
test('ATV footprint covers turned front tyres, not only straight-ahead body',()=>{
 const fit=NATIVE_DRIVE_VEHICLES.atv;
 for(let steering=-.48;steering<=.481;steering+=.01)assert(fit.width/2>.46+.12*Math.cos(steering)+.37*Math.abs(Math.sin(steering)));
 assert(!nativeDriveFootprintClear(0,0,0,'atv',(x)=>x>.7));
 assert(nativeDriveFootprintClear(0,0,0,'atv',()=>false));
});
test('ATV has its own broad straddle pose instead of motorcycle body lean fit',()=>{
 assert(ATV_FIT.footSide>.5);assert(ATV_FIT.kneeSide!>2);
 assert(ATV_FIT.handSide>MOTORCYCLE_FIT.handSide);
});
