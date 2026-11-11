import fs from 'node:fs/promises';
import path from 'node:path';
import {ModelContext} from './context.mjs';
import {Archive,Video} from './recording.mjs';
import {CheckpointJournal,verifyReplayState} from './checkpoint.mjs';
import {replayStatic} from './static-replay.mjs';
import {staticRoundLimit} from './static-budget.mjs';
import {healthyObservation,recoverRenderer} from './render-recovery.mjs';
import {saveModelResponse,MODEL_RESPONSE_RECORDING} from './model-response.mjs';
import {realtimeRoundBudget} from './realtime-policy.mjs';

export function frozenEqual(a,b){
 return ['elapsed','worldTime','animationTime','actor','mousePosition','mode','paused','replayState'].every(key=>JSON.stringify(a[key])===JSON.stringify(b[key]));
}
/** Managed policies receive history; external harnesses receive only each new observation. */
export async function runEpisode({env,taskId,system,instruction,adapter,policy,maxRounds,output,name,videoFPS=10,crf=28,signal,redact=s=>s,metadata={},onEvent=()=>{},checkpoint=false,resume=null,maxRenderRestarts=2,renderFaultMode='recover',onRenderIncident=()=>{},contextMode='managed',observationTransform=null}){
 if(!['managed','external'].includes(contextMode))throw Error('Invalid contextMode');
 if(observationTransform!==null&&typeof observationTransform!=='function')throw Error('Invalid observationTransform');
 if(!['recover','preserve'].includes(renderFaultMode))throw Error('Invalid renderFaultMode');
 if(renderFaultMode==='preserve'&&typeof env.preserveIncident!=='function')throw Error('Preserve mode requires an incident environment');
 const realtime=env.clockMode==='realtime';
 if(realtime&&resume)throw Error('Realtime trajectories cannot use deterministic paused-action replay');
 if(!Number.isInteger(maxRenderRestarts)||maxRenderRestarts<0||maxRenderRestarts>5)throw Error('Invalid maxRenderRestarts');
 const staticOriginal=/^c(?:10|11)-n/.test(taskId)||taskId.startsWith('rl-task-shooting-');
 if(staticOriginal)maxRounds=Math.min(maxRounds,await staticRoundLimit(taskId));
 const temp=await fs.mkdtemp(path.join(output,`.${name}-`));
 const archive=new Archive(path.join(output,name+'.tar.gz'));
 const video=new Video(path.join(temp,'episode.mp4'),{fps:videoFPS,crf,inputCodec:staticOriginal?'png':'mjpeg'});
 const timeline=await fs.open(path.join(temp,'video-frames.jsonl'),'wx');
 const context=contextMode==='managed'?new ModelContext(system,instruction,{staticOriginal,language:metadata.language??'zh'}):null;
 let policyTurns=0;
 const result={taskId,rounds:0,status:'starting',success:false,...metadata};
 const journal=checkpoint?new CheckpointJournal(path.join(output,'checkpoints',name)):null;
 const committed=[];
 result.renderHealth={enabled:!staticOriginal&&!!env.inspectRenderHealth,mode:renderFaultMode,maxRestarts:maxRenderRestarts,restarts:0,faults:[]};
 let recoveryFailed=false;
 const observeHealthy=()=>healthyObservation({env,type:staticOriginal?'png':'jpeg',holdFirst:renderFaultMode==='preserve',
  onFault:async({first,second,image,confirmation})=>{
   // Another worker may already have stopped this episode while inspecting.
   signal?.throwIfAborted();
   const index=result.renderHealth.faults.length+1,stem=`diagnostics/render-${index}`;
   const fault={round:committed.length+1,lastCommittedState:committed.at(-1)?.after??result.initial,first,second,confirmed:renderFaultMode!=='preserve',images:[stem+'-first.jpg',...(renderFaultMode==='preserve'?[]:[stem+'-confirmation.jpg'])]};
   result.renderHealth.faults.push(fault);
   if(renderFaultMode==='preserve'){
    env.incidentHeld=true;
    // Synchronous queue latch BEFORE any evidence writes / archive finalization.
    onRenderIncident({env,taskId,round:fault.round});
    try{result.incident=await env.preserveIncident({directory:path.join(output,'incidents',name),image,fault});}
    catch(error){result.incident=env.incident;result.incidentSaveError=redact(error.message);}
    onEvent({event:'render_incident_held',taskId,round:fault.round,incident:result.incident});
   }
   await archive.add(fault.images[0],image);if(fault.images[1])await archive.add(fault.images[1],confirmation);
   await archive.json(stem+'.json',fault);
   onEvent({event:'render_anomaly',taskId,round:fault.round,kind:second.kind});
  },recover:async()=>{
   try{
    if(result.renderHealth.restarts>=maxRenderRestarts)throw Error('Render anomaly restart limit exceeded');
    result.renderHealth.restarts++;
    onEvent({event:'render_restart',taskId,attempt:result.renderHealth.restarts,replayedRounds:committed.length});
    await recoverRenderer({env,taskId,adapter,records:committed,initial:result.initial,build:result.environment.build,signal});
    onEvent({event:'render_recovered',taskId,attempt:result.renderHealth.restarts,replayedRounds:committed.length});
   }catch(error){recoveryFailed=true;throw error;}
  }});
 let lastVideoTime=-1,videoFailed=false;
 const saveFrame=async(image,gameSeconds)=>{
  try{await video.frame(image);await timeline.write(JSON.stringify({frame:video.frames-1,videoSeconds:(video.frames-1)/videoFPS,gameSeconds})+'\n');lastVideoTime=gameSeconds;}
  catch(error){videoFailed=true;throw error;}
 };
 const began=performance.now();
 try{
  const config={taskId,system,instruction,actionLimits:adapter.LIMITS??null,actionAdapter:metadata.language==='en'?adapter.descriptionEn:adapter.description,maxRounds,videoFPS,crf,maxRenderRestarts,renderFaultMode,contextMode,...metadata,modelResponseRecording:MODEL_RESPONSE_RECORDING};
  await archive.json('config.json',config);
  result.environment=await env.open();await env.reset(taskId);result.initial=await env.state();
  if(realtime){result.clockMode='realtime';result.keyboardReleasePolicy=result.initial.realtimeClock?.version??'duration-deadline';result.roundBudget=realtimeRoundBudget(result.initial.maxDuration,maxRounds);maxRounds=result.roundBudget.maxRounds;result.maxRounds=maxRounds;await archive.json('resolved-runtime.json',{clockMode:'realtime',keyboardReleasePolicy:result.keyboardReleasePolicy,roundBudget:result.roundBudget});}
  if(resume){
   if(resume.config.taskId!==taskId||resume.config.system!==system||resume.config.instruction!==instruction||resume.config.actionAdapter!==config.actionAdapter)throw Error('Resume task/prompt/action protocol mismatch');
   if(resume.config.build&&resume.config.build!==result.environment.build)throw Error('Resume game build mismatch');
   if(resume.config.initial)verifyReplayState(resume.config.initial,result.initial,'initial');
   if(maxRounds<resume.nextRound)throw Error('maxRounds must include the requested resume round');
   result.recovery={source:resume.source,nextRound:resume.nextRound,kind:'verified-action-replay',replayedRounds:0};
  }
  if(journal){await journal.init({...config,build:result.environment.build,initial:result.initial});result.checkpointDirectory=path.relative(output,journal.directory);}
  onEvent({event:'ready',taskId,renderer:result.environment.renderer,gpu:result.environment.gpu,bootMs:result.environment.bootMs,maxRounds,roundBudget:result.roundBudget});
  if(!realtime)await env.assertFrozen();
  for(let round=1;round<=maxRounds;round++){
   if(signal?.aborted){result.status='interrupted';break;}
   let before=await env.state();if(before.complete||before.failed)break;
   const previous=resume?.records[round-1];
   if(previous?.before)verifyReplayState(previous.before,before,`round ${round} before`);
   const rawImage=previous?await resume.getImage(round):await observeHealthy();
   // Check render health before adding presentation-only overlays. Archive exactly
   // the delivered pixels; replayed checkpoint images are already transformed.
   const image=!previous&&observationTransform?await observationTransform(rawImage,{round,taskId,mimeType:staticOriginal?'image/png':'image/jpeg'}):rawImage;
   const imagePath=`observations/${String(round).padStart(6,'0')}.${staticOriginal?'png':'jpg'}`;
   if(!previous)before=await env.state(); // a verified browser restart may change wall-clock origin
   await archive.add(imagePath,image);
   if(lastVideoTime<0)await saveFrame(image,env.frames/60);
   const pruned=context?.observe({round,image,mime:staticOriginal?'image/png':'image/jpeg'})??[];
   const record={round,observation:imagePath,gameSeconds:before.elapsed,before,contextRounds:context?.rounds??[round],prunedRounds:pruned,
    ...(contextMode==='external'?{contextManagement:'external-harness'}:{})};
   if(journal)await journal.save(record,image,'observed');
   // All requests survive pruning and inference errors in the archive.
   await archive.json(`requests/${String(round).padStart(6,'0')}.json`,record);
   onEvent({event:'request',taskId,round,gameSeconds:before.elapsed,contextRounds:record.contextRounds,prunedRounds:pruned});
   try{
    const thinkingStart=await env.state(),started=performance.now();
    const messages=context?.messages()??[{role:'user',content:[{type:'image_url',image_url:{url:`data:${staticOriginal?'image/png':'image/jpeg'};base64,${image.toString('base64')}`}}]}];
    if(realtime)await env.startRealtime(saveFrame);
    const response=previous?{raw:previous.reply,evaluatorFeedback:previous.evaluatorFeedback,usage:previous.usage,finishReason:previous.finishReason,attempts:previous.attempts,emptyResponseAttempts:previous.emptyResponseAttempts,modelResponse:previous.modelResponse}:
     await (realtime?Promise.race([policy(messages,{round,signal,taskId}),env.waitForTerminal()]):policy(messages,{round,signal,taskId}));
    if(response?.hostTerminal){record.kind='terminal_during_inference';record.after=await env.state();record.modelMs=performance.now()-started;result.rounds++;result.terminalDuringInference=true;break;}
    record.modelMs=performance.now()-started;record.reply=redact(response.raw);record.usage=response.usage;record.finishReason=response.finishReason;
    saveModelResponse(record,response,redact);
    if(response.transportAttempts)record.transportAttempts=response.transportAttempts.map(a=>({...a,error:redact(a.error)}));
    const afterThinking=await env.state();
    if(!realtime&&!frozenEqual(thinkingStart,afterThinking))throw Error('Game clock/actor/animation drift during inference');
    record.freezeVerified=!realtime;
    if(realtime)record.inferenceGameSeconds=afterThinking.elapsed-thinkingStart.elapsed;
    const feedback=contextMode==='external'&&typeof response.evaluatorFeedback==='string';
    if(feedback){record.kind='early_stop_feedback';record.evaluatorFeedback=response.evaluatorFeedback;}
    else{context?.reply(response.raw);policyTurns++;}
    // Native and static share the parser's single whole-reply JSON fence support.
    // Keep the original reply in history/archive; static single-action scoring is unchanged.
    const action=feedback?null:adapter.parse(response.raw);if(!feedback)record.action=action;
    if(journal)await journal.save(record,image,'response');
    onEvent({event:'action',taskId,round,modelMs:record.modelMs,usage:record.usage});
    signal?.throwIfAborted();
    // Trusted harness feedback consumes one decision round, without executing
    // input, advancing simulation, or releasing keys held across decisions.
    record.transition=feedback?{advanced:0,wallMs:0,heldKeys:[...(env.heldKeys??[])],heldButtons:[...(env.heldButtons??[])]}:await adapter.execute(env,action,saveFrame,{signal});
    record.after=await env.state();
    if(previous){
     if(previous.transition.advanced!==record.transition.advanced)throw Error(`Replay frame count diverged at round ${round}`);
     if(previous.transition.heldKeys&&JSON.stringify(previous.transition.heldKeys)!==JSON.stringify(record.transition.heldKeys))throw Error(`Replay held keys diverged at round ${round}`);
     if(previous.transition.heldButtons&&JSON.stringify(previous.transition.heldButtons)!==JSON.stringify(record.transition.heldButtons))throw Error(`Replay held buttons diverged at round ${round}`);
     verifyReplayState(previous.after,record.after,`round ${round} after`);
     record.replayed=true;record.originalModelMs=previous.modelMs;result.recovery.replayedRounds++;
     onEvent({event:'replay',taskId,round});
    }
    if(journal)await journal.save(record,image,'committed');
    committed.push({round,action:record.action,evaluatorFeedback:record.evaluatorFeedback,before:record.before,after:record.after,transition:record.transition});
    result.rounds++;
    if(feedback)result.earlyStopFeedbackRounds=(result.earlyStopFeedbackRounds??0)+1;
    onEvent({event:'round',taskId,round,gameSeconds:record.after.elapsed,prunedRounds:pruned,modelMs:record.modelMs,actionMs:record.transition.wallMs,advanced:record.transition.advanced});
   }catch(error){record.error=redact(error.message);saveModelResponse(record,error,redact);if(error.transportAttempts)record.transportAttempts=error.transportAttempts;if(error.modelResponseIncident)record.modelResponseIncident=error.modelResponseIncident;
    if(journal)await journal.save(record,image,'error');
    throw error;}
   finally{await archive.json(`rounds/${String(round).padStart(6,'0')}.json`,record);}
   if(record.after.complete||record.after.failed)break;
  }
  result.final=await env.state();result.success=!!result.final.complete;
  result.status=signal?.aborted?'interrupted':result.success?'success':result.final.failed?'task_failure':'round_limit';
  result.freezeVerified=realtime?false:await env.assertFrozen();
  if(env.errors.length||env.failedResources.length)throw Error('Browser resource/script errors; see diagnostics');
 }catch(error){result.success=false;result.status=env.incidentHeld?'render_anomaly':signal?.aborted?'interrupted':'error';result.error=redact(error.message);if(error.modelResponseIncident)result.modelResponseIncident=error.modelResponseIncident;}
 finally{
  if(realtime&&env.clockDiagnostics)try{result.realtimeDiagnostics=await env.clockDiagnostics();}catch(error){result.clockDiagnosticsError=redact(error.message);}
  if(realtime)try{await env.stopRealtime();}catch(error){result.success=false;result.status='error';result.clockStopError=redact(error.message);}
  // Also covers model/parse failures between rounds and round-budget exhaustion.
  // Release before the final observation/recording, not just when closing Chrome.
  if(!env.incidentHeld)try{await env.releaseInputs?.();}catch(error){result.success=false;result.status='error';result.inputReleaseError=redact(error.message);}
  if(!env.incidentHeld){
  try{
   result.final=await env.state();
   // Do not try to salvage a browser whose replay failed or an uncommitted action.
   if(recoveryFailed)throw Error('Final capture skipped after render recovery failure');
   const image=result.error?await env.observe({type:staticOriginal?'png':'jpeg'}):await observeHealthy();await archive.add(`observations/final.${staticOriginal?'png':'jpg'}`,image);
   result.final=await env.state();
   if(!videoFailed&&env.frames/60!==lastVideoTime)await saveFrame(image,env.frames/60);
  }catch(error){result.captureError=redact(error.message);result.success=false;result.status=signal?.aborted?'interrupted':'error';}
  }
  if(staticOriginal){
   try{
    const trace={...await env.staticTrace(),max_steps:maxRounds,model_steps:policyTurns,...(result.error?{execution_error:result.error}:{})};
    await archive.json('static-trace.json',trace);
    result.staticEvaluation=await replayStatic(taskId,trace,{executionError:!!result.error,trainingDataset:taskId.startsWith('rl-task-shooting-')?new URL(env.url).searchParams.get('trainingDataset'):null});
    if(!result.error&&(result.staticEvaluation.reward===1)!==!!result.final.complete)throw Error('Static replay outcome disagrees with page');
    result.success=result.staticEvaluation.reward===1;
   }catch(error){result.success=false;result.status='error';result.replayError=redact(error.message);}
  }
  result.simulatedSeconds=env.frames/60;result.pageErrors=env.errors;result.failedResources=env.failedResources;result.wallMs=performance.now()-began;
  result.rendererDiagnostics={requested:env.renderer,selected:env.selectedRenderer,fallbackReason:env.fallbackReason};
  if(!env.incidentHeld)await env.close().catch(error=>{result.closeError=redact(error.message);});
  await timeline.close();
  // Failed launches retain diagnostics, without inventing video evidence.
  try{
   if(video.frames&&!videoFailed){await video.finish();await archive.fileEntry('episode.mp4',video.file);result.video={file:'episode.mp4',frames:video.frames,fps:videoFPS,clock:staticOriginal?'action-steps':realtime?'real-time-simulation':'simulation',format:'H264/yuv420p/MP4',includesInferenceWait:realtime,maxEndPaddingSeconds:2/videoFPS};}
   else{await video.abort();result.video=null;}
  }catch(error){await video.abort();result.status='error';result.success=false;result.recordingError=redact(error.message);}
  await archive.fileEntry('video-frames.jsonl',path.join(temp,'video-frames.jsonl'));
  result.archive=name+'.tar.gz';
  if(env.incidentHeld){result.status='render_anomaly';result.success=false;result.final??=committed.at(-1)?.after??result.initial;result.finalStateSource='last-committed-or-initial; incident browser untouched';}
  await archive.json('result.json',result);await archive.finish();
  // Only newly-created temporary files, after durable archive completion.
  await fs.rm(temp,{recursive:true});
 }
 return result;
}
