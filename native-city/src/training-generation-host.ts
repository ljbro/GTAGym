/** Privileged generation-only bundle. Never imported by main.ts or an MCP tool. */
import type {DrivingWorld} from './city-world.ts';
import type {ExtraLayout} from './native-extra-layout.ts';
import {inRing} from './driving.ts';
import {FlightCityCollision} from './city-flight-collision.ts';
import {NATIVE_FLIGHT_TASKS} from './native-flight-catalog.ts';
import {NATIVE_FLIGHT_LAUNCH} from './native-flight-sites.ts';
import {createOutdoorGenerationEnvironment} from './outdoor-generation-host.ts';
import {domain,inPosition,type SamplingSpec,type ShootingPool} from './training-task-schema.ts';
import type {OutdoorGeneratorEnvironment} from './outdoor-task-generator.ts';
import type {TrainingGenerationEnvironment} from './training-task-generator.ts';
export {generateTrainingTask,validateTemplateSpec,TEMPLATE_CAPABILITIES} from './training-task-generator.ts';
export {probeTrainingTask} from './training-task-validation.ts';

function placement(world:DrivingWorld,l:ExtraLayout,s:SamplingSpec,random:()=>number){
 const b=l.bounds,extent=world.data.meta.extent;
 for(let i=0;i<1500;i++){
  let x:number,z:number;
  if(s.start){const [a,c]=domain(s.start.x,0,'start.x'),[d,e]=domain(s.start.z,0,'start.z');x=a+(c-a)*random();z=d+(e-d)*random();}
  else {const anchors=[[-4300,1450],[-4700,650],[-3500,2100],[-1900,2300],[-700,2300],[1500,2500],[5500,2400]],anchor=anchors[i%anchors.length];x=anchor[0]+(random()-.5)*Math.min(1000,40+i*4);z=anchor[1]+(random()-.5)*Math.min(800,40+i*3);}
  if(x+b.minX<extent[0]||x+b.maxX>extent[2]||z+b.minZ<extent[1]||z+b.maxZ>extent[3])continue;
  let low=Infinity,high=-Infinity,ok=true;
  for(let dx=b.minX;dx<=b.maxX&&ok;dx+=2)for(let dz=b.minZ;dz<=b.maxZ;dz+=2){const wx=x+dx,wz=z+dz,road=world.collision.nearest(wx,wz),h=world.groundHeight(wx,wz);
   if(!Number.isFinite(h)||world.collision.blocked(wx,wz)||world.propBlocked(wx,wz)||road&&road.d<road.road.width/2+3||!world.data.land.some(p=>inRing(wx,wz,p[0])&&!p.slice(1).some(h=>inRing(wx,wz,h)))){ok=false;break;}
   low=Math.min(low,h);high=Math.max(high,h);if(high-low>.5){ok=false;break;}
  }
  const p={x,y:high+.18,z},goal=l.points.at(-1)!;
  if(ok&&inPosition(p,s.start)&&inPosition({x:x+goal[0],y:p.y+l.goalY,z:z+goal[1]},s.destination))return p;
 }
 throw Error('No grounded, road-free room parcel in the requested endpoint regions');
}
export function createTrainingGenerationEnvironment(world:DrivingWorld,roads:OutdoorGeneratorEnvironment['roads'],starts:readonly [number,number][],shootingPool:ShootingPool):TrainingGenerationEnvironment{
 const collision=new FlightCityCollision(world.data,world.groundHeight),extent=world.data.meta.extent;
 return {outdoor:createOutdoorGenerationEnvironment(world,roads,starts),shootingPool,flights:NATIVE_FLIGHT_TASKS,flightLaunch:{x:NATIVE_FLIGHT_LAUNCH.x,y:world.walkingSurfaceHeight(NATIVE_FLIGHT_LAUNCH.x,NATIVE_FLIGHT_LAUNCH.z),z:NATIVE_FLIGHT_LAUNCH.z},
  placeInterior:(l,s,random)=>placement(world,l,s,random),airClear:p=>p.x>extent[0]+100&&p.x<extent[2]-100&&p.z>extent[1]+100&&p.z<extent[3]-100&&!collision.sweep({...p,y:p.y-12},{...p,y:p.y+12})};
}
