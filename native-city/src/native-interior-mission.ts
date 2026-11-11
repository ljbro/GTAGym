import original from './native-interior-tasks.json' with {type:'json'};
import type {ShutterActor} from './native-warehouse-shutter.ts';
import {BANK_INBOUND,reviewedBank} from './native-bank-layout.ts';
import {GARAGE_APPROACH} from './native-garage-approach.ts';
import {STORE_ROUTE} from './native-interior-video-layout.ts';
type Point=number[];
const task=(id:string)=>original.find(t=>t.id===id)!;
const length=(points:Point[])=>points.slice(1).reduce((s,p,i)=>s+Math.hypot(p[0]-points[i][0],p[1]-points[i][1]),0);
const join=(...paths:Point[][])=>paths.flatMap((p,i)=>i&&paths[i-1].at(-1)!.every((v,k)=>v===p[0][k])?p.slice(1):p);
export const BANK_EXIT=join(task('c09-n09').points,task('c09-n02').points,task('c09-n03').points);
export const DEALER_RETURN=join([task('c09-n04').points.at(-1)!],task('c09-n10').points);
export const MERGED_INTERIOR_IDS=['c09-n09','c09-n10'];
export const BANK_COVER_POINT=[5,20.8];
/** Runtime-only compositions: all original tasks and evidence remain unchanged. */
export const MERGED_INTERIORS=original.filter(t=>!MERGED_INTERIOR_IDS.includes(t.id)).map(t=>{
 t=reviewedBank(t);
 if(t.id==='c09-n02'){const points=[...t.points.slice(0,-2),[7.3,16.4],[7.3,20.8],BANK_COVER_POINT];return {...t,points,length:length(points),source:{...t.source,note:t.source.note+" Go around the right end of the main cover, Go between the cargo crate and the rear wall, After landing, approach on foot, then face the side of the door and crouch to complete; The endpoint is adapted for gameplay."}};}
 if(t.id==='c01-n02')return {...t,points:GARAGE_APPROACH,length:length(GARAGE_APPROACH),source:{...t.source,note:"The Original Clip Is Only About 2.1 meters. Start from the other side of the courtyard as required by the gameplay, After going around the central flower bed with collision enabled, Align with the wide main garage door and drive in; The new route is an estimated adaptation, Not Measured from Video. Michael Garage uses an existing substitute asset, Not from the Recording Franklin Bicycle Garage."}};
 if(t.id==='c09-n05')return {...t,points:STORE_ROUTE,length:length(STORE_ROUTE),times:[],intervals:[],source:{...t.source,metricStatus:'gameplay-adaptation',note:"Keep original 47–55 seconds, about 13 meters of calibration data; The current version extends the route around store shelves and through the back room, This is a gameplay adaptation rather than a new measurement. Still Treated as Outside the Shop→Storefront→Rear room→Starting step layout, Step height 0.16m, deep 0.35m To estimate, Approximate finish elevation 0.48m, A full ascent upstairs is not required."}};
 const bank=t.id==='c09-n01',dealer=t.id==='c09-n04';if(!bank&&!dealer)return t;
 const points=join(bank?BANK_INBOUND:t.points,bank?BANK_EXIT:DEALER_RETURN);
 return {...t,title:bank?"Collect the cash and leave the bank":"Visit the showroom and return to the rear area",points,length:length(points),source:{...t.source,note:bank?"Office→Security anteroom→Equipment room→Corridor→Vault cash storage area→Adapt the warehouse exit for continuous gameplay. Add room dimensions, Turns and safe interactions are estimated adaptations, Not measured from video in meters; The original segmented route does not cover.":t.source.note+" Merge missions for continuous gameplay, Original segment data is retained."}};
});
export class InteriorMission{
 stage=0;
 constructor(readonly id:string,readonly origin:{x:number;y:number;z:number}){}
 get phased(){return this.id==='c09-n01'||this.id==='c09-n04';}
 get localRoute(){return this.id==='c09-n01'?(this.stage?BANK_EXIT:BANK_INBOUND):this.id==='c09-n04'?(this.stage?DEALER_RETURN:task(this.id).points):null;}
 get ready(){return this.id==='c09-n02'?this.stage===1:!this.phased||this.stage===1;}
 coverPrompt(actor:ShutterActor|null|undefined){return this.id==='c09-n02'&&!this.stage&&this.at(actor,BANK_COVER_POINT,.85)?"press Q Enter cover and crouch":'';}
 takeCover(actor:(ShutterActor&{enterCover:(yaw:number)=>boolean})|null|undefined){if(!this.coverPrompt(actor)||!actor?.enterCover(Math.PI))return false;this.stage=1;return true;}
 get instruction(){return this.id==='c09-n01'?(this.stage?"Stashed cash retrieved, Open the exit roller shutter and leave the bank.":"Enter the Vault, Open the safe and take the hidden cash, Then evacuate the bank."):this.id==='c09-n04'?(this.stage?"Arrived at the Showroom, Go through the maintenance room and return to the rear area.":"Enter the exhibition hall from the maintenance room, Reach the yellow target marker, then return to the back lot."):'';}
 private at(actor:ShutterActor|null|undefined,point:Point,radius:number){return !!actor?.active&&!actor.airborne&&!actor.traversing&&Math.abs(actor.feetY-this.origin.y)<.4&&Math.hypot(actor.x-this.origin.x-point[0],actor.z-this.origin.z-point[1])<=radius;}
 prompt(actor:ShutterActor|null|undefined){return this.id==='c09-n01'&&!this.stage&&this.at(actor,task(this.id).points.at(-1)!,1.5)?"press E Open the safe and take the hidden cash":'';}
 guidance(actor:ShutterActor|null|undefined){
  if(this.id!=='c09-n01'||!actor?.active)return '';
  if(this.stage)return "Stolen money obtained: Evacuate along the green line on the minimap, At the exit roller shutter, press E Enable.";
  const x=actor.x-this.origin.x,z=actor.z-this.origin.z;
  const room=x< -10.5?"Cash Storage Area":x< -4.8&&z>-.5?"Vault":z< -9.54?"Office":z< -4.5?"Security anteroom":z<-.5?"Equipment room":"Security corridor";
  return room==="Cash Storage Area"?"Cash safe: approach the counter marked CASH and press E.":`Current room: ${room}. Follow the purple route to the cash safe in the vault.`;
 }
 interact(actor:ShutterActor|null|undefined){if(!this.prompt(actor))return false;this.stage=1;return true;}
 step(actor:(ShutterActor&{coverCrouched?:boolean})|null|undefined){if(this.id==='c09-n02'&&this.stage&&!actor?.coverCrouched)this.stage=0;if(this.id==='c09-n04'&&!this.stage&&this.at(actor,task(this.id).points.at(-1)!,1))this.stage=1;}
}
