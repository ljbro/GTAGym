import original from './native-interior-tasks.json' with {type:'json'};
type Task=typeof original[number];
/** Inferred multi-room adaptation, not a new measurement of the GTA map. */
export const BANK_INBOUND=[
 [1.2363,-17.5635],[-1.2,-15],[-1.2,-9.54],[-1.2,-7],
 [8,-7],[8,-2.2],[-1.2,-2.2],[-1.2,5.8],
 [-5.5,5.8],[-9,5.8],[-11.195,6.545],[-13.2,7.6],
];
export function reviewedBank(t:Task):Task{
 if(t.theme!=='bank')return t;
 const walls=t.walls!.map(w=>w.id==='corridor-east'?{...w,minZ:-.5}:w);
 const wall=(id:string,minX:number,maxX:number,minZ:number,maxZ:number)=>({id,minX,maxX,minZ,maxZ,height:3.5,kind:'concrete'});
 walls.push(wall('security-east',10.48,10.72,-9.54,-.5),wall('security-front',7,10.72,-9.66,-9.42),
  wall('equipment-door-left',-3.5,6.8,-4.62,-4.38),wall('equipment-door-right',9.2,10.6,-4.62,-4.38),
  wall('corridor-entry-left',-3.5,-2.45,-.62,-.38),wall('corridor-entry-right',.05,1.1,-.62,-.38));
 const rooms=t.rooms!.map(r=>r.id==='security-corridor'?{...r,minZ:-.5}:r);
 rooms.push({id:'security-vestibule',minX:-3.5,maxX:10.6,minZ:-9.54,maxZ:-4.5},{id:'equipment-room',minX:-3.5,maxX:10.6,minZ:-4.5,maxZ:-.5});
 // Cash cart from the old approximation competes visually with the new safe.
 const props=t.id==='c09-n01'?t.props!.filter(p=>p.kind!=='cash'):t.props!;
 return {...t,walls,rooms,props} as Task;
}
