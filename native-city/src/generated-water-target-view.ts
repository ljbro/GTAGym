import type {V2} from './city-types.ts';
import type {DrivingWorld} from './city-world.ts';
import {createCityRider,type CityRider} from './city-rider.ts';
import {FOLLOW_CHARACTER,FOLLOW_CHARACTER_BASE} from './native-npc-character.ts';
import {NativeWatercraftModel} from './native-watercraft-model.ts';
import {NativeBoatWakeView} from './native-boat-wake-view.ts';
import {WATERCRAFT} from './native-watercraft-spec.ts';
import type {GeneratedOutdoorTask} from './generated-outdoor-tasks.ts';

/** A real target rig/hull, independent of the player, using existing assets. */
export class GeneratedWaterTargetView{
 private rider:CityRider|null=null;private craft:NativeWatercraftModel|null=null;private wake:NativeBoatWakeView|null=null;private disposed=false;private time=0;
 constructor(private world:DrivingWorld,readonly task:GeneratedOutdoorTask,readonly waterHeight:number){}
 async load(){
  if(this.task.vehicle==='boat'){this.craft=new NativeWatercraftModel(this.world.scene,'zodiac');await this.craft.load();if(this.disposed)return;this.wake=new NativeBoatWakeView(this.world.scene,WATERCRAFT.zodiac.halfWidth,WATERCRAFT.zodiac.length/2,this.waterHeight);}
  const rider=await createCityRider(this.world.scene,this.task.vehicle==='swim'?'swim':'ground',{character:FOLLOW_CHARACTER,assetBase:FOLLOW_CHARACTER_BASE});
  if(this.disposed){rider.dispose();return;}this.rider=rider;rider.setEnabled(true);if(this.craft)rider.setBoatHelmSeated(true,1,'zodiac');
 }
 get meshes(){return [...this.craft?.meshes??[],...this.rider?.meshes??[],...this.wake?[this.wake.mesh]:[]];}
 update(point:V2,yaw:number,speed:number,dt:number,_knockdown?:unknown){
  if(this.disposed)return;this.time+=dt;
  if(this.craft){this.craft.setPose(point[0],this.waterHeight,point[1],yaw,this.time);const p=this.craft.localPoint(WATERCRAFT.zodiac.driver);this.rider?.setPose({x:p.x,y:p.y,z:p.z,yaw,speed:0},dt);this.wake?.update(point[0],point[1],yaw,speed,dt,false);}
  else this.rider?.setPose({x:point[0],y:this.waterHeight,z:point[1],yaw,speed,swimDepth:this.task.goalDepth},dt);
 }
 dispose(){this.disposed=true;this.rider?.dispose();this.craft?.dispose();this.wake?.dispose();this.rider=null;this.craft=null;this.wake=null;}
}
