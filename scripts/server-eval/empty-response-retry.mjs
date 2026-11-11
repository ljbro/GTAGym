import {setTimeout as sleep} from 'node:timers/promises';

/** Missing final text in a valid message is distinct from malformed JSON,
 * unsupported non-text content, a tool call, or an HTTP/transport error. */
export function emptyModelResponse(body){
 const message=body?.choices?.[0]?.message;
 if(!message||typeof message!=='object'||Array.isArray(message))return false;
 if(message.tool_calls?.length||message.function_call)return false;
 return message.content==null||(typeof message.content==='string'&&!message.content.trim());
}

export function emptyResponseState(){return {retries:0,responses:0,attempts:[]};}

/** Two extra empty-response requests per game round, shared across format
 * corrections. request() closes over the same input; this adds no messages,
 * observations, game ticks or input releases. Network retries remain separate. */
export async function retryEmptyResponse(request,{state=emptyResponseState(),signal,maxAttempts=3,delayMs=2000,
 capture=async()=>undefined,onRetry=()=>{},onExhausting=()=>{},onExhausted=()=>{},wait=sleep}={}){
 if(!Number.isInteger(maxAttempts)||maxAttempts<1||maxAttempts>5)throw Error('Invalid empty-response attempt limit');
 for(;;){
  signal?.throwIfAborted();
  let response;
  try{response=await request();}catch(error){if(state.attempts.length)error.emptyResponseAttempts=[...state.attempts];throw error;}
  state.responses++;
  const empty=response.emptyReply===true,exhausted=empty&&state.retries>=maxAttempts-1;
  if(!empty&&!state.attempts.length)return response;
  if(exhausted)onExhausting({response,state,maxAttempts});
  const record={responseNumber:state.responses,kind:empty?'empty':'nonempty',receivedAt:new Date().toISOString(),
   raw:response.raw,usage:response.usage,finishReason:response.finishReason,
   ...(response.modelResponse!==undefined?{modelResponse:response.modelResponse}:{}),
   ...(response.transportAttempts?.length?{transportAttempts:response.transportAttempts}:{})};
  let captureFailure;
  try{record.capture=await capture({response,record,exhausted});}
  catch(error){
   record.captureError=error.message;captureFailure=error;
   // A full retry-budget failure must still stop the group if evidence storage
   // itself fails. onExhausted can retry capture via the existing guard.
   if(!exhausted){state.attempts.push(record);error.emptyResponseAttempts=[...state.attempts];throw error;}
  }
  state.attempts.push(record);
  if(!empty)return {...response,emptyResponseAttempts:[...state.attempts]};
  if(exhausted){
   try{await onExhausted({response,record,state,maxAttempts});}
   catch(error){error.emptyResponseAttempts=[...state.attempts];throw error;}
   const error=Error(`Empty model response after ${maxAttempts} attempts`,captureFailure?{cause:captureFailure}:undefined);
   error.name='EmptyResponseLimitError';error.emptyResponseAttempts=[...state.attempts];throw error;
  }
  const delay=delayMs*2**state.retries;state.retries++;
  onRetry({retry:state.retries,maxRetries:maxAttempts-1,delayMs:delay,record});
  try{await wait(delay,undefined,{signal});}
  catch(error){error.emptyResponseAttempts=[...state.attempts];throw error;}
 }
}
