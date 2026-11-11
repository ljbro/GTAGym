/** Ambient population only. Mission targets and police have separate rules.
 * Test the final lane/interpolated pose, never merely the source graph node. */
export const AMBIENT_SPAWN_RULES=Object.freeze({vehicleDistance:180,pedestrianDistance:100,vehicleRetention:650,pedestrianRetention:400});
export function ambientSpawnAllowed(x:number,z:number,playerX:number,playerZ:number,kind:'vehicle'|'pedestrian'){
 return [x,z,playerX,playerZ].every(Number.isFinite)&&Math.hypot(x-playerX,z-playerZ)>=(kind==='vehicle'?AMBIENT_SPAWN_RULES.vehicleDistance:AMBIENT_SPAWN_RULES.pedestrianDistance);
}
