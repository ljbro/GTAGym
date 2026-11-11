import {WALK_SPEED,RUN_SPEED} from './city-walk.ts';

/** Reference speed used to derive a deadline for ordinary outdoor driving.
 *
 * This is deliberately a virtual-NPC speed: ordinary driving tasks do not
 * spawn an NPC.  The deadline is based on the final GTA_SZ-adapted route
 * length, so it also includes task-specific endpoint additions (garages,
 * showrooms, etc.).
 */
export const ORDINARY_DRIVE_REFERENCE_SPEED=18;
export const OUTDOOR_FOOT_WALK_SPEED=WALK_SPEED;
export const OUTDOOR_FOOT_RUN_SPEED=RUN_SPEED;
export const OUTDOOR_FOOT_REFERENCE_SPEED=OUTDOOR_FOOT_WALK_SPEED;

export function isOrdinaryOutdoorDrive(mode:string,category:string){
 return mode==='drive'&&category==='outdoor-road';
}

export function isOrdinaryOutdoorWalk(mode:string,category:string){
 return mode==='walk'&&category==='outdoor-foot';
}

/** Return the exact route-time deadline in seconds, or 0 when disabled. */
export function ordinaryDriveMaxDuration(routeLength:number){
 if(!Number.isFinite(routeLength)||routeLength<=0)return 0;
 return routeLength/ORDINARY_DRIVE_REFERENCE_SPEED;
}

/** Return the deadline for ordinary outdoor driving or walking. */
export function ordinaryOutdoorTaskMaxDuration(mode:string,category:string,routeLength:number,taskId=''){
 if(!Number.isFinite(routeLength)||routeLength<=0)return 0;
 if(isOrdinaryOutdoorDrive(mode,category))return routeLength/ORDINARY_DRIVE_REFERENCE_SPEED;
 // c07-n04 uses its independent climbing mission's fixed 20-second deadline.
 // Menu-only reclassification must not remove these existing walking deadlines.
 const reclassifiedClimb=mode==='walk'&&category==='stairs'&&['c07-n01','c07-n04','c07-n05'].includes(taskId);
 if(isOrdinaryOutdoorWalk(mode,category)||reclassifiedClimb)return routeLength/OUTDOOR_FOOT_REFERENCE_SPEED+(taskId==='c07-n05'?10:0);
 return 0;
}

/** Recalibrate from the final navigation polyline, not catalog estimates or
 * a cached length from before endpoint/scene adaptation. Frozen at start:
 * taking a shortcut or trimming the minimap must not shrink the deadline. */
export function ordinaryOutdoorRouteMaxDuration(mode:string,category:string,points:readonly (readonly [number,number])[],taskId=''){
 let length=0;
 for(let i=1;i<points.length;i++)length+=Math.hypot(points[i][0]-points[i-1][0],points[i][1]-points[i-1][1]);
 return ordinaryOutdoorTaskMaxDuration(mode,category,length,taskId);
}
