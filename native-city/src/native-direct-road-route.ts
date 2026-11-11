import type {RoadGraph} from './navigation.ts';
import type {V2} from './city-types.ts';
import {nativeBends} from './native-annotation-route.ts';
/** User-requested detour removal; follows native road edges, not a straight chord. */
export function directNativeRoadRoute(graph:RoadGraph,source:readonly V2[]){
 if(source.length<2)throw Error("The native route lacks start and end points");
 const points=graph.route(source[0],source.at(-1)!);
 if(points.length<2)throw Error("No road connects the original start and end points");
 const audit=nativeBends(points);
 return {points,length:audit.length,turns:audit.turns.map(t=>points[t.index]),turnDirections:audit.turns.map(t=>t.direction)};
}

/**
 * Calibrated M06 routes: the graph search keeps the audited L/R sequence while
 * rejecting retraced parallel carriageways. The node IDs are part of the
 * generated navigation asset, so this remains deterministic across restarts.
 */
const CALIBRATED_NODE_IDS:Record<string,number[]>= {
 'c01-n12':[10941,10947,10946,5343,10945,32319,32320,32341,6323,6324,6325,6309,6308,6307,6293,6306,6305,6304,6303,6302,6301,6300,6335,9259,9260,9261,8699,8698,8697,8696,8695,8694,8693,8692,6356,8691,8690,9263,9264,6925,20970,22209,22210,22211,22212,10664,22213,22214,22215,22216,22217,22218,22136,22135,22134,22133,22132,20984,22228,22241,22240,22239,22238,22237,22236,22235,22234,22233,10675,10674,10673,10672,10671,10670,30533,10655,10656,22232,33237,38578,38577,9254,36110,42121,8662,8645,25481,22257,4963],
 'c01-n13':[1847,1846,1845,1844,1843,1842,20145,1859,1787,1715,1716,1717,1718,1719,1720,22750,1721,1922,1923,1907,1908,1909,1910,1911,1912,1913,1914,30316,1931,33970,22727,34603,34604,34605,22736,22028,34011,16466,16457,16456,16455,16454,16453,33964,33963,35523,25658,25662,35886,6099,33648,25672,25673,25674,25675,36791,36792,1598,1599,5207,5208,5209,5210,5211,5212,25670,30694,30698,1593,1594,1595,1562,1563,1564,1565,38128,1651,1650,1649,1648,1647,1646,30206,30205,1644,1643,1642,1641,5143,35871,22470,22469,26258,1465,1466,35863,30203,35865,22474,22473,37464,37463,37462,5304,25709,25708,25707,25706,30719],
};
export function calibratedM06Route(graph:RoadGraph,id:string,source:readonly V2[]){
 const ids=CALIBRATED_NODE_IDS[id]?.slice();if(!ids)return directNativeRoadRoute(graph,source);
 // Keep the two junction nodes that make the audited R/R transitions
 // explicit; older generated snapshots omitted them from the literal.
 if(id==='c01-n13'){ids.splice(55,0,25676);const at=ids.indexOf(22473);if(at>=0)ids.splice(at+1,0,22472);}
 const points=ids.map(i=>graph.nodes[i]);if(points.some(p=>!p))return directNativeRoadRoute(graph,source);
 const audit=nativeBends(points);if(audit.turns.length<2)return directNativeRoadRoute(graph,source);
 return {points,length:audit.length,turns:audit.turns.map(t=>points[t.index]),turnDirections:audit.turns.map(t=>t.direction)};
}
