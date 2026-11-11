import {MeshBuilder,PBRMaterial,Color3,type Scene,type TransformNode} from '@babylonjs/core';
/** Authored touring accessories on the licensed motorcycle, not a claimed GTA asset. */
export function addBaggerDetails(scene:Scene,root:TransformNode){
 const paint=new PBRMaterial('bagger-hard-case-paint',scene);paint.albedoColor=new Color3(.035,.045,.052);paint.metallic=.55;paint.roughness=.25;
 const trim=new PBRMaterial('bagger-chrome',scene);trim.albedoColor=new Color3(.65,.68,.7);trim.metallic=.9;trim.roughness=.2;
 const glass=new PBRMaterial('bagger-windshield',scene);glass.albedoColor=new Color3(.5,.66,.7);glass.alpha=.3;glass.roughness=.12;glass.backFaceCulling=false;
 const box=(name:string,w:number,h:number,d:number,x:number,y:number,z:number,mat:PBRMaterial)=>{
  const mesh=MeshBuilder.CreateBox('bagger-'+name,{width:w,height:h,depth:d},scene);mesh.parent=root;mesh.position.set(x,y,z);mesh.material=mat;mesh.isPickable=false;mesh.receiveShadows=true;return mesh;
 };
 for(const side of [-1,1]){box('saddlebag-'+side,.27,.34,.65,side*.385,.53,-.55,paint);box('case-trim-'+side,.275,.025,.66,side*.385,.66,-.55,trim);box('case-mount-'+side,.2,.06,.4,side*.22,.53,-.52,trim);}
 box('rear-backrest',.36,.23,.10,0,.92,-.72,paint);for(const x of [-.14,.14])box('backrest-support',.025,.3,.035,x,.73,-.76,trim);
 const shield=box('windshield',.5,.40,.025,0,1.13,.51,glass);shield.rotation.x=-.18;
 return ()=>{for(const m of [paint,trim,glass])m.dispose();};
}
