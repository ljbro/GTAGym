import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import {gzip} from 'node:zlib';
import {promisify} from 'node:util';

const zip=promisify(gzip);
const sha256=data=>createHash('sha256').update(data).digest('hex');
export const isKimiModel=model=>/(?:^|\/)kimi(?:-|$)/i.test(model??'');
export const unusableModelContent=body=>typeof body?.choices?.[0]?.message?.content!=='string'||!body.choices[0].message.content.trim();

export class EmptyModelResponseError extends Error {
 constructor(incident){
  super(`Empty/non-text model response; Kimi evaluations stopped. Evidence: ${incident.directory}`);
  this.name='EmptyModelResponseError';this.modelResponseIncident=incident;
 }
}

/** Compressed forensic copies include every provider field and every input image.
 * Request authentication headers are deliberately never passed to this function. */
export async function captureModelResponse({output,taskId,round,model,endpoint,request,response,rawBody,body,secret='',detectedAt=new Date().toISOString(),kind='empty_model_response',attempt}){
 if(!/^[a-z0-9-]+$/.test(taskId)||!Number.isInteger(round)||round<1)throw Error('Invalid response incident task/round');
 const directory=path.join(output,'api-incidents',`${taskId}-r${String(round).padStart(6,'0')}-${randomUUID()}`);
 await fs.mkdir(directory,{recursive:true,mode:0o700});
 const redact=s=>secret?String(s).replaceAll(secret,'[REDACTED]'):String(s);
 let bytes=Buffer.isBuffer(rawBody)?rawBody:Buffer.from(rawBody);
 if(secret){
  const credential=Buffer.from(secret),parts=[];let cursor=0,index;
  while((index=bytes.indexOf(credential,cursor))!==-1){parts.push(bytes.subarray(cursor,index),Buffer.from('[REDACTED]'));cursor=index+credential.length;}
  if(parts.length){parts.push(bytes.subarray(cursor));bytes=Buffer.concat(parts);}
 }
 const requestBytes=Buffer.from(redact(JSON.stringify(request)));
 const responseBytes=Buffer.from(redact(JSON.stringify(body??null)));
 const write=async(name,data)=>{
  const file=await fs.open(path.join(directory,name),'wx',0o600);
  try{await file.writeFile(data);await file.sync();}finally{await file.close();}
 };
 const message=body?.choices?.[0]?.message;
 const incident={kind,...(attempt!==undefined?{attempt}:{}),id:path.basename(directory),directory,taskId,round,model,endpoint,detectedAt,
  runnerPid:process.pid,status:response.status,statusText:response.statusText,
  headers:Object.fromEntries([...response.headers].map(([k,v])=>[k,redact(v)])),
  providerRequestId:body?.id??null,finishReason:body?.choices?.[0]?.finish_reason??null,
  messageKeys:message&&typeof message==='object'?Object.keys(message):[],
  contentType:message?.content===null?'null':Array.isArray(message?.content)?'array':typeof message?.content,
  contentLength:typeof message?.content==='string'?message.content.length:null,
  usage:body?.usage??null,requestSha256:sha256(requestBytes),responseSha256:sha256(bytes),
  files:{request:'request.json.gz',response:'response.body.txt.gz',parsedResponse:'response.json.gz'},
  responseEncoding:'Complete HTTP entity bytes after fetch transport decompression; no fields truncated. Only the supplied API credential is redacted.',
  note:'Authentication request headers are excluded. Request contains full Markdown, task instruction, retained screenshots and replies. Current observation and checkpoint are also retained in the episode archive.'};
 await write('response.body.txt.gz',await zip(bytes));
 await write('response.json.gz',await zip(responseBytes));
 await write('request.json.gz',await zip(requestBytes));
 await write('incident.json',redact(JSON.stringify(incident,null,2)));
 const handle=await fs.open(directory,'r');try{await handle.sync();}finally{await handle.close();}
 return incident;
}

/** Resolve only this repository's actual eval runners; never pkill model names.
 * startTime is checked again before signalling to guard against PID reuse. */
