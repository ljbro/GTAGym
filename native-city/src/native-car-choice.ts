import type {V2,Road} from './city-types.ts';
import {DEFAULT_CAR_PERFORMANCE,type CarPerformance} from './driving.ts';
export const CAR_CHOICE_TASK='c01-n04';
export const CAR_CHOICE_SECONDS=150;
/** Scenario-specific city economy-car limiter. Other tasks retain their physics. */
export const ECONOMY_PERFORMANCE:CarPerformance={maxSpeed:12,acceleration:3.5};
export const SPORTS_PERFORMANCE=DEFAULT_CAR_PERFORMANCE;
export type ChoicePose={x:number;z:number;yaw:number;speed:number;steer:number};
export type CarChoiceLayout={foot:V2;footYaw:number;sports:ChoicePose;ordinary:ChoicePose;ordinaryLowerBound:number};
type Environment={roadAt:(x:number,z:number)=>{x:number;z:number;road:Road}|null;blocked:(x:number,z:number)=>boolean;walkClear:(x:number,z:number)=>boolean;heightAt:(x:number,z:number)=>number;routeLength?:(x:number,z:number)=>number};
export function findCarChoiceParking(points:readonly V2[],env:Environment,seed=0):CarChoiceLayout{
 const a=points[0],b=points[1],yaw=Math.atan2(b[0]-a[0],b[1]-a[1]),s=Math.sin(yaw),c=Math.cos(yaw),goal=points.at(-1)!;
 const length=points.slice(1).reduce((sum,p,i)=>sum+Math.hypot(p[0]-points[i][0],p[1]-points[i][1]),0);
 // Parallel bays, aligned bumpers, with the pedestrian on their perpendicular
 // bisector. Swap left/right by episode seed, never put the sports car ahead.
 for(const distance of [28,32,36,40,44,48])for(const side of [1,-1])for(const apron of [4.8,8,0]){
  const n=env.roadAt(a[0]+s*distance,a[1]+c*distance),startRoad=env.roadAt(...a);if(!n||!startRoad)continue;
  const offset=apron?n.road.width/2+apron:0,center={x:n.x+c*side*offset,z:n.z-s*side*offset};
  const slot=(sign:number):ChoicePose=>({x:center.x+c*sign*3.4,z:center.z-s*sign*3.4,yaw,speed:0,steer:0});
  const ordinary=slot(seed&1?1:-1),sports=slot(seed&1?-1:1);
  if(env.routeLength&&[ordinary,sports].some(car=>{const d=env.routeLength!(car.x,car.z);return !Number.isFinite(d)||d<1||d>length+40;}))continue;
  const foot:V2=[center.x-s*distance,center.z-c*distance];
  if(!env.walkClear(...foot))continue;
  let clear=true;
  for(const car of [ordinary,sports]){
   const h=env.heightAt(car.x,car.z);
   for(const u of [-1.1,0,1.1])for(const v of [-2.5,0,2.5]){
    const x=car.x+c*u+s*v,z=car.z-s*u+c*v;
    if(env.blocked(x,z)||!Number.isFinite(h)||Math.abs(env.heightAt(x,z)-h)>.3)clear=false;
   }
   const innerSide=Math.sign((center.x-car.x)*c-(center.z-car.z)*s);
   const door:V2=[car.x+c*innerSide*1.9,car.z-s*innerSide*1.9];
   for(let k=0;k<=30;k++){
    const x=foot[0]+(door[0]-foot[0])*k/30,z=foot[1]+(door[1]-foot[1])*k/30;
    if(!env.walkClear(x,z)||Math.abs(env.heightAt(x,z)-h)>.5)clear=false;
   }
  }
  if(!clear)continue;
  // Even a straight, instantly full-speed shortcut must fail in the ordinary
  // car. Includes the 24 m arrival radius, excludes boarding time.
  const ordinaryLowerBound=(Math.hypot(goal[0]-foot[0],goal[1]-foot[1])-24)/Math.max(4.2,ECONOMY_PERFORMANCE.maxSpeed);
  // Keep a frame-boundary margin; the former 10-second design buffer is not
  // required after extending this mission to 150 seconds.
  if(ordinaryLowerBound<=CAR_CHOICE_SECONDS+.1)continue;
  return {foot,footYaw:yaw,sports,ordinary,ordinaryLowerBound};
 }
 throw Error('No safe two-car parking area');
}
