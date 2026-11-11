import {AbstractMesh,AssetContainer,Light,TransformNode,type Scene} from '@babylonjs/core';

/** Keep shared vehicle assets cached, but remove their nodes and lights from
 * the live scene during flight missions. Do not dispose shared materials. */
export class NativeFlightCar {
 private assets:AssetContainer;
 removed=false;
 constructor(scene:Scene,private roots:TransformNode[]){
  this.assets=new AssetContainer(scene);
  for(const node of new Set(roots.flatMap(root=>[root,...root.getDescendants(false)]))){
   if(node instanceof AbstractMesh)this.assets.meshes.push(node);
   else if(node instanceof Light)this.assets.lights.push(node);
   else if(node instanceof TransformNode)this.assets.transformNodes.push(node);
  }
 }
 setRemoved(removed:boolean){
  if(this.removed===removed)return;
  this.removed=removed;
  if(removed){for(const root of this.roots)root.setEnabled(false);this.assets.removeAllFromScene();}
  else{this.assets.addAllToScene();for(const root of this.roots)root.setEnabled(true);}
 }
}
