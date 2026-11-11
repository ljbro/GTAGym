/** Existing OffMapBench Michael export, not a Franklin texture recolour.
 * Used for pedestrian follow targets and the c03-n06 target motorcycle rider.
 */
export const FOLLOW_CHARACTER={
 id:'michael' as const,name:'Michael',file:'michael.glb',
 displayHeight:1.78,sourceHeight:1.933,bytes:3043060,triangles:31608,
 gait:{walk:{cycleSeconds:1,authoredSpeed:1.6},run:{cycleSeconds:17/24,authoredSpeed:4.2}},
};
export const FOLLOW_CHARACTER_BASE='/characters/offmapbench';
/** Task-scoped: never replaces the player's motorcycle rider. */
export function targetRiderOptions(taskId:string){
 return taskId==='c03-n06'?{character:FOLLOW_CHARACTER,assetBase:FOLLOW_CHARACTER_BASE}:{};
}
