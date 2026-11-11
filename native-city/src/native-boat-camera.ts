import {Ray,Vector3,type AbstractMesh} from '@babylonjs/core';

/** Sweep five probes against actual scenery, including non-pickable terrain.
 * Never include the vessel, rider, sky or water surface in blockers. */
export function clearBoatCamera(eye:Vector3,target:Vector3,blockers:AbstractMesh[]){
 const delta=eye.subtract(target),length=delta.length();if(length<.01)return eye;
 const direction=delta.scale(1/length),side=Vector3.Cross(direction,Vector3.Up()).normalize().scale(.3),up=new Vector3(0,.3,0);
 let arm=length;
 for(const offset of [Vector3.Zero(),side,side.negate(),up,up.negate()]){
  const ray=new Ray(target.add(offset),direction,length+.35);
  for(const mesh of blockers){
   if(mesh.isDisposed()||!mesh.isEnabled()||!mesh.isVisible||!mesh.getTotalVertices())continue;
   const box=mesh.getBoundingInfo().boundingBox;
   if(!ray.intersectsBoxMinMax(box.minimumWorld,box.maximumWorld))continue;
   const hit=ray.intersectsMesh(mesh,false);
   if(hit.hit)arm=Math.min(arm,Math.max(0,hit.distance-.4));
  }
 }
 return target.add(direction.scale(arm));
}
