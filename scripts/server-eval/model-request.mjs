import {completionURL} from './protocol.mjs';

// Transport-only URL normalization belongs outside protocol.mjs, whose hash
// pins action/replay semantics in existing checkpoints and reused results.
export function responsesURL(base){
 const u=new URL(base);if(!['http:','https:'].includes(u.protocol)||u.username||u.password||u.search||u.hash)throw Error('Invalid model endpoint');
 let pathname=u.pathname.replace(/\/$/,'').replace(/\/chat\/completions$/,'');
 if(!pathname.endsWith('/responses'))pathname+=(pathname.endsWith('/v1')?'':'/v1')+'/responses';
 u.pathname=pathname;return u.href;
}

export function modelEndpoint(base,api){
 if(api==='responses')return responsesURL(base);
 if(api!=='chat-completions')throw Error('Invalid model API');
 const u=new URL(base);u.pathname=u.pathname.replace(/\/$/,'').replace(/\/responses$/,'');
 return completionURL(u.href);
}

export function validateReasoningEffort(value){
 if(!['','low','high','xhigh','max'].includes(value))throw Error('Invalid reasoning-effort');
 return value;
}

export function validateThinking(value){
 if(!['','enabled','disabled'].includes(value))throw Error('Invalid thinking mode');
 return value;
}

export const isOpenAIModel=model=>/^(?:openai\/)?(?:gpt-|o\d(?:-|$))/i.test(model??'');

export function modelTransport({model,api='auto',reasoningSummary='auto'}){
 if(!['auto','chat-completions','responses'].includes(api))throw Error('Invalid api');
 if(!['off','auto','concise','detailed'].includes(reasoningSummary))throw Error('Invalid reasoning-summary');
 const selected=api==='auto'?(isOpenAIModel(model)?'responses':'chat-completions'):api;
 return {api:selected,reasoningSummary:selected==='responses'?reasoningSummary:'off'};
}

/** Old checkpoints predate Responses and must keep their original API. */
export function resumeModelTransport(config,{api='auto',reasoningSummary='auto',explicitAPI=false,explicitSummary=false}={}){
 const recorded=modelTransport({model:config.model,api:config.api??'chat-completions',reasoningSummary:config['reasoning-summary']??'off'});
 if(explicitAPI&&modelTransport({model:config.model,api,reasoningSummary:recorded.reasoningSummary}).api!==recorded.api)throw Error('Resume API mismatch');
 if(explicitSummary&&reasoningSummary!==recorded.reasoningSummary)throw Error('Resume reasoning-summary mismatch');
 return recorded;
}

/** Keep system/instruction/images and the already-pruned action history intact.
 * No previous_response_id or hidden reasoning items can bypass local pruning. */
export function responsesInput(messages){
 return messages.map(message=>{
  if(!['system','developer','user','assistant'].includes(message.role))throw Error('Unsupported Responses input role');
  if(typeof message.content==='string')return {role:message.role,content:message.content};
  if(!Array.isArray(message.content))throw Error('Unsupported Responses input content');
  return {role:message.role,content:message.content.map(part=>{
   if(part.type==='text'&&typeof part.text==='string')return {type:'input_text',text:part.text};
   if(part.type==='image_url'&&typeof part.image_url?.url==='string')return {type:'input_image',image_url:part.image_url.url,detail:part.image_url.detail??'auto'};
   throw Error('Unsupported Responses input part');
  })};
 });
}

export function responsesRequest({model,messages,maxTokens,reasoningEffort='',reasoningSummary='auto',thinking=''}){
 validateReasoningEffort(reasoningEffort);validateThinking(thinking);
 modelTransport({model,api:'responses',reasoningSummary});
 const reasoning={...(reasoningEffort?{effort:reasoningEffort}:{}),...(reasoningSummary!=='off'?{summary:reasoningSummary}:{})};
 return {model,input:responsesInput(messages),max_output_tokens:maxTokens,store:false,stream:false,truncation:'disabled',
  ...(Object.keys(reasoning).length?{reasoning}:{})};
}

export function modelRequest(options){
 return modelTransport(options).api==='responses'?responsesRequest(options):completionRequest(options);
}

export function completionRequest({model,messages,maxTokens,reasoningEffort='',thinking=''}){
 validateReasoningEffort(reasoningEffort);
 validateThinking(thinking);
 const openAI=isOpenAIModel(model);
 // OpenAI reasoning uses its standard token/effort fields, not the
 // Kimi/GLM/DeepSeek-specific thinking object or a forced temperature.
 return {model,messages,...(openAI?{max_completion_tokens:maxTokens}:{max_tokens:maxTokens}),
  ...(thinking==='enabled'||openAI&&reasoningEffort?{}:{temperature:0}),
  ...(thinking&&!openAI?{thinking:{type:thinking}}:{}),...(reasoningEffort?{reasoning_effort:reasoningEffort}:{})};
}

export function resumeThinking(config,requested,explicit=false){
 const recorded=config.thinking??'';
 validateThinking(recorded);
 if(explicit&&requested!==recorded)throw Error('Resume thinking mode mismatch');
 return recorded;
}

export function resumeReasoningEffort(config,requested,explicit=false){
 const recorded=config['reasoning-effort']??'';
 validateReasoningEffort(recorded);
 if(explicit&&requested!==recorded)throw Error('Resume reasoning-effort mismatch');
 return recorded;
}
