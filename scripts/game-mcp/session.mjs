import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import {gzip,gunzip} from 'node:zlib';
import {promisify} from 'node:util';
import {createActionAdapter} from '../server-eval/actions.mjs';
import {runEpisode,frozenEqual} from '../server-eval/episode.mjs';
import {initialInstructionOverlay,INSTRUCTION_PRESENTATION} from './instruction-image.mjs';
import {harnessRules} from './rules.mjs';
import {realtimeRules} from '../server-eval/realtime-policy.mjs';

const zip=promisify(gzip),unzip=promisify(gunzip);
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});promise.catch(()=>{});return {promise,resolve,reject};};
const canonical=value=>Array.isArray(value)?value.map(canonical):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(k=>[k,canonical(value[k])])):value;
const digest=value=>createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex');

export class GameError extends Error {
 constructor(code,message){super(message);this.code=code;}
}

async function atomic(file,value){
 const temp=file+'.'+randomUUID()+'.tmp';
 const handle=await fs.open(temp,'wx',0o600);
 try{await handle.writeFile(value);await handle.sync();}finally{await handle.close();}
 await fs.rename(temp,file);
  const directory=await fs.open(path.dirname(file),'r');try{await directory.sync();}finally{await directory.close();}
}

/** One fixed task per MCP connection. Privileged game state never leaves this class.
 * The existing episode runner owns scoring, input semantics, video and checkpoints.
 * Its policy call is a rendezvous: paused screenshot out, validated GUI action in.
 */
export class GameSession {
 constructor(options,{episodeRunner=runEpisode,environmentFactory,resume=null,sessionId,initialCalls=0,onEvent=()=>{}}={}){
  this.adapter=createActionAdapter({maxSeconds:options.maxActionSeconds??1});
  this.options={...options,system:harnessRules(options.system,{language:options.language,maxSeconds:this.adapter.LIMITS.maxSeconds})};this.episodeRunner=episodeRunner;
  if(options.clockMode==='realtime')this.options.system=realtimeRules(this.options.system);
  this.environmentFactory=environmentFactory??(async settings=>{
   if(options.clockMode==='realtime'){const {RealtimeServerEnvironment}=await import('../server-eval/realtime-environment.mjs');return new RealtimeServerEnvironment(settings);}
   const {ServerEnvironment}=await import('../server-eval/environment.mjs');
   return new ServerEnvironment(settings);
  });
  if(sessionId!==undefined&&!/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(sessionId))throw Error('Invalid restored game session id');
  if(!Number.isSafeInteger(initialCalls)||initialCalls<0||initialCalls>=options.maxCalls)throw Error('Invalid restored call budget');
  this.resume=resume;this.onEvent=onEvent;
  this.id=sessionId??randomUUID();this.first=deferred();this.changed=deferred();this.abort=new AbortController();
  this.receipts=new Map();this.calls=initialCalls;this.started=false;this.closed=false;this.done=false;
  this.events=Promise.resolve();this.result=null;this.publicSnapshot=null;
 }

 async event(value){
  if(!this.directoryReady)return;
  this.events=this.events.then(async()=>{await fs.appendFile(path.join(this.options.output,'mcp-events.jsonl'),JSON.stringify({at:new Date().toISOString(),...value})+'\n');await this.onEvent(value);});
  await this.events;
 }

 publish(snapshot){
  this.publicSnapshot=snapshot;
  const changed=this.changed;this.changed=deferred();changed.resolve(snapshot);this.first.resolve(snapshot);
  if(snapshot.metadata?.done)this.onTerminal?.(snapshot);
 }

 snapshot({observationId,image,mimeType,done=false,status='active'}={}){
  return {
   metadata:{task_id:this.options.taskId,
    observation_id:observationId??`${this.id}:final`,width:1280,height:720,done,
    outcome:status},
   ...(image?{image:image.toString('base64'),mimeType}:{}),
  };
 }

