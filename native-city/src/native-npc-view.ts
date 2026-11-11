import type {CityRider,CityRiderOptions} from './city-rider.ts';
import type {DrivingWorld} from './city-world.ts';
import type {V2} from './city-types.ts';
import {NativeDriveVehicle} from './native-drive-vehicle.ts';
import type {NativeDriveKind} from './native-drive-vehicle-spec.ts';
import {FOLLOW_CHARACTER,FOLLOW_CHARACTER_BASE} from './native-npc-character.ts';
import type {MotorcycleKnockdown} from './native-vehicle-npc.ts';
/** Separate instance from the player: it never repositions the player's rig. */
export class NativeNpcView{
 private rider:CityRider|null=null;private disposed=false;private vehicle:NativeDriveVehicle|null=null;
 constructor(private world:DrivingWorld,readonly mode:'walk'|'drive',readonly vehicleKind?:NativeDriveKind,readonly objective:'follow'|'chase'='chase',private readonly riderOptions:CityRiderOptions={}){}
 async load(){
  if(this.mode==='walk'){
   const {createCityRider}=await import('./city-rider.ts');
   if(this.disposed)return;
   const rider=await createCityRider(this.world.scene,'ground',this.objective==='follow'?{character:FOLLOW_CHARACTER,assetBase:FOLLOW_CHARACTER_BASE}:{});
   if(this.disposed){rider.dispose();return;}this.rider=rider;rider.setEnabled(true);
  }
  else if(this.vehicleKind){const model=new NativeDriveVehicle(this.world.scene,this.vehicleKind,this.riderOptions);this.vehicle=model;await model.load();if(this.disposed){model.dispose();return;}model.root.name='native-npc-target-'+this.vehicleKind;}
  else if(!this.world.createNativeTargetVehicle())throw Error("Target NPC Vehicle loading failed");
 }
 get meshes(){return this.rider?.meshes??this.vehicle?.meshes??[];}
 update(point:V2,yaw:number,speed:number,dt:number,knockdown?:MotorcycleKnockdown|null){
  if(this.disposed)return;
  if(this.rider)this.rider.setPose({x:point[0],z:point[1],y:this.world.walkingSurfaceHeight(point[0],point[1]),yaw,speed},dt);
  else if(this.vehicle){this.vehicle.sync({x:point[0],z:point[1],yaw,speed,steer:0,knockdown},this.world.groundHeight,dt);this.vehicle.root.metadata={...this.vehicle.root.metadata,knockdown:knockdown??null};}
  else this.world.updateNativeTargetVehicle(point[0],point[1],yaw);
 }
 dispose(){this.disposed=true;this.rider?.dispose();this.rider=null;this.vehicle?.dispose();this.vehicle=null;if(this.mode==='drive'&&!this.vehicleKind)this.world.disposeNativeTargetVehicle();}
}
