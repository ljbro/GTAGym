import type {WalkLink} from './native-walk-traversal.ts';
type Walker={active:boolean;grounded:boolean;traversing:boolean;x:number;z:number;feetY:number;yaw:number};
/** Only advertise a reachable side of an authored railing, not a remote link. */
export function vaultPrompt(links:readonly WalkLink[],walk:Walker|null){
 if(!walk?.active||!walk.grounded||walk.traversing)return '';
 const link=links.filter(l=>l.kind==='vault'&&Math.abs(walk.feetY-l.from.y)<.7&&Math.hypot(walk.x-l.from.x,walk.z-l.from.z)<(l.triggerRadius??1.6))
  .sort((a,b)=>Math.hypot(walk.x-a.from.x,walk.z-a.from.z)-Math.hypot(walk.x-b.from.x,walk.z-b.from.z))[0];
 if(!link)return '';
 const dx=link.to.x-link.from.x,dz=link.to.z-link.from.z;
 const facing=(dx*Math.sin(walk.yaw)+dz*Math.cos(walk.yaw))/Math.max(.01,Math.hypot(dx,dz))>.3;
 return facing?"Press Space to vault over the railing":"Face the railing, Press Space to vault";
}
