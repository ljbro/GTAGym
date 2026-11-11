import type {FlightPoint} from './city-flight-simulation.ts';

export type FlightRunway={id:string;name:string;x:number;z:number;y:number;yaw:number;length:number;width:number};
export const FLIGHT_GEAR_CLEARANCE=2.25;
export const FLIGHT_ROTATE_SPEED=32;
export const FLIGHT_LANDING_LIMITS={sinkSpeed:4,speed:65,roll:.18,minPitch:-.08,maxPitch:.26,heading:.24} as const;
export function runwayPoint(runway:FlightRunway,along:number,right=0):FlightPoint{
 const s=Math.sin(runway.yaw),c=Math.cos(runway.yaw);
 return {x:runway.x+s*along+c*right,y:runway.y,z:runway.z+c*along-s*right};
}
export function runwayLocal(runway:FlightRunway,point:Pick<FlightPoint,'x'|'z'>){
 const x=point.x-runway.x,z=point.z-runway.z,s=Math.sin(runway.yaw),c=Math.cos(runway.yaw);
 return {along:x*s+z*c,right:x*c-z*s};
}
export function runwayContains(runway:FlightRunway,point:Pick<FlightPoint,'x'|'z'>,margin=0){
 const p=runwayLocal(runway,point);
 return Math.abs(p.along)<=runway.length/2-margin&&Math.abs(p.right)<=runway.width/2-margin;
}
export function landingHeadingError(yaw:number,runway:FlightRunway){
 return Math.acos(Math.min(1,Math.abs(Math.cos(yaw-runway.yaw))));
}
