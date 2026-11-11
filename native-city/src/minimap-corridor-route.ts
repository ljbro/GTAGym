import type {V2} from './city-types.ts';

/** GPS on a task-built bridge/channel absent from the city road graph.
 * The polyline describes physical infrastructure, not an NPC itinerary.
 * Slice it at both CURRENT actor positions; reversing and overtaking work too.
 */
export function corridorTargetRoute(points:readonly (readonly number[])[],player:V2,target:V2,clear:(a:V2,b:V2)=>boolean):V2[]{
 if(points.length<2)return [];
 const cumulative=[0];
 for(let i=1;i<points.length;i++)cumulative.push(cumulative[i-1]+Math.hypot(points[i][0]-points[i-1][0],points[i][1]-points[i-1][1]));
 const project=(p:V2)=>{
  let best={distance:Infinity,along:0,index:0,point:[0,0] as V2};
  for(let i=1;i<points.length;i++){
   const a=points[i-1],b=points[i],length=cumulative[i]-cumulative[i-1];if(length<1e-8)continue;
   const t=Math.max(0,Math.min(1,((p[0]-a[0])*(b[0]-a[0])+(p[1]-a[1])*(b[1]-a[1]))/(length*length)));
   const point:V2=[a[0]+t*(b[0]-a[0]),a[1]+t*(b[1]-a[1])],distance=Math.hypot(p[0]-point[0],p[1]-point[1]);
   if(distance<best.distance)best={distance,along:cumulative[i-1]+t*length,index:i,point};
  }
  return best;
 };
 const a=project(player),b=project(target);
 if(!Number.isFinite(a.distance)||!Number.isFinite(b.distance))return [];
 // A direct connection is safe only on the same straight corridor section.
 if(a.index===b.index&&clear(player,target))return [[...player],[...target]];
 if(!clear(player,a.point)||!clear(b.point,target))return [];
 const lo=Math.min(a.along,b.along),hi=Math.max(a.along,b.along);
 const middle=points.filter((_,i)=>cumulative[i]>lo+1e-6&&cumulative[i]<hi-1e-6);
 if(a.along>b.along)middle.reverse();
 const result:V2[]=[];
 for(const p of [player,a.point,...middle,b.point,target]){
  if(!result.length||Math.hypot(p[0]-result.at(-1)![0],p[1]-result.at(-1)![1])>1e-6)result.push([p[0],p[1]]);
 }
 if(result.length>1)result[result.length-1]=[...target];
 return result;
}

/** Reject connectors crossing water, railings or unsupported space. */
export function corridorSegmentClear(a:V2,b:V2,inside:(x:number,z:number)=>boolean){
 const steps=Math.max(1,Math.ceil(Math.hypot(b[0]-a[0],b[1]-a[1])/.5));
 for(let i=0;i<=steps;i++)if(!inside(a[0]+(b[0]-a[0])*i/steps,a[1]+(b[1]-a[1])*i/steps))return false;
 return true;
}
