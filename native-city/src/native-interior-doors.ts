import type {InteriorTask,InteriorSolid} from './native-interior-layout.ts';
import {extraInteriorLayout,type ExtraLayout} from './native-extra-layout.ts';
import {STORE_LAYOUT,workshopPoint,WORKSHOP_YAW} from './native-interior-video-layout.ts';
export type PushDoorSpec={name:string;x:number;z:number;y:number;w:number;h:number;d:number;yaw:number;locked:boolean;maxAngle?:number};
export type PushDoorActor={x:number;z:number;feetY:number;yaw:number;active:boolean;airborne?:boolean;traversing?:boolean};
export const PUSH_DOOR_SECONDS=1.4;
export function interiorPushDoorSpecs(task:Pick<InteriorTask,'id'|'mode'|'theme'|'points'>,layout?:ExtraLayout):PushDoorSpec[]{
 if(task.mode!=='walk')return [];
 const e=layout??extraInteriorLayout(task.id);
 if(e)return e.doors.map(d=>({...d,yaw:d.yaw??0,locked:d.decoy||!d.open}));
 const door=(name:string,x:number,z:number,w:number,yaw=0,locked=false,h=2.6):PushDoorSpec=>({name,x,z,w,yaw,locked,h,y:0,d:.12});
 if(task.theme==='bank')return [door('office-push',-1.2,-9.54,2.56),door('vault-push',-5,5.8,2.76,Math.PI/2,false,2.85),
  door('office-service',6.72,-16,1.5,Math.PI/2,true),door('office-storage',3.8,-22.05,1.5,0,true)];
 if(task.theme==='store'){
  let cross=.95;for(let i=1;i<task.points.length;i++){const a=task.points[i-1],b=task.points[i];if((a[1]-STORE_LAYOUT.partition)*(b[1]-STORE_LAYOUT.partition)<=0&&Math.abs(b[1]-a[1])>.001){cross=a[0]+(b[0]-a[0])*(STORE_LAYOUT.partition-a[1])/(b[1]-a[1]);break;}}
  return [door('shop-entry-push',0,STORE_LAYOUT.front,2.5),{...door('stock-room-push',cross,STORE_LAYOUT.partition,2.5),maxAngle:Math.PI*5/6},door('stairwell-push',1.05,STORE_LAYOUT.rearDoor,2.1),
   door('shop-service',STORE_LAYOUT.minX+.18,1,1.4,Math.PI/2,true),door('stock-storage',STORE_LAYOUT.minX+.18,7.2,1.4,Math.PI/2,true)];
 }
 // Wide vehicle bays are not hinged pedestrian doors; keep those openings.
 if(task.theme==='workshop')return [-3,4].map((v,i)=>{const [x,z]=workshopPoint(-7.8,v);return door('workshop-service-'+i,x,z,1.4,WORKSHOP_YAW+Math.PI/2,true);});
 return [];
}
/** Ordinary doors start shut. Forward intent matters, not measured speed:
 * a player blocked by the leaf must still be able to push. No autonomous timer. */
export class InteriorPushDoor{
 progress=0;private side=0;
 constructor(readonly spec:PushDoorSpec){}
 get snapshot(){return {name:this.spec.name,progress:this.progress,side:this.side,locked:this.spec.locked};}
 reset(){this.progress=0;this.side=0;}
 step(actor:PushDoorActor|undefined,keys:ReadonlySet<string>,dt:number){
  if(this.spec.locked||this.progress>=1||!actor?.active||actor.airborne||actor.traversing||!Number.isFinite(dt)||dt<=0||!keys.has('KeyW')||keys.has('KeyS'))return;
  const d=this.spec,c=Math.cos(d.yaw),s=Math.sin(d.yaw),dx=actor.x-d.x,dz=actor.z-d.z,u=dx*c-dz*s,v=dx*s+dz*c;
  if(Math.abs(actor.feetY-d.y)>.4)return;
  const side=Math.abs(v)>.04?Math.sign(v):this.side||-1;
  const portalPush=Math.abs(u)<=d.w/2+.1&&Math.abs(v)<=1.4&&-side*Math.cos(actor.yaw-d.yaw)>=.6;
  // After crossing the portal a half-open leaf may obstruct a turn. Allow
  // pushing that actual leaf farther in its opening direction, not only
  // approaching the original closed plane (which would strand the player).
  const leafPush=this.progress>0&&this.leaves.some((leaf,i)=>{
   const a=leaf.yaw!,lx=actor.x-leaf.x,lz=actor.z-leaf.z,lu=lx*Math.cos(a)-lz*Math.sin(a),lv=lx*Math.sin(a)+lz*Math.cos(a);
   if(Math.abs(lu)>leaf.w/2+.2||Math.abs(lv)>.7||-Math.sign(lv)*Math.cos(actor.yaw-a)<.25)return false;
   const hinge=i===0?-1:1,hx=d.x+c*hinge*d.w/2,hz=d.z-s*hinge*d.w/2;
   const torque=(actor.z-hz)*Math.sin(actor.yaw)-(actor.x-hx)*Math.cos(actor.yaw);
   return -this.side*hinge*torque>.12;
  });
  if(!portalPush&&!leafPush)return;
  if(!this.side)this.side=side;
  this.progress=Math.min(1,this.progress+Math.min(dt,.1)/(PUSH_DOOR_SECONDS*(d.maxAngle??Math.PI/2)/(Math.PI/2)));
 }
 /** Two leaves for wide portals, each swinging away from the initiating actor.
  * This exact oriented rectangle drives mesh, body/camera collision and map. */
 get leaves():InteriorSolid[]{
  const d=this.spec,count=d.w>1.9?2:1,width=d.w/count,angle=this.progress*(d.maxAngle??Math.PI/2);
  return Array.from({length:count},(_,i)=>{
   const hinge=i===0?-1:1,base=hinge*d.w/2,rotation=d.yaw-(this.side||-1)*hinge*angle;
   return {name:d.name+'-leaf-'+i,x:d.x+Math.cos(d.yaw)*base-Math.cos(rotation)*hinge*width/2,
    z:d.z-Math.sin(d.yaw)*base+Math.sin(rotation)*hinge*width/2,w:width-.025,d:d.d,h:d.h,y:d.y,yaw:rotation};
  });
 }
 blocked(x:number,z:number,y:number,pad=.24,height=1.65){return this.leaves.some(s=>{
  if(y>=(s.y??0)+s.h-.03||y+height<=(s.y??0)+.03)return false;
  const c=Math.cos(s.yaw!),r=Math.sin(s.yaw!),dx=x-s.x,dz=z-s.z;
  return Math.abs(dx*c-dz*r)<s.w/2+pad&&Math.abs(dx*r+dz*c)<s.d/2+pad;
 });}
}
