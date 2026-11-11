/** Trusted generation bundle only. Never imported by the gameplay entry. */
import {CityWalk} from './city-walk.ts';
import {extraFloorAt,extraBodyBlocked} from './native-extra-layout.ts';
import {InteriorPushDoor} from './native-interior-doors.ts';
import {probeOutdoorRoute} from './outdoor-task-validation.ts';
import {probeTrainingFlight} from './training-flight-expert.ts';
import type {DrivingWorld} from './city-world.ts';
import type {TrainingTask} from './training-task-schema.ts';
import type {OutdoorGeneratorEnvironment} from './outdoor-task-generator.ts';

export function probeTrainingRoom(t:TrainingTask){
 if(!t.interior)throw Error('Not a room task');const l=t.interior.layout,doors=l.doors.map(d=>new InteriorPushDoor({...d,yaw:d.yaw??0,locked:d.decoy||!d.open}));
 const floor=(x:number,z:number,maxY:number)=>extraFloorAt(l,x,z,maxY)??-100;
 const walk:CityWalk=new CityWalk((x,z,y)=>extraBodyBlocked(l,x,z,y,0,1.75)||doors.some(d=>d.blocked(x,z,y,0,1.75)),(x,z)=>floor(x,z,walk.y+.35),{floorAt:floor,ladders:[]});
 walk.active=true;walk.x=l.points[0][0];walk.z=l.points[0][1];walk.y=0;walk.grounded=true;
 const max=Math.ceil(t.maxDuration*60);let frames=0,index=1,stalled=0;
 while(index<l.points.length&&frames<max){const [x,z]=l.points[index];if(Math.hypot(walk.x-x,walk.z-z)<.12){index++;continue;}
  walk.yaw=Math.atan2(x-walk.x,z-walk.z);const before=[walk.x,walk.z],keys=new Set(['KeyW']);
  for(const door of doors)door.step({x:walk.x,z:walk.z,feetY:walk.y,yaw:walk.yaw,active:true},keys,1/60);
  walk.step(keys,1/60);frames++;stalled=Math.hypot(walk.x-before[0],walk.z-before[1])<1e-6?stalled+1:0;
  if(stalled>240)break;
 }
 const passed=index===l.points.length&&Math.abs(walk.y-l.goalY)<.35;
 return {passed,frames,seconds:frames/60,position:{x:walk.x,y:walk.y,z:walk.z},doors:doors.map(d=>d.snapshot),reason:passed?undefined:`Room controller stalled at route point ${index}/${l.points.length}`};
}
export function probeTrainingTask(t:TrainingTask,env:OutdoorGeneratorEnvironment,world:DrivingWorld){
 if(t.outdoor)return probeOutdoorRoute(t.outdoor,env,world.walk??undefined);
 if(t.interior)return probeTrainingRoom(t);
 if(t.flight)return probeTrainingFlight(t,world);
 throw Error('Shooting pairs are verified by the host original shooting engine');
}
