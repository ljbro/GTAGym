/** Correct format violations without executing partial actions or advancing the
 * game. Retry text adds no images and never changes retained episode history.
 * All attempts are returned for the durable, unpruned trajectory archive. */
export async function validatedPolicyReply({messages,request,parse,maxAttempts=3,signal,onRetry=()=>{},language='zh'}){
 if(!Number.isInteger(maxAttempts)||maxAttempts<1||maxAttempts>5)throw Error('Invalid format attempt limit');
 const attempts=[];let current=messages;
 for(let attempt=1;attempt<=maxAttempts;attempt++){
  signal?.throwIfAborted();let response;
  try{response=await request(current);}catch(error){error.attempts=attempts;throw error;}
  const record={attempt,raw:response.raw,usage:response.usage,finishReason:response.finishReason,
   ...(response.modelResponse!==undefined?{modelResponse:response.modelResponse}:{})};attempts.push(record);
  if(response.transportAttempts?.length)record.transportAttempts=response.transportAttempts;
  try{parse(response.raw);return {...response,attempts};}
  catch(error){
   record.validationError=error.message;
   if(attempt===maxAttempts){const failure=Error(`Invalid action after ${maxAttempts} format attempts: ${error.message}`);failure.attempts=attempts;throw failure;}
   onRetry({attempt,error:error.message});
   const correction=language==='en'?'Action format validation failed: '+error.message+'. The game is still paused and that action was not executed. Use the same screenshot and reply again with only one JSON object matching the system prompt, starting with { and ending with }. Do not include explanations, analysis, Markdown, code fences, or extra fields.':"Action format validation failed:"+error.message+". Game is still paused, The previous action was not executed, Please generate the output again using the same screenshot. Output only one that meets system prompt Of the agreement JSON Object, using { Start, using } End; No Explanations, Analysis, Markdown Or code fences. Do not add extra fields.";
   current=[...messages,{role:'assistant',content:response.raw},{role:'user',content:correction}];
  }
 }
}
