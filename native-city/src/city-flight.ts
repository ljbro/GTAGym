import {ImportMeshAsync,TransformNode,Quaternion,Vector3,Ray,Matrix,PBRMaterial,MeshBuilder,Color3,type AbstractMesh,type Scene} from '@babylonjs/core';
import {HelicopterSimulation} from './city-helicopter-simulation.ts';
import type {FlightModel} from './native-flight-catalog.ts';
import type {CityWalk} from './city-walk.ts';
import type {CityData} from './city-types.ts';
import {FlightExplosion} from './city-flight-explosion.ts';
import {FlightCityCollision} from './city-flight-collision.ts';
import {FlightMissiles} from './city-flight-missiles.ts';
import {FlightSimulation,flightPoint,flightChaseCamera,type FlightPoint,type FlightHit} from './city-flight-simulation.ts';
import {FLIGHT_GEAR_CLEARANCE,runwayContains,type FlightRunway} from './city-flight-ground.ts';

const vector=(p:FlightPoint)=>new Vector3(p.x,p.y,p.z);
type ModelAsset={root:TransformNode;meshes:AbstractMesh[];gear:TransformNode|null;propeller:TransformNode|null;rotors:{node:TransformNode;axis:Vector3;angle:number}[]};
type MeshCollider={mesh:AbstractMesh;world:Matrix;inverse:Matrix;min:Vector3;max:Vector3};
function boxInterval(a:FlightPoint,b:FlightPoint,min:Vector3,max:Vector3){
 let near=0,far=1;
 for(const axis of ['x','y','z'] as const){const d=b[axis]-a[axis];if(Math.abs(d)<1e-9){if(a[axis]<min[axis]||a[axis]>max[axis])return false;}else{const u=(min[axis]-a[axis])/d,v=(max[axis]-a[axis])/d;near=Math.max(near,Math.min(u,v));far=Math.min(far,Math.max(u,v));if(near>far)return false;}}
 return true;
}

