import type {ExtraBox,ExtraLayout} from './native-extra-layout.ts';
import type {Position3} from './training-task-schema.ts';

const box=(name:string,x:number,z:number,w:number,d:number,h:number,y=0,material='wall'):ExtraBox=>({name,x,z,w,d,h,y,material});
/** A chain of sealed, connected rooms, not floating corridor strips. Cells
 * that touch without a route connection retain solid walls. All door/step
 * rectangles are consumed by the existing renderer AND collision controller. */
export function trainingRooms(id:string,turns:number,cell:number,upstairs:boolean,mirror=1):{layout:ExtraLayout;route:Position3[]}{
 const centers:[number,number][]=[[0,0]];
 // Equal runs produce exactly `turns` 90-degree reference turns. Reversals
 // are forbidden; no room is reused to pad the requested distance.
 for(let i=0;i<=turns;i++){const p=centers.at(-1)!;centers.push([p[0]+(i%2===0?cell*mirror:0),p[1]+(i%2?cell:0)]);}
 const solids:ExtraBox[]=[],doors:ExtraLayout['doors']=[],floors:ExtraBox[]=[],ceilings:ExtraBox[]=[],steps:ExtraBox[]=[],lights:ExtraLayout['lights']=[];
 const end=centers.at(-1)!,route:Position3[]=centers.map(([x,z])=>({x,y:0,z})),half=cell/2;
 for(const [i,[x,z]] of centers.entries()){
  const tall=upstairs&&i===centers.length-1,height=tall?7.2:3.6;
  floors.push(box('floor-'+i,x,z,cell,cell,.18,-.18));ceilings.push(box('ceiling-'+i,x,z,cell+.04,cell+.04,.18,height));
  lights.push({x,y:height-.5,z});
  for(const [side,[dx,dz]] of [[1,0],[-1,0],[0,1],[0,-1]].entries()){
   const next=centers.findIndex(([cx,cz])=>Math.abs(cx-x-dx*cell)<.01&&Math.abs(cz-z-dz*cell)<.01),connected=next>=0&&Math.abs(next-i)===1;
   // One shared partition, never two coincident walls/door leaves.
   if(connected&&next<i)continue;
   const wx=x+dx*half,wz=z+dz*half,yaw=dx?Math.PI/2:0,name=`room-${i}-side-${side}`;
   if(connected){
    const gap=Math.min(3,cell*.4),span=(cell-gap)/2,wallHeight=upstairs&&(i===centers.length-1||next===centers.length-1)?7.2:3.6;
    for(const sign of [-1,1])solids.push({...box(name+'-jamb-'+sign,wx+(dx?0:sign*(gap/2+span/2)),wz+(dx?sign*(gap/2+span/2):0),span,.3,wallHeight),yaw});
    solids.push({...box(name+'-header',wx,wz,gap,.3,wallHeight-2.7,2.7),yaw});
    doors.push({...box(name+'-push',wx,wz,gap,.12,2.7),yaw,open:true,decoy:false});
   }else{
    solids.push({...box(name,wx,wz,cell+.02,.3,height),yaw});
    if(side===1&&i%2===0)doors.push({...box(name+'-locked',wx-dx*.19,wz-dz*.19,1.4,.12,2.5),yaw,open:false,decoy:true});
   }
  }
 }
 if(upstairs){
  // The upper floor has a REAL stairwell cutout, supported treads and a
  // landing. No automatic floor transition or animation-only teleport.
  const run=cell-2,count=20,rise=3.6/count,stairX=end[0],startZ=end[1]-run/2,finishZ=end[1]+run/2;
  const previous=centers.at(-2)!,entryX=end[0]-previous[0];
  // Enter through the ACTUAL last doorway before turning toward the foot of
  // the stairs. A diagonal straight to the foot would cut through a jamb.
  route.pop();
  if(Math.abs(entryX)>.01){const x=end[0]-Math.sign(entryX)*(half-1.8);route.push({x,y:0,z:end[1]},{x,y:0,z:startZ-.3});}
  route.push({x:stairX,y:0,z:startZ-.3});
  for(let i=0;i<count;i++){const z=startZ+(i+.5)*run/count,y=(i+1)*rise;steps.push(box('tread-'+i,stairX,z,2.6,run/count+.005,y,0,'wood'));route.push({x:stairX,y,z});}
  route.push({x:stairX,y:3.6,z:finishZ+.45},{x:stairX+Math.min(2.6,half-1),y:3.6,z:finishZ+.45});
  const sideWidth=(cell-2.6)/2;
  for(const sign of [-1,1])floors.push(box('upper-side-'+sign,stairX+sign*(1.3+sideWidth/2),end[1],sideWidth,cell,.18,3.42));
  floors.push(box('upper-landing',stairX,end[1]+half-.5,2.6,1,.18,3.42));
  for(const sign of [-1,1])solids.push(box('stairwell-rail-'+sign,stairX+sign*1.4,end[1],.12,run,1,3.6,'metal'));
 }
 const xs=centers.map(p=>p[0]),zs=centers.map(p=>p[1]);
 const layout:ExtraLayout={id,title:upstairs?'Find the stairs and reach the upper room':'Navigate the connected rooms',source:{task:'procedural-room-chain',sha256:'',note:'New training geometry; not a measured video reconstruction.'},bounds:{minX:Math.min(...xs)-half-.2,maxX:Math.max(...xs)+half+.2,minZ:Math.min(...zs)-half-.2,maxZ:Math.max(...zs)+half+.2},points:route.map(p=>[p.x,p.z]),goalY:upstairs?3.6:0,solids,doors,floors,ceilings,steps,signs:[],lights};
 return {layout,route};
}
export function routeLength3(points:readonly Position3[]){return points.slice(1).reduce((sum,p,i)=>sum+Math.hypot(p.x-points[i].x,p.y-points[i].y,p.z-points[i].z),0);}
