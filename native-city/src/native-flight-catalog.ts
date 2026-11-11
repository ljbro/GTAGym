import definitions from './native-flight-configs.json' with {type:'json'};
import {NATIVE_FLIGHT_TASK} from './native-flight-sites.ts';
import type {FlightPoint} from './city-flight-simulation.ts';
export type FlightModel='plane'|'frogger'|'cargobob';
export type FlightObjective='navigate'|'follow'|'approach'|'hover';
export type FlightWaypoint=FlightPoint&{sourceIndex:number};
export type NativeFlightConfig=Omit<typeof NATIVE_FLIGHT_TASK,'id'|'title'|'source'|'annotationRevision'|'sourceObjective'|'yaw'|'npcSpeed'>&{
 id:string;title:string;source:string;annotationRevision:number;sourceObjective:string;yaw:number;npcSpeed:number;
 model:FlightModel;vehicle:'plane'|'helicopter';objective:FlightObjective;route:FlightWaypoint[];recovery:FlightPoint[];
 scale:number;checkpointRadius:number;landingPoint:FlightPoint;hoverSeconds:number;
};

// Ready-to-run city coordinates and task parameters. Original source-video
// annotations and annotation processing are not needed by the public runtime.
export const NATIVE_FLIGHT_TASKS:readonly NativeFlightConfig[]=definitions as NativeFlightConfig[];
export function nativeFlightConfig(id:string){const config=NATIVE_FLIGHT_TASKS.find(t=>t.id===id);if(!config)throw Error("Unknown flight mission:"+id);return config;}
export {helicopterControls,planeControls} from './city-flight-controls.ts';
