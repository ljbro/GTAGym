import type {V2} from './city-types.ts';
export type GaragePlacement={origin:V2;yaw:number;baseY:number;approach:V2;door:V2;goal:V2;originalGoal:V2};
export function garageWorld(p:Pick<GaragePlacement,'origin'|'yaw'>,x:number,z:number):V2{
 const c=Math.cos(p.yaw),s=Math.sin(p.yaw);return [p.origin[0]+c*x+s*z,p.origin[1]-s*x+c*z];
}
export function garageLocal(p:Pick<GaragePlacement,'origin'|'yaw'>,x:number,z:number):V2{
 const dx=x-p.origin[0],dz=z-p.origin[1],c=Math.cos(p.yaw),s=Math.sin(p.yaw);return [c*dx-s*dz,s*dx+c*dz];
}
type SiteChecks={blocked:(x:number,z:number)=>boolean;heightAt:(x:number,z:number)=>number;roadAt:(x:number,z:number)=>{d:number;road:{width:number}}|null};
/** Find nearby buildable land, never stamp the garage over a road or building. */
export function findGaragePlacement(points:readonly V2[],checks:SiteChecks):GaragePlacement{
 const end=points.at(-1)!,previous=points.at(-2)??end,heading=Math.atan2(end[1]-previous[1],end[0]-previous[0]);
 for(const distance of [10,16,24,34,46,60])for(const angle of [Math.PI/2,-Math.PI/2,0,Math.PI/4,-Math.PI/4,3*Math.PI/4,-3*Math.PI/4,Math.PI]){
  const a=heading+angle,dx=Math.cos(a),dz=Math.sin(a),yaw=-a,door:V2=[end[0]+dx*distance,end[1]+dz*distance];
  const offset=garageWorld({origin:[0,0],yaw},-6.22,-1.925),origin:V2=[door[0]-offset[0],door[1]-offset[1]];
  const p:GaragePlacement={origin,yaw,baseY:0,door,approach:[door[0]-dx*3,door[1]-dz*3],goal:[0,0],originalGoal:[...end]};p.goal=garageWorld(p,-1.5,-1.925);
  const heights:number[]=[];let clear=true;
  for(let x=-6.6;x<=6.61&&clear;x+=1.1)for(let z=-6.9;z<=6.91;z+=1.15){
   const [wx,wz]=garageWorld(p,x,z),road=checks.roadAt(wx,wz),h=checks.heightAt(wx,wz);
   if(checks.blocked(wx,wz)||!Number.isFinite(h)||(road&&road.d<road.road.width/2+1)){clear=false;break;}heights.push(h);
  }
  if(!clear||Math.max(...heights)-Math.min(...heights)>.25)continue;
  p.baseY=Math.max(...heights)+.025;
  const steps=Math.ceil(distance/.3);let last=checks.heightAt(...end);
  for(let i=1;i<=steps&&clear;i++){
   const x=end[0]+dx*distance*i/steps,z=end[1]+dz*distance*i/steps,h=checks.heightAt(x,z);
   if(!Number.isFinite(h)||Math.abs(h-last)>.35||p.baseY+.157-h>.45)clear=false;
   for(const side of [-.4,0,.4])if(checks.blocked(x-dz*side,z+dx*side))clear=false;
   last=h;
  }
  if(clear)return p;
 }
 throw Error("c02-n02 No open space suitable for safely placing a garage was found near the original endpoint, Please check the site.");
}
