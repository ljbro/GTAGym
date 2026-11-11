import type {InteriorMission} from './native-interior-mission.ts';
import type {WarehouseShutter,ShutterActor} from './native-warehouse-shutter.ts';
export type InteriorHintKey='safe'|'shutter'|'cover';
export function interiorHintCandidate(mission:InteriorMission,shutter:WarehouseShutter|null,actor:ShutterActor|null|undefined):InteriorHintKey|null{
 return mission.coverPrompt(actor)?'cover':mission.prompt(actor)?'safe':shutter?.ready&&!shutter.opening&&!shutter.open&&shutter.near(actor)?'shutter':null;
}
export const INTERIOR_HINT_SECONDS=8;
export const INTERIOR_HINT_TEXT:Record<InteriorHintKey,string>={
 safe:'Press E to open the safe and collect the cash.',
 shutter:'Press E to open the roller shutter. Wait until it is fully raised.',
 cover:'Press Q to crouch into cover.',
};
/** One encounter per interaction per task attempt; only simulation time expires it. */
export class InteriorHint{
 private seen=new Set<InteriorHintKey>();
 private remaining=0;
 private current:InteriorHintKey|null=null;
 step(candidate:InteriorHintKey|null,dt:number,enabled=true){
  if(!enabled)return '';
  this.remaining=Math.max(0,this.remaining-(Number.isFinite(dt)?Math.max(0,dt):0));
  if(candidate&&!this.seen.has(candidate)){
   this.seen.add(candidate);this.current=candidate;this.remaining=INTERIOR_HINT_SECONDS;
  }
  return this.current&&this.remaining>0?INTERIOR_HINT_TEXT[this.current]:'';
 }
 get snapshot(){return {seen:[...this.seen],current:this.current,remaining:this.remaining};}
}
