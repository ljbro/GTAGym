import type {V2} from './city-types.ts';
import {nativeBends} from './native-annotation-route.ts';

/** Erase only excursions returning to the exact same road-graph vertex.
 * Do not join nearby carriageways or intersections: that could cut across a
 * median/building or connect roads at different heights. All retained edges
 * already existed in the original route, and both endpoints remain unchanged.
 */
export function removeClosedRoadLoops(source:readonly V2[]){
 const points:V2[]=[],indices=new Map<string,number>();
 const key=(p:V2)=>`${p[0]},${p[1]}`;
 for(const p of source){
  const previous=indices.get(key(p));
  if(previous===undefined){indices.set(key(p),points.length);points.push([...p]);continue;}
  for(let i=points.length-1;i>previous;i--)indices.delete(key(points[i]));
  points.length=previous+1;
 }
 const audit=nativeBends(points);
 return {points,length:audit.length,turns:audit.turns.map(t=>points[t.index]),turnDirections:audit.turns.map(t=>t.direction),removedMetres:nativeBends(source).length-audit.length};
}