 async start(){
  if(this.started)return this.first.promise;
  if(this.closed)throw new GameError('SESSION_CLOSED','This task session is closed.');
  this.started=true;
  // Keep an owner-only output directory. Refuse accidental reuse/overwrite.
  this.background=this.run().catch(async error=>{
   this.done=true;this.startError=error;
   if(this.directoryReady)await fs.appendFile(path.join(this.options.output,'server-errors.log'),String(error.stack??error)+'\n').catch(()=>{});
   this.publish(this.snapshot({done:true,status:'evaluation_error',image:this.lastImage?.buffer,mimeType:this.lastImage?.mimeType}));
   await this.env?.close().catch(()=>{});
  });
  return this.first.promise;
 }

 async run(){
  const o=this.options;
  await fs.mkdir(path.dirname(o.output),{recursive:true});
  await fs.mkdir(o.output,{mode:0o700});this.directoryReady=true;
  await fs.mkdir(path.join(o.output,'receipts'),{mode:0o700});
  const config={protocol:'gui-server-turns-v2',transport:'mcp-stdio',model:o.agentLabel,
   policy:'external-mcp',tasks:o.taskId,workers:1,seed:o.seed,language:o.language,
   'max-rounds':o.maxRounds,quality:o.quality,renderer:o.renderer,'video-fps':o.videoFPS,crf:o.crf,
   url:o.url,system:o.system,instructions:{[o.taskId]:o.instruction},
   systemPromptHash:createHash('sha256').update(o.system).digest('hex'),actionProtocol:'gui-actions-v7',executionHost:'server',
   canvas2d:'software',pageCompositing:'software',sessionId:this.id,
   contextManagement:'external-harness',instructionMode:'initial-image',instructionPresentation:INSTRUCTION_PRESENTATION,
   note:'External harness owns its history/model calls; no model API credentials are read by this service.'};
  await atomic(path.join(o.output,'config.json'),JSON.stringify(config,null,2));
  this.env=await this.environmentFactory({url:o.url,seed:o.seed,quality:o.quality,renderer:o.renderer,
   id:'mcp-'+this.id,videoFPS:o.videoFPS,signal:this.abort.signal,accelerated2D:false,gpuCompositing:false});
  const originalObserve=this.env.observe.bind(this.env);
  this.env.observe=async options=>{
   const buffer=await originalObserve(options);
   this.lastImage={buffer,mimeType:options?.type==='jpeg'?'image/jpeg':'image/png'};
   return buffer;
  };
  await this.event({event:'session_start',taskId:o.taskId,sessionId:this.id});
  this.result=await this.episodeRunner({env:this.env,taskId:o.taskId,system:o.system,instruction:o.instruction,
   adapter:this.adapter,maxRounds:o.maxRounds,output:o.output,name:'0000-'+o.taskId,
   contextMode:'external',observationTransform:initialInstructionOverlay(o.instruction),
   videoFPS:o.videoFPS,crf:o.crf,signal:this.abort.signal,checkpoint:true,resume:this.resume,
   maxRenderRestarts:o.clockMode==='realtime'?0:2,renderFaultMode:'recover',
   metadata:{index:0,worker:0,language:o.language,seed:o.seed,model:o.agentLabel,policy:'external-mcp',
    quality:o.quality,renderer:o.renderer,endpoint:null,harness:'mcp-external',sessionId:this.id,
    actionProtocol:'gui-actions-v7',instructionMode:'initial-image',instructionPresentation:INSTRUCTION_PRESENTATION,contextManagement:'external-harness'},
   onEvent:e=>{if(e.event==='ready'){this.effectiveMaxRounds=e.maxRounds;this.roundBudget=e.roundBudget;}void this.event(e).catch(error=>{this.logError=error;this.abort.abort(error);this.actionRequest?.reject(error);});},
   policy:async(messages,{round})=>{
    this.abort.signal.throwIfAborted();
    const part=messages.at(-1).content.find(p=>p.type==='image_url');
    const match=/^data:(image\/(?:jpeg|png));base64,([\s\S]+)$/.exec(part?.image_url?.url??'');
    if(!match)throw Error('Episode runner did not provide a screenshot');
    this.actionRequest=deferred();
    this.publish(this.snapshot({observationId:`${this.id}:${round-1}`,image:Buffer.from(match[2],'base64'),mimeType:match[1]}));
    return await this.actionRequest.promise;
   }});
  this.done=true;
  await this.events;
  const summary={protocol:config.protocol,requested:1,completedEpisodes:1,running:false,
   successes:Number(!!this.result.success),errors:Number(['error','archive_error','render_anomaly'].includes(this.result.status)),
   results:[this.result]};
  await atomic(path.join(o.output,'summary.json'),JSON.stringify(summary,null,2));
  await this.event({event:'session_end',status:this.result.status,rounds:this.result.rounds});
  const outcome={success:'success',task_failure:'failure',round_limit:'round_limit',interrupted:'interrupted'}[this.result.status]??'evaluation_error';
  this.publish(this.snapshot({done:true,status:outcome,image:this.lastImage?.buffer,mimeType:this.lastImage?.mimeType}));
 }

