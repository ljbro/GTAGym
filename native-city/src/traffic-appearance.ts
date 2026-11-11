import {Matrix,type AbstractMesh} from '@babylonjs/core';
export type TrafficWheel={center:[number,number,number];radius:number;front:boolean};
/** Imported metadata is already expressed in the game's +Z-forward coordinates. */
export function trafficWheel(mesh:AbstractMesh):TrafficWheel|null{
 const w=mesh.metadata?.gltf?.extras?.trafficWheel??mesh.metadata?.trafficWheel;
 return w&&Array.isArray(w.center)&&w.center.length===3&&w.center.every(Number.isFinite)&&Number.isFinite(w.radius)&&w.radius>.1?w:null;
}
export function trafficWheelMatrix(w:TrafficWheel,distance:number){
 const [x,y,z]=w.center;
 return Matrix.Translation(-x,-y,-z).multiply(Matrix.RotationX(distance/w.radius)).multiply(Matrix.Translation(x,y,z));
}
/** Signed travel, not throttle or wall time: stopped/paused wheels stay still. */
export function trafficWheelTravel(before:{x:number;z:number},after:{x:number;z:number;yaw:number},dt:number){
 const dx=after.x-before.x,dz=after.z-before.z;
 if(dt<=0||Math.hypot(dx,dz)>8)return 0;
 return dx*Math.sin(after.yaw)+dz*Math.cos(after.yaw);
}
