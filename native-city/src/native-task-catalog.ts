import {NATIVE_FLIGHT_TASKS,helicopterControls,planeControls} from './native-flight-catalog.ts';

// Only remote aviation additions; the local 86 tasks stay authoritative.
export const NATIVE_AIR_TASKS=NATIVE_FLIGHT_TASKS.map((flight,index)=>({
 id:flight.id,title:flight.title,mode:'flight' as const,category:'air',expectedTurns:[],seed:4201+index,minLength:0,
 objective:`Board the aircraft on the ground in the Central Park urban area and take off, ${flight.objective==='approach'?"Approach the area ahead NPC Fly to 60 meters within":`Pass through in order ${flight.route.length} waypoints`}${flight.objective==='hover'?", Hover at low speed within the target circle 3 seconds":flight.objective==='follow'?", Approach the companion aircraft to within 60 meters within":''}, Finally in northern Futian ${flight.vehicle==='helicopter'?"H Helipad":"Runway"} Land, Release the throttle and come to a stop 2 seconds. ${flight.vehicle==='helicopter'?helicopterControls:planeControls}`,
}));
