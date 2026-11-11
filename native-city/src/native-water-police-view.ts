import {Color3,Mesh,MeshBuilder,PBRMaterial,TransformNode,Vector3,VertexBuffer,VertexData,type Scene,type AbstractMesh} from '@babylonjs/core';
import {NativeWatercraftModel} from './native-watercraft-model.ts';
import {createCityRider,type CityRider} from './city-rider.ts';
import type {PoliceUnit} from './offmap-navigation-police.ts';
import {WATERCRAFT} from './native-watercraft-spec.ts';
import {NativeBoatWakeView} from './native-boat-wake-view.ts';
/** One rigid GLB/pilot prototype; all reinforcements share its geometry/textures. */
export class NativeWaterPoliceView{
 private prototype:TransformNode;private craft:NativeWatercraftModel;private rider:CityRider|null=null;
 private actors=new Map<string,TransformNode>();private lamps:PBRMaterial[]=[];private disposed=false;
 private wakes=new Map<string,NativeBoatWakeView>();
 constructor(private scene:Scene,private setMeshes:(meshes:AbstractMesh[])=>void){
  this.prototype=new TransformNode('native-water-police-prototype',scene);this.craft=new NativeWatercraftModel(scene,'jetski');this.craft.root.parent=this.prototype;
 }
 async load(){
  await this.craft.load();if(this.disposed)return;this.craft.setPose(0,0,0,0);
  const rider=await createCityRider(this.scene);if(this.disposed){rider.dispose();return;}this.rider=rider;
  rider.setEnabled(true);rider.setJetskiSeated(true);rider.setPose({x:0,y:WATERCRAFT.jetski.platformHeight,z:WATERCRAFT.jetski.platform[1],yaw:0,speed:0},0);
  // Apply the procedural seated override without requiring a running GPU loop.
  this.scene.onBeforeAnimationsObservable.notifyObservers(this.scene);this.scene.onAfterAnimationsObservable.notifyObservers(this.scene);
  for(const source of rider.meshes){source.computeWorldMatrix(true);source.skeleton?.prepare(true);const positions=source.getPositionData(true,true),normals=source.getNormalsData(true,true);if(!positions)continue;
   const p:number[]=[],n:number[]=[],matrix=source.getWorldMatrix();
   for(let i=0;i<positions.length;i+=3){p.push(...Vector3.TransformCoordinates(Vector3.FromArray(positions,i),matrix).asArray());if(normals)n.push(...Vector3.TransformNormal(Vector3.FromArray(normals,i),matrix).normalize().asArray());}
   const data=new VertexData();data.positions=p;data.normals=n;data.indices=source.getIndices();data.uvs=source.getVerticesData(VertexBuffer.UVKind);const mesh=new Mesh('water-police-seated-pilot',this.scene);data.applyToMesh(mesh);mesh.material=source.material;mesh.parent=this.prototype;mesh.isPickable=false;
  }
  rider.setEnabled(false);
  for(const [i,color]of [new Color3(.8,.025,.015),new Color3(.015,.16,.9)].entries()){
   const mat=new PBRMaterial('water-pursuer-lamp-'+i,this.scene);mat.albedoColor=color;mat.emissiveColor=color.scale(1.5);this.lamps.push(mat);
   const light=MeshBuilder.CreateBox('water-pursuer-lamp-'+i,{width:.14,height:.12,depth:.14},this.scene);light.parent=this.prototype;light.position.set((i-.5)*.4,.78,-.9);light.material=mat;light.isPickable=false;
  }
  this.prototype.setEnabled(false);
 }
 update(units:PoliceUnit[],dt:number){
  if(this.disposed)return;
  const ids=new Set(units.map(u=>u.id));for(const [id,root]of this.actors)if(!ids.has(id)){root.dispose(false,false);this.actors.delete(id);this.wakes.get(id)?.dispose();this.wakes.delete(id);}
  for(const unit of units){let root=this.actors.get(unit.id);if(!root){root=this.prototype.clone('water-'+unit.id,null,false)!;root.setEnabled(true);this.actors.set(unit.id,root);this.wakes.set(unit.id,new NativeBoatWakeView(this.scene,WATERCRAFT.jetski.halfWidth,WATERCRAFT.jetski.length/2,unit.position.y));}root.position.set(unit.position.x,unit.position.y,-unit.position.z);root.rotation.y=-unit.yaw;this.wakes.get(unit.id)!.update(root.position.x,root.position.z,root.rotation.y,unit.speed,dt,false);}
  this.setMeshes([...this.actors.values()].flatMap(root=>root.getChildMeshes()).concat([...this.wakes.values()].map(w=>w.mesh)));
 }
 dispose(){if(this.disposed)return;this.disposed=true;for(const root of this.actors.values())root.dispose(false,false);this.actors.clear();for(const w of this.wakes.values())w.dispose();this.wakes.clear();this.prototype.dispose(false,false);this.craft.dispose();this.rider?.dispose();for(const m of this.lamps)m.dispose();this.setMeshes([]);}
}
