import {Color3,MeshBuilder,StandardMaterial,type Scene,type Camera} from '@babylonjs/core';
/** A single readable destination mark, tied to the actual ground height. */
export function createObjectiveMarker(scene:Scene,host:HTMLElement,heightAt:(x:number,z:number)=>number,radius=6.5){
 const ring=MeshBuilder.CreateTorus('career-parking-guide',{diameter:radius*2,thickness:.07,tessellation:64},scene);
 const material=new StandardMaterial('career-parking-guide-mat',scene);material.diffuseColor=new Color3(.35,.73,.62);material.emissiveColor=new Color3(.22,.65,.49);material.specularColor=Color3.Black();material.disableLighting=true;material.alpha=.74;ring.material=material;ring.isPickable=false;ring.setEnabled(false);
 let target:{position:readonly number[];label:string}|null=null;
 function set(value:typeof target){target=value;ring.setEnabled(!!value);if(value)ring.position.set(value.position[0],heightAt(value.position[0],value.position[1])+.22,value.position[1]);}
 function update(camera:Camera,x:number,z:number,hide:boolean){
  if(!target||hide){ring.setEnabled(false);return;}
  const distance=Math.hypot(target.position[0]-x,target.position[1]-z);ring.setEnabled(distance<180);
 }
 return {set,update,dispose(){ring.dispose();material.dispose();}};
}
