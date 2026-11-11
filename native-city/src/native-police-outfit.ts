import {MeshBuilder,PBRMaterial,Color3,TransformNode,type AbstractMesh,type Scene,type Material} from '@babylonjs/core';
/** Police presentation on the existing Michael rig, not a new licensed police asset.
 * Separate imported materials ensure player/follow NPC skins remain untouched. */
export function createPoliceOutfit(scene:Scene,nodes:readonly TransformNode[],materials:readonly Material[]){
 const head=nodes.find(n=>n.name==='head'),chest=nodes.find(n=>n.name==='spine_03');
 if(!head||!chest)throw Error('Police outfit requires humanoid head/chest bones');
 for(const material of materials)if(material instanceof PBRMaterial&&['Material__72','Material__74','Material__73'].includes(material.name)){
  material.albedoColor=new Color3(.10,.16,.25);material.roughness=.9;material.metallic=0;
 }
 const cloth=new PBRMaterial('police-navy-cloth',scene);cloth.albedoColor=new Color3(.015,.03,.06);cloth.roughness=.92;
 const black=new PBRMaterial('police-cap-visor',scene);black.albedoColor=new Color3(.012,.016,.022);black.roughness=.5;
 const gold=new PBRMaterial('police-insignia',scene);gold.albedoColor=new Color3(.75,.58,.18);gold.metallic=.65;gold.roughness=.4;
 const meshes:AbstractMesh[]=[];
 const cap=MeshBuilder.CreateCylinder('police-cap-crown',{diameterTop:.235,diameterBottom:.22,height:.08,tessellation:32},scene);cap.parent=head;cap.position.set(0,.132,0);cap.material=cloth;meshes.push(cap);
 const visor=MeshBuilder.CreateSphere('police-cap-visor',{diameter:1,segments:16},scene);visor.parent=head;visor.scaling.set(.23,.018,.16);visor.position.set(0,.099,.09);visor.material=black;meshes.push(visor);
 for(const [name,parent,y,z,size,x] of [['cap',head,.133,.118,.026,0],['chest',chest,.23,.17,.05,.075]] as const){
  const badge=MeshBuilder.CreateCylinder('police-'+name+'-badge',{diameter:size,height:.005,tessellation:6},scene);badge.parent=parent;badge.rotation.x=Math.PI/2;badge.position.set(x,y,z);badge.material=gold;meshes.push(badge);
 }
 for(const mesh of meshes){mesh.isPickable=false;mesh.receiveShadows=true;mesh.alwaysSelectAsActiveMesh=true;}
 return {meshes,dispose(){for(const m of meshes)m.dispose();cloth.dispose();black.dispose();gold.dispose();}};
}
