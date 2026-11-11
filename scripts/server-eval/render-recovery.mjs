import {verifyReplayState} from './checkpoint.mjs';

/** A restart replays committed actions, never inference. Fail closed on drift.
 * Kept separate from archive/context so recovery cannot duplicate their rounds. */
export async function recoverRenderer({env,taskId,adapter,records,initial,build,signal}){
 signal?.throwIfAborted();
 const boot=await env.restart(taskId);
 if(boot.build!==build)throw Error('Render recovery game build mismatch');
 verifyReplayState(initial,await env.state(),'render recovery initial');
 for(const record of records){
  signal?.throwIfAborted();
  verifyReplayState(record.before,await env.state(),`render recovery ${record.round} before`);
  if(typeof record.evaluatorFeedback==='string'){
   verifyReplayState(record.after,await env.state(),`render recovery ${record.round} feedback`);
   continue;
  }
  // Keep the same render cadence, but do not append replay frames to the video.
  const transition=await adapter.execute(env,record.action,async()=>{},{signal});
  if(transition.advanced!==record.transition.advanced)throw Error('Render recovery frame count diverged');
  if(record.transition.heldKeys&&JSON.stringify(transition.heldKeys)!==JSON.stringify(record.transition.heldKeys))throw Error('Render recovery held keys diverged');
  if(record.transition.heldButtons&&JSON.stringify(transition.heldButtons)!==JSON.stringify(record.transition.heldButtons))throw Error('Render recovery held mouse buttons diverged');
  verifyReplayState(record.after,await env.state(),`render recovery ${record.round} after`);
 }
 await env.assertFrozen();
 return boot;
}

export async function healthyObservation({env,type='jpeg',recover,onFault,holdFirst=false}){
 for(;;){
  const image=await env.observe({type});
  if(!env.inspectRenderHealth||env.isStatic)return image;
  // The terminal dialog intentionally dims/blurs the canvas. Comparing that
  // final page with an unobscured canvas is not a compositor-health test, and
  // restarting here would overwrite an already committed game outcome.
  const terminal=await env.state?.();
  if(terminal?.active===false&&(terminal.complete||terminal.failed))return image;
  const first=await env.inspectRenderHealth(image);
  if(first.healthy)return image;
  // Diagnostic mode must not re-observe, restart or advance after first evidence.
  if(holdFirst){await onFault({first,second:first,image,confirmation:image});throw Error('Render incident held for debugging');}
  // A single bad/unfinished composite can settle without restarting Chrome.
  const confirmation=await env.observe({type});
  const second=await env.inspectRenderHealth(confirmation);
  if(second.healthy)return confirmation;
  await onFault({first,second,image,confirmation});
  await recover();
 }
}
