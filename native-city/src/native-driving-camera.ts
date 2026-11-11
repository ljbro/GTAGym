/** Existing IDs preserved: 0 near, 3 medium, 2 far, 1 cockpit. */
export function drivingView(view:number,thirdPersonOnly:boolean):number{
 return thirdPersonOnly&&view!==2?0:view;
}
export function nextDrivingView(view:number,thirdPersonOnly:boolean):number{
 return thirdPersonOnly?(view===0?2:0):({0:3,3:2,2:1,1:0}[view]??0);
}
/** Place the real camera outside the car, after async task/model loading.
 * Resetting only `view` leaves the previous cockpit/observer pose until a tick.
 */
export function nativeDrivingStartCamera(p:{x:number;z:number;yaw:number},ground:number,large=false){
 const distance=large?21:8.6,height=large?5.8:3.5;
 return {
  eye:[p.x-Math.sin(p.yaw)*distance,ground+height,p.z-Math.cos(p.yaw)*distance] as [number,number,number],
  target:[p.x+Math.sin(p.yaw)*5,ground+2.65,p.z+Math.cos(p.yaw)*5] as [number,number,number],
 };
}
