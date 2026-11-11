// Wire-only bridge. Codex still owns the loop, context, pruning and compaction.
// Provider reasoning is opaque in Codex history and replayed ONLY if that item
// survives Codex's own context management. No side channel restores old turns.
import {createCipheriv,createDecipheriv,randomBytes} from 'node:crypto';
import {GAME_TOOL,guardItem,isFeedbackEligibleTool} from './policy.mjs';

export function reasoningEnvelope(){
 const key=randomBytes(32),prefix='gta_codex_reasoning_v1.';
 return {
  seal(value){const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',key,iv),data=Buffer.concat([cipher.update(JSON.stringify(value)),cipher.final()]);
   return prefix+Buffer.concat([iv,cipher.getAuthTag(),data]).toString('base64url');},
  open(value){
   if(typeof value!=='string'||!value.startsWith(prefix))throw Error('Unsupported opaque reasoning in Chat adapter');
   try{const b=Buffer.from(value.slice(prefix.length),'base64url'),decipher=createDecipheriv('aes-256-gcm',key,b.subarray(0,12));decipher.setAuthTag(b.subarray(12,28));
    return JSON.parse(Buffer.concat([decipher.update(b.subarray(28)),decipher.final()]).toString());
   }catch{throw Error('Invalid provider reasoning envelope');}
  },
 };
}

function parts(content){
 if(typeof content==='string')return [{type:'text',text:content}];
 if(!Array.isArray(content))throw Error('Unsupported Responses content in Chat adapter');
 return content.map(p=>{
  if(['input_text','output_text'].includes(p.type)&&typeof p.text==='string')return {type:'text',text:p.text};
  if(p.type==='input_image'&&typeof p.image_url==='string')return {type:'image_url',image_url:{url:p.image_url,...p.detail?{detail:p.detail}:{}}};
  throw Error('Unsupported Responses content part in Chat adapter');
 });
}
export function chatRequest(wire,settings,envelope){
 if(wire.previous_response_id)throw Error('Chat adapter requires Codex full input history');
 const messages=[];let assistant,reasoning='',observations=[];
 const flushImages=()=>{if(observations.length){messages.push({role:'user',content:observations});observations=[];}};
 const flushAssistant=()=>{if(assistant){if(reasoning){assistant.reasoning_content=reasoning;reasoning='';}messages.push(assistant);assistant=undefined;}};
 if(wire.instructions)messages.push({role:'system',content:wire.instructions});
 for(const item of wire.input??[]){
  guardItem(item,{name:GAME_TOOL});
  if(item.type==='reasoning'){
   if(item.encrypted_content){const value=envelope.open(item.encrypted_content);if(typeof value.reasoning!=='string')throw Error('Invalid reasoning payload');reasoning+=value.reasoning;}
   else if(item.content?.length)reasoning+=item.content.map(p=>{if(p.type!=='reasoning_text'||typeof p.text!=='string')throw Error('Unsupported reasoning part');return p.text;}).join('');
   else if(item.summary?.length)throw Error('Cannot silently replace reasoning with a summary');
  }else if(item.type==='function_call'){
   flushImages();assistant??={role:'assistant',content:null};assistant.tool_calls??=[];
   assistant.tool_calls.push({id:item.call_id,type:'function',function:{name:item.name,arguments:item.arguments}});
  }else if(item.type==='function_call_output'){
   flushAssistant();const content=parts(item.output);
   messages.push({role:'tool',tool_call_id:item.call_id,content:content.filter(p=>p.type==='text').map(p=>p.text).join('\n')});
   observations.push(...content.filter(p=>p.type==='image_url'));
  }else if(item.type==='message'||item.role){
   if(!['user','assistant','system','developer'].includes(item.role))throw Error('Unsupported Responses role');
   if(item.role==='assistant'){
    flushImages();assistant??={role:'assistant',content:null};
    const content=parts(item.content);if(content.some(p=>p.type!=='text'))throw Error('Assistant image is unsupported');
    assistant.content=(assistant.content??'')+content.map(p=>p.text).join('');
   }else{
    flushAssistant();flushImages();if(reasoning)throw Error('Orphaned reasoning item');
    messages.push({role:item.role==='developer'?'system':item.role,content:parts(item.content)});
   }
  }else throw Error('Unsupported Responses input item in Chat adapter: '+item.type);
 }
 flushAssistant();flushImages();if(reasoning)throw Error('Orphaned reasoning item');
 const tools=wire.tools.map(t=>({type:'function',function:{name:t.name,description:t.description,parameters:t.parameters}}));
 const choice=typeof wire.tool_choice==='object'?{type:'function',function:{name:wire.tool_choice.name}}:wire.tool_choice;
 return {model:wire.model,messages,tools,max_tokens:wire.max_output_tokens,stream:true,stream_options:{include_usage:true},
  ...settings.family==='gpt'?{max_completion_tokens:wire.max_output_tokens,max_tokens:undefined}:{thinking:{type:'enabled'}},
  reasoning_effort:settings.effort,...choice?{tool_choice:choice}:{},
  ...(wire.parallel_tool_calls===undefined?{}:{parallel_tool_calls:wire.parallel_tool_calls})};
}

