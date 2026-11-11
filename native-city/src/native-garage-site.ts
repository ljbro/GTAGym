import {LoadAssetContainerAsync,TransformNode,Quaternion,MeshBuilder,StandardMaterial,Color3,PointLight,Vector3,type AbstractMesh,type Scene,type AssetContainer} from '@babylonjs/core';
import '@babylonjs/loaders/glTF';
import {garageLocal,garageWorld,type GaragePlacement} from './native-garage-layout.ts';
import type {WalkLink} from './native-walk-traversal.ts';
import {interiorVehicleOverlap} from './native-interior-layout.ts';
import {mapRect,moveInteriorPlan,type InteriorMinimapPlan} from './interior-minimap.ts';
type Box={minX:number;maxX:number;minZ:number;maxZ:number;minY:number;maxY:number};
type GarageCollision={surfaces:{minX:number;maxX:number;minZ:number;maxZ:number;y:number}[];walls:Box[]};
const BASE='/assets/interiors/michaels-garage/';
/** Reuses the archived OffMapBench model, not the archived playground runtime. */
export class NativeGarageSite{
 readonly links:WalkLink[]=[];readonly traversalClear=null;readonly spec={id:'c02-n02'};
 readonly root:TransformNode;private container:AssetContainer|null=null;private collision:GarageCollision|null=null;
 private foundation:AbstractMesh|null=null;private light:PointLight|null=null;private disposed=false;
 constructor(private scene:Scene,readonly placement:GaragePlacement){this.root=new TransformNode('native-c02-n02-garage',scene);this.root.position.set(...[placement.origin[0],placement.baseY,placement.origin[1]] as [number,number,number]);this.root.rotation.y=placement.yaw;}
 async load(){
  try{
   const response=await fetch(BASE+'michaels-garage.collision.json');if(!response.ok)throw Error("Garage collision data failed to load");this.collision=await response.json();
   const container=await LoadAssetContainerAsync(BASE+'michaels-garage.glb',this.scene);if(this.disposed){container.dispose();return;}
   this.container=container;container.addAllToScene();
   // Collision JSON uses the normalized GLB coordinates before Babylon's
   // handedness wrapper. Remove that wrapper transform, retain Unity hierarchy.
   const imported=container.meshes.find(m=>m.name==='__root__');
   if(!imported)throw Error("Garage GLB Root node missing");
   imported.rotationQuaternion=Quaternion.Identity();imported.scaling.setAll(1);imported.position.setAll(0);imported.parent=this.root;
   for(const mesh of container.meshes){mesh.isPickable=false;mesh.receiveShadows=true;if(mesh.material)mesh.material.backFaceCulling=false;}
   const material=new StandardMaterial('native-garage-foundation',this.scene);material.diffuseColor=new Color3(.29,.30,.29);
   this.foundation=MeshBuilder.CreateBox('native-garage-foundation',{width:12.7,depth:13.25,height:.4},this.scene);this.foundation.parent=this.root;this.foundation.position.y=-.2;this.foundation.material=material;this.foundation.receiveShadows=true;
   const [x,z]=garageWorld(this.placement,-.5,-2);this.light=new PointLight('native-garage-light',new Vector3(x,this.placement.baseY+3.4,z),this.scene);this.light.intensity=12;this.light.range=13;this.light.includedOnlyMeshes=container.meshes;
  }catch(error){this.dispose();throw error;}
 }
 get meshes(){return this.root.getChildMeshes();}
 get interiorMinimap():InteriorMinimapPlan{
  return moveInteriorPlan({floors:(this.collision?.surfaces??[]).map(mapRect),walls:(this.collision?.walls??[]).filter(w=>w.minY<1.9).map(mapRect),obstacles:[],doors:[],stairs:[]},...this.placement.origin,this.placement.yaw);
 }
 get goalHeight(){return this.placement.baseY+.157;}
 floorAt(x:number,z:number){
  const [u,v]=garageLocal(this.placement,x,z);
  for(const floor of this.collision?.surfaces??[])if(u>=floor.minX&&u<=floor.maxX&&v>=floor.minZ&&v<=floor.maxZ)return this.placement.baseY+floor.y;
  return null;
 }
 blocked(x:number,z:number){
  const [u,v]=garageLocal(this.placement,x,z);
  return (this.collision?.walls??[]).some(w=>w.minY<1.9&&u>w.minX-.23&&u<w.maxX+.23&&v>w.minZ-.23&&v<w.maxZ+.23);
 }
 vehicleBlocked(x:number,z:number,yaw:number,width:number,length:number){
  const [u,v]=garageLocal(this.placement,x,z);
  return (this.collision?.walls??[]).some(w=>w.minY<1.9&&interiorVehicleOverlap({name:'garage-wall',x:(w.minX+w.maxX)/2,z:(w.minZ+w.maxZ)/2,w:w.maxX-w.minX,d:w.maxZ-w.minZ,h:w.maxY-w.minY},u,v,yaw-this.placement.yaw,width,length));
 }
 canFinish(walk:{x:number;z:number;feetY:number;active:boolean;airborne:boolean;traversing:boolean}|null){
  if(!walk?.active||walk.airborne||walk.traversing||Math.abs(walk.feetY-this.goalHeight)>.2)return false;
  const [x,z]=garageLocal(this.placement,walk.x,walk.z);
  return x>-5.7&&x<5.1&&z>-5.9&&z<1.6&&!this.blocked(walk.x,walk.z);
 }
 dispose(){if(this.disposed)return;this.disposed=true;this.light?.dispose();this.foundation?.dispose(false,true);this.container?.dispose();this.root.dispose();}
}
