import type {V2} from './city-types.ts';
import type {CityWalk} from './city-walk.ts';
import {stepCar,manualSteeringInput,type CarState} from './driving.ts';
import {VehicleRoute} from './native-vehicle-route.ts';
import {NativeWaterMotion} from './native-water-motion.ts';
import {NativeBoatMotion} from './native-boat-motion.ts';
import {outdoorWaterSpec,type GeneratedOutdoorTask} from './generated-outdoor-tasks.ts';
import type {OutdoorGeneratorEnvironment} from './outdoor-task-generator.ts';
import {goalLandmarkBlocks} from './walk-goal-landmark.ts';

const angle=(v:number)=>Math.atan2(Math.sin(v),Math.cos(v));
const clamp=(v:number,a:number,b:number)=>Math.max(a,Math.min(b,v));
export type OutdoorProbe={passed:boolean;frames:number;controllerSeconds:number;position:V2;reason?:string};

/** Trusted-host feasibility probe, not an agent tool or a fabricated task win.
 * Advances the same movement controllers with clearance checks. No position
 * teleport between waypoints; it does not certify dynamic-traffic optimality.
 */
export function probeOutdoorRoute(task:GeneratedOutdoorTask,env:OutdoorGeneratorEnvironment,walker?:CityWalk):OutdoorProbe{
 const dt=1/60,points=task.points,goal=points.at(-1)!;
 let frames=0,position:V2=[...points[0]],passed=false,reason='Controller did not reach the goal';
 const limit=Math.ceil((task.length/(task.vehicle==='drive'?3:task.vehicle==='boat'?2:1)+80)*60);
 if(task.vehicle==='walk'){
  if(!walker)throw Error('A loaded CityWalk controller is required');
  const access=walker as unknown as {blocked:(x:number,z:number,y:number)=>boolean};
  const old={x:walker.x,z:walker.z,y:walker.y,yaw:walker.yaw,active:walker.active},blocked=access.blocked;
  try{
   walker.x=position[0];walker.z=position[1];walker.active=true;walker.resetMotion();
   if(task.goalLandmark)access.blocked=(x,z,y)=>blocked.call(walker,x,z,y)||goalLandmarkBlocks(task.goalLandmark!,x,z);
   let index=1,stalled=0;
   while(frames<limit&&index<points.length){const p=points[index];if(Math.hypot(p[0]-walker.x,p[1]-walker.z)<.08){index++;continue;}walker.yaw=Math.atan2(p[0]-walker.x,p[1]-walker.z);const before:V2=[walker.x,walker.z];walker.step(new Set(['KeyW']),dt);frames++;stalled=Math.hypot(walker.x-before[0],walker.z-before[1])<1e-5?stalled+1:0;if(stalled>120)break;}
   position=[walker.x,walker.z];passed=index===points.length;
  }finally{access.blocked=blocked;Object.assign(walker,old);walker.resetMotion();}
 }else if(task.vehicle==='swim'){
  const swim=new NativeWaterMotion(outdoorWaterSpec(task,env.water.height,false),(x,z)=>env.water.clear(x,z,.5));let index=1,stalled=0;
  while(frames<limit){
   while(index<points.length&&Math.hypot(points[index][0]-swim.x,points[index][1]-swim.z)<.08)index++;
   const keys=new Set<string>();
   if(index<points.length){swim.yaw=Math.atan2(points[index][0]-swim.x,points[index][1]-swim.z);keys.add('KeyW');}
   if(swim.depth<task.goalDepth-.03)keys.add('ControlLeft');else if(swim.depth>task.goalDepth+.03)keys.add('Space');
   if(index===points.length&&swim.canFinish()){passed=true;break;}
   const before:V2=[swim.x,swim.z];swim.step(keys,dt);frames++;
   stalled=index<points.length&&Math.hypot(swim.x-before[0],swim.z-before[1])<1e-5?stalled+1:0;if(stalled>120)break;
  }position=[swim.x,swim.z];
 }else{
  const boat=task.vehicle==='boat'?new NativeBoatMotion(outdoorWaterSpec(task,env.water.height,false),(x,z)=>env.water.clear(x,z)):null;
  const car:CarState={x:position[0],z:position[1],yaw:task.playerSpawn.yaw,speed:0,steer:0,distance:0};
  if(boat)boat.boat.yaw=task.playerSpawn.yaw;
  const reference=new VehicleRoute(points,boat?7:18,(x,z,yaw)=>boat?env.water.clear(x,z,4):env.driveClear(x,z,yaw));
  let nearest=0,stalled=0;
  while(frames<limit){const actor=boat?boat.boat:car;
   let best=Infinity,next=nearest;
   for(let i=Math.max(0,nearest-3);i<Math.min(reference.points.length,nearest+100);i++){const p=reference.points[i],d=Math.hypot(actor.x-p[0],actor.z-p[1]);if(d<best){best=d;next=i;}}
   nearest=next;
   if(Math.hypot(actor.x-goal[0],actor.z-goal[1])<(boat?6:2.5)&&reference.length-reference.distances[nearest]<10){passed=true;break;}
   const along=reference.distances[nearest],look=boat?Math.max(3,actor.speed*.8):Math.max(3.5,actor.speed*.55),target=reference.sample(along+look),error=angle(Math.atan2(target.point[0]-actor.x,target.point[1]-actor.z)-actor.yaw);
   const desired=Math.min(target.limit,Math.abs(error)>.9?2.5:Math.abs(error)>.35?boat?4:7:boat?7:18);
   const before:V2=[actor.x,actor.z];
   if(boat){const keys=new Set<string>();if(actor.speed<desired+.2)keys.add('KeyW');if(actor.speed>desired+.7)keys.add('Space');if(error>.025)keys.add('KeyD');else if(error<-.025)keys.add('KeyA');boat.step(keys,dt);}
   else{const desiredWheel=Math.atan(2*3.2*Math.sin(error)/look),steer=clamp(desiredWheel*(1+Math.abs(car.speed)*.026)/.48,-manualSteeringInput(1,car.speed),manualSteeringInput(1,car.speed));stepCar(car,{throttle:car.speed<desired?1:car.speed>desired+1?-.4:0,steer,handbrake:false},dt);
    if(!env.driveClear(car.x,car.z,car.yaw)){reason='Real car footprint hit static geometry';break;}
   }
   frames++;stalled=Math.hypot(actor.x-before[0],actor.z-before[1])<1e-5?stalled+1:0;if(stalled>180){reason='Movement controller stalled';break;}
  }position=boat?[boat.x,boat.z]:[car.x,car.z];
 }
 return {passed,frames,controllerSeconds:frames*dt,position,...passed?{}:{reason}};
}