export async function findKimiEvaluations({root,excludePid=process.pid,procRoot='/proc'}={}){
 const realRoot=await fs.realpath(root),script=path.join(realRoot,'scripts/server-eval/run.mjs');
 const targets=[];
 for(const name of await fs.readdir(procRoot)){
  if(!/^\d+$/.test(name)||Number(name)===excludePid)continue;
  const pid=Number(name),base=path.join(procRoot,name);
  try{
   const cwd=await fs.realpath(await fs.readlink(path.join(base,'cwd')));
   const argv=(await fs.readFile(path.join(base,'cmdline'))).toString().split('\0').filter(Boolean);
   if(!/^node(?:js)?$/.test(path.basename(argv[0]??'')))continue;
   if(!argv.some((arg,i)=>i>0&&!arg.startsWith('-')&&path.resolve(cwd,arg)===script))continue;
   const option=key=>{const i=argv.indexOf('--'+key);return i>=0?argv[i+1]:undefined;};
   let model=option('model');
   if(!model&&option('output')){
    const config=JSON.parse(await fs.readFile(path.join(path.resolve(cwd,option('output')),'config.json'),'utf8'));model=config.model;
   }
   if(!isKimiModel(model))continue;
   const stat=await fs.readFile(path.join(base,'stat'),'utf8');
   targets.push({pid,startTime:stat.slice(stat.lastIndexOf(')')+2).trim().split(/\s+/)[19],model});
  }catch(error){if(!['ENOENT','ESRCH','EACCES','EINVAL'].includes(error.code))throw error;}
 }
 return targets;
}

export async function stopKimiEvaluations({root,excludePid=process.pid,procRoot='/proc',kill=process.kill.bind(process)}={}){
 const targets=await findKimiEvaluations({root,excludePid,procRoot}),results=[];
 for(const target of targets){
  try{
   const stat=await fs.readFile(path.join(procRoot,String(target.pid),'stat'),'utf8');
   if(stat.slice(stat.lastIndexOf(')')+2).trim().split(/\s+/)[19]!==target.startTime){results.push({...target,status:'pid-reused-skipped'});continue;}
   kill(target.pid,'SIGTERM');results.push({...target,status:'graceful-stop-sent'});
  }catch(error){results.push({...target,status:['ENOENT','ESRCH'].includes(error.code)?'already-exited':'signal-error',error:error.message});}
 }
 return results;
}

const markerFile=root=>path.join(root,'.cache/server-eval-control/kimi-response-stop.json');
export async function broadcastKimiStop(root,incident){
 const file=markerFile(root);await fs.mkdir(path.dirname(file),{recursive:true});
 const temporary=file+'.'+randomUUID()+'.tmp';
 await fs.writeFile(temporary,JSON.stringify(incident,null,2),{flag:'wx',mode:0o600});
 await fs.rename(temporary,file);
}

/** All new Kimi runners listen, including ones not launched in probe mode.
 * A marker from an older run never blocks a deliberately started new batch. */
export function watchKimiStops({root,startedAt=Date.now(),onStop,onError=()=>{},intervalMs=250}){
 let stopped=false,busy=false,seen=null;
 const poll=async()=>{
  if(stopped||busy)return;busy=true;
  try{
   const incident=JSON.parse(await fs.readFile(markerFile(root),'utf8'));
   if(incident.runnerPid!==process.pid&&Date.parse(incident.detectedAt)>=startedAt&&incident.id!==seen){seen=incident.id;onStop(incident);}
  }catch(error){if(error.code!=='ENOENT')onError(error);}
  finally{busy=false;}
 };
 const timer=setInterval(()=>{void poll();},intervalMs);timer.unref();void poll();
 return ()=>{stopped=true;clearInterval(timer);};
}

/** Runs before format retries: latch the queue synchronously, capture first,
 * then notify/signal other Kimi runners. Used on the first fault in diagnostic
 * mode, or after the empty-response retry budget has been exhausted. */
export async function guardKimiResponse({root,output,taskId,round,model,endpoint,request,response,rawBody,body,secret,capturedIncident,onDetected=()=>{},onCaptured=()=>{}}){
 if(!unusableModelContent(body))return;
 const detectedAt=new Date().toISOString();
 const initial={kind:'empty_model_response',taskId,round,model,runnerPid:process.pid,detectedAt};
 onDetected(initial);
 let incident;
 try{
  incident=capturedIncident??await captureModelResponse({output,taskId,round,model,endpoint,request,response,rawBody,body,secret,detectedAt});
  await broadcastKimiStop(root,incident);
 }catch(error){
  if(incident)incident.broadcastError=error.message;
  else incident={...initial,directory:path.join(output,'api-incidents'),captureError:error.message};
 }
 // The local queue is already stopped, even if evidence storage failed.
 try{incident.stoppedEvaluations=await stopKimiEvaluations({root});}catch(error){incident.stopError=error.message;}
 if(incident.id)await fs.writeFile(path.join(incident.directory,'stop-report.json'),JSON.stringify({incidentId:incident.id,stoppedEvaluations:incident.stoppedEvaluations,stopError:incident.stopError},null,2),{flag:'wx',mode:0o600}).catch(error=>{incident.stopReportError=error.message;});
 onCaptured(incident);
 throw new EmptyModelResponseError(incident);
}
