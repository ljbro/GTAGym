import type {V2,Road} from './city-types.ts';
export const ROADSIDE_START_TASKS=new Set(['c01-n05','c01-n06','c01-n17','c01-n18']);
export const ROUTE_CAR_MIN_DISTANCE=50;
export type RouteParkedCar={x:number;z:number;yaw:number;group:number;distance:number};
export type RoadsideStart={foot:V2;footYaw:number;maxDuration:number;vehicles:RouteParkedCar[];seed:number};
type Environment={roadAt:(x:number,z:number)=>{x:number;z:number;road:Road}|null;blocked:(x:number,z:number)=>boolean;walkClear:(x:number,z:number)=>boolean;heightAt:(x:number,z:number)=>number};
export function roadsideDeadline(id:string){return id==='c01-n06'?300:180;}
/** Stable across models, retries and browser sessions; independent of episode RNG. */
export function roadsideLayoutSeed(id:string){let seed=2166136261;for(const c of id.toLowerCase())seed=Math.imul(seed^c.charCodeAt(0),16777619)>>>0;return seed;}
/** Seeded geometric search; production always uses roadsideLayoutSeed(task ID). */
export function findRoadsideStart(points:readonly V2[],id:string,seed:number,env:Environment):RoadsideStart{
 const origin=points[0],next=points.slice(1).find(p=>Math.hypot(p[0]-origin[0],p[1]-origin[1])>1);
 if(!next)throw Error('Roadside start needs a route');
 const yaw=Math.atan2(next[0]-origin[0],next[1]-origin[1]),s=Math.sin(yaw),c=Math.cos(yaw);
 let foot:V2|undefined;
 for(const shift of [0,-4,4,-8,8]){
  const n=env.roadAt(origin[0]+s*shift,origin[1]+c*shift);if(!n)continue;
  for(const side of [1,-1]){
   const p:V2=[n.x+side*c*(n.road.width/2+1.2),n.z-side*s*(n.road.width/2+1.2)];
   if(env.walkClear(...p)&&Number.isFinite(env.heightAt(...p))){foot=p;break;}
  }
  if(foot)break;
 }
 if(!foot)throw Error('No walkable mission starting point');
 let randomState=seed>>>0;
 const random=()=>((randomState=(Math.imul(randomState,1664525)+1013904223)>>>0)/4294967296);
 const lengths=[0];for(let i=1;i<points.length;i++)lengths.push(lengths.at(-1)!+Math.hypot(points[i][0]-points[i-1][0],points[i][1]-points[i-1][1]));
 const at=(distance:number)=>{
  let i=1;while(i<points.length-1&&lengths[i]<distance)i++;
  const a=points[i-1],b=points[i],t=Math.min(1,(distance-lengths[i-1])/(lengths[i]-lengths[i-1]||1));
  return {x:a[0]+(b[0]-a[0])*t,z:a[1]+(b[1]-a[1])*t,yaw:Math.atan2(b[0]-a[0],b[1]-a[1])};
 };
 const vehicles:RouteParkedCar[]=[];
 for(const band of [70,140,270,470,720]){
  const target=Math.min(lengths.at(-1)!-60,band+random()*24),sideFirst=random()<.5?1:-1;
  let found=false;
  for(const delta of [0,5,-5,10,-10,20,30,40]){if(found)break;
   const distance=target+delta;if(distance<60||distance>lengths.at(-1)!-40)continue;
   const p=at(distance),n=env.roadAt(p.x,p.z);if(!n)continue;
   for(const side of [sideFirst,-sideFirst]){
    const sin=Math.sin(p.yaw),cos=Math.cos(p.yaw),offset=Math.max(0,n.road.width/2-1.45);
    const x=n.x+side*cos*offset,z=n.z-side*sin*offset,h=env.heightAt(x,z);
    if(Math.hypot(x-foot[0],z-foot[1])<ROUTE_CAR_MIN_DISTANCE||vehicles.some(v=>Math.hypot(v.x-x,v.z-z)<24)||!Number.isFinite(h))continue;
    let clear=true;
    for(const u of [-1.1,0,1.1])for(const v of [-2.5,0,2.5]){
     const a=x+cos*u+sin*v,b=z-sin*u+cos*v;
     if(env.blocked(a,b)||Math.abs(env.heightAt(a,b)-h)>.4)clear=false;
    }
    const door:V2=[x+side*cos*2.15,z-side*sin*2.15];
    if(!clear||!env.walkClear(...door)||Math.abs(env.heightAt(...door)-h)>.5)continue;
    vehicles.push({x,z,yaw:p.yaw,group:Math.floor(random()*3),distance});found=true;break;
   }
  }
 }
 if(vehicles.length<3||vehicles[0].distance>135)throw Error('Insufficient reachable vehicles along route');
 return {foot,footYaw:yaw,maxDuration:roadsideDeadline(id),vehicles,seed};
}
export function remainingTimeText(maxDuration:number,elapsed:number){
 const seconds=Math.max(0,Math.ceil(maxDuration-elapsed));
 return `${Math.floor(seconds/60).toString().padStart(2,'0')}:${(seconds%60).toString().padStart(2,'0')}`;
}
