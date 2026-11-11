/** Persist only what the provider actually returned. Never infer hidden text
 * from token counts or decrypt opaque reasoning items. This module does not
 * change model inputs, request settings, action parsing, or game execution. */
export const MODEL_RESPONSE_RECORDING={version:1,enabled:true,format:'complete-parsed-provider-json',
 location:'round.modelResponse',reasoning:'returned-fields-only',compression:'episode.tar.gz and checkpoint json.gz',
 history:'final assistant content only; reasoning is analysis-only'};

export function modelReply(body,{api}={}){
 const responses=api==='responses'||(api===undefined&&(body?.object==='response'||Array.isArray(body?.output)));
 if(responses){
  const fail=message=>{const error=Error(message);error.name='ModelResponseError';error.modelResponse=body;throw error;};
  if(body?.error||body?.status==='failed')fail('Responses API error: '+(body?.error?.message??body?.error?.code??'failed response'));
  if(!Array.isArray(body?.output))fail('Invalid Responses API envelope: expected output array');
  if(['queued','in_progress','cancelled'].includes(body.status))fail('Responses API did not finish: '+body.status);
  const messages=body.output.filter(item=>item.type==='message'&&item.role==='assistant');
  const final=messages.some(item=>item.phase==='final_answer')?messages.filter(item=>item.phase==='final_answer'):messages.filter(item=>!item.phase);
  const raw=final.flatMap(item=>(item.content??[]).filter(part=>part.type==='output_text').map(part=>part.text)).join('');
  const usage=body.usage?{...body.usage,prompt_tokens:body.usage.input_tokens,completion_tokens:body.usage.output_tokens,
   ...(body.usage.input_tokens_details?{prompt_tokens_details:body.usage.input_tokens_details}:{}),
   ...(body.usage.output_tokens_details?{completion_tokens_details:body.usage.output_tokens_details}:{})}:undefined;
  return {raw,usage,finishReason:body.status==='incomplete'?(body.incomplete_details?.reason==='max_output_tokens'?'length':body.incomplete_details?.reason??'incomplete'):'stop',modelResponse:body};
 }
 const choice=body?.choices?.[0],message=choice?.message;
 return {raw:typeof message?.content==='string'?message.content:'',usage:body?.usage,
  finishReason:choice?.finish_reason,modelResponse:body};
}

/** A small index into the original body, not a second copy of long reasoning.
 * Reasoning summaries and encrypted/opaque fields remain distinguishable. */
export function reasoningMetadata(body){
 if(body===undefined)return {status:'not_recorded',textAvailable:false,sources:[]};
 const sources=[];
 const add=(path,kind,value)=>sources.push({path,kind,...(typeof value==='string'?{characters:value.length}:{})});
 function inspect(value,path,kind='text'){
  if(value==null||value===''){add(path,'empty',value);return;}
  if(typeof value==='string'){add(path,value.trim()?kind:'empty',value);return;}
  if(Array.isArray(value)){if(!value.length)add(path,'empty');value.forEach((v,i)=>inspect(v,`${path}[${i}]`,kind));return;}
  if(typeof value!=='object'){add(path,'structured');return;}
  const type=String(value.type??'');
  if(/encrypt|opaque/i.test(type)){
   add(path,'opaque');return;
  }
  let recognized=false;
  for(const [key,child] of Object.entries(value)){
   if(/^(?:encrypted_content|encrypted|signature|redacted_thinking)$/i.test(key)){
    if(child){add(`${path}.${key}`,'opaque');recognized=true;}
   }else if(['text','content','thinking','reasoning_content','reasoning','summary','reasoning_summary','summary_text'].includes(key)){
    inspect(child,`${path}.${key}`,/summary/i.test(key)||/summary/i.test(type)?'summary':kind);recognized=true;
   }
  }
  if(!recognized)add(path,'structured');
 }
 const message=body?.choices?.[0]?.message;
 for(const key of ['reasoning_content','reasoning','reasoning_details','reasoning_summary','thinking','thinking_blocks','analysis']){
  if(message&&Object.hasOwn(message,key))inspect(message[key],`choices[0].message.${key}`,/summary/i.test(key)?'summary':'text');
 }
 if(Array.isArray(message?.content))message.content.forEach((part,i)=>{
  if(part&&/reasoning|thinking|summary/i.test(part.type??''))inspect(part,`choices[0].message.content[${i}]`,/summary/i.test(part.type)?'summary':'text');
 });
 // Responses API summaries and opaque items stay in the original body;
 // the index only identifies them and never injects them into action history.
 if(Array.isArray(body?.output))body.output.forEach((item,i)=>{
  if(item?.type==='reasoning')inspect(item,`output[${i}]`);
 });
 const has=kind=>sources.some(s=>s.kind===kind);
 return {status:has('text')?'text_returned':has('summary')?'summary_only':has('opaque')?'opaque_only':has('structured')?'structured':sources.length?'empty':'not_returned',
  textAvailable:has('text')||has('summary'),sources};
}

function redactValue(value,redact){
 if(typeof value==='string')return redact(value);
 if(Array.isArray(value))return value.map(v=>redactValue(v,redact));
 if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).map(([k,v])=>[k,redactValue(v,redact)]));
 return value;
}

/** Store the accepted (or last failed) body once. Attempt refs address this
 * round's modelResponse; distinct failed/empty responses retain their bodies.
 * Checkpoints and exports carry the complete record without external files. */
export function saveModelResponse(record,response,redact=s=>s){
 const body=[response.modelResponse,response.emptyResponseAttempts?.findLast(a=>a.modelResponse!==undefined)?.modelResponse,
  response.attempts?.findLast(a=>a.modelResponse!==undefined)?.modelResponse,record.modelResponse].find(value=>value!==undefined);
 if(body!==undefined)record.modelResponse=redactValue(body,redact);
 record.reasoning=reasoningMetadata(record.modelResponse);
 const serialized=body===undefined?null:JSON.stringify(record.modelResponse);
 for(const key of ['attempts','emptyResponseAttempts']){
  if(!response[key])continue;
  record[key]=response[key].map(attempt=>{
   const saved=redactValue(attempt,redact);
   if(saved.modelResponse!==undefined&&JSON.stringify(saved.modelResponse)===serialized){
    delete saved.modelResponse;saved.modelResponseRef='modelResponse';
   }
   return saved;
  });
 }
 return record;
}
