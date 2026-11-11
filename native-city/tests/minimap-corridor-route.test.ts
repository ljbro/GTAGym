import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {corridorTargetRoute,corridorSegmentClear} from '../src/minimap-corridor-route.ts';
import {hillLayout} from '../src/native-hill-layout.ts';
import {floodLayout} from '../src/native-flood-layout.ts';
import {rescueBridgeLayout} from '../src/native-rescue-bridge-layout.ts';
import type {V2} from '../src/city-types.ts';
const path:V2[]=[[0,0],[0,100],[100,100],[100,200]];
test('corridor GPS keeps bends and stops at the moving target, including reverse travel',()=>{
 const route=corridorTargetRoute(path,[0,20],[40,100],()=>true);
 assert.deepEqual(route,[[0,20],[0,100],[40,100]]);
 assert.deepEqual(corridorTargetRoute(path,[40,100],[0,20],()=>true),[...route].reverse());
 assert.deepEqual(corridorTargetRoute(path,[0,20],[0,40],()=>true),[[0,20],[0,40]]);
});
test('crossing a corner between frames recomputes the full corridor slice',()=>{
 assert.deepEqual(corridorTargetRoute(path,[0,20],[0,99],()=>true),[[0,20],[0,99]]);
 assert.deepEqual(corridorTargetRoute(path,[0,20],[3,100],()=>true),[[0,20],[0,100],[3,100]]);
});
test('unsupported connectors are not drawn and input geometry is not mutated',()=>{
 const before=JSON.stringify(path);
 assert.deepEqual(corridorTargetRoute(path,[-20,20],[40,100],()=>false),[]);
 assert.equal(JSON.stringify(path),before);
 assert.equal(corridorSegmentClear([0,0],[10,0],x=>x<4||x>6),false);
});
for(const [id,file] of [['c04-n10','native-river-chase-routes.json'],['c04-n04','native-rescue-routes.json'],['c04-n11','native-hill-chase-routes.json']]){
 test(`${id}: every displayed segment stays on its authored channel/deck`,()=>{
  const spec=JSON.parse(fs.readFileSync(new URL('../src/'+file,import.meta.url),'utf8')).find((r:any)=>r.id===id);
  const layout=id==='c04-n11'?hillLayout(spec,()=>0):id==='c04-n10'?floodLayout(spec):rescueBridgeLayout(spec,()=>0);
  const clear=(a:V2,b:V2)=>corridorSegmentClear(a,b,(x,z)=>layout.floorAt(x,z)!==null&&!layout.blocked(x,z));
  const original=spec.path.points as V2[];
  const at=(distance:number):V2=>{for(let i=1;i<original.length;i++){const a=original[i-1],b=original[i],length=Math.hypot(b[0]-a[0],b[1]-a[1]);if(distance<=length)return[a[0]+(b[0]-a[0])*distance/length,a[1]+(b[1]-a[1])*distance/length];distance-=length;}return original.at(-1)!;};
  for(let d=0;d<spec.path.length-80;d+=25){
   const a=at(d),b=at(Math.min(d+150,spec.path.length-1));
   for(const [start,target] of [[a,b],[b,a]]){
    const route=corridorTargetRoute(original,start,target,clear);
    assert(route.length>=2,`missing route at ${d}`);
    assert.deepEqual(route[0],start);assert.deepEqual(route.at(-1),target);
    for(let i=1;i<route.length;i++)assert(clear(route[i-1],route[i]),`off-corridor segment at ${d}`);
   }
  }
 });
}
