import type {InteriorBox,Triple} from './offmap-interior-layout.ts';
import {nearestWeaponHit} from './offmap-weapon-core.ts';
/** A small swept camera volume, in the same world coordinates as the room. */
export function interiorThirdPersonCamera(eye:Triple,yaw:number,pitch:number,distance:number,boxes:InteriorBox[]){
 const forward:Triple=[Math.sin(yaw)*Math.cos(pitch),-Math.sin(pitch),Math.cos(yaw)*Math.cos(pitch)];
 const offset:Triple=[-forward[0]*distance,-forward[1]*distance+.28,-forward[2]*distance];
 const length=Math.hypot(...offset),direction=offset.map(v=>v/length) as Triple;
 const hit=nearestWeaponHit(eye,direction,boxes.map(b=>({...b,size:b.size.map(v=>v+.32) as Triple})),length);
 const arm=hit?Math.max(0,hit.distance-.03):length;
 return {position:eye.map((v,i)=>v+direction[i]*arm) as Triple,target:eye.map((v,i)=>v+forward[i]*1.5) as Triple,arm};
}
