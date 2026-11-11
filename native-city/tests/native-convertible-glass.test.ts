import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import {createHash} from 'node:crypto';
import {NodeIO} from '@gltf-transform/core';
const root=new URL('../../',import.meta.url);
test('convertible separates only windshield panes; opaque car and total geometry survive',async()=>{
 const io=new NodeIO(),source=await io.read(new URL('assets/task-vehicles/sources/convertible.glb',root).pathname),fixed=await io.read(new URL('assets/task-vehicles/convertible.glb',root).pathname);
 const panes=fixed.getRoot().listMeshes().flatMap(m=>m.listPrimitives()).filter(p=>p.getMaterial()?.getName()==='native-convertible-windshield');
 assert.equal(panes.length,1);const glass=panes[0];assert.equal(glass.getIndices()!.getCount()/3,16);assert.equal(glass.getMaterial()!.getAlphaMode(),'BLEND');assert.equal(glass.getMaterial()!.getBaseColorFactor()[3],.14);
 const body=fixed.getRoot().listMeshes().flatMap(m=>m.listPrimitives()).filter(p=>!panes.includes(p));assert.equal(body.length,1);assert.equal(body[0].getMaterial()!.getAlphaMode(),'OPAQUE');assert.equal(body[0].getMaterial()!.getBaseColorFactor()[3],1);
 const indices=(d:typeof fixed)=>d.getRoot().listMeshes().flatMap(m=>m.listPrimitives()).reduce((sum,p)=>sum+p.getIndices()!.getCount(),0);
 assert.equal(indices(source),indices(fixed),'no car/frame triangles deleted');
 const manifest=JSON.parse(fs.readFileSync(new URL('assets/task-vehicles/manifest.json',root),'utf8')).sources.find((s:any)=>s.id==='convertible');
 assert.equal(createHash('sha256').update(fs.readFileSync(new URL('assets/task-vehicles/convertible.glb',root))).digest('hex'),manifest.outputs[0].sha256);
 assert.equal(createHash('sha256').update(fs.readFileSync(new URL('assets/task-vehicles/sources/convertible.glb',root))).digest('hex'),manifest.sourceSha256);
 assert.equal(manifest.license,'CC-BY-3.0');assert.match(manifest.changes,/Windshield/);
});
