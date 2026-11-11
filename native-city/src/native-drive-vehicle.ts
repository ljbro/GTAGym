import {LoadAssetContainerAsync,TransformNode,Vector3,Quaternion,VertexBuffer,Mesh,type AbstractMesh,type AssetContainer,type Scene} from '@babylonjs/core';
import '@babylonjs/loaders/glTF';
import {NATIVE_DRIVE_VEHICLES,type NativeDriveKind} from './native-drive-vehicle-spec.ts';
import {createCityRider,type CityRider,type CityRiderOptions} from './city-rider.ts';
import {waitForVehicleRendering} from './native-render-ready.ts';
import {addBaggerDetails} from './native-bagger-details.ts';
import {applyNativeDrivePaint} from './native-drive-paint.ts';
import {drivingSupportHeight} from './driving-surface.ts';
import {attachNativeVehicleDoors,type VehicleDoors} from './native-vehicle-doors.ts';
import type {MotorcycleKnockdown} from './native-vehicle-npc.ts';
import {trafficWheel} from './traffic-appearance.ts';
/** Separate from the hero hierarchy used by legacy NPC/police clones. */
export class NativeDriveVehicle{
 readonly root:TransformNode;private container:AssetContainer|null=null;private disposed=false;private spin=0;
 private wheels:{node:TransformNode;rest:Quaternion;spinSign:number;front:boolean}[]=[];
 private rider:CityRider|null=null;private driverVisible=true;
 private disposeBagger:(()=>void)|null=null;
 bounds:{width:number;height:number;length:number}|null=null;
 trafficGroup:number|null=null;
 private doors:VehicleDoors|null=null;
 private trafficDoors:{node:Mesh;side:number}[]=[];
 setDoor(side:number,openness:number){
  if(this.trafficDoors.length){
   const amount=Number.isFinite(openness)?Math.max(0,Math.min(1,openness)):0;
   for(const door of this.trafficDoors)door.node.rotationQuaternion=Quaternion.RotationAxis(Vector3.Up(),door.side===side?-door.side*1.15*amount:0);
   return;
  }
  if(!this.doors){const fit=NATIVE_DRIVE_VEHICLES[this.kind];this.doors=attachNativeVehicleDoors(this.root,this.bodyMeshes,{width:fit.width,height:fit.height,seatZ:fit.seat[2]});}
  this.doors.update(side,openness);
 }
 get doorAnimationAvailable(){return this.trafficDoors.length>0||(this.doors?.available??false);}
 /** Create one controllable copy without inheriting the shared instance buffers. */
 loadTraffic(sources:readonly Mesh[],group:number){
  if(this.kind!=='traffic-sedan')throw Error('Traffic model kind required');
  for(const source of sources){
   if(!source.geometry)continue;
   const mesh=new Mesh('taken-'+source.name,this.scene);source.geometry.applyToMesh(mesh);
   mesh.subMeshes=[];for(const sub of source.subMeshes)sub.clone(mesh);
   mesh.material=source.material;mesh.sideOrientation=source.sideOrientation;mesh.parent=this.root;mesh.receiveShadows=true;mesh.isPickable=false;
   mesh.metadata=source.metadata;
   const wheel=trafficWheel(mesh);if(wheel){mesh.setPivotPoint(Vector3.FromArray(wheel.center));this.wheels.push({node:mesh,rest:Quaternion.Identity(),spinSign:NATIVE_DRIVE_VEHICLES['traffic-sedan'].wheelRadius/wheel.radius,front:wheel.front});}
   const door=mesh.metadata?.trafficDoor;if(door){mesh.setPivotPoint(Vector3.FromArray(door.hinge));this.trafficDoors.push({node:mesh,side:door.side});}
  }
  if(!this.bodyMeshes.length)throw Error('Traffic car has no geometry');
  this.trafficGroup=group;this.bounds={width:2.1,length:4.9,height:1.65};
 }
 constructor(readonly scene:Scene,readonly kind:NativeDriveKind,private readonly riderOptions:CityRiderOptions={}){this.root=new TransformNode('native-drive-'+kind,scene);}
 async load(){
  if(this.kind==='traffic-sedan')throw Error('Use loadTraffic for an existing traffic vehicle');
  const fit=NATIVE_DRIVE_VEHICLES[this.kind],container=await LoadAssetContainerAsync(fit.file.startsWith('/')?fit.file:'/assets/task-vehicles/'+fit.file,this.scene);
  if(this.kind==='sports-car')for(const root of container.rootNodes)if(root instanceof TransformNode)root.rotationQuaternion=Quaternion.Identity();
  if(this.disposed){container.dispose();return;}this.container=container;container.addAllToScene();for(const a of container.animationGroups)a.stop();
  // The live loop may already have moved/rotated root while the GLB was loading.
  // Measure in an unattached local hierarchy, never in that actor's world pose:
  // otherwise centering subtracts world coordinates and sends the body off-map.
  const heading=new TransformNode('native-drive-heading',this.scene);
  const model=new TransformNode('native-drive-normalized',this.scene);model.parent=heading;for(const node of container.rootNodes)node.parent=model;
  let min=new Vector3(Infinity,Infinity,Infinity),max=min.negate();
  for(const mesh of model.getChildMeshes()){
   const vertices=mesh.getVerticesData(VertexBuffer.PositionKind);if(!vertices)continue;const matrix=mesh.computeWorldMatrix(true);
   for(let i=0;i<vertices.length;i+=3){const p=Vector3.TransformCoordinates(Vector3.FromArray(vertices,i),matrix);min=Vector3.Minimize(min,p);max=Vector3.Maximize(max,p);}
   mesh.isPickable=false;mesh.receiveShadows=true;
  }
  if(!Number.isFinite(min.y))throw Error("The vehicle model being driven has no valid GLB Geometric Shape");
  const scale=fit.length/(max.z-min.z);model.scaling.setAll(scale);model.position.set(-(min.x+max.x)*scale/2,-min.y*scale,-(min.z+max.z)*scale/2);
  const paintedMaterials=applyNativeDrivePaint(this.kind,container.materials);
  this.bounds={width:(max.x-min.x)*scale,height:(max.y-min.y)*scale,length:fit.length};this.root.metadata={nativeDriveKind:this.kind,credit:fit.credit,paintedMaterials};
  heading.rotation.y=fit.heading;heading.parent=this.root;
  if(this.kind==='motorcycle-bagger')this.disposeBagger=addBaggerDetails(this.scene,this.root);
  for(const node of [...container.transformNodes,...container.meshes])if(/^wheel_[lr][fr]$/.test(node.name)||this.kind==='semi-tractor'&&/^wheel_[lr]r2$/.test(node.name)||this.kind==='atv'&&/^wheel-[lr][fr]$/.test(node.name)||['box-truck','sedan-red'].includes(this.kind)&&node.name==='wheel_rear_axle')this.wheels.push({node,rest:node.rotationQuaternion?.clone()??Quaternion.FromEulerVector(node.rotation),spinSign:['semi-tractor','atv','box-truck','sedan-red'].includes(this.kind)?1:node.name[6]==='r'?-1:1,front:node.name.endsWith('f')});
  if(this.kind.startsWith('motorcycle')||this.kind==='atv'){const rider=await createCityRider(this.scene,'ground',this.riderOptions);if(this.disposed){rider.dispose();return;}this.rider=rider;if(this.kind==='atv')rider.setAtvSeated(true);else rider.setMotorcycleSeated(true);}
 }
 sync(p:{x:number;z:number;yaw:number;speed:number;steer:number;knockdown?:MotorcycleKnockdown|null},height:(x:number,z:number)=>number,dt:number){
  const fit=NATIVE_DRIVE_VEHICLES[this.kind],s=Math.sin(p.yaw),c=Math.cos(p.yaw),span=fit.length*.6;
  const support=(x:number,z:number)=>drivingSupportHeight(height,p.x,p.z,x,z);
  const pitch=-Math.atan2(support(p.x+s*span/2,p.z+c*span/2)-support(p.x-s*span/2,p.z-c*span/2),span);
  const roll=Math.atan2(support(p.x+c*fit.width/2,p.z-s*fit.width/2)-support(p.x-c*fit.width/2,p.z+s*fit.width/2),fit.width);
  const fallen=this.kind.startsWith('motorcycle')?p.knockdown:null;
  const lean=this.kind.startsWith('motorcycle')?Math.max(-.22,Math.min(.22,-p.steer*Math.abs(p.speed)*.025))*(1-(fallen?.blend??0))+(fallen?.blend??0)*(fallen?.side??1)*1.35:0;
  this.root.rotation.set(pitch,p.yaw,roll+lean);this.root.position.set(p.x,height(p.x,p.z)+.105+Math.abs(Math.sin((fallen?.blend??0)*1.35))*fit.width/2,p.z);this.spin+=p.speed*dt/fit.wheelRadius;
  for(const wheel of this.wheels)wheel.node.rotationQuaternion=Quaternion.RotationAxis(Vector3.Up(),wheel.front?-p.steer:0).multiply(wheel.rest).multiply(Quaternion.RotationAxis(Vector3.Right(),this.spin*wheel.spinSign));
  if(this.rider){const seat=Vector3.TransformCoordinates(this.kind==='atv'?new Vector3(0,1.08,-.23):new Vector3(0,.68,-.13),this.root.computeWorldMatrix(true));this.rider.setEnabled(this.driverVisible&&this.root.isEnabled());this.rider.setPose({x:seat.x,y:seat.y,z:seat.z,yaw:p.yaw,speed:0,ridePitch:pitch,rideRoll:roll+lean},dt);}
 }
 setDriverVisible(visible:boolean){this.driverVisible=visible;this.rider?.setEnabled(visible&&this.root.isEnabled());}
 async prepareForRendering(){
  // Pre-build doors while the loading screen is up, not on the first F press.
  if(!this.kind.startsWith('motorcycle')&&this.kind!=='atv')this.setDoor(1,0);
  const result=await waitForVehicleRendering(this.bodyMeshes.filter(m=>m.isEnabled()),{cancelled:()=>this.disposed});
  this.root.metadata={...this.root.metadata,renderReady:result};return result;
 }
 get riderStats(){return this.rider?.jetskiPoseStats()??null;}
 get wheelStats(){return this.wheels.map(w=>({name:w.node.name,front:w.front,rotation:w.node.rotationQuaternion?.asArray(),position:w.node.getAbsolutePosition().asArray()}));}
 get bodyMeshes():AbstractMesh[]{return this.root.getChildMeshes().filter(m=>m.getTotalVertices()>0);}
 get meshes():AbstractMesh[]{return [...this.bodyMeshes,...(this.rider?.meshes??[])];}
 dispose(){this.disposed=true;this.rider?.dispose();this.rider=null;this.doors?.dispose();this.container?.dispose();this.root.dispose(false,false);this.disposeBagger?.();this.disposeBagger=null;}
}
