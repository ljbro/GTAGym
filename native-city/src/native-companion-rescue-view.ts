import {Vector3,type Scene,type TransformNode,type AbstractMesh} from '@babylonjs/core';
import {createCityRider,type CityRider} from './city-rider.ts';
import {NativeDriveVehicle} from './native-drive-vehicle.ts';
import {NativeSemiTrailer} from './native-semi-trailer.ts';
import {NativeCompanionRescue} from './native-companion-rescue.ts';
export class NativeCompanionRescueView{
 readonly tractor:NativeDriveVehicle;readonly trailer:NativeSemiTrailer;
 private riders:CityRider[]=[];private disposed=false;
 constructor(private scene:Scene,readonly objective:NativeCompanionRescue,private height:(x:number,z:number)=>number){this.tractor=new NativeDriveVehicle(scene,'semi-tractor');this.tractor.root.name='native-npc-rescue-tractor';this.trailer=new NativeSemiTrailer(scene,'boat-carrier.glb');}
 async load(){
  // Assign each async resource independently so a canceled load owns and
  // disposes late-arriving characters rather than leaking them into the city.
  await Promise.all([this.tractor.load(),this.trailer.load(),...[0].map(async i=>{const r=await createCityRider(this.scene);if(this.disposed){r.dispose();return;}this.riders[i]=r;r.setEnabled(true);})]);
  if(this.disposed){this.dispose();return;}this.trailer.state={...this.objective.trailer};this.tractor.root.metadata.rescue=this.objective;this.tractor.root.metadata.rescueCompanionCount=this.riders.length;
 }
 update(playerRoot:TransformNode,dt:number){
  if(this.disposed)return;const o=this.objective,p=o.pose;
  this.tractor.sync({x:p.point[0],z:p.point[1],yaw:p.yaw,speed:o.speed,steer:0},this.height,dt);
  this.trailer.state={...o.trailer};this.trailer.sync({x:p.point[0],z:p.point[1],yaw:p.yaw},this.height,false,this.tractor.root);
  const tm=this.trailer.root.computeWorldMatrix(true),pm=playerRoot.computeWorldMatrix(true),toWorld=(v:Vector3)=>Vector3.TransformCoordinates(v,tm);
  this.riders.forEach((r,i)=>{
   const seated=i<o.boarded,transferring=o.stage==='side-transfer',progress=seated?1:transferring?o.transferProgress:0,smooth=progress*progress*(3-2*progress);
   // Only the side-hanging companion remains; no second character at the stern.
   const seat=Vector3.TransformCoordinates(new Vector3(-.43,.82,-.7),pm);
   const hang=toWorld(new Vector3(-4.25,5.55-.95,-4.5)),point=Vector3.Lerp(hang,seat,smooth);
   r.setRescuePose(progress);
   const yaw=seated?playerRoot.rotation.y:transferring?o.trailer.yaw+Math.atan2(Math.sin(playerRoot.rotation.y-o.trailer.yaw),Math.cos(playerRoot.rotation.y-o.trailer.yaw))*smooth:o.trailer.yaw;
   r.setPose({x:point.x,y:point.y,z:point.z,yaw,speed:0,ridePitch:playerRoot.rotation.x*smooth,rideRoll:playerRoot.rotation.z*smooth},dt);
  });
 }
 get meshes():AbstractMesh[]{return [...this.tractor.meshes,...this.trailer.meshes,...this.riders.flatMap(r=>r.meshes)];}
 blocked(x:number,z:number){
  if(this.disposed)return false;const p=this.objective.pose,t=this.objective.trailer,local=(x0:number,z0:number,yaw:number)=>{const dx=x-x0,dz=z-z0;return{u:dx*Math.cos(yaw)-dz*Math.sin(yaw),v:dx*Math.sin(yaw)+dz*Math.cos(yaw)};},a=local(...p.point,p.yaw),b=local(t.x,t.z,t.yaw);
  // The boom is above car height; the hull/chassis are physical obstacles.
  return Math.abs(a.u)<1.314&&Math.abs(a.v)<4.065||Math.abs(b.u)<1.314&&b.v> -9.5&&b.v<1.61||Math.abs(b.u)<1.9&&b.v> -8.3&&b.v<-.3;
 }
 get diagnostics(){return{boarded:this.objective.boarded,stage:this.objective.stage,passengers:this.riders.map(r=>r.jetskiPoseStats()),trailer:this.trailer.state};}
 dispose(){this.disposed=true;for(const r of this.riders)r.dispose();this.riders=[];this.tractor.dispose();this.trailer.dispose();}
}
