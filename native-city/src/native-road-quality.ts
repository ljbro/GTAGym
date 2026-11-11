import routes from './native-road-quality-overrides.json' with {type:'json'};
import type {RoadGraph} from './navigation.ts';
import type {V2} from './city-types.ts';
import {nativeBends} from './native-annotation-route.ts';

/** Reviewed offline paths: never search for a different route on task start. */
export function reviewedNativeRoadRoute(graph:RoadGraph,id:string,expectedCount:number){
 const route=routes.find(r=>r.id===id);if(!route)return null;
 let points:V2[];
 if(route.nodeIds){
  const ids=route.nodeIds;
  for(let i=0;i<ids.length;i++){
   if(!graph.nodes[ids[i]]||i>0&&!graph.edges[ids[i-1]].has(ids[i]))throw Error(id+' reviewed native road is disconnected');
  }
  points=ids.map(n=>[...graph.nodes[n]] as V2);
 }else points=route.points!.map(p=>[p[0],p[1]]);
 const audit=nativeBends(points);
 if(expectedCount!==route.expectedTurnCount||audit.turns.length!==expectedCount)throw Error(id+' reviewed turn count changed');
 return {points,length:audit.length,turns:audit.turns.map(t=>points[t.index]),turnDirections:audit.turns.map(t=>t.direction)};
}
