/** Explicit per-page experimental policy; default game behavior is unchanged. */
export function evaluationTimePolicy(search:string){
 return new URLSearchParams(search).get('evaluationTimePolicy')==='round-budget'?'round-budget':'task-defined';
}
export const EVAL_TIMED_ARRIVALS=new Set(['c01-n04','c01-n05','c01-n06','c01-n17','c01-n18','c06-n09','c06-n05']);
export function taskTimeLimitEnabled(category:string,policy:string,taskId=''){
 return policy!=='round-budget'||['chase','follow','escape'].includes(category)||EVAL_TIMED_ARRIVALS.has(taskId);
}
/** Keep calibrated controllers unchanged; opt out only during this synchronous
 * step. The original published duration remains the round-budget reference. */
export function stepWithTimePolicy<T>(mission:{readonly maxDuration:number},enabled:boolean,step:()=>T):T{
 if(enabled)return step();
 const original=mission.maxDuration,mutable=mission as {maxDuration:number};
 try{mutable.maxDuration=Infinity;return step();}finally{mutable.maxDuration=original;}
}
