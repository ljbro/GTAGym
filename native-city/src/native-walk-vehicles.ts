import {LoadAssetContainerAsync,TransformNode,Vector3,VertexBuffer,MeshBuilder,PBRMaterial,type AssetContainer,type Scene} from '@babylonjs/core';
import '@babylonjs/loaders/glTF';
import type {V2} from './city-types.ts';
import {WALK_VEHICLES,placeWalkVehicle,vehicleBlocks,type VehiclePose,type WalkVehicleRequest} from './native-walk-vehicle-layout.ts';
type Host={scene:Scene;groundHeight:(x:number,z:number)=>number;walkingSurfaceHeight?:(x:number,z:number)=>number;collision:{blocked:(x:number,z:number)=>boolean};propBlocked?:(x:number,z:number)=>boolean};
export class NativeWalkVehicles{
 private containers:AssetContainer[]=[];private disposed=false;private materials:PBRMaterial[]=[];
 readonly poses:(VehiclePose&{model:string;at:number;fallen:boolean})[]=[];
 constructor(private root:TransformNode,private host:Host,private ownBlocked:(x:number,z:number)=>boolean){}
 async load(id:string,points:readonly V2[],placement?:VehiclePose,requests?:readonly WalkVehicleRequest[]){
  try{for(const request of requests??WALK_VEHICLES[id]??[]){
   const container=await LoadAssetContainerAsync(`/assets/task-vehicles/${request.model}.glb`,this.host.scene);
   if(this.disposed){container.dispose();return;}
   this.containers.push(container);container.addAllToScene();
   const model=new TransformNode(`${id}-${request.model}-GLB`,this.host.scene);model.parent=this.root;
   for(const node of container.rootNodes)node.parent=model;
   if(request.fallen)model.rotation.z=1.35;
   const meshes=model.getChildMeshes().filter(m=>m.getTotalVertices()>0);
   if(!meshes.length)throw Error("Vehicle GLB No geometry");
   let min=new Vector3(Infinity,Infinity,Infinity),max=min.negate();
   // Actual transformed vertices, not rotated AABB corners: the latter make a
   // fallen motorcycle float above ground and exaggerate a rotated van's width.
   for(const mesh of meshes){const matrix=mesh.computeWorldMatrix(true),positions=mesh.getVerticesData(VertexBuffer.PositionKind)!;
    for(let i=0;i<positions.length;i+=3){const v=Vector3.TransformCoordinates(Vector3.FromArray(positions,i),matrix);min=Vector3.Minimize(min,v);max=Vector3.Maximize(max,v);}
    mesh.isPickable=false;mesh.receiveShadows=true;
   }
   const blocked=(x:number,z:number)=>this.host.collision.blocked(x,z)||!!this.host.propBlocked?.(x,z)||this.ownBlocked(x,z)||this.blocked(x,z);
   const surface=(x:number,z:number)=>this.host.walkingSurfaceHeight?.(x,z)??this.host.groundHeight(x,z)+.105;
   if(requests&&placement&&(Math.abs(placement.width-(max.x-min.x))>.001||Math.abs(placement.depth-(max.z-min.z))>.001))throw Error('Training landmark GLB bounds have changed; regenerate the dataset');
   const pose=placement?{...placement,width:max.x-min.x,depth:max.z-min.z}:placeWalkVehicle(points,request.at,max.x-min.x,max.z-min.z,blocked,surface);
   // Separate pose from model roll so the collider matches the visible footprint.
   const parked=new TransformNode(`${id}-${request.model}-parked`,this.host.scene);parked.parent=this.root;model.parent=parked;
   model.position.set(-(min.x+max.x)/2,-min.y,-(min.z+max.z)/2);parked.position.set(pose.x,pose.y,pose.z);parked.rotation.set(pose.pitch??0,pose.yaw,pose.roll??0);
   parked.metadata={taskVehicle:true,model:request.model,source:'assets/task-vehicles/manifest.json',note:request.note};
   if(request.model.includes('motorcycle')&&!request.fallen){
    const stand=MeshBuilder.CreateBox(`${id}-motorcycle-stand`,{width:.045,height:.29,depth:.055},this.host.scene);stand.parent=parked;stand.position.set(.26,.145,-.12);stand.rotation.z=-.28;stand.isPickable=false;
    const steel=new PBRMaterial(`${id}-stand-steel`,this.host.scene);steel.albedoColor.set(.12,.14,.15);steel.metallic=.8;steel.roughness=.35;stand.material=steel;this.materials.push(steel);
   }
   this.poses.push({...pose,model:request.model,at:request.at,fallen:!!request.fallen});
  }}catch(error){this.dispose();throw error;}
 }
 blocked(x:number,z:number){return this.poses.some(p=>vehicleBlocks(p,x,z));}
 dispose(){if(this.disposed)return;this.disposed=true;for(const c of this.containers)c.dispose();for(const m of this.materials)m.dispose();this.containers=[];this.poses.length=0;}
}
