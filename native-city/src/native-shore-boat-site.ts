import type {Scene,AbstractMesh} from '@babylonjs/core';
import type {CityData} from './city-types.ts';
import {NativeShoreBoatMotion,type ShoreBoatSpec} from './native-shore-boat-motion.ts';
import {NativeShoreSite} from './native-shore-site.ts';import {NativeBoatSite} from './native-boat-site.ts';
import type {ShoreEnvironment} from './native-shore-motion.ts';
import {transferPlatformBlocks} from './native-water-transfer.ts';
import {NativeWaterTransferView} from './native-water-transfer-view.ts';
export class NativeShoreBoatSite extends NativeShoreBoatMotion{
 declare readonly shore:NativeShoreSite;declare readonly boat:NativeBoatSite;
 private disposed=false;private destination:NativeWaterTransferView|null=null;
 constructor(scene:Scene,spec:ShoreBoatSpec,city:CityData,env:ShoreEnvironment){
  const platform=(x:number,z:number)=>spec.objective==='shore-transfer'&&transferPlatformBlocks(spec,x,z);
  const boat=new NativeBoatSite(scene,spec,city,false,undefined,platform);
  const shore:NativeShoreSite=new NativeShoreSite(scene,{...spec,path:spec.shorePath},{...env,blocked:(x,z):boolean=>env.blocked(x,z)||platform(x,z)||boat.hullBlocks(x,z,shore?.depth??0)},true);
  super(spec,env,shore,boat);if(spec.objective==='shore-transfer')this.destination=new NativeWaterTransferView(scene,spec);this.syncActors();
 }
 async load(){try{await this.boat.load();if(this.disposed)return;await this.shore.load();if(!this.disposed)this.syncActors();}catch(error){this.dispose();throw error;}}
 private syncActors(){this.shore.setActorsEnabled(!this.aboard);this.boat.setActorsEnabled(this.aboard);}
 override step(keys:ReadonlySet<string>,dt:number){const before=this.aboard;super.step(keys,dt);if(!before)this.boat.updateWake(dt);if(before!==this.aboard)this.syncActors();}
 override interact(){const result=super.interact();this.syncActors();return result;}
 override reset(){super.reset();this.syncActors();}
 toggleView(){this.shore.toggleView();this.boat.toggleView();}
 get camera(){return this.aboard?this.boat.camera:this.shore.camera;}
 get meshes():AbstractMesh[]{return [...this.shore.meshes,...this.boat.meshes,...this.destination?.meshes??[]];}
 diagnostics(){return {mode:this.mode,craft:this.spec.craft,shore:this.shore.diagnostics(),boat:this.boat.diagnostics(),canFinish:this.canFinish()};}
 dispose(){this.disposed=true;this.shore.dispose();this.boat.dispose();this.destination?.dispose();}
}