 checkCall(){
  if(this.closed)throw new GameError('SESSION_CLOSED','This task session is closed.');
  if(++this.calls>this.options.maxCalls){
   void this.close('tool_call_limit').catch(error=>{this.startError??=error;});
   throw new GameError('TOOL_CALL_LIMIT','The MCP tool-call budget is exhausted.');
  }
 }

 async observe(){
  // Internal evaluator operation, not a model tool and not an action/tool budget.
  if(this.closed)throw new GameError('SESSION_CLOSED','This task session is closed.');
  await this.start();
  // A concurrent read must not return a pre-action image as if it were current.
  if(this.inFlight)await this.inFlight.promise;
  return this.publicSnapshot;
 }

 // Trusted evaluator operation, never an MCP tool. It resumes the pending
 // policy rendezvous with a feedback-only round; the episode runner owns the
 // shared round cap, archive/checkpoint and unchanged simulation state.
 async feedback(message){
  if(typeof message!=='string'||!message.trim())throw Error('Invalid evaluator feedback');
  const current=await this.observe();
  if(this.done)return current;
  if(this.held||this.feedbackInFlight)throw Error('Session is not ready for evaluator feedback');
  this.feedbackInFlight=true;
  try{
   const next=this.changed.promise;
   await this.event({event:'early_stop_feedback',observationId:current.metadata.observation_id,message});
   this.actionRequest.resolve({raw:'',evaluatorFeedback:message});
   return await next;
  }finally{this.feedbackInFlight=false;}
 }

