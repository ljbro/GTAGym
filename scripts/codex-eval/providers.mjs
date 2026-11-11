// Trusted provider configuration, shared by the CLI, launcher and scheduler.
// Exact model IDs are never substituted; API dialect changes are explicit.
export function modelSettings({model,api='auto',effort,contextWindow,reasoningSummary='auto'}={}){
 if(typeof model!=='string'||!model||model.length>160||!/^[a-zA-Z0-9][a-zA-Z0-9._/-]*$/.test(model))throw Error('Invalid Codex model ID');
 const family=/^qwen/i.test(model)?'qwen':/^(kimi|k3(?:[.-]|$))/i.test(model)?'kimi':/^glm-/i.test(model)?'glm':/^deepseek-/i.test(model)?'deepseek':/^gpt-/i.test(model)?'gpt':null;
 if(!family)throw Error('Unsupported Codex model family');
 const levels=family==='qwen'?['low','medium','xhigh']:family==='gpt'?['low','medium','high','xhigh','max']:['low','high','max'];
 effort??=family==='qwen'?'xhigh':family==='gpt'?'high':'max';
 if(!levels.includes(effort))throw Error('Unsupported '+family+' effort: '+effort+'; choose '+levels.join(', '));
 if(!['auto','responses','chat-completions'].includes(api))throw Error('Invalid provider API');
 api=api==='auto'?(family==='glm'?'chat-completions':'responses'):api;
 if(!['off','auto','concise','detailed'].includes(reasoningSummary))throw Error('Invalid reasoning summary');
 // Conservative harness cap for hosted providers; it is not a claim about an
 // account's maximum context allowance. Explicit limits are frozen in reports.
 contextWindow??=family==='qwen'?1000000:family==='gpt'?272000:128000;
 if(!Number.isSafeInteger(contextWindow)||contextWindow<4096||contextWindow>2000000)throw Error('Invalid context window');
 return {model,family,api,effort,levels,contextWindow,reasoningSummary:family==='gpt'?reasoningSummary:'off'};
}

export function providerEndpoint(base,api){
 const url=new URL(base);
 if(!['http:','https:'].includes(url.protocol)||url.username||url.password||url.search||url.hash)throw Error('Invalid provider base URL');
 if(!['responses','chat-completions','models'].includes(api))throw Error('Invalid provider API');
 let pathname=url.pathname.replace(/\/+$/,'').replace(/\/(responses|chat\/completions|models)$/,'');
 // Preserve versioned vendor prefixes, including /api/coding/paas/v4.
 if(!pathname||!/(?:^|\/)v\d+(?:beta\d*)?$/.test(pathname))pathname+='/v1';
 url.pathname=pathname+'/'+(api==='chat-completions'?'chat/completions':api);return url.href;
}

export function providerWire(wire,settings,{mode='action'}={}){
 const result={...wire,reasoning:{...wire.reasoning,effort:settings.effort}};
 if(settings.reasoningSummary==='off')delete result.reasoning.summary;
 else result.reasoning.summary=settings.reasoningSummary;
 if(settings.family!=='gpt'){
  for(const key of ['include','text','prompt_cache_retention','prompt_cache_key','service_tier','safety_identifier'])delete result[key];
 }
 // Kimi's Responses + max-thinking endpoint rejects tool_choice:"none",
 // including with tools:[]. Only the verified native compaction path omits
 // that optional hint; zero offered tools and the output guard still apply.
 if(settings.family==='kimi'&&mode==='compaction'){
  if(!Array.isArray(result.tools)||result.tools.length!==0)throw Error('Kimi compaction must offer zero tools');
  delete result.tool_choice;
 }
 return result;
}
