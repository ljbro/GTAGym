// State-informed reference controller, not a vision-model benchmark result.
// Only ordinary keys are emitted. No pose/velocity edits or forced completion.
import {NativeWaterMotion,type NativeWaterSpec} from '../src/native-water-motion.ts';
import {NativeBoatMotion,type BoatSpec} from '../src/native-boat-motion.ts';
import {NativeShoreMotion,type ShoreEnvironment} from '../src/native-shore-motion.ts';
import {NativeShoreBoatMotion,type ShoreBoatSpec} from '../src/native-shore-boat-motion.ts';
import {channelContains,waterChannelPath} from '../src/native-water-channel.ts';
import {waterTransferSpec} from '../src/native-water-transfer.ts';

export const WATER_EXPERT_HZ=60;
export const WATER_ROUTE_GROUPS=['water','shore','shore-boat','driving-boat','boat','beach-boat'] as const;
export type WaterGroup=typeof WATER_ROUTE_GROUPS[number];
export type WaterSpec=NativeWaterSpec&Partial<BoatSpec&ShoreBoatSpec>&{title?:string};
export type WaterAction={startTick:number;ticks:number;keys:string[]};
export function createWaterExpertRun(group:WaterGroup,spec:WaterSpec,env:ShoreEnvironment){
 const transfer=waterTransferSpec(spec.id);if(transfer){spec=transfer;group='shore-boat';}
 const channel=spec.channelHalfWidth?waterChannelPath(spec as BoatSpec):null;
 const sea=(x:number,z:number)=>!env.land(x,z)&&(!channel||channelContains(channel,spec.channelHalfWidth!,x,z));
 const motion=group==='water'?new NativeWaterMotion(spec,sea):group==='shore'?new NativeShoreMotion(spec,env)
  :group==='shore-boat'?new NativeShoreBoatMotion(spec as ShoreBoatSpec,env):new NativeBoatMotion(spec as BoatSpec,sea,env);
 let ticks=0,index=1,previousKeys:string[]=[];
 const boat=motion instanceof NativeShoreBoatMotion?motion.boat:motion instanceof NativeBoatMotion?motion:null;
 const mode=()=>motion instanceof NativeWaterMotion?'swim':motion.mode;
 const depth=()=>motion instanceof NativeWaterMotion?motion.depth:motion instanceof NativeShoreBoatMotion?motion.shore.depth:motion instanceof NativeBoatMotion?motion.swimmer.depth:motion.depth;
 const sample=()=>({tick:ticks,mode:mode(),pose:{x:motion.x,y:motion.y,z:motion.z,yaw:motion.yaw},speed:motion.speed,depth:depth(),complete:motion.canFinish()});
 return {motion,get ticks(){return ticks;},sample,controls():string[]{
  if(motion.canFinish())return [];
  if(mode()==='boarding'||mode()==='leaving')return [];
  if(mode()==='boat'&&boat){
   const points=spec.path.points;
   while(index<points.length-1&&Math.hypot(motion.x-points[index][0],motion.z-points[index][1])<8)index++;
   const target=points[index],desired=Math.atan2(target[0]-motion.x,target[1]-motion.z);
   const angle=Math.atan2(Math.sin(desired-boat.boat.yaw),Math.cos(desired-boat.boat.yaw));
   return ['KeyW',...(Math.abs(angle)>.018?[angle>0?'KeyD':'KeyA']:[])];
  }
  const target=boat&&spec.objective!=='swim-to-boat'?[boat.boardingPoint.x,boat.boardingPoint.z]:spec.path.points.at(-1)!;
  const distance=Math.hypot(target[0]-motion.x,target[1]-motion.z);
  if(boat&&spec.objective!=='swim-to-boat'&&mode()==='swim'&&distance<.5&&depth()<=.35)return ['KeyF'];
  const dx=target[0]-motion.x,dz=target[1]-motion.z;
  const forward=dx*Math.sin(motion.yaw)+dz*Math.cos(motion.yaw),right=dx*Math.cos(motion.yaw)-dz*Math.sin(motion.yaw);
  const keys:string[]=[];
  // Swimming and walking accept local translation, so no heading teleports.
  if(distance>.2){keys.push('ShiftLeft');if(Math.abs(forward)>.08)keys.push(forward>0?'KeyW':'KeyS');if(Math.abs(right)>.08)keys.push(right>0?'KeyD':'KeyA');}
  if(mode()==='swim'){
   // Descend near the underwater entrance, after leaving the shallow seabed.
   const wanted=group==='water'&&distance<12?spec.goalDepth:0;
   if(depth()<wanted-.05)keys.push('ControlLeft');else if(depth()>wanted+.05)keys.push('Space');
  }
  return keys;
 },step(keys:string[]){
  if(motion.canFinish())throw Error('Cannot replay beyond water task completion');
  if(keys.includes('KeyF')&&!previousKeys.includes('KeyF')&&'interact' in motion)motion.interact();
  motion.step(new Set(keys),1/WATER_EXPERT_HZ);previousKeys=[...keys];ticks++;
 }};
}
