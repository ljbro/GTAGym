import test from 'node:test';
import assert from 'node:assert/strict';
import {NullEngine,Scene,PBRMaterial,Color3} from '@babylonjs/core';
import {applyNativeDrivePaint} from '../src/native-drive-paint.ts';
test('yellow paint affects body and door shut only, not glass, lamps, wheels or other vehicles',()=>{
 const engine=new NullEngine(),scene=new Scene(engine);
 try{
  const names=['vehicle_generic_smallspecmap [PRIMARY]_PBR','vehicle_generic_doorshut [PRIMARY]_PBR','vehicle_generic_glasswindows2_PBR','baller_lights_PBR','vehicle_generic_tyrewallblack_PBR','vehicle_licenseplate_PBR'];
  const mats=names.map(n=>new PBRMaterial(n,scene)),before=mats.map(m=>m.albedoColor.asArray());
  assert.deepEqual(applyNativeDrivePaint('baller',mats),[]);
  assert.deepEqual(mats.map(m=>m.albedoColor.asArray()),before);
  assert.deepEqual(applyNativeDrivePaint('baller-yellow',mats),names.slice(0,2));
  for(const m of mats.slice(0,2))assert.deepEqual(m.albedoColor.asArray(),Color3.FromHexString('#F4C21D').toLinearSpace().asArray());
  assert.deepEqual(mats.slice(2).map(m=>m.albedoColor.asArray()),before.slice(2));
  assert.throws(()=>applyNativeDrivePaint('baller-yellow',mats.slice(2)),/missing.*paint material/i);
 }finally{scene.dispose();engine.dispose();}
});
