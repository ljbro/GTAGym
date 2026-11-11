import type {NativeBoatMotion} from '../native-city/src/native-boat-motion.ts';
/** Test driver sends ordinary throttle/steering inputs. No path snapping,
 * coordinate writes or heading teleportation is allowed in this traversal. */
export function driveBoatRoute(m:NativeBoatMotion,onTick:()=>void=()=>{}){
 const points=m.spec.path.points;let index=1,ticks=0,maxStep=0;const visited:number[]=[],positions:number[][]=[];
 while(ticks++<10000&&!m.canFinish()){
  const target=points[index],near=Math.hypot(m.x-target[0],m.z-target[1]);
  if(near<8&&index<points.length-1){visited.push(index++);continue;}
  const desired=Math.atan2(target[0]-m.x,target[1]-m.z),angle=Math.atan2(Math.sin(desired-m.boat.yaw),Math.cos(desired-m.boat.yaw));
  const keys=new Set(['KeyW']);if(Math.abs(angle)>.018)keys.add(angle>0?'KeyD':'KeyA');
  const x=m.x,z=m.z;m.step(keys,.025);onTick();maxStep=Math.max(maxStep,Math.hypot(m.x-x,m.z-z));if(ticks%40===0)positions.push([m.x,m.z]);
 }
 return {ticks,visited,maxStep,positions,complete:m.canFinish()};
}
