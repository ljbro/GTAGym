import definitions from './native-flight-site-config.json' with {type:'json'};
import type {FlightPoint} from './city-flight-simulation.ts';
import type {Landmark} from './city-types.ts';
import {runwayLocal,type FlightRunway} from './city-flight-ground.ts';

export const NATIVE_FLIGHT_RUNWAYS:readonly FlightRunway[]=definitions.runways;
export const [FLIGHT_DEPARTURE,FLIGHT_ARRIVAL]=NATIVE_FLIGHT_RUNWAYS;
export const NATIVE_FLIGHT_TASK=definitions.task;
export const NATIVE_FLIGHT_LAUNCH:Landmark=definitions.launch as Landmark;
export const NATIVE_FLIGHT_DESTINATION:Landmark=definitions.destination as Landmark;
/** Reserve only the two paved sites, including a narrow shoulder/apron. */
export function nativeFlightReserved(x:number,z:number,radius=0){
 return NATIVE_FLIGHT_RUNWAYS.some(r=>{const p=runwayLocal(r,{x,z});return Math.abs(p.along)<r.length/2+20+radius&&Math.abs(p.right)<30+radius||p.right>=30-radius&&p.right<=42+radius&&Math.abs(p.along+261)<17+radius;});
}
export function nativeFlightSurfaceAt(x:number,z:number){
 for(const r of NATIVE_FLIGHT_RUNWAYS){const p=runwayLocal(r,{x,z});
  if(Math.abs(p.along)<=r.length/2+20&&Math.abs(p.right)<=30)return r.y;
  if(p.right>30&&p.right<=42&&Math.abs(p.along+261)<=17)return r.y*(42-p.right)/12;
 }
 return null;
}
export function nativeFlightTarget(elapsed:number):FlightPoint{
 const {approachOrigin,direction,npcSpeed}=NATIVE_FLIGHT_TASK,distance=Math.max(0,elapsed)*npcSpeed;
 return {x:approachOrigin.x+direction.x*distance,y:approachOrigin.y,z:approachOrigin.z+direction.z*distance};
}
