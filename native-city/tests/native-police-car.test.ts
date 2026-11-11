import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {NodeIO} from '@gltf-transform/core';
import {NATIVE_DRIVE_ASSIGNMENTS,nativeDriveFootprintClear} from '../src/native-drive-vehicle-spec.ts';

test('player police car preserves opaque geometry and gets independently transparent windows',async()=>{
 const base=new URL('../../assets/task-vehicles/',import.meta.url);
 const doc=await new NodeIO().read(new URL('police-car.glb',base).pathname);
 const original=await new NodeIO().read(new URL('sources/police-car.glb',base).pathname);
 const count=(d:any)=>d.getRoot().listMeshes().flatMap((m:any)=>m.listPrimitives()).reduce((n:number,p:any)=>n+(p.getIndices()?.getCount()??p.getAttribute('POSITION').getCount()),0);
 assert.equal(count(doc),count(original));
 const windows=doc.getRoot().listMaterials().filter(m=>m.getName()==='Windows');
 assert.equal(windows.length,1);assert.equal(windows[0].getAlphaMode(),'BLEND');assert.equal(windows[0].getBaseColorFactor()[3],.14);
 for(const m of doc.getRoot().listMaterials().filter(m=>m.getName()!=='Windows'))assert.equal(m.getAlphaMode(),'OPAQUE');
 const manifest=JSON.parse(fs.readFileSync(new URL('special-manifest.json',base),'utf8')).sources.find((s:any)=>s.id==='police-car');
 const hash=(file:string)=>createHash('sha256').update(fs.readFileSync(new URL(file,base))).digest('hex');
 assert.equal(manifest.sourceSha256,hash('sources/police-car.glb'));assert.equal(manifest.output.sha256,hash('police-car.glb'));assert.equal(manifest.license,'CC0-1.0');
 assert.equal(NATIVE_DRIVE_ASSIGNMENTS['c05-n10'].kind,'police-car');
 assert(!nativeDriveFootprintClear(0,0,0,'police-car',(x,z)=>x>1.1&&z< -2.3));
});
