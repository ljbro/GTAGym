import {interiorBounds,interiorFloorPoints,interiorGeometryPoints,interiorRibbon,INTERIOR_TUNNEL_HALF_WIDTH,type InteriorTask,type InteriorSolid} from './native-interior-layout.ts';
import {bankEnvelopeRooms,STORE_VESTIBULE,WORKSHOP_REAR_LIMIT} from './native-interior-enclosure.ts';
import {STORE_LAYOUT,STORE_STAIRS,workshopPoint} from './native-interior-video-layout.ts';
import {mapBox,mapRect,type InteriorMinimapPlan} from './interior-minimap.ts';
import {extraInteriorLayout,extraMapPlan} from './native-extra-layout.ts';

/** Local footprints reuse the SAME room extents, yaw, aisle widths and solids
 * as NativeInteriorSite. The task's route is not used to invent room geometry. */
export function nativeInteriorMap(spec:InteriorTask,solids:readonly InteriorSolid[]):InteriorMinimapPlan{
 const extra=extraInteriorLayout(spec.id);if(extra)return extraMapPlan(extra,0);
 const plan:InteriorMinimapPlan={floors:[],walls:[],obstacles:[],stairs:[],doors:[]};
 if(spec.theme==='bank')plan.floors=bankEnvelopeRooms(spec).map(mapRect);
 else if(spec.theme==='workshop')plan.floors=[mapRect({minX:-8,maxX:8,minZ:-9,maxZ:WORKSHOP_REAR_LIMIT}).map(([x,z])=>workshopPoint(x,z))];
 else if(spec.theme==='store'){
  plan.floors=[mapRect({minX:STORE_LAYOUT.minX,maxX:STORE_LAYOUT.maxX,minZ:STORE_LAYOUT.front,maxZ:STORE_LAYOUT.rearDoor}),mapRect(STORE_VESTIBULE),mapRect({minX:0,maxX:2.1,minZ:STORE_LAYOUT.rearDoor,maxZ:STORE_STAIRS.landingEnd})];
  for(let i=0;i<STORE_STAIRS.count;i++)plan.stairs.push(mapRect({minX:STORE_STAIRS.minX,maxX:STORE_STAIRS.maxX,minZ:STORE_STAIRS.startZ+i*STORE_STAIRS.tread,maxZ:STORE_STAIRS.startZ+(i+1)*STORE_STAIRS.tread}));
 }else if(spec.theme==='parking'||spec.theme==='tunnel'){
  const edge=interiorRibbon(interiorGeometryPoints(interiorFloorPoints(spec.points)),spec.theme==='tunnel'?INTERIOR_TUNNEL_HALF_WIDTH:8.5);
  plan.floors=[edge.ring];
  // Continuous side walls follow the generated parking/tunnel mesh, not city roads.
  if(!solids.some(s=>s.name==='long-side-wall'))for(const side of [edge.left,edge.right])for(let i=1;i<side.length;i++){
   const a=side[i-1],b=side[i];plan.walls.push(mapBox((a[0]+b[0])/2,(a[1]+b[1])/2,.25,Math.hypot(b[0]-a[0],b[1]-a[1]),Math.atan2(b[0]-a[0],b[1]-a[1])));
  }
 }else plan.floors=[mapRect(interiorBounds(spec))]; // Garage courtyard foundation.
 for(const s of solids){
  if((s.y??0)>1.9)continue;
  const wall=s.material==='wall'||s.material==='glass'||s.material==='cage'||s.name.includes('wall')||s.name.includes('enclosure')||s.name.startsWith('loading-bay');
  (wall?plan.walls:plan.obstacles).push(mapBox(s.x,s.z,s.w,s.d,s.yaw));
 }
 return plan;
}
