import {NativeBoatMotion,type BoatSpec} from './native-boat-motion.ts';
import {NativeShoreMotion,type ShoreEnvironment} from './native-shore-motion.ts';
import type {NativeWaterSpec} from './native-water-motion.ts';
import {transferPlatformBlocks} from './native-water-transfer.ts';
export type ShoreBoatSpec=BoatSpec&{title?:string;shorePath:NativeWaterSpec['path'];expectedTurns:('left'|'right')[]};
/** The shore sampler is sea->land; the task/source route is land->sea.
 * Keep those frames explicit rather than silently reversing the annotation. */
export class NativeShoreBoatMotion{
 readonly shore:NativeShoreMotion;readonly boat:NativeBoatMotion;protected aboard=false;
 constructor(readonly spec:ShoreBoatSpec,env:ShoreEnvironment,shore?:NativeShoreMotion,boat?:NativeBoatMotion){
  const platform=(x:number,z:number)=>spec.objective==='shore-transfer'&&transferPlatformBlocks(spec,x,z);
  this.boat=boat??new NativeBoatMotion(spec,(x,z)=>!env.land(x,z)&&!platform(x,z));
  this.shore=shore??new NativeShoreMotion({...spec,path:spec.shorePath},{...env,blocked:(x,z)=>env.blocked(x,z)||platform(x,z)||this.boat.hullBlocks(x,z,this.shore?.depth??0)},true);
 }
 navigationClear(x:number,z:number){return this.active.navigationClear(x,z);}
 get active(){return this.aboard?this.boat:this.shore;}
 get mode(){return this.active.mode;}
 get x(){return this.active.x;}get y(){return this.active.y;}get z(){return this.active.z;}
 get yaw(){return this.active.yaw;}get speed(){return this.active.speed;}
 look(dx:number,dy:number){this.active.look(dx,dy);}
 interact(){
  if(this.aboard)return this.boat.interact();
  if(this.shore.mode!=='swim')return "First enter the water and swim to the side of the boat, Then press F Board the boat";
  const a=this.shore.swimmer,b=this.boat.swimmer;
  Object.assign(b,{x:a.x,z:a.z,depth:a.depth,yaw:a.yaw,pitch:a.pitch,speed:a.speed,verticalSpeed:a.verticalSpeed});
  const result=this.boat.interact();if(this.boat.mode==='boarding'||this.boat.boardingApproach)this.aboard=true;return result;
 }
 step(keys:ReadonlySet<string>,dt:number){
  this.active.step(keys,dt);
  if(this.aboard&&this.boat.mode==='swim'&&!this.boat.boardingApproach){
   const a=this.boat.swimmer,b=this.shore.swimmer;
   Object.assign(b,{x:a.x,z:a.z,depth:a.depth,yaw:a.yaw,pitch:a.pitch,speed:0,verticalSpeed:0});
   this.shore.mode='swim';this.shore.walker.active=false;this.aboard=false;
  }
 }
 reset(){this.aboard=false;this.boat.reset();this.shore.reset();}
 canFinish(){
  if(this.spec.objective==='shore-transfer'){
   const end=this.spec.path.points.at(-1)!;
   return (this.mode==='boat'||this.mode==='swim'&&this.shore.depth<=.5)&&Math.hypot(this.x-end[0],this.z-end[1])<=7;
  }
  return this.aboard&&this.boat.canFinish();
 }
}
