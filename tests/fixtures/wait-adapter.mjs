/** Deterministic wait-only fixture for checkpoint and executor unit tests. */
export const smokeAction=round=>({action:'wait',duration_seconds:round%2?.1:.25});
export const description="[ACTION_SPACE_PLACEHOLDER] Final action space to be filled in. Integration testing only supports waiting: Output JSON {\"action\":\"wait\",\"duration_seconds\":0.5}; Duration greater than 0 And no more than 30 seconds. Do Not Output Explanations.";
export function parse(raw){
 const value=JSON.parse(raw);
 if(!value||Array.isArray(value)||Object.keys(value).some(k=>!['action','duration_seconds'].includes(k))||value.action!=='wait')throw Error('Placeholder adapter only supports wait');
 if(!Number.isFinite(value.duration_seconds)||value.duration_seconds<=0||value.duration_seconds>30)throw Error('duration_seconds must be in (0,30]');
 return {...value,frames:Math.ceil(value.duration_seconds*60)};
}
export async function execute(env,action,onFrame,{signal}={}){
 // Reuse bounded GUI step calls; execute the ENTIRE model-selected duration, not a fixed round length.
 let remaining=action.frames,advanced=0,state;
 while(remaining>0){
  signal?.throwIfAborted();
  const result=await env.step({keys:[],frames:Math.min(120,remaining)},{onFrame});
  advanced+=result.advanced;remaining-=result.advanced;state=result.state;
  if(!state.active||state.complete||state.failed||!result.advanced)break;
 }
 return {advanced,state,requestedSeconds:action.duration_seconds,executedSeconds:advanced/60};
}
