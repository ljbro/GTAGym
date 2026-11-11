// Data-only module: host-side dataset loaders can read the same rules without
// loading TypeScript simulation classes that require a transforming runtime.
import {CAR_MAX_SPEED} from './driving-constants.ts';
export const NPC_DRIVE_SPEED=CAR_MAX_SPEED*.6;
export type NpcRules={kind:'follow'|'chase';speed:number;headStart:number;radius:number};
export function npcRules(kind:'follow'|'chase',mode:'walk'|'drive'):NpcRules{
 return {kind,speed:mode==='walk'?(kind==='follow'?1.5:3):NPC_DRIVE_SPEED,headStart:kind==='follow'?(mode==='walk'?4:20):(mode==='walk'?8:55),radius:mode==='walk'?(kind==='follow'?20:2.5):(kind==='follow'?200:10)};
}
