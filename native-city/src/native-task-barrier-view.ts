import {MeshBuilder,PBRMaterial,TransformNode,type Scene} from '@babylonjs/core';
import type {NativeTaskBarrier} from './native-task-barrier.ts';
export function createNativeBarrierView(scene:Scene,barrier:NativeTaskBarrier,groundY:number){
 const root=new TransformNode('native-manual-route-barrier',scene);root.position.set(barrier.x,groundY,barrier.z);root.rotation.y=barrier.yaw;
 const material=(name:string,r:number,g:number,b:number)=>{const m=new PBRMaterial(name,scene);m.albedoColor.copyFromFloats(r,g,b);m.roughness=.86;return m;};
 const concrete=material('barrier-concrete',.42,.44,.40),yellow=material('barrier-reflector',.95,.64,.07),black=material('barrier-warning-stripe',.025,.028,.024);
 const box=(name:string,width:number,height:number,depth:number,x:number,y:number,z:number,m:PBRMaterial)=>{
  const mesh=MeshBuilder.CreateBox(name,{width,height,depth},scene);mesh.parent=root;mesh.position.set(x,y,z);mesh.material=m;mesh.receiveShadows=true;return mesh;
 };
 box('barrier-ground-base',1.8,.18,1,0,.09,0,concrete);
 box('barrier-concrete-body',1.65,.62,.62,0,.49,0,concrete);
 box('barrier-top-cap',1.65,.12,.68,0,.86,0,concrete);
 for(const side of [-1,1]){
  box('barrier-reflective-panel',1.5,.32,.016,0,.59,side*.319,yellow);
  for(let i=-3;i<=3;i++){const stripe=box('barrier-diagonal-stripe',.085,.27,.009,i*.205,.59,side*.333,black);stripe.rotation.z=-.45;}
 }
 return {meshes:root.getChildMeshes(),dispose(){root.dispose();concrete.dispose();yellow.dispose();black.dispose();}};
}
