import type {PickupClimbLayout} from './native-pickup-climb-layout.ts';
type Walker={active:boolean;grounded:boolean;traversing:boolean;x:number;z:number;feetY:number;yaw:number};
/** Same proximity/height/facing gates as the existing Space traversal.
 * No historical flag: descending to the hood or ground restores the right hint.
 */
export function pickupClimbPrompt(layout:PickupClimbLayout,walk:Walker|null){
 if(!walk?.active||!walk.grounded||walk.traversing)return '';
 for(const link of layout.links){
  if(Math.hypot(walk.x-link.from.x,walk.z-link.from.z)>=(link.triggerRadius??1.6)||Math.abs(walk.feetY-link.from.y)>=.7)continue;
  const dx=link.to.x-link.from.x,dz=link.to.z-link.from.z;
  const facing=(dx*Math.sin(walk.yaw)+dz*Math.cos(walk.yaw))/Math.max(.01,Math.hypot(dx,dz))>.3;
  const action=link.id==='pickup-hood'?"Press Space to climb onto the pickup":"Press Space to get onto the roof";
  return facing?action:(link.id==='pickup-hood'?"Face the front of the pickup truck,":"Face the rooftop,")+action;
 }
 return '';
}
