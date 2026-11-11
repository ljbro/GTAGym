import type {V2} from './city-types.ts';
import type {RoadGraph} from './navigation.ts';
import {nativeBends} from './native-annotation-route.ts';

// Native north-ring road: eastbound approach, existing median connector,
// westbound carriageway, then leave via the first usable neighbourhood street.
// Never connect the two carriageways with an invented straight shortcut.
export const M03_N02_UTURN_NODES=[39545,8250,39546,39547,39548,39549,39550,39551,39552,39553,2779,21349,25825,36161,2800,2814,2815,2798,42143,42144,42145,42167,8259,8260,8261,8262,8263,31724] as const;
// Do not append the old calibrated matcher tail: it revisits the spawn and
// 737 metres of already-used edges, then loops past the goal a second time.
// Continue away from the turnaround, rather than ending next to its entrance.
// The goal is 62% along the last native edge, clear of both neighbouring roads.
export const M03_N02_ROUTE_NODES=[...M03_N02_UTURN_NODES,31725,31726,31727,31711,31672,36047,31734,1237,31745,34480,31762,31763,29613,35470,35471,35472,2790,35473,2786,35168,17098,17099,17108,17107,17106,17113] as const;
export const M03_N02_GOAL_EDGE_FRACTION=.62;

export function m03n02TurnaroundRoute(graph:RoadGraph,source:readonly V2[]){
 const nodes=M03_N02_ROUTE_NODES.map(id=>graph.nodes[id]);
 if(nodes.some(p=>!p))throw Error('c01-n06 native turnaround road nodes are unavailable');
 for(let i=1;i<M03_N02_ROUTE_NODES.length;i++)if(!graph.edges[M03_N02_ROUTE_NODES[i-1]].has(M03_N02_ROUTE_NODES[i]))throw Error('c01-n06 native turnaround road is disconnected');
 const originalGoal=graph.nodes[2791];
 if(!source.length||source[0][0]!==nodes[0][0]||source[0][1]!==nodes[0][1]||source.at(-1)![0]!==originalGoal[0]||source.at(-1)![1]!==originalGoal[1])throw Error('c01-n06 source endpoints changed; re-audit the turnaround connection');
 const points=nodes.map(p=>[...p] as V2),a=points.at(-2)!,b=points.at(-1)!;
 points[points.length-1]=[a[0]+(b[0]-a[0])*M03_N02_GOAL_EDGE_FRACTION,a[1]+(b[1]-a[1])*M03_N02_GOAL_EDGE_FRACTION];
 const audit=nativeBends(points);
 return {points,length:audit.length,turns:audit.turns.map(t=>points[t.index]),turnDirections:audit.turns.map(t=>t.direction)};
}
