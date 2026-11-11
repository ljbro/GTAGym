import {Color3,MeshBuilder,PBRMaterial,Texture,TransformNode,type Scene} from '@babylonjs/core';
import type {ShoreBoatSpec} from './native-shore-boat-motion.ts';
import {transferPlatformCenter} from './native-water-transfer.ts';

export class NativeWaterTransferView{
 readonly root:TransformNode;private materials:PBRMaterial[]=[];
 constructor(scene:Scene,spec:ShoreBoatSpec){
  this.root=new TransformNode('water-transfer-platform-'+spec.id,scene);
  const [x,z]=transferPlatformCenter(spec);this.root.position.set(x,spec.waterHeight,z);this.root.rotation.y=Math.atan2(spec.path.forward[0],spec.path.forward[1]);
  const material=(name:string,color:number[],metallic=0)=>{const m=new PBRMaterial('transfer-'+name,scene);m.albedoColor=new Color3(...color as [number,number,number]);m.metallic=metallic;m.roughness=.85;this.materials.push(m);return m;};
  const concrete=material('weathered-concrete',[.51,.55,.53]),steel=material('steel',[.24,.29,.31],.65),rubber=material('fender',[.055,.065,.07]),paint=material('paint',[.77,.63,.19]),hut=material('hut',spec.id==='c06-n05'?[.26,.43,.52]:[.46,.49,.35]);
  concrete.albedoTexture=new Texture('/assets/interiors/native-materials/concrete_floor_02_diff.webp',scene);(concrete.albedoTexture as Texture).uScale=4;(concrete.albedoTexture as Texture).vScale=3;
  const box=(name:string,u:number,y:number,v:number,w:number,h:number,d:number,m:PBRMaterial)=>{const b=MeshBuilder.CreateBox('transfer-'+name,{width:w,height:h,depth:d},scene);b.position.set(u,y,v);b.parent=this.root;b.material=m;b.receiveShadows=true;return b;};
  // Full caisson, founded below the seabed: no floating building or wafer floor.
  box('caisson',0,-1.3,0,22,4.6,20,concrete);
  box('deck',0,1.1,0,22,.2,20,concrete);
  box('front-fender',0,.25,-10.12,21,.48,.24,rubber);
  for(const side of [-1,1]){
   for(let v=-9;v<=9;v+=3)box('rail-post',side*10.6,1.75,v,.09,1.1,.09,steel);
   box('rail',side*10.6,2.25,0,.09,.09,19,paint);
   for(let u=-9;u<=9;u+=3)if(side===1||Math.abs(u)>3)box('end-post',u,1.75,side*9.6,.09,1.1,.09,steel);
   if(side===1)box('end-rail',0,2.25,9.6,20,.09,.09,paint);
   else for(const s of [-1,1])box('front-rail',s*6.7,2.25,-9.6,7,.09,.09,paint);
  }
  box('service-hut',-4,3.1,4,7,3.8,7,hut);box('hut-roof',-4,5.08,4,7.6,.16,7.6,steel);
  box('door',-3,2.4,.47,1.3,2.4,.08,steel);box('door-handle',-2.5,2.4,.39,.06,.3,.06,paint);
  for(let i=0;i<3;i++)box('supply-crate',5,1.8,2+i*2,1.7,1.2,1.5,hut);
  for(const u of [-8,8]){box('bollard',u,1.45,-8,.35,.5,.35,steel);box('bollard-bar',u,1.6,-8,.85,.13,.13,steel);}
  box('beacon-mast',7,4.2,7,.16,6,.16,steel);
  const lamp=material('beacon',[1,.7,.23]);lamp.emissiveColor=new Color3(.7,.35,.06);box('beacon',7,7.35,7,.55,.3,.55,lamp);
 }
 get meshes(){return this.root.getChildMeshes();}
 dispose(){this.root.dispose(false,false);for(const m of this.materials)m.dispose(false,true);}
}
