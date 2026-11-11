import shoreBoatRoutes from './native-shore-boat-routes.json' with {type:'json'};
import shoreRoutes from './native-shore-routes.json' with {type:'json'};
import type {ShoreBoatSpec} from './native-shore-boat-motion.ts';
import {waterLocal,waterWorld} from './native-water-motion.ts';

/** Authored transport-choice variants. Original video annotations stay intact.
 * The goal accepts any surface arrival; the deadline, not a vehicle gate,
 * makes swimming an ineffective strategy. No artificial route barriers. */
export const WATER_TRANSFER_IDS=new Set(['c06-n05','c06-n09']);
export const WATER_TRANSFER_SPECS:ShoreBoatSpec[]=[
 {id:'c06-n05',length:450,title:"47 Off the Rails · Head to the offshore supply platform",shore:shoreBoatRoutes[0].shorePath},
 {id:'c06-n09',length:525,title:"25 Escape the Drug Den · Head to the offshore work platform",shore:shoreRoutes.find(s=>s.id==='c06-n03')!.path},
].map(({id,length,title,shore})=>{
 const start=shore.points.at(-1)!,forward=shore.forward.map(n=>-n),right=[forward[1],-forward[0]];
 const at=(v:number)=>[start[0]+forward[0]*v,start[1]+forward[1]*v];
 const points=[start,at(60),at(length)];
 const region={minX:Math.min(...points.map(p=>p[0]))-180,maxX:Math.max(...points.map(p=>p[0]))+180,minZ:Math.min(...points.map(p=>p[1]))-180,maxZ:Math.max(...points.map(p=>p[1]))+180};
 return {id,title,objective:'shore-transfer',craft:'zodiac',startAboard:false,boatSpawn:at(60),
  path:{points,length,forward,right},
  // The shore sampler still runs sea -> land, but now covers the whole bay.
  shorePath:{points:[at(length),start],length,forward:forward.map(n=>-n),right:right.map(n=>-n)},
  freeRoamRegion:region,region,expectedTurns:[],waterHeight:-.25,startDepth:0,goalDepth:0,
  shallowFloorDepth:3,deepFloorDepth:3,entrance:false,
 } as ShoreBoatSpec;
});
export function waterTransferSpec(id:string){return WATER_TRANSFER_SPECS.find(s=>s.id===id);}
/** A solid, sea-bed-supported caisson platform. The goal is in front of its
 * fender, not inside the concrete. Same footprint for rendering and physics. */
export function transferPlatformBlocks(spec:ShoreBoatSpec,x:number,z:number){
 const [u,v]=waterLocal(spec,x,z);return Math.abs(u)<11.35&&v>spec.path.length+5.65&&v<spec.path.length+26.35;
}
export function transferPlatformCenter(spec:ShoreBoatSpec){return waterWorld(spec,0,spec.path.length+16);}
