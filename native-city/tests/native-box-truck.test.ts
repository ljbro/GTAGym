import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import {createHash} from 'node:crypto';
import {NodeIO} from '@gltf-transform/core';import {getBounds} from '@gltf-transform/functions';
import {NATIVE_DRIVE_VEHICLES,nativeDriveFootprintClear} from '../src/native-drive-vehicle-spec.ts';
const dir=new URL('../../assets/task-vehicles/',import.meta.url),provenance=JSON.parse(fs.readFileSync(new URL('box-truck-native.provenance.json',dir),'utf8'));
test('compact rigid truck is licensed, grounded and sized independently from the old oversized candidate',async()=>{
 assert.equal(provenance.source.license,'CC0-1.0');assert.equal(provenance.source.author,'Quaternius');
 for(const item of [provenance.source,provenance.output])assert.equal(createHash('sha256').update(fs.readFileSync(new URL(item.file,dir))).digest('hex'),item.sha256);
 const doc=await new NodeIO().read(new URL(provenance.output.file,dir).pathname),b=getBounds(doc.getRoot().listScenes()[0]),fit=NATIVE_DRIVE_VEHICLES['box-truck'];
 assert(Math.abs(b.min[1])<1e-6);assert(Math.abs(b.max[0]-b.min[0]-fit.width)<1e-6);assert(Math.abs(b.max[2]-b.min[2]-fit.length)<1e-6);assert(fit.width<2.6);assert.equal(doc.getRoot().listNodes().filter(n=>/^wheel_/.test(n.getName())).length,3);
 assert(nativeDriveFootprintClear(0,0,0,'box-truck',()=>false));assert(!nativeDriveFootprintClear(0,0,0,'box-truck',(x,z)=>z<-2.4));
});
test('correcting wheel origins preserves every original truck vertex in place',async()=>{
 const io=new NodeIO(),source=await io.read(new URL(provenance.source.file,dir).pathname),output=await io.read(new URL(provenance.output.file,dir).pathname),bounds=getBounds(source.getRoot().listScenes()[0]);
 const rename:Record<string,string>={FrontWheel_L:'wheel_lf',FrontWheel_R:'wheel_rf',BackWheels:'wheel_rear_axle'};
 const transform=(a:ArrayLike<number>,i:number,m:number[])=>[m[0]*a[i]+m[4]*a[i+1]+m[8]*a[i+2]+m[12],m[1]*a[i]+m[5]*a[i+1]+m[9]*a[i+2]+m[13],m[2]*a[i]+m[6]*a[i+1]+m[10]*a[i+2]+m[14]];
 for(const node of source.getRoot().listNodes().filter(n=>n.getMesh())){
  const derived=output.getRoot().listNodes().find(n=>n.getName()===(rename[node.getName()]??node.getName()))!;assert(derived);
  for(const [j,primitive] of node.getMesh()!.listPrimitives().entries()){
   const original=primitive.getAttribute('POSITION')!.getArray()!,actual=derived.getMesh()!.listPrimitives()[j].getAttribute('POSITION')!.getArray()!;assert.equal(original.length,actual.length);
   for(let i=0;i<original.length;i+=3){const p=transform(original,i,node.getWorldMatrix()),q=transform(actual,i,derived.getWorldMatrix());for(let axis=0;axis<3;axis++){const offset=axis===1?bounds.min[1]:(bounds.min[axis]+bounds.max[axis])/2;assert(Math.abs((p[axis]-offset)*provenance.scale-q[axis])<1e-6);}}
  }
 }
});
