// Shared model boundary. Versions and evaluator metadata stay on the host.
export const OBSERVATION_CONTRACT='image-only-host-observation-v1';
export const INITIAL_USER_PROMPT='play the game use game_step';
export const GAME_MCP_INSTRUCTIONS='Use game_step to play the game';
export const GAME_STEP_DESCRIPTION=[
 'Execute exactly one game action and return the next screenshot.',
 'Key holds start together, last independently for at most 1 game second, and may continue across calls.',
 'Mouse move is instantaneous relative pixels (dx positive right, dy positive up); mouse button holds persist until up.',
 'Move and scroll cannot coexist.',
 'wait_seconds requires keys:[].',
 'Use a new request_id for a new action; reuse the same request_id and identical action on retry to avoid executing twice.',
 'Only the first action from a model response can execute and return a screenshot.',
 'Extra, stale, or invalid calls return an error without an image. Completed retries return confirmation without another image or action.',
].join('\n');
export function gameStepDescription(maxSeconds=1){
 if(!Number.isFinite(maxSeconds)||maxSeconds<1/60||maxSeconds>5||Math.abs(maxSeconds*60-Math.round(maxSeconds*60))>1e-8)throw Error('Invalid action duration cap');
 return GAME_STEP_DESCRIPTION.replace('at most 1 game second',`at most ${maxSeconds} game second${maxSeconds===1?'':'s'}`);
}

export function publicObservation(snapshot){
 if(typeof snapshot?.image!=='string'||!snapshot.image||!['image/png','image/jpeg'].includes(snapshot.mimeType))throw Error('Missing observation image');
 return {image:snapshot.image,mimeType:snapshot.mimeType};
}

export function publicGameStepSchema(schema){
 const {request_id,action}=schema?.properties??{};
 if(!request_id||!action)throw Error('Missing game action schema');
 return {type:'object',properties:{request_id,action},required:['request_id','action'],additionalProperties:false};
}

// Normalize older render-server rules as well as freshly generated manuals.
export function modelGameRules(text){
 return text.replace('together with a unique `request_id` and the latest `observation_id`; reuse the same arguments when retrying an uncertain call.',
  'together with a unique `request_id`; reuse the same `request_id` and identical action when retrying an uncertain call.')
  .replace("Also provides the only `request_id` And the most recently observed `observation_id`; Reuse all original parameters when retrying a call with an uncertain outcome.",
   "Also provides the only `request_id`; When retrying a call with an uncertain outcome, reuse the same `request_id` And exactly the same action.");
}

export function modelMcpMessage(message){
 if(!message?.result)return message;
 const result=message.result;
 if(Array.isArray(result.contents))return {...message,result:{contents:result.contents.map(part=>{
  if(part.uri!=='game://rules'||typeof part.text!=='string')throw Error('Unexpected game resource');
  return {uri:part.uri,mimeType:'text/markdown',text:modelGameRules(part.text)};
 })}};
 if(typeof result.protocolVersion==='string'&&result.serverInfo)return {...message,result:{...result,instructions:GAME_MCP_INSTRUCTIONS}};
 if(Array.isArray(result.tools))return {...message,result:{...result,tools:result.tools.map(tool=>{
  if(tool.name!=='game_step')return tool;
  const maxSeconds=tool.inputSchema?.properties?.action?.properties?.keys?.items?.properties?.duration_seconds?.maximum??1;
  return {name:tool.name,title:tool.title,description:gameStepDescription(maxSeconds),
   inputSchema:publicGameStepSchema(tool.inputSchema),annotations:tool.annotations};
 })}};
 if(result.isError){
  // Older render workers may attach cached pixels and private metadata to a
  // stale-action error. Preserve only its safe repair message, never the image.
  let text=JSON.stringify({code:'ACTION_REJECTED',message:'The action was not completed. No new screenshot is available.'});
  const part=result.content?.find(part=>part.type==='text'&&typeof part.text==='string');
  if(part){
   try{
    const value=JSON.parse(part.text);
    if(typeof value?.code==='string'&&typeof value?.message==='string'){
     text=JSON.stringify({code:value.code,message:value.message});
    }
   }catch{
    if(result.structuredContent===undefined&&!result.content.some(part=>part.type==='image'))text=part.text;
   }
  }
  return {jsonrpc:message.jsonrpc,id:message.id,result:{isError:true,content:[{type:'text',text}]}};
 }
 const images=(result.content??[]).filter(part=>part.type==='image').map(part=>{
  const snapshot=publicObservation({image:part.data,mimeType:part.mimeType});
  return {type:'image',data:snapshot.image,mimeType:snapshot.mimeType};
 });
 if(images.length)return {jsonrpc:message.jsonrpc,id:message.id,result:{content:images,...(result.isError?{isError:true}:{})}};
 if(result.structuredContent!==undefined)throw Error('Game observation is missing its image');
 // Protocol/action-validation errors have no observation; preserve their safe
 // repair instructions. Terminal evaluator errors are consumed by the host.
 return message;
}
