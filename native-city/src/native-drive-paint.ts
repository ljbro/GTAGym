import {Color3,PBRMaterial,type Material} from '@babylonjs/core';
import type {NativeDriveKind} from './native-drive-vehicle-spec.ts';

/** Only task-owned containers: never recolour the shared hero/NPC materials.
 * Baller's PRIMARY paint channels exclude glass, tyres, lamps and cabin. */
export function applyNativeDrivePaint(kind:NativeDriveKind,materials:readonly Material[]){
 const changed:string[]=[];
 if(kind!=='baller-yellow')return changed;
 for(const material of new Set(materials)){
  if(!(material instanceof PBRMaterial)||!/^vehicle_generic_(smallspecmap|doorshut) \[PRIMARY\]_PBR$/.test(material.name))continue;
  material.albedoColor=Color3.FromHexString('#F4C21D').toLinearSpace();
  material.metallic=.3;material.roughness=.28;
  material.clearCoat.isEnabled=true;material.clearCoat.intensity=.75;material.clearCoat.roughness=.16;
  changed.push(material.name);
 }
 if(!changed.length)throw Error("Yellow SUV Missing car paint material, Cannot continue startup with the wrong color");
 return changed;
}
