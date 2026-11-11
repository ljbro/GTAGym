import type {DrivingWorld} from './city-world.ts';
import {createCityRider,type CityRider,type RiderPose} from './city-rider.ts';
import {FOLLOW_CHARACTER,FOLLOW_CHARACTER_BASE} from './native-npc-character.ts';
import type {PoliceUnit} from './offmap-navigation-police.ts';
/** Preload six independent rigs, then replenish the spare pool before timed reinforcements. */
export class NativeFootPoliceView{
 private pool:CityRider[]=[];private actors=new Map<string,{rider:CityRider;pose:RiderPose}>();private disposed=false;
 private pauseObserver;
 private loading=0;private retryAfter=0;
 constructor(private world:DrivingWorld,private presentation:'ground'|'swim'='ground'){
  this.pauseObserver=world.scene.onBeforeAnimationsObservable.add(()=>{if(world.paused||world.observer?.active)for(const a of this.actors.values())a.rider.setPose(a.pose,0);});
 }
 private async grow(count:number){
  this.loading+=count;
  await Promise.all(Array.from({length:count},async()=>{try{
   const rider=await createCityRider(this.world.scene,this.presentation,{character:{...FOLLOW_CHARACTER,name:"Police"},assetBase:FOLLOW_CHARACTER_BASE,police:true});
   if(this.disposed){rider.dispose();return;}rider.setEnabled(false);this.pool.push(rider);
  }finally{this.loading--;}}));
 }
 async load(){try{await this.grow(6);}catch(error){this.dispose();throw error;}}
 get ready(){return !this.disposed&&this.pool.length>0;}
 private replenish(){
  if(this.pool.length+this.loading>=2||performance.now()<this.retryAfter)return;
  void this.grow(2-this.pool.length-this.loading).catch(error=>{this.retryAfter=performance.now()+2000;console.warn('Police model replenishment will retry',error);});
 }
 update(units:readonly PoliceUnit[],dt:number){
  if(this.disposed)return;const ids=new Set(units.map(u=>u.id));
  for(const [id,a] of this.actors)if(!ids.has(id)){a.rider.setEnabled(false);this.pool.push(a.rider);this.actors.delete(id);}
  for(const unit of units){
   let a=this.actors.get(unit.id);const pose={x:unit.position.x,y:unit.position.y,z:-unit.position.z,yaw:-unit.yaw,speed:unit.speed,...this.presentation==='swim'?{swimDepth:0}:{}};
   if(!a){const rider=this.pool.pop();if(!rider)throw Error('Foot police pool exhausted');a={rider,pose};this.actors.set(unit.id,a);rider.setEnabled(true);}
   a.pose=pose;a.rider.setPose(pose,dt);
  }
  this.world.nativePoliceMeshes=[...this.actors.values()].flatMap(a=>a.rider.meshes);
  this.replenish();
 }
 get stats(){return {kind:this.presentation==='swim'?'swim-police':'foot-police',active:this.actors.size,pooled:this.pool.length,running:[...this.actors.values()].filter(a=>a.pose.speed>.1).length};}
 dispose(){if(this.disposed)return;this.disposed=true;this.world.scene.onBeforeAnimationsObservable.remove(this.pauseObserver);for(const a of this.actors.values())a.rider.dispose();for(const r of this.pool)r.dispose();this.actors.clear();this.pool=[];this.world.nativePoliceMeshes=[];}
}
