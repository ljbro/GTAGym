import test from 'node:test';
import assert from 'node:assert/strict';
import {installRealtimeMaterials} from '../scripts/server-eval/realtime-materials.mjs';

test('reflection guards preserve values, changes and newly loaded materials',()=>{
 class Material{
  dirty=0;enabled=false;quality=8;
  get realTimeFiltering(){return this.enabled;}
  set realTimeFiltering(v){this.enabled=v;this.dirty++;}
  get realTimeFilteringQuality(){return this.quality;}
  set realTimeFilteringQuality(v){this.quality=v;this.dirty++;}
 }
 const a=new Material(),plain={name:'no-reflection-properties'};let added;
 const old=globalThis.window;globalThis.window={__SHENCHENGJI_CITY__:{world:{scene:{materials:[a,plain],onNewMaterialAddedObservable:{add(fn){added=fn;}}}}}};
 try{
  const stats=installRealtimeMaterials();assert.equal(stats.materials,1);
  for(let i=0;i<1000;i++){a.realTimeFiltering=false;a.realTimeFilteringQuality=8;}
  assert.equal(a.dirty,0);assert.equal(stats.skipped,2000);
  a.realTimeFiltering=true;a.realTimeFilteringQuality=4;
  assert.equal(a.dirty,2);assert.equal(a.realTimeFiltering,true);assert.equal(a.realTimeFilteringQuality,4);
  const b=new Material();added(b);added(b);b.realTimeFiltering=false;b.realTimeFiltering=true;
  assert.equal(stats.materials,2);assert.equal(b.dirty,1);assert.equal(stats.changed,3);
  assert(!Object.hasOwn(plain,'realTimeFiltering'));
 }finally{globalThis.window=old;}
});
