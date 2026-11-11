import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import {randomBytes} from 'node:crypto';
import {gzip} from 'node:zlib';
import {promisify} from 'node:util';
import {once} from 'node:events';
import {prepareRequest,guardItem,nativeResponseEvent,GAME_TOOL,guardCompactionEvent,validateCompactionSummary,isFeedbackEligibleTool,invalidToolFeedbackPolicy,INVALID_GAME_TOOL_MESSAGE} from './policy.mjs';
import {modelSettings,providerEndpoint,providerWire} from './providers.mjs';
import {reasoningEnvelope,chatRequest,chatCompletion,chatResponse,responseStream,sseEvents} from './chat-adapter.mjs';
import {kimiFiveHourLimit} from './kimi-quota.mjs';
import {isTrainingSessionEndpoint,sessionFetch} from './session-transport.mjs';
const compress=promisify(gzip),LIMIT=128*1024**2;
export async function startGateway({baseURL,key,model,output,maxTokens=32768,timeoutMs=3600000,api='auto',effort,reasoningSummary='auto',fetcher=fetch,onViolation=()=>{},onRequest=()=>{},onResponse=()=>{},onQuota=()=>{},onInvalidGameTool=null,invalidToolFeedbackLimit=3}){
 const inferenceAffinity=process.env.GTA_INFERENCE_AFFINITY_KEY;
 if(inferenceAffinity&&!/^[A-Za-z0-9_-]{1,96}$/.test(inferenceAffinity))throw Error('Invalid host inference affinity');
 const settings=modelSettings({model,api,effort,reasoningSummary}),endpoint=providerEndpoint(baseURL,settings.api),envelope=reasoningEnvelope();
 const allFunctionNames=settings.family==='deepseek',feedbackPolicy=invalidToolFeedbackPolicy(settings.family);
 if(!Number.isInteger(invalidToolFeedbackLimit)||invalidToolFeedbackLimit<0||invalidToolFeedbackLimit>3)throw Error('Invalid game tool feedback limit');
 const token=randomBytes(32).toString('hex'),calls=[],controllers=new Set();let index=0,closed=false,invalidToolStreak=0;
 await fs.mkdir(output,{mode:0o700});
 const server=http.createServer(async(req,res)=>{
  const id=++index,record={id,at:new Date().toISOString(),path:req.url},began=performance.now(),prefix=path.join(output,String(id).padStart(6,'0'));let controller;
  const save=async(suffix,value)=>fs.writeFile(prefix+suffix,await compress(value),{flag:'wx',mode:0o600});
  try{
   if(req.headers.authorization!=='Bearer '+token){res.writeHead(401);res.end();return;}
   if(req.method!=='POST'||req.url!=='/v1/responses'){res.writeHead(404);res.end();return;}
   let bytes=0;const chunks=[];for await(const chunk of req){bytes+=chunk.length;if(bytes>LIMIT)throw Error('Request too large');chunks.push(chunk);}
   const data=Buffer.concat(chunks),body=JSON.parse(data);await save('-native-request.json.gz',data);
   const prepared=prepareRequest(body,model,maxTokens),{mode,target,audit}=prepared;
   const wire=settings.api==='responses'?providerWire(prepared.wire,settings,{mode}):chatRequest(prepared.wire,settings,envelope);
   Object.assign(record,audit,{...(inferenceAffinity?{inferenceAffinity}:{}),api:settings.api,endpoint,effort:settings.effort,reasoningSummary:settings.reasoningSummary,toolChoice:wire.tool_choice??null});
   await save('-request.json.gz',JSON.stringify(wire));
   if(mode==='action')onRequest(); // Summary inference must not rebind the private action generation.
   controller=new AbortController();controllers.add(controller);res.once('close',()=>{if(!res.writableEnded)controller.abort();});
   // Keep the real native CLI identity; never impersonate a different client.
   const send=fetcher===fetch&&isTrainingSessionEndpoint(endpoint)?(url,options)=>sessionFetch(url,options,{onAttempt:attempt=>(record.transportAttempts??=[]).push(attempt)}):fetcher;
   const upstream=await send(endpoint,{method:'POST',headers:{authorization:'Bearer '+key,'content-type':'application/json',
    ...(req.headers['user-agent']?{'user-agent':req.headers['user-agent']}:{}),
    ...(inferenceAffinity?{'x-inspire-inference-key':inferenceAffinity}:{})},body:JSON.stringify(wire),redirect:'error',signal:AbortSignal.any([controller.signal,AbortSignal.timeout(timeoutMs)])});
   record.status=upstream.status;record.contentType=upstream.headers.get('content-type')??'application/json';
   const parts=[];bytes=0;
   // Buffer and validate a whole response before releasing any event to the
   // harness. A late forbidden call cannot slip through partial SSE chunks.
   for await(const chunk of upstream.body??[]){bytes+=chunk.length;if(bytes>LIMIT)throw Error('Response too large');parts.push(Buffer.from(chunk));}
   const response=Buffer.concat(parts),sse=record.contentType.includes('text/event-stream');
   await save(sse?'-response.sse.gz':'-response.json.gz',response);
   if(settings.family==='kimi'&&!upstream.ok){
    let body;try{body=JSON.parse(response);}catch{}
    const limit=kimiFiveHourLimit({status:upstream.status,body,headers:upstream.headers});
    if(limit){record.providerLimit=limit;onQuota(limit);}
   }
   const recordUsage=u=>{if(u)record.usage={input_tokens:u.input_tokens??u.prompt_tokens??0,output_tokens:u.output_tokens??u.completion_tokens??0,
    cache_read_input_tokens:u.input_tokens_details?.cached_tokens??u.prompt_tokens_details?.cached_tokens??u.prompt_cache_hit_tokens??0,cache_creation_input_tokens:0,
    reasoning_tokens:u.output_tokens_details?.reasoning_tokens??u.completion_tokens_details?.reasoning_tokens??0};};
   const invalidItems=new Map();
   const inspect=event=>{
    if(mode==='compaction'){guardCompactionEvent(event);return;}
    const guard=item=>{try{guardItem(item,{name:GAME_TOOL});}catch(error){
     if(onInvalidGameTool&&isFeedbackEligibleTool(item,{allFunctionNames})){
      invalidItems.set(item.call_id??item.id,item);return;
     }
     record.rejectedTool={type:item.type,...item.name?{name:item.name}:{},...item.namespace?{namespace:item.namespace}:{}};throw error;
    }};
    if(event.item)guard(event.item);
    for(const item of [...(event.output??[]),...(event.response?.output??[])])guard(item);
    if(event.type==='response.output_item.done'&&event.item?.type==='function_call')(record.toolCalls??=[]).push(event.item.name);
   };
   const feedback=async completed=>{
    if(!invalidItems.size){
     if(mode==='action'&&(completed?.output??[]).some(i=>i.type==='function_call'))invalidToolStreak=0;
     return completed;
    }
    const items=completed?.output??[],functions=items.filter(i=>i.type==='function_call');
    if(completed?.status!=='completed'||!functions.length||functions.some(i=>!i.call_id||typeof i.arguments!=='string')||
     new Set(functions.map(i=>i.call_id)).size!==functions.length||
     [...invalidItems.values()].some(i=>!functions.some(f=>i.call_id&&f.call_id===i.call_id||i.id&&f.id===i.id)))throw Error('Forbidden incomplete invalid game tool response');
    if(invalidToolStreak>=invalidToolFeedbackLimit){
     const rejected=[...invalidItems.values()][0];record.rejectedTool={type:rejected.type,name:rejected.name};
     throw Error('Forbidden tool invocation: invalid game tool feedback limit exhausted');
    }
    const attempt=++invalidToolStreak;
    // If any name is invalid, NONE of this response's actions execute, including
    // otherwise valid calls mixed into it. Route only host-issued error receipts.
    const replacements=new Map();
    for(const item of functions){
     const args=await onInvalidGameTool(INVALID_GAME_TOOL_MESSAGE);
     if(!args||!/^invalid_tool_[a-f0-9]{32}$/.test(args.request_id)||args.action?.__invalid_tool!==true)throw Error('Invalid host-only tool error receipt');
     // Do not forward the rejected namespace, arguments or any custom fields.
     replacements.set(item.call_id,{type:'function_call',id:item.id,call_id:item.call_id,status:'completed',name:GAME_TOOL,arguments:JSON.stringify(args)});
    }
    record.invalidToolFeedback={policy:feedbackPolicy.version,attempt,limit:invalidToolFeedbackLimit,
     message:INVALID_GAME_TOOL_MESSAGE,executed:false,invalidCalls:[...invalidItems.values()].map(i=>({callId:i.call_id,name:i.name,...i.namespace!==undefined?{namespace:i.namespace}:{}})),
     suppressedCalls:functions.map(i=>({callId:i.call_id,name:i.name,receipt:JSON.parse(replacements.get(i.call_id).arguments).request_id}))};
    return {...completed,output:items.map(i=>i.type==='function_call'?replacements.get(i.call_id):i)};
   };
   if(upstream.ok&&settings.api==='chat-completions'){
    const completed=chatCompletion(response,sse);await save('-completion.json.gz',JSON.stringify(completed));
    recordUsage(completed.usage); // Include billed responses even if their tools are rejected below.
    let converted=chatResponse(completed,envelope,model,{allowInvalidGameTools:mode==='action'&&!!onInvalidGameTool,allFunctionNames});inspect(converted);record.toolCalls=converted.output.filter(i=>i.type==='function_call').map(i=>i.name);
    if(mode==='compaction')validateCompactionSummary(converted);
    else converted=await feedback(converted);
    if(mode==='action')onResponse(converted.output??[]);
    const native=body.stream?responseStream(converted,target):JSON.stringify(nativeResponseEvent(converted,target));
    await save(body.stream?'-native-response.sse.gz':'-native-response.json.gz',native);
    res.writeHead(200,{'content-type':body.stream?'text/event-stream':'application/json','cache-control':'no-store'});res.end(native);return;
   }
   let events,completed;
   if(upstream.ok){
    if(sse){events=sseEvents(response);for(const e of events)recordUsage((e.response??e).usage);for(const event of events)if(!event.done)inspect(event);
     completed=events.findLast(e=>e.type==='response.completed')?.response;
     if(mode==='compaction'){
      const completed=events.findLast(e=>e.type==='response.completed')?.response;
      if(!completed)throw Error('Incomplete compaction response stream');
      validateCompactionSummary(completed);
     }
    }
    else {completed=JSON.parse(response);recordUsage(completed.usage);inspect(completed);if(mode==='compaction')validateCompactionSummary(completed);}
   }
   let forwarded=response,forwardType=record.contentType;
   if(upstream.ok&&mode==='action'&&invalidItems.size){
    const corrected=await feedback(completed);
    completed=corrected;
    forwarded=Buffer.from(body.stream?responseStream(corrected,target):JSON.stringify(nativeResponseEvent(corrected,target)));
    forwardType=body.stream?'text/event-stream':'application/json';
    await save(body.stream?'-native-response.sse.gz':'-native-response.json.gz',forwarded);
   }else if(upstream.ok&&!sse&&body.stream){
    forwarded=Buffer.from(responseStream(JSON.parse(response),target));forwardType='text/event-stream';
    await save('-native-response.sse.gz',forwarded);
   }else if(upstream.ok&&target?.namespace){
    forwarded=Buffer.from(sse?sseEvents(response).map(event=>event.done?'data: [DONE]\n\n':
     'event: '+event.type+'\ndata: '+JSON.stringify(nativeResponseEvent(event,target))+'\n\n').join(''):JSON.stringify(nativeResponseEvent(JSON.parse(response),target)));
    await save(sse?'-native-response.sse.gz':'-native-response.json.gz',forwarded);
   }
   if(upstream.ok&&mode==='action'&&!invalidItems.size)await feedback(completed);
   if(upstream.ok&&mode==='action')onResponse(completed?.output??events?.filter(event=>event.type==='response.output_item.done').sort((a,b)=>a.output_index-b.output_index).map(event=>event.item)??[]);
   res.writeHead(upstream.status,{'content-type':forwardType,'cache-control':'no-store'});res.end(forwarded);
  }catch(error){record.error=error.message;record.errorCode=error.code??error.cause?.code??null;if(error.cause)record.errorCause={name:error.cause.name,code:error.cause.code??null,message:String(error.cause.message??'').replaceAll(key,'[redacted]')};if(/Forbidden|Only game_step|Unexpected model/.test(error.message)){record.securityViolation=true;onViolation(error);}
   if(!res.headersSent){res.writeHead(502,{'content-type':'application/json'});res.end(JSON.stringify({error:{message:'Evaluator rejected or failed request; inspect private audit.',type:'evaluator_error'}}));}else res.destroy();
  }finally{controllers.delete(controller);record.wallMs=performance.now()-began;calls.push(record);await fs.appendFile(path.join(output,'audit.jsonl'),JSON.stringify(record)+'\n',{mode:0o600});}
 });
 server.requestTimeout=0;server.on('clientError',(_,s)=>s.destroy());server.listen(0,'127.0.0.1');await once(server,'listening');
 return {url:'http://127.0.0.1:'+server.address().port,token,calls,
  usage(){const out={input_tokens:0,output_tokens:0,cache_read_input_tokens:0,cache_creation_input_tokens:0,reasoning_tokens:0};for(const c of calls)for(const k of Object.keys(out))out[k]+=c.usage?.[k]??0;return out;},
  async close(){if(closed)return;closed=true;for(const c of controllers)c.abort();server.closeAllConnections();await new Promise(r=>server.close(r));}};
}
