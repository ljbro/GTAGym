import {Color3,MeshBuilder,PBRMaterial,TransformNode,Vector3,VertexBuffer,VertexData,type Scene,type AbstractMesh} from '@babylonjs/core';
import type {CityData} from './city-types.ts';import type {CityRider} from './city-rider.ts';
import {inRing} from './driving.ts';import {NativeBoatMotion,type BoatSpec} from './native-boat-motion.ts';
import {NativeWatercraftModel} from './native-watercraft-model.ts';import {diveFloor,waterWorld,waterRegionContains} from './native-water-motion.ts';
import type {BeachEnvironment} from './native-beach-terrain.ts';
import {channelContains,waterChannelPath} from './native-water-channel.ts';
import {NativeWaterChannelView} from './native-water-channel-view.ts';
import {clearBoatCamera} from './native-boat-camera.ts';
import {NativeBoatWakeView} from './native-boat-wake-view.ts';
import {NativeSwimEffects} from './native-swim-effects.ts';
export class NativeBoatSite extends NativeBoatMotion{
 readonly root:TransformNode;private craft:NativeWatercraftModel;private swimRider:CityRider|null=null;private deckRider:CityRider|null=null;
 private disposed=false;private firstPerson=false;private lookingBehind=false;private actorsEnabled=true;private material:PBRMaterial|null=null;
 private channelView:NativeWaterChannelView|null=null;
 private wake:NativeBoatWakeView;
 private swimEffects:NativeSwimEffects;
 private cameraBlockers:AbstractMesh[]=[];
 readonly waterAllows:(x:number,z:number,margin?:number)=>boolean;
 constructor(private scene:Scene,spec:BoatSpec,city:CityData,seabed=true,env?:Omit<BeachEnvironment,'land'>,solid:(x:number,z:number)=>boolean=()=>false){
  // Escape is free roaming. Keep the original seabed footprint, but remove
  // the invisible route corridor; real land still blocks boats and pursuers.
  if(spec.objective==='water-escape'){const [x,z]=spec.path.points[0];spec={...spec,channelHalfWidth:undefined,freeRoamRegion:{minX:x-2000,maxX:x+2000,minZ:z-2000,maxZ:z+2000}};}
  const channel=spec.channelHalfWidth?waterChannelPath(spec):null;
  super(spec,(x,z)=>!solid(x,z)&&(!channel||channelContains(channel,spec.channelHalfWidth!,x,z))&&!city.land.some(p=>inRing(x,z,p[0])&&!p.slice(1).some(h=>inRing(x,z,h))),env);
  this.waterAllows=(x,z,margin=0)=>!solid(x,z)&&waterRegionContains(spec,x,z)&&(!channel||channelContains(channel,spec.channelHalfWidth!,x,z,margin))&&!city.land.some(p=>inRing(x,z,p[0])&&!p.slice(1).some(h=>inRing(x,z,h)));
  this.root=new TransformNode('native-boat-task-'+spec.id,scene);this.craft=new NativeWatercraftModel(scene,spec.craft);this.craft.root.parent=this.root;
  this.wake=new NativeBoatWakeView(scene,this.fit.halfWidth,this.fit.length/2,spec.waterHeight);this.wake.mesh.parent=this.root;
  this.swimEffects=new NativeSwimEffects(scene,spec.waterHeight);for(const m of this.swimEffects.meshes)m.parent=this.root;
  this.cameraBlockers=scene.meshes.filter(m=>/^(terrain_|opposite_shore|coastal_shore|ground_relief_|mountain)/.test(m.name)&&m.name!=='terrain_water');
  if(channel){this.channelView=new NativeWaterChannelView(scene,spec);for(const mesh of this.channelView.meshes)mesh.parent=this.root;}
  // Same continuously sampled floor as swimming physics, under native bay water.
  if(seabed){
  const r=spec.region,ground=MeshBuilder.CreateGround('boat-task-seabed',{width:r?r.maxX-r.minX:120,height:r?r.maxZ-r.minZ:spec.path.length+65,subdivisions:this.beach&&r?Math.ceil(Math.max(r.maxX-r.minX,r.maxZ-r.minZ)/2):60,updatable:true},scene),positions=ground.getVerticesData(VertexBuffer.PositionKind)!,normals:number[]=[];
  for(let i=0;i<positions.length;i+=3){const [x,z]=r?[positions[i]+(r.minX+r.maxX)/2,positions[i+2]+(r.minZ+r.maxZ)/2]:waterWorld(spec,positions[i],positions[i+2]+spec.path.length/2+7.5);positions[i]=x;positions[i+1]=this.beach?.at(x,z)??diveFloor(spec,x,z);positions[i+2]=z;
   // Keep unrelated city land visible; only this beach lies above its ground.
   if(this.beach?.env.land(x,z)&&!this.beach.isBeach(x,z))positions[i+1]-=.085;
  }
  VertexData.ComputeNormals(positions,ground.getIndices()!,normals);ground.updateVerticesData(VertexBuffer.PositionKind,positions,true);ground.updateVerticesData(VertexBuffer.NormalKind,normals);ground.parent=this.root;ground.isPickable=false;
  this.material=new PBRMaterial('boat-seabed-sand',scene);this.material.albedoColor=new Color3(.30,.33,.25);this.material.roughness=.95;ground.material=this.material;
  this.cameraBlockers.push(ground);
  }
 }
 async load(){
  try{await this.craft.load();if(this.disposed)return;
   const {createCityRider}=await import('./city-rider.ts');
   const swimmer=await createCityRider(this.scene,'swim');if(this.disposed){swimmer.dispose();return;}this.swimRider=swimmer;
   const deck=await createCityRider(this.scene);if(this.disposed){deck.dispose();return;}this.deckRider=deck;this.sync(0);
  }catch(e){this.dispose();throw e;}
 }
 private sync(dt:number){
  if(this.mode!=='swim'&&this.mode!=='boat')this.firstPerson=false;
  this.craft.setPose(this.boat.x,this.spec.waterHeight,this.boat.z,this.boat.yaw,this.time,this.body);
  this.updateWake(dt);
  const swim=this.mode==='swim';this.swimRider?.setEnabled(this.actorsEnabled&&swim&&!this.firstPerson);this.deckRider?.setEnabled(this.actorsEnabled&&!swim&&!this.firstPerson);
  this.swimEffects.update(this.swimmer.x,this.swimmer.z,this.swimmer.depth,this.swimmer.yaw,this.swimmer.speed,dt,this.actorsEnabled&&swim);
  if(swim)this.swimRider?.setPose({x:this.swimmer.x,y:this.spec.waterHeight,z:this.swimmer.z,yaw:this.swimmer.yaw,speed:Math.hypot(this.swimmer.speed,this.swimmer.verticalSpeed),swimDepth:this.swimmer.depth},dt);
  else{const pose=this.transitionPose,transfer=this.deckTransfer,driving=this.mode==='boat',local=transfer?.seated?[transfer.local[0],this.fit.driver[1]+(this.spec.craft==='zodiac'?.64:.44)*(1-transfer.blend),this.fit.driver[2]]:transfer?.local;
   const p=driving?this.craft.localPoint(this.fit.driver):local?this.craft.localPoint(local):pose?.physicalPosition??this.platform;
   if(this.spec.craft==='jetski')this.deckRider?.setJetskiSeated(driving);else this.deckRider?.setBoatHelmSeated(driving||!!transfer?.seated,transfer?.blend??1,this.spec.craft??'yacht');
   this.deckRider?.setPose({x:p.x,y:p.y,z:p.z,yaw:pose?.bodyYaw??transfer?.yaw??this.boat.yaw,speed:transfer&&!transfer.seated?1.6:0,ridePitch:this.craft.root.rotation.x,rideRoll:this.craft.root.rotation.z},dt);this.deckRider?.setTraversalPose(pose);
  }
 }
 updateWake(dt:number){this.wake.update(this.boat.x,this.boat.z,this.boat.yaw,this.boat.speed,dt,this.body.grounded);}
 override step(keys:ReadonlySet<string>,dt:number){if(dt>0)this.lookingBehind=keys.has('KeyC');super.step(keys,dt);this.sync(dt);}
 override interact(){const result=super.interact();this.sync(0);return result;}
 override reset(){this.lookingBehind=false;super.reset();this.firstPerson=false;this.wake.reset();this.swimEffects.reset();this.sync(0);}
 toggleView(){this.firstPerson=(this.mode==='swim'||this.mode==='boat')&&!this.firstPerson;this.sync(0);}
 setActorsEnabled(enabled:boolean){this.actorsEnabled=enabled;if(!enabled)this.swimEffects.reset();this.sync(0);}
 get camera(){
  if(this.mode==='swim'){
   const f=new Vector3(Math.sin(this.yaw+(this.lookingBehind?Math.PI:0)),0,Math.cos(this.yaw+(this.lookingBehind?Math.PI:0))),target=new Vector3(this.x,this.y+.1,this.z);
   if(this.firstPerson){const eye=target.add(new Vector3(Math.sin(this.yaw)*.6,0,Math.cos(this.yaw)*.6));return {eye,target:eye.add(f).add(new Vector3(0,-Math.sin(this.swimmer.pitch),0))};}
   const eye=target.subtract(f.scale(3.6*Math.cos(this.swimmer.pitch)));eye.y+=.6+Math.sin(this.swimmer.pitch)*3.6;
   if(this.swimmer.depth>.35)eye.y=Math.min(eye.y,this.spec.waterHeight-.2);return {eye,target};
  }
  if(this.mode==='boat'&&this.firstPerson){
   const [x,y,z]=this.fit.driver,eye=this.craft.localPoint([x,y+.78,z+.12]);
   const yaw=this.boat.yaw+this.cameraOrbit+(this.lookingBehind?Math.PI:0),direction=new Vector3(Math.sin(yaw)*Math.cos(this.cameraPitch),-Math.sin(this.cameraPitch),Math.cos(yaw)*Math.cos(this.cameraPitch));
   return {eye,target:eye.add(direction.scale(8))};
  }
  const yaw=this.boat.yaw+this.cameraOrbit+(this.lookingBehind?Math.PI:0),f=new Vector3(Math.sin(yaw),0,Math.cos(yaw)),target=this.transitionPose?new Vector3(this.x,this.y+1.2,this.z):new Vector3(this.boat.x,this.body.bottomY+this.fit.waterline+1.3,this.boat.z);
  const eye=target.subtract(f.scale(this.fit.cameraDistance*Math.cos(this.cameraPitch))).add(new Vector3(0,2+Math.sin(this.cameraPitch)*(this.fit.cameraDistance-2),0));
  return {eye:clearBoatCamera(eye,target,this.cameraBlockers),target};
 }
 get meshes():AbstractMesh[]{return [...this.root.getChildMeshes(),...(this.swimRider?.meshes??[]),...(this.deckRider?.meshes??[])];}
 diagnostics(){return {mode:this.mode,depth:this.swimmer.depth,boarded:this.boarded,boat:{...this.boat},body:this.body,bounds:this.craft.bounds,helm:this.craft.localPoint(this.fit.driver).asArray(),swim:this.swimRider?.swimPoseStats(),seated:this.deckRider?.jetskiPoseStats(),traversal:this.deckRider?.traversalPoseStats(),canFinish:this.canFinish()};}
 dispose(){this.disposed=true;this.wake.dispose();this.swimEffects.dispose();this.channelView?.dispose();this.craft.dispose();this.swimRider?.dispose();this.deckRider?.dispose();this.root.dispose(false,false);this.material?.dispose();}
}
