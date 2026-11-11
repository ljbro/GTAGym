// Trusted quota monitoring. Nothing in this module is offered as a policy tool.
import fs from 'node:fs/promises';
import path from 'node:path';
import {gzipSync} from 'node:zlib';
import {randomUUID} from 'node:crypto';
import {setTimeout as sleep} from 'node:timers/promises';
import {providerEndpoint} from './providers.mjs';

function timestamp(value,now,{seconds=false}={}){
 if(value==null||value==='')return null;
 let n=Number(value);
 if(Number.isFinite(n))n=seconds?now+n*1000:n<1e12?n*1000:n;
 else n=Date.parse(String(value));
 return Number.isFinite(n)&&n>now?new Date(n).toISOString():null;
}
export function kimiFiveHourLimit({status,body,headers,now=Date.now()}){
 if(![403,429].includes(status))return null;
 const text=JSON.stringify(body??'');
 // Do not confuse concurrency, weekly/monthly quota, balance or auth errors
 // with this explicitly requested rolling-window recovery policy.
 if(!/(?:5[\s-]*(?:hour|hr)|five[\s-]*hour|\u4e94\s*(?:\u4e2a)?\u5c0f\u65f6)/i.test(text)
   ||!/(?:usage[\s_-]*limit|quota|rate[\s_-]*limit|\u7528\u91cf|\u989d\u5ea6|\u9650\u989d)/i.test(text))return null;
 const error=body?.error??{};
 const retryAfter=headers?.get?.('retry-after');
 const retryAt=timestamp(error.reset_at??error.resets_at??body?.reset_at,now)
  ??timestamp(error.retry_after??body?.retry_after,now,{seconds:true})
  ??timestamp(retryAfter,now,{seconds:Number.isFinite(Number(retryAfter))});
 return {kind:'kimi-five-hour',httpStatus:status,detectedAt:new Date(now).toISOString(),retryAt};
}
export function quotaOptions(config={}){
 const enabled=config.enabled===true,pollSeconds=config.pollSeconds??300,timeoutSeconds=config.timeoutSeconds??60;
 if(!Number.isInteger(pollSeconds)||pollSeconds<1||pollSeconds>3600||!Number.isInteger(timeoutSeconds)||timeoutSeconds<1||timeoutSeconds>600)throw Error('Invalid Kimi quota monitor interval/timeout');
 return {enabled,pollSeconds,timeoutSeconds};
}
export class KimiQuotaGate {
 constructor({config,output,fetcher=fetch,wait=sleep,now=Date.now,onEvent=()=>{}}){
  this.options=quotaOptions(config.quotaRecovery);
  if(!this.options.enabled||!/^kimi(?:-|$)/i.test(config.model))throw Error('Quota recovery requires an explicit Kimi configuration');
  Object.assign(this,{config,output,fetcher,wait,now,onEvent});
  this.controller=new AbortController();this.paused=false;this.version=0;this.pending=null;this.writes=Promise.resolve();
  this.state={enabled:true,status:'ready',checks:0,recoveries:0,interruptedAttempts:0,pollSeconds:this.options.pollSeconds};
 }
 async save(patch={}){
  this.state={...this.state,...patch,updatedAt:new Date(this.now()).toISOString()};
  const payload=JSON.stringify(this.state,null,2),file=path.join(this.output,'quota-status.json'),tmp=file+'.'+randomUUID()+'.tmp';
  this.writes=this.writes.then(async()=>{await fs.writeFile(tmp,payload,{mode:0o600});await fs.rename(tmp,file);});
  await this.writes;
 }
 async pause(limit){
  if(limit?.kind!=='kimi-five-hour')throw Error('Unexpected quota limit');
  this.version++;
  if(!this.paused){this.paused=true;this.onEvent({event:'kimi_quota_paused',...limit});}
  await this.save({status:'waiting_5h_quota',limit,interruptedAttempts:this.state.interruptedAttempts+1});
 }
 stop(){this.controller.abort();}
 async probe(){
  const {model,baseURL,keyFile,effort='max',api='responses'}=this.config;
  const key=(await fs.readFile(keyFile,'utf8')).trim();
  const request=api==='responses'?{model,input:[{role:'user',content:'Reply OK.'}],max_output_tokens:128,reasoning:{effort},store:false,stream:false}
   :{model,messages:[{role:'user',content:'Reply OK.'}],max_tokens:128,thinking:{type:'enabled'},reasoning_effort:effort,stream:false};
  const response=await this.fetcher(providerEndpoint(baseURL,api),{method:'POST',headers:{authorization:'Bearer '+key,'content-type':'application/json','user-agent':'GTAbench-quota-monitor/1.0'},
   body:JSON.stringify(request),signal:AbortSignal.any([this.controller.signal,AbortSignal.timeout(this.options.timeoutSeconds*1000)])});
  const raw=await response.text();let body;try{body=JSON.parse(raw);}catch{}
  const directory=path.join(this.output,'quota-probes');await fs.mkdir(directory,{recursive:true,mode:0o700});
  const at=new Date(this.now()).toISOString(),file=path.join(directory,randomUUID()+'.json.gz');
  await fs.writeFile(file,gzipSync(JSON.stringify({at,httpStatus:response.status,request,response:body??raw})),{mode:0o600,flag:'wx'});
  const record={at,httpStatus:response.status,evidence:path.relative(this.output,file),usage:body?.usage??null};
  await fs.appendFile(path.join(directory,'audit.jsonl'),JSON.stringify(record)+'\n',{mode:0o600});
  // A zero/absent usage ratio is not evidence of recovery: require an actual
  // successful inference response from the same exact model and endpoint.
  const valid=response.ok&&body?.model===model&&!body.error&&(api==='responses'&&Array.isArray(body.output)||api==='chat-completions'&&Array.isArray(body.choices));
  if(valid)return {...record,ready:true};
  const limit=kimiFiveHourLimit({status:response.status,body,headers:response.headers,now:this.now()});
  if(limit)return {...record,ready:false,limit};
  if(response.status===429||response.status>=500)return {...record,ready:false,transient:true};
  throw Error('Kimi quota probe blocked by HTTP '+response.status+'; not a confirmed five-hour quota error. Inspect '+record.evidence);
 }
 async waitUntilReady(){
  if(!this.paused||this.controller.signal.aborted)return;
  if(this.pending)return this.pending;
  this.pending=this.monitor().finally(()=>{this.pending=null;});return this.pending;
 }
 async monitor(){
  while(this.paused&&!this.controller.signal.aborted){
   const version=this.version;
   const reset=Date.parse(this.state.limit?.retryAt??'');
   const delay=Number.isFinite(reset)&&reset>this.now()?Math.min(this.options.pollSeconds*1000,reset-this.now()+1000):this.options.pollSeconds*1000;
   await this.save({nextCheckAt:new Date(this.now()+delay).toISOString()});
   try{await this.wait(delay,undefined,{signal:this.controller.signal});}catch(e){if(this.controller.signal.aborted)return;throw e;}
   if(this.controller.signal.aborted)return;
   let checked;
   try{checked=await this.probe();}catch(e){
    if(this.controller.signal.aborted)return;
    if(e instanceof TypeError||e.name==='TimeoutError'||e.code==='ECONNRESET')checked={ready:false,networkError:true};
    else {await this.save({status:'blocked',error:e.message,nextCheckAt:null});throw e;}
   }
   await this.save({checks:this.state.checks+1,lastCheck:checked,...checked.limit?{limit:checked.limit}:{}});
   this.onEvent({event:'kimi_quota_checked',ready:checked.ready,httpStatus:checked.httpStatus,networkError:checked.networkError??false});
   if(checked.ready&&version===this.version){
    this.paused=false;await this.save({status:'ready',nextCheckAt:null,recoveries:this.state.recoveries+1});
    this.onEvent({event:'kimi_quota_restored'});
   }
  }
 }
}
