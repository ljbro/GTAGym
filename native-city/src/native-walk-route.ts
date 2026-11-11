import type {V2} from './city-types.ts';
import {nativeBends} from './native-annotation-route.ts';

/** Reviewed street walks, not the first 100 m of a motor-vehicle U-turn.
 * c02-n01 keeps its car destination; c02-n04 moves the fallen motorcycle about
 * 22 m to an adjacent street. Both keep two separated bends and a 100 m walk.
 * Raw annotation/SVG data remains unchanged.
 */
const REVIEWED_WALKS:Record<string,V2[]>={
 'c02-n01':[[-.708672999699627,-285.6356798503466],[5.6,-287.3],[6.5,-289.6],[13.2,-301.3],[14,-302.8],[15.4,-304.5],[23.3,-306.5],[27.9,-307.7],[38.5,-310.5],[86.65704652548752,-323.0046047469551]],
 'c02-n04':[[4795.766841109394,58.27779482069595],[4788,59.4],[4787.7,130.9],[4808.2,133.4]],
};
export function reviewedNativeWalkRoute(id:string){
 const source=REVIEWED_WALKS[id];if(!source)return null;
 const points=source.map(p=>[...p] as V2),audit=nativeBends(points);
 return {points,length:audit.length,turns:audit.turns.map(t=>points[t.index]),turnDirections:audit.turns.map(t=>t.direction),shortWalk:true as const};
}

export const NATIVE_WALK_DISTANCE=100;

/** A short, unchanged section of native roads, not a scaled copy of a city. */
export function shortNativeWalkRoute(source:readonly V2[]){
 const cumulative=[0];
 for(let i=1;i<source.length;i++)cumulative.push(cumulative[i-1]+Math.hypot(source[i][0]-source[i-1][0],source[i][1]-source[i-1][1]));
 const bend=(a:V2,b:V2,c:V2)=>{
  const delta=Math.atan2(c[0]-b[0],c[1]-b[1])-Math.atan2(b[0]-a[0],b[1]-a[1]);
  return Math.atan2(Math.sin(delta),Math.cos(delta));
 };
 const firstTurn=source.findIndex((p,i)=>i>0&&i<source.length-1&&Math.abs(bend(source[i-1],p,source[i+1]))>=Math.PI/9);
 const total=cumulative.at(-1)??0;
 // Retain the first corner when it lies beyond a long initial straight.
 const from=Math.min(Math.max(0,total-NATIVE_WALK_DISTANCE),firstTurn>0?Math.max(0,cumulative[firstTurn]-35):0);
 const to=Math.min(total,from+NATIVE_WALK_DISTANCE),points:V2[]=[];
 const add=(p:V2)=>{if(!points.length||Math.hypot(p[0]-points.at(-1)![0],p[1]-points.at(-1)![1])>1e-7)points.push([...p]);};
 for(let i=1;i<source.length;i++){
  const low=cumulative[i-1],high=cumulative[i];if(high<=from||low>=to||high===low)continue;
  const a=source[i-1],b=source[i];
  for(const d of [Math.max(from,low),Math.min(to,high)]){const t=(d-low)/(high-low);add([a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t]);}
 }
 const turns:V2[]=[],turnDirections:('left'|'right')[]=[];
 for(let i=1;i<points.length-1;i++){const delta=bend(points[i-1],points[i],points[i+1]);if(Math.abs(delta)<Math.PI/9)continue;turns.push(points[i]);turnDirections.push(delta>0?'right':'left');}
 return {points,turns,turnDirections,length:to-from,shortWalk:true as const};
}