export function sseEvents(buffer){
 const events=[];let pieces=[];
 const dispatch=()=>{if(pieces.length){const s=pieces.join('\n');pieces=[];if(s==='[DONE]')events.push({done:true});else events.push(JSON.parse(s));}};
 for(const line of buffer.toString().split(/\r?\n/)){
  if(line==='')dispatch();else if(line.startsWith('data:'))pieces.push(line.slice(5).trimStart());
 }dispatch();return events;
}
export function chatCompletion(buffer,sse){
 if(!sse){const value=JSON.parse(buffer);if(value.error)throw Error('Provider returned an error envelope');return value;}
 const events=sseEvents(buffer),calls=new Map();let first,message={role:'assistant',content:''},finish,usage,done=false;
 for(const event of events){
  if(event.done){done=true;continue;}if(event.error)throw Error('Provider returned an error event');first??=event;
  usage=event.usage??usage;
  for(const choice of event.choices??[]){
   if((choice.index??0)!==0)throw Error('Unexpected multiple completion choices');
   const delta=choice.delta??{};
   for(const field of ['content','reasoning_content','reasoning'])if(delta[field]!=null){if(typeof delta[field]!=='string')throw Error('Unsupported completion delta');message[field]=(message[field]??'')+delta[field];}
   for(const t of delta.tool_calls??[]){
    if(!Number.isSafeInteger(t.index))throw Error('Missing streamed tool index');
    const c=calls.get(t.index)??{id:'',type:'function',function:{name:'',arguments:''}};
    if(t.type&&t.type!=='function')throw Error('Forbidden tool invocation type');
    if(t.id)c.id+=t.id;if(t.function?.name)c.function.name+=t.function.name;if(t.function?.arguments)c.function.arguments+=t.function.arguments;calls.set(t.index,c);
   }
   if(choice.finish_reason!=null)finish=choice.finish_reason;
  }
 }
 if(!done||!finish)throw Error('Incomplete provider Chat stream');
 if(calls.size)message.tool_calls=[...calls].sort((a,b)=>a[0]-b[0]).map(([,c])=>c);
 return {...first,object:'chat.completion',choices:[{index:0,message,finish_reason:finish}],usage};
}

export function chatResponse(completion,envelope,model,{allowInvalidGameTools=false,allFunctionNames=false}={}){
 const choice=completion.choices?.[0],message=choice?.message;if(!message||completion.choices.length!==1)throw Error('Invalid provider completion');
 if(completion.error)throw Error('Provider returned an error envelope');
 if(!['stop','tool_calls','length','content_filter'].includes(choice.finish_reason))throw Error('Incomplete provider completion');
 const reasoning=message.reasoning_content??message.reasoning??'',output=[],id='resp_'+randomBytes(12).toString('hex');
 if(typeof reasoning!=='string')throw Error('Unsupported provider reasoning');
 if(reasoning)output.push({type:'reasoning',id:'rs_'+id,status:'completed',summary:[],encrypted_content:envelope.seal({reasoning}),content:[{type:'reasoning_text',text:reasoning}]});
 if(message.content){if(typeof message.content!=='string')throw Error('Unsupported provider content');output.push({type:'message',id:'msg_'+id,role:'assistant',status:'completed',content:[{type:'output_text',text:message.content,annotations:[]}]});}
 for(const [index,call]of (message.tool_calls??[]).entries()){
  const name=call.function?.name;
  if(call.type!=='function'||name!==GAME_TOOL&&!(allowInvalidGameTools&&isFeedbackEligibleTool({type:'function_call',name},{allFunctionNames})))throw Error('Forbidden tool invocation');
  if(!call.id||typeof call.function.arguments!=='string')throw Error('Invalid provider tool invocation');
  output.push({type:'function_call',id:'fc_'+id+'_'+index,call_id:call.id,name,arguments:call.function.arguments,status:'completed'});
 }
 if(message.function_call)throw Error('Forbidden legacy tool invocation');
 if(!output.some(i=>i.type==='message'||i.type==='function_call'))throw Error('Empty provider completion (no text or tool call)');
 const u=completion.usage??{},usage={input_tokens:u.prompt_tokens??0,output_tokens:u.completion_tokens??0,total_tokens:u.total_tokens??((u.prompt_tokens??0)+(u.completion_tokens??0)),
  input_tokens_details:{cached_tokens:u.prompt_tokens_details?.cached_tokens??u.prompt_cache_hit_tokens??0},output_tokens_details:{reasoning_tokens:u.completion_tokens_details?.reasoning_tokens??0}};
 const reason=choice.finish_reason==='length'?'max_output_tokens':choice.finish_reason==='content_filter'?'content_filter':null;
 return {id,object:'response',created_at:Math.floor(Date.now()/1000),model,status:reason?'incomplete':'completed',
  ...(reason?{incomplete_details:{reason}}:{}),output,usage};
}

export function responseStream(response,target){
 const output=response.output.map(item=>item.type==='function_call'?{...item,...target}:item),events=[];
 const emit=(type,data)=>events.push({type,sequence_number:events.length,...data});
 emit('response.created',{response:{...response,status:'in_progress',output:[]}});
 for(const [output_index,item]of output.entries()){
  emit('response.output_item.added',{output_index,item:{...item,status:'in_progress',...(item.type==='function_call'?{arguments:''}:{})}});
  if(item.type==='function_call'){
   emit('response.function_call_arguments.delta',{item_id:item.id,output_index,delta:item.arguments});
   emit('response.function_call_arguments.done',{item_id:item.id,output_index,arguments:item.arguments});
  }
  if(item.type==='message'){
   emit('response.content_part.added',{item_id:item.id,output_index,content_index:0,part:{type:'output_text',text:'',annotations:[]}});
   emit('response.output_text.delta',{item_id:item.id,output_index,content_index:0,delta:item.content[0].text});
   emit('response.output_text.done',{item_id:item.id,output_index,content_index:0,text:item.content[0].text});
   emit('response.content_part.done',{item_id:item.id,output_index,content_index:0,part:item.content[0]});
  }
  emit('response.output_item.done',{output_index,item});
 }
 emit(response.status==='incomplete'?'response.incomplete':'response.completed',{response:{...response,output}});
 return events.map(e=>'event: '+e.type+'\ndata: '+JSON.stringify(e)+'\n\n').join('');
}
