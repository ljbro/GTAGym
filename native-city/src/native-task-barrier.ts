import type {V2} from './city-types.ts';
export type NativeTaskBarrier={x:number;z:number;yaw:number;halfWidth:number;halfDepth:number};
/** Half-lane obstruction, with enough room to go round on a 6 m road. */
export function routeBarrier(points:readonly V2[],beforeDistance:number):NativeTaskBarrier{
 let remaining=Math.max(0,beforeDistance);
 for(let i=1;i<points.length;i++){
  const a=points[i-1],b=points[i],dx=b[0]-a[0],dz=b[1]-a[1],length=Math.hypot(dx,dz);if(length<1e-6)continue;
  if(remaining<=length||i===points.length-1){const t=Math.min(1,remaining/length);
   return {x:a[0]+dx*t-dz/length*1.3,z:a[1]+dz*t+dx/length*1.3,yaw:Math.atan2(dx,dz),halfWidth:.9,halfDepth:.5};
  }remaining-=length;
 }
 throw Error('Cannot place obstacle on an empty route');
}
export function nativeBarrierBlocked(barriers:readonly NativeTaskBarrier[],x:number,z:number,margin=1.1){
 return barriers.some(b=>{const dx=x-b.x,dz=z-b.z,c=Math.cos(b.yaw),s=Math.sin(b.yaw);
  return Math.abs(dx*c-dz*s)<b.halfWidth+margin&&Math.abs(dx*s+dz*c)<b.halfDepth+margin;
 });
}
/** Oriented vehicle footprint: stop the bumper, not just the car's centre. */
export function nativeBarrierVehicleBlocked(barriers:readonly NativeTaskBarrier[],x:number,z:number,yaw:number){
 const carRight:V2=[Math.cos(yaw),-Math.sin(yaw)],carForward:V2=[Math.sin(yaw),Math.cos(yaw)];
 const dot=(a:V2,b:V2)=>a[0]*b[0]+a[1]*b[1];
 return barriers.some(b=>{
  const right:V2=[Math.cos(b.yaw),-Math.sin(b.yaw)],forward:V2=[Math.sin(b.yaw),Math.cos(b.yaw)],delta:V2=[x-b.x,z-b.z];
  return [right,forward,carRight,carForward].every(axis=>Math.abs(dot(delta,axis))<
   b.halfWidth*Math.abs(dot(right,axis))+b.halfDepth*Math.abs(dot(forward,axis))+
   1.1*Math.abs(dot(carRight,axis))+2.5*Math.abs(dot(carForward,axis)));
 });
}
