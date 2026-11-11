import {Color3,MeshBuilder,StandardMaterial,TransformNode,type Camera,type Scene} from '@babylonjs/core';
/** Original camera-space carbine model, based on the component layout in OffMapBench buildWeapon. */
export function buildOffmapWeapon(scene:Scene,camera:Camera){
 const root=new TransformNode('offmap-weapon',scene);root.parent=camera;
 const mats=['#303638','#626b6e','#292824','#080b0c'].map((hex,i)=>{const m=new StandardMaterial('offmap-gun-material-'+i,scene);m.diffuseColor=Color3.FromHexString(hex);m.emissiveColor=m.diffuseColor.scale(.32);m.specularColor=Color3.White().scale(i===1?.6:.18);m.specularPower=64;return m;});
 const box=(n:string,x:number,y:number,z:number,w:number,h:number,d:number,mi=0)=>{const m=MeshBuilder.CreateBox('offmap-gun-'+n,{width:w,height:h,depth:d},scene);m.parent=root;m.position.set(x,y,z);m.material=mats[mi];m.isPickable=false;m.renderingGroupId=2;return m;};
 box('receiver',0,0,0,.095,.11,.32);box('upper',0,.048,.04,.078,.042,.38,1);box('stock',0,-.017,-.26,.085,.135,.17,2);
 box('butt-pad',0,-.019,-.348,.097,.15,.018,3);box('buffer',0,.012,-.15,.045,.055,.1,1);
 const magazine=box('magazine',0,-.13,.01,.055,.2,.09);magazine.rotation.x=-.18;
 const grip=box('grip',0,-.12,-.105,.053,.145,.064,2);grip.rotation.x=.23;
 box('trigger-guard',0,-.096,-.049,.04,.009,.067,1);box('trigger',0,-.071,-.035,.012,.04,.012,1);
 box('handguard',0,.012,.28,.087,.075,.21,2);
 for(let i=0;i<14;i++)box('rail-'+i,0,.08,-.09+i*.033,.078,.012,.013,1);
 for(const side of [-1,1])for(let i=0;i<5;i++)box('vent',side*.044,.024,.21+i*.032,.002,.019,.02,3);
 const tube=(n:string,z:number,length:number,r:number,mi:number)=>{const m=MeshBuilder.CreateCylinder('offmap-gun-'+n,{diameter:r*2,height:length,tessellation:16},scene);m.parent=root;m.position.set(0,.018,z);m.rotation.x=Math.PI/2;m.material=mats[mi];m.isPickable=false;m.renderingGroupId=2;return m;};
 tube('barrel',.46,.19,.014,1);tube('muzzle',.563,.036,.024,0);tube('bore',.582,.002,.015,3);
 box('rear-sight-base',0,.092,-.09,.065,.012,.025,1);
 for(const x of [-.026,.026])box('rear-sight-post',x,.114,-.09,.013,.039,.025,1);
 box('front-sight',0,.108,.325,.012,.05,.014,1);
 box('bolt',.049,.022,.055,.006,.03,.085,3);box('selector',-.052,-.012,-.077,.009,.014,.037,1);
 const flashMat=new StandardMaterial('offmap-gun-flash',scene);flashMat.disableLighting=true;flashMat.emissiveColor=new Color3(1,.65,.15);
 const flash=MeshBuilder.CreateSphere('offmap-gun-flash',{diameter:.07,segments:6},scene);flash.parent=root;flash.position.set(0,.018,.61);flash.scaling.z=2.6;flash.material=flashMat;flash.isPickable=false;flash.renderingGroupId=2;flash.setEnabled(false);
 // Camera-space geometry does not clip against nearby world surfaces; ballistics still do.
 scene.setRenderingAutoClearDepthStencil(2,true,true,true);
 return {root,flash,magazine,muzzle:()=>flash.getAbsolutePosition().clone(),dispose(){root.dispose();mats.forEach(m=>m.dispose());flashMat.dispose();}};
}