 async step(input){
  if(this.held)throw new GameError('SESSION_HELD','The evaluator has suspended this session.');
  if(this.feedbackInFlight)throw new GameError('ACTION_IN_PROGRESS','The evaluator is supplying a new observation.');
  this.checkCall();
  if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).some(k=>!['request_id','observation_id','action'].includes(k)))throw new GameError('INVALID_ACTION','Expected request_id, observation_id and action only.');
  const {request_id:requestId,observation_id:observationId,action}=input;
  if(typeof requestId!=='string'||!/^[-a-zA-Z0-9_]{1,64}$/.test(requestId))throw new GameError('INVALID_ACTION','request_id must contain 1–64 letters, numbers, hyphens or underscores.');
  if(typeof observationId!=='string'||observationId.length>100)throw new GameError('INVALID_ACTION','observation_id must copy the current observation identifier.');
  try{this.adapter.parse(JSON.stringify(action));}catch(error){throw new GameError('INVALID_ACTION',error.message);}
  const fingerprint=digest({observation_id:observationId,action});
  const existing=this.receipts.get(requestId);
  if(existing){
   if(existing.fingerprint!==fingerprint)throw new GameError('REQUEST_ID_CONFLICT','This request_id was already used with different arguments.');
   if(existing.promise)return existing.promise;
   return JSON.parse((await unzip(await fs.readFile(existing.file))).toString()).result;
  }
  if(!this.started||!this.publicSnapshot)throw new GameError('HOST_NOT_READY','The evaluator must supply the initial observation before actions can start.');
  if(this.inFlight)throw new GameError('ACTION_IN_PROGRESS','Another action is in progress; retry it with the same request_id or wait for its result.');
  if(this.done)throw new GameError('TASK_FINISHED','The task has ended. Do not start another action.');
  if(this.abort.signal.aborted)throw new GameError('SESSION_ERROR','This session is stopping after an execution or recording error.');
  if(observationId!==this.publicSnapshot.metadata.observation_id)throw new GameError('STALE_OBSERVATION','The observation is stale. No action executed; use the latest screenshot already returned.');
  const receipt={fingerprint,file:path.join(this.options.output,'receipts',digest(requestId)+'.json.gz')};
  // Claim before the first asynchronous write: parallel requests cannot both step.
  const operation=deferred();receipt.promise=operation.promise;this.receipts.set(requestId,receipt);this.inFlight=receipt;
  const next=this.changed.promise;
  void (async()=>{
   try{
    await atomic(receipt.file,await zip(JSON.stringify({requestId,fingerprint,phase:'prepared',observationId,action})));
    await this.event({event:'action_accepted',requestId,observationId,fingerprint});
    this.actionRequest.resolve({raw:JSON.stringify(action)});
    const result=await next;
    await atomic(receipt.file,await zip(JSON.stringify({requestId,fingerprint,phase:'completed',result})));
    await this.event({event:'action_completed',requestId,observationId:result.metadata.observation_id});
    delete receipt.promise;operation.resolve(result);
   }catch(error){
    // Never retry an uncertain partially executed action. Halt this episode.
    this.abort.abort(error);this.actionRequest?.reject(error);
    operation.reject(new GameError('SESSION_ERROR','The action could not be durably completed; this session is stopped.'));
    // Keep the rejected promise as a tombstone: the same ID never executes again.
   }finally{if(this.inFlight===receipt)this.inFlight=null;}
  })();
  return operation.promise;
 }

 // Trusted supervisor operations. Never registered as tools or resources.
 async hold(reason='transport_disconnected'){
  this.held=true;
  await this.start();
  await this.inFlight?.promise;
  if(this.done||this.closed)return {terminal:true,snapshot:this.publicSnapshot};
  this.abort.signal.throwIfAborted();
  await this.env.assertFrozen();
  const state=await this.env.state();
  if(!this.publicSnapshot||this.publicSnapshot.metadata.done)throw Error('No resumable observation');
  this.heldState=state;
  this.heldInputs={keys:[...(this.env.heldKeys??[])],buttons:[...(this.env.heldButtons??[])]};
  await atomic(path.join(this.options.output,'held-observation.json'),JSON.stringify(this.publicSnapshot));
  await atomic(path.join(this.options.output,'held-state.json'),JSON.stringify({version:1,sessionId:this.id,
   taskId:this.options.taskId,reason,heldAt:new Date().toISOString(),state,calls:this.calls,
   maxCalls:this.options.maxCalls,maxRounds:this.options.maxRounds,observation:this.publicSnapshot.metadata,
   imageSha256:createHash('sha256').update(Buffer.from(this.publicSnapshot.image,'base64')).digest('hex'),
   heldKeys:[...(this.env.heldKeys??[])],heldButtons:[...(this.env.heldButtons??[])]}));
  await this.event({event:'session_held',reason,observationId:this.publicSnapshot.metadata.observation_id,calls:this.calls});
  return {terminal:false,snapshot:this.publicSnapshot};
 }

 async resumeHeld(){
  if(this.closed||this.done)throw Error('The preserved game has ended');
  if(!this.held)return this.publicSnapshot;
  this.abort.signal.throwIfAborted();
  await this.env.assertFrozen();
  if(!frozenEqual(this.heldState,await this.env.state()))throw Error('Preserved game drifted; refusing to resume');
  if(JSON.stringify(this.heldInputs)!==JSON.stringify({keys:[...(this.env.heldKeys??[])],buttons:[...(this.env.heldButtons??[])]}))throw Error('Preserved inputs drifted; refusing to resume');
  this.held=false;await this.event({event:'session_reattached',observationId:this.publicSnapshot.metadata.observation_id,calls:this.calls});
  return this.publicSnapshot;
 }

 async close(reason='client_disconnected'){
  if(this.closing)return this.closing;
  this.closed=true;
  this.closing=(async()=>{
   if(!this.done){const error=Error(reason);this.abort.abort(error);this.actionRequest?.reject(error);}
   // Closing the private browser also interrupts an in-progress load/evaluation.
   await this.env?.close().catch(()=>{});
   await this.background;
   await this.inFlight?.promise?.catch(()=>{});
   if(this.directoryReady)await this.event({event:'session_closed',reason});
  })();
  return this.closing;
 }
}
