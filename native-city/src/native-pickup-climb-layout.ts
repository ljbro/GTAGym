import type {V2} from './city-types.ts';
import type {WalkLink,WalkPoint} from './native-walk-traversal.ts';
export type PickupClimbLayout={x:number;z:number;y:number;yaw:number;side:number;roofY:number;approach:V2;goal:V2;links:WalkLink[]};
export function pickupWorld(p:Pick<PickupClimbLayout,'x'|'z'|'yaw'>,u:number,v:number):V2{const c=Math.cos(p.yaw),s=Math.sin(p.yaw);return [p.x+c*u+s*v,p.z-s*u+c*v];}
export function pickupLocal(p:Pick<PickupClimbLayout,'x'|'z'|'yaw'>,x:number,z:number):V2{const c=Math.cos(p.yaw),s=Math.sin(p.yaw),dx=x-p.x,dz=z-p.z;return [c*dx-s*dz,s*dx+c*dz];}
/** Heights are fitted to the imported pickup hood, not to the cab roof. */
export function hoodHeight(v:number){return 1.43-(v-1.25)*.05;}
export function pickupFloor(p:PickupClimbLayout,x:number,z:number):number|null{
 const [u,v]=pickupLocal(p,x,z);
 if(Math.abs(u)<=.93&&v>=1.25&&v<=2.43)return p.y+hoodHeight(v);
 if(Math.abs(u)<=2.5&&v>=2.85&&v<=7.05)return p.roofY;
 return null;
}
export function makePickupClimbLayout(x:number,z:number,y:number,yaw:number,side=1):PickupClimbLayout{
 const p:PickupClimbLayout={x,z,y,yaw,side,roofY:y+2.78,approach:[0,0],goal:[0,0],links:[]};
 const point=(u:number,v:number,h:number):WalkPoint=>{const [x,z]=pickupWorld(p,u,v);return {x,y:h,z};};
 p.approach=pickupWorld(p,side*3.6,1.7);p.goal=pickupWorld(p,0,6.25);
 p.links=[
  {id:'pickup-hood',kind:'climb',from:point(side*1.85,1.7,y),to:point(0,1.7,y+hoodHeight(1.7)),top:y+hoodHeight(1.7),duration:1.9,triggerRadius:.65,mantleGrip:point(side*1.12,1.7,y+hoodHeight(1.7))},
  {id:'pickup-roof',kind:'climb',from:point(0,2.03,y+hoodHeight(2.03)),to:point(0,3.65,p.roofY),top:p.roofY,duration:2.15,triggerRadius:.65,mantleGrip:point(0,2.85,p.roofY)},
 ];return p;
}
type Checks={blocked:(x:number,z:number)=>boolean;heightAt:(x:number,z:number)=>number;roadAt?:(x:number,z:number)=>{d:number;road:{width:number}}|null};
/** A supported low annex beside the existing city; never overlap native roads/buildings. */
export function findPickupClimbLayout(points:readonly V2[],checks:Checks):PickupClimbLayout{
 const end=points.at(-1)!,before=points.at(-2)!,heading=Math.atan2(end[0]-before[0],end[1]-before[1]);
 for(const distance of [8,12,18,26,36,48,60])for(const direction of [1,-1])for(const shift of [0,-8,8])for(const turn of [0,Math.PI]){
  const x=end[0]+Math.cos(heading)*distance*direction+Math.sin(heading)*shift,z=end[1]-Math.sin(heading)*distance*direction+Math.cos(heading)*shift,yaw=heading+turn;
  const [ex]=pickupLocal({x,z,yaw},...end),side=ex<0?-1:1,p=makePickupClimbLayout(x,z,0,yaw,side);
  let clear=true;const heights:number[]=[];
  for(let u=-2.9;u<=2.91&&clear;u+=.58)for(let v=-2.9;v<=9.5;v+=.4){const [wx,wz]=pickupWorld(p,u,v),h=checks.heightAt(wx,wz),r=checks.roadAt?.(wx,wz);
   if(checks.blocked(wx,wz)||!Number.isFinite(h)||r&&r.d<r.road.width/2+.6){clear=false;break;}heights.push(h);}
  if(!clear||Math.max(...heights)-Math.min(...heights)>.06)continue;
  const placed=makePickupClimbLayout(x,z,Math.max(...heights)+.015,yaw,side);
  // Approach stays outside both the car and the annex. The last metre leads
  // to the physical hood edge, not into its collision box.
  const groundFrom:V2=[placed.links[0].from.x,placed.links[0].from.z];
  for(const [a,b] of [[end,placed.approach],[placed.approach,groundFrom]]){
   const n=Math.max(1,Math.ceil(Math.hypot(b[0]-a[0],b[1]-a[1])/.25));
   for(let i=0;i<=n&&clear;i++){const px=a[0]+(b[0]-a[0])*i/n,pz=a[1]+(b[1]-a[1])*i/n,[u,v]=pickupLocal(placed,px,pz);
    if(Math.abs(u)<1.43&&Math.abs(v)<2.9||Math.abs(u)<2.8&&v>2.6&&v<9.5)clear=false;
    for(const [dx,dz] of [[0,0],[.3,0],[-.3,0],[0,.3],[0,-.3]])if(checks.blocked(px+dx,pz+dz)||Math.abs(checks.heightAt(px+dx,pz+dz)-placed.y)>.28)clear=false;
   }
  }
  if(clear)return placed;
 }
 throw Error("c07-n01 There is no nearby open space where the pickup climbing area can be placed safely");
}