/** One aircraft with pooled missiles and crash FX. No extra render loop. */
export class CityFlight{
 sim:FlightSimulation=new FlightSimulation();readonly root:TransformNode;model:FlightModel='plane';
 meshes:AbstractMesh[]=[];loading=false;loaded=false;parked=false;
 cameraView=0;cameraYawOffset=0;cameraPitchOffset=0;private lookReturn=0;private lookingBehind=false;
 look(dx:number,dy:number){
  if(!Number.isFinite(dx)||!Number.isFinite(dy)||this.sim.phase!=='flying')return;
  this.cameraYawOffset+=dx*.005;this.cameraPitchOffset=Math.max(-.2,Math.min(1,this.cameraPitchOffset+dy*.002));if(dx||dy)this.lookReturn=2;
 }
 get doorOffset(){return this.model==='cargobob'?3.2:this.model==='frogger'?1.8:2.4;}
 canBoard(walk:CityWalk|null){return !!walk?.active&&this.parked&&!this.loading&&walk.canEnter({...this.sim.pose,speed:0},this.doorOffset+3,this.doorOffset);}
 private assets=new Map<FlightModel,ModelAsset>();private promises=new Map<FlightModel,Promise<ModelAsset>>();private propeller:TransformNode|null=null;
 private collision:FlightCityCollision;private colliders:MeshCollider[]=[];
 private explosion:FlightExplosion|null=null;private missiles:FlightMissiles|null=null;private impactEye=Vector3.Zero();
 private eye=Vector3.Zero();private target=Vector3.Zero();private crashPoint=Vector3.Zero();private dead=false;
 constructor(private scene:Scene,private data:CityData,private heightAt:(x:number,z:number)=>number,landmarks:AbstractMesh[],private onExplosion:()=>void,runways:readonly FlightRunway[]=[]){
  this.sim.runways=runways;
  this.root=new TransformNode('bay-flight',scene);this.root.setEnabled(false);
  this.collision=new FlightCityCollision(data,heightAt);
  // Real landmark triangles preserve passages and bridge-like overhangs.
  // Ordinary buildings use their original footprint + roof height instead.
  for(const mesh of landmarks){
   if(mesh.isDisposed()||!mesh.getTotalVertices()||!/^(landmark_|detail_|civic_|bamboo_cafe_)/.test(mesh.name)||/terrain|lianhua|mountain|plant|tree|lamp|sign|light|shore|ground|paving|road/.test(mesh.name))continue;
   const world=mesh.computeWorldMatrix(true).clone(),bounds=mesh.getBoundingInfo().boundingBox;
   this.colliders.push({mesh,world,inverse:Matrix.Invert(world),min:bounds.minimumWorld.clone(),max:bounds.maximumWorld.clone()});
  }
 }
 get active(){return this.sim.active;}
 get stats(){return {...this.sim.status,model:this.model,rotorCount:this.assets.get(this.model)?.rotors.length??0,rotorAngle:this.assets.get(this.model)?.rotors[0]?.angle??0,loading:this.loading,loaded:this.loaded,altitude:Math.max(0,this.sim.pose.y-this.heightAt(this.sim.pose.x,this.sim.pose.z)-FLIGHT_GEAR_CLEARANCE),meshCount:this.meshes.length,landmarkColliders:this.colliders.length,explosionParticles:this.explosion?.stats.particles??0,explosion:this.explosion?.stats??null,missiles:this.missiles?.stats??null};}
 get modelRoot(){return this.assets.get(this.model)?.root??this.root;}
 async load(model:FlightModel=this.model){
  if(this.loaded&&this.model===model)return;
  this.loading=true;
  try{
   let asset=this.assets.get(model);
   if(!asset){
    let pending=this.promises.get(model);if(!pending){pending=this.loadModel(model);this.promises.set(model,pending);}
    try{asset=await pending;}finally{this.promises.delete(model);}if(this.dead){asset.root.dispose(false,true);return;}this.assets.set(model,asset);
   }
   this.stop();for(const item of this.assets.values())item.root.setEnabled(false);
   asset.root.setEnabled(true);this.meshes=asset.meshes;this.propeller=asset.propeller;
   if(this.model!==model){const runways=this.sim.runways;this.sim=model==='plane'?new FlightSimulation():new HelicopterSimulation(model);this.sim.runways=runways;}
   this.model=model;this.loaded=true;
   this.explosion??=new FlightExplosion(this.scene);this.missiles??=new FlightMissiles(this.scene,this.sweep,this.onExplosion);
   for(let i=0;i<100&&(!this.explosion.isReady()||!this.missiles.isReady());i++)await new Promise(resolve=>setTimeout(resolve,20));
  }finally{this.loading=false;}
 }
 private async loadModel(model:FlightModel):Promise<ModelAsset>{
  const result=await ImportMeshAsync(model==='plane'?'/city/floatplane.glb':'/city/helicopters/'+model+'.glb',this.scene);
  const root=new TransformNode('city-aircraft-'+model,this.scene);root.parent=this.root;root.setEnabled(false);
  result.meshes[0].rotationQuaternion=Quaternion.Identity();result.meshes[0].parent=root;
  const meshes=result.meshes.filter(m=>m.getTotalVertices()>0),rotors:ModelAsset['rotors']=[];
  let gear:TransformNode|null=null;
  if(model==='plane'){
   gear=new TransformNode('flight-landing-gear',this.scene);gear.parent=root;
   const rubber=new PBRMaterial('flight-landing-tyres',this.scene);rubber.albedoColor=new Color3(.035,.04,.045);rubber.metallic=0;rubber.roughness=.95;
   for(const [x,y,z,r] of [[-1.64,-1.8,.8,.45],[1.64,-1.8,.8,.45],[0,-1.9,-4,.35]]){
    const wheel=MeshBuilder.CreateCylinder('flight-landing-wheel',{diameter:r*2,height:.35,tessellation:16},this.scene);
    wheel.parent=gear;wheel.position.set(x,y,z);wheel.rotation.z=Math.PI/2;wheel.material=rubber;meshes.push(wheel);
   }
  }else{
   // Archived models already put skids/wheels at local Y=0. The solver's
   // origin is gear-clearance metres above the shared runway deck.
   root.position.y=-FLIGHT_GEAR_CLEARANCE;
   const response=await fetch('/city/helicopters/'+model+'.json');if(!response.ok)throw Error("Helicopter rotor information failed to load");
   const metadata=await response.json() as {rotors:{pivot:number[];axis:number[];parts:string[]}[]};
   const nodes=[...result.transformNodes,...result.meshes];
   metadata.rotors.forEach((rotor,index)=>{
    for(const part of rotor.parts){const node=nodes.find(n=>n.name===part);if(!node)continue;
     if(part.endsWith('_fast')){node.setEnabled(false);continue;}
     node.rotationQuaternion=null;node.setPivotPoint(Vector3.FromArray(rotor.pivot).subtract(node.position));
     rotors.push({node,axis:Vector3.FromArray(rotor.axis).scale(index%2?-1:1),angle:0});
    }
   });
  }
  for(const mesh of meshes){mesh.isPickable=false;mesh.receiveShadows=true;mesh.unfreezeWorldMatrix();if(mesh.material instanceof PBRMaterial){mesh.material.environmentIntensity=1;mesh.material.maxSimultaneousLights=4;}}
  const propeller=result.transformNodes.find(n=>n.name==='floatplane_propeller')??null;if(propeller)propeller.rotationQuaternion=null;
  return {root,meshes,rotors,propeller,gear};
 }
 private sweep=(a:FlightPoint,b:FlightPoint):FlightHit|null=>{
  let hit=this.collision.sweep(a,b),closest=hit?Vector3.Distance(vector(a),vector(hit.point)):Infinity;
  const start=vector(a),delta=vector(b).subtract(start),length=delta.length();if(length<1e-6)return hit;
  const ray=new Ray(start,delta.scale(1/length),length);
  for(const c of this.colliders){if(c.mesh.isDisposed()||!boxInterval(a,b,c.min,c.max))continue;
   const pick=c.mesh.intersects(Ray.Transform(ray,c.inverse),false,undefined,false,c.world);
   if(pick.hit&&pick.pickedPoint){const distance=Vector3.Distance(start,pick.pickedPoint);if(distance<=length+.001&&distance<closest){closest=distance;hit={point:{x:pick.pickedPoint.x,y:pick.pickedPoint.y,z:pick.pickedPoint.z},kind:'building',id:c.mesh.name};}}
  }
  return hit;
 };
 start(eye:FlightPoint,yaw:number){
  if(!this.loaded||this.dead)return false;
  this.clearEffects();const extent=this.data.meta.extent;
  const p={x:Math.max(extent[0]+80,Math.min(extent[2]-80,eye.x)),y:Math.max(80,eye.y),z:Math.max(extent[1]+80,Math.min(extent[3]-80,eye.z))};
  p.y=Math.max(p.y,this.heightAt(p.x,p.z)+65);let clear=false;
  // Spawn only into free air, with room for the first second of forward flight.
  for(let i=0;i<60&&p.y<=2050;i++,p.y+=25){const pose={...p,yaw,pitch:0,roll:0};clear=true;
   for(const side of [-7,0,7]){const from=flightPoint(pose,side,-6,-1.5),to=flightPoint(pose,side,60,2.4);if(this.sweep(from,to)){clear=false;break;}}
   if(clear)break;
  }
  if(!clear)return false;
  this.parked=false;this.cameraYawOffset=0;this.cameraPitchOffset=0;this.lookReturn=0;this.lookingBehind=false;this.sim.start(p,yaw);this.root.setEnabled(true);this.syncModel(0);
  const camera=this.chase();this.eye.copyFrom(camera.eye);this.target.copyFrom(camera.target);return true;
 }
 park(point:FlightPoint,yaw:number){
  if(!this.loaded||this.dead)return false;
  this.clearEffects();this.sim.start(point,yaw);this.sim.stop();this.parked=true;this.root.setEnabled(true);this.syncModel(0);return true;
 }
 startGround(point:FlightPoint,yaw:number){
  if(!this.loaded||this.dead)return false;
  const runway=this.sim.runways.find(r=>runwayContains(r,point,7)&&Math.abs(point.y-r.y-FLIGHT_GEAR_CLEARANCE)<.05);
  if(!runway)return false;
  const pose={...point,yaw,pitch:0,roll:0};
  for(const side of [-7,0,7])if(this.sweep(flightPoint(pose,side,-5,-1.4),flightPoint(pose,side,5,-1.4)))return false;
  this.clearEffects();this.parked=false;this.cameraView=0;this.cameraYawOffset=0;this.cameraPitchOffset=0;this.lookReturn=0;this.lookingBehind=false;this.sim.start(point,yaw);this.sim.startEngine();this.root.setEnabled(true);this.syncModel(0);
  const camera=this.chase();this.eye.copyFrom(camera.eye);this.target.copyFrom(camera.target);return true;
 }
 stop(){this.parked=false;this.sim.stop();this.root.setEnabled(false);this.clearEffects();}
 fire(){return this.model==='plane'&&this.loaded&&this.sim.phase==='flying'&&!this.dead?this.missiles?.fire(this.sim.pose,this.sim.speed)??false:false;}
 step(keys:ReadonlySet<string>,dt:number,now:number){
  this.lookingBehind=keys.has('KeyC');this.lookReturn=Math.max(0,this.lookReturn-dt);
  if(!this.lookingBehind&&this.lookReturn===0&&this.sim.speed>.5){const amount=1-Math.exp(-dt*3);this.cameraYawOffset-=Math.atan2(Math.sin(this.cameraYawOffset),Math.cos(this.cameraYawOffset))*amount;this.cameraPitchOffset*=1-amount;}
  if(this.sim.phase==='flying'&&keys.has('Space'))this.fire();
  const result=this.sim.step(keys,dt,now,this.sweep,this.data.meta.extent);
  if(result==='crashed'){this.missiles?.clear();this.root.setEnabled(false);this.burst(vector(this.sim.hit!.point));this.onExplosion();}
  if(this.sim.phase==='flying')this.missiles?.step(dt);
  if(this.sim.phase==='flying')this.syncModel(dt);
  if(this.sim.phase==='exploding'){
   const seconds=(now-this.sim.crashedAt)/1000;this.explosion?.step(seconds);
   const away=this.impactEye.subtract(this.crashPoint).normalize(),desired=this.impactEye.add(away.scale(8*(1-Math.exp(-seconds*3))));
   const wall=this.sweep(this.impactEye,desired);this.eye.copyFrom(wall?this.impactEye:desired);
   const shake=.35*Math.exp(-seconds*3.5);this.eye.x+=Math.sin(seconds*63)*shake;this.eye.y+=Math.cos(seconds*71)*shake*.6;
   this.target.copyFrom(this.crashPoint).addInPlaceFromFloats(0,2+seconds*2.8,0);
  }else if(this.sim.phase==='flying'){
   const desired=this.chase(),amount=1-Math.exp(-dt*7);this.eye=Vector3.Lerp(this.eye,desired.eye,amount);this.target.copyFrom(desired.target);
   const origin={x:this.sim.pose.x,y:this.sim.pose.y+1,z:this.sim.pose.z},obstacle=this.sweep(origin,this.eye);
   if(obstacle){const direction=this.eye.subtract(vector(origin)).normalize(),distance=Math.max(1,Vector3.Distance(vector(origin),vector(obstacle.point))-1.2);this.eye.copyFrom(vector(origin).add(direction.scale(distance)));}
  }
  return result;
 }
 get camera(){return {eye:this.eye,target:this.target};}
 private chase(){
  const shot=flightChaseCamera(this.sim.pose),p=vector(this.sim.pose),eye=this.cameraView?p.add(vector(shot.eye).subtract(p).scale(1.6)):vector(shot.eye),target=vector(shot.target);
  if(!this.cameraYawOffset&&!this.cameraPitchOffset&&!this.lookingBehind)return {eye,target};
  const radius=Vector3.Distance(eye,target),offset=eye.subtract(target),yaw=Math.atan2(offset.x,offset.z)+this.cameraYawOffset+(this.lookingBehind?Math.PI:0);
  const pitch=Math.max(.03,Math.min(1.3,Math.atan2(offset.y,Math.hypot(offset.x,offset.z))+this.cameraPitchOffset));
  return {eye:target.add(new Vector3(Math.sin(yaw)*Math.cos(pitch)*radius,Math.sin(pitch)*radius,Math.cos(yaw)*Math.cos(pitch)*radius)),target};
 }
 private syncModel(dt:number){const p=this.sim.pose;this.root.position.set(p.x,p.y,p.z);this.root.rotationQuaternion=Quaternion.RotationYawPitchRoll(p.yaw,-p.pitch,-p.roll);if(this.propeller)this.propeller.rotation.z+=dt*(this.sim.engineRpm*100+this.sim.speed*.08);const asset=this.assets.get(this.model);if(asset?.gear){asset.gear.position.y=(1-this.sim.gearProgress)*1.25;asset.gear.setEnabled(this.sim.gearProgress>.01);}for(const rotor of asset?.rotors??[]){rotor.angle+=dt*this.sim.rotorRpm*34;rotor.node.rotation.copyFrom(rotor.axis.scale(rotor.angle));}}
 private burst(position:Vector3){
  this.crashPoint.copyFrom(position);this.impactEye.copyFrom(this.eye);this.explosion?.burst(position,this.sim.pose.yaw);
 }
 private clearEffects(){this.explosion?.reset();this.missiles?.clear();}
 dispose(){this.dead=true;this.stop();this.explosion?.dispose();this.explosion=null;this.missiles?.dispose();this.missiles=null;this.root.dispose(false,true);}
}
