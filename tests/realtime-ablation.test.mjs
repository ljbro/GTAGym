import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {createRequire} from 'node:module';
import {installRealtimeClock} from '../scripts/server-eval/realtime-clock.mjs';
import {realtimeRoundBudget,realtimeRules} from '../scripts/server-eval/realtime-policy.mjs';
import {taskTimeLimitEnabled,stepWithTimePolicy} from '../native-city/src/native-eval-time-policy.ts';
import {batchVariant} from '../scripts/codex-eval/batch-variant.mjs';
import {runEpisode} from '../scripts/server-eval/episode.mjs';
import {createActionAdapter} from '../scripts/server-eval/actions.mjs';
import {RealtimeServerEnvironment} from '../scripts/server-eval/realtime-environment.mjs';

function fixture(options={}){
 let now=0,tick;const keys=new Set(),events=[],notifications=[];
 const state={active:true,complete:false,failed:false},observable={notifyObservers(){}};
 const world={keys,engine:{},scene:{onBeforeAnimationsObservable:observable,onAfterAnimationsObservable:observable,_animate(){}},
  elapsed:0,npcDistance:0,wSeconds:0,sprintSeconds:0,costMs:0,
  update(dt){this.elapsed+=dt;this.npcDistance+=dt*18;if(keys.has('w'))this.wSeconds+=dt;if(keys.has('Shift'))this.sprintSeconds+=dt;
   this.afterUpdate?.(dt);now+=this.costMs;}};
 const window={__SHENCHENGJI_CITY__:{world,stats:{nativeTask:state}},__evalRealtimeTerminal:e=>notifications.push(e??'terminal'),
  dispatchEvent(e){events.push(e);if(e.type==='keydown')keys.add(e.key);else keys.delete(e.key);}};
 vm.runInNewContext('('+installRealtimeClock.toString()+')('+JSON.stringify(options)+')', {window,performance:{now:()=>now},
  setInterval(fn){tick=fn;return 1;},KeyboardEvent:class{constructor(type,values){Object.assign(this,{type},values);}}});
 return {world,keys,events,notifications,state,clock:world.__evalRealtime,
  advance(ms){now+=ms;tick();},stall(ms){now+=ms;},pulse(){tick();}};
}
const near=(a,b)=>assert(Math.abs(a-b)<1e-7,`${a} != ${b}`);
test('inference without keys advances NPCs and physics in wall-clock time',()=>{
 const f=fixture();f.clock.start();f.advance(1000);
 near(f.clock.frames,60);near(f.world.npcDistance,18);assert.equal(f.keys.size,0);
});
test('independent input deadlines are exact even across a twelve-second browser stall',async()=>{
 const f=fixture();f.clock.start();const pending=f.clock.schedule([{key:'w',frames:60},{key:'Shift',frames:12}],60);
 f.advance(12000);const result=await pending;
 near(f.world.wSeconds,1);near(f.world.sprintSeconds,.2);near(f.world.npcDistance,216);
 near(result.advanced,60);assert.equal(f.keys.size,0);assert.equal(f.clock.error,null);
 assert(result.inputTiming.maxReleaseLateSeconds>10,'physical delivery delay remains visible');
 near(result.inputTiming.maxAppliedDurationErrorSeconds,0);assert.equal(f.clock.recoveries,1);
});
test('new input cannot act retroactively on accumulated no-input history',async()=>{
 const f=fixture();f.clock.start();f.stall(5000);
 const pending=f.clock.schedule([{key:'w',frames:60}],60);near(f.world.elapsed,5);near(f.world.wSeconds,0);
 f.advance(1000);await pending;near(f.world.elapsed,6);near(f.world.wSeconds,1);
});
test('asset loading excludes only its own time and terminal states notify while thinking',()=>{
 const f=fixture();f.clock.start();f.world.vehicleBoardingLoading=true;f.advance(1000);assert.equal(f.clock.frames,0);
 f.world.vehicleBoardingLoading=false;f.advance(500);near(f.clock.frames,30);
 f.state.failed=true;f.state.active=false;f.advance(50);assert.deepEqual(f.notifications,['terminal']);assert(!f.clock.running);
});
test('one long stall is recovered without skipping simulation time',()=>{
 const f=fixture();f.clock.start();f.advance(31000);
 assert.equal(f.clock.error,null);near(f.world.elapsed,31);near(f.clock.frames,1860);
 assert.equal(f.clock.recoveries,1);assert.equal(f.clock.maxLagSeconds,31);
});
test('sustained simulation overload still fails with diagnostic evidence',()=>{
 const f=fixture();f.world.costMs=80;f.clock.start();
 for(let i=0;i<500&&!f.clock.error;i++)f.advance(50);
 assert.match(f.clock.error,/could not catch up/);assert(!f.clock.running);
 assert(f.clock.failure.catchupSeconds>=30);assert(f.clock.failure.spans.update.maxMs>=80);
});
test('input-duration priority survives sustained overload and records skipped idle wall time',()=>{
 const f=fixture({wallClockPolicy:'input-duration-priority'});f.world.costMs=80;f.clock.start();
 for(let i=0;i<900;i++)f.advance(50);
 assert.equal(f.clock.error,null);assert(f.clock.running);assert(f.clock.fallbackActivated);
 assert(f.clock.droppedIdleWallSeconds>0);near(f.world.npcDistance,f.world.elapsed*18);
 assert.equal(f.clock.diagnostics().wallClockPolicy,'input-duration-priority');
 near((f.clock.wallElapsedMs-f.clock.wallMs)/1000,f.clock.droppedIdleWallSeconds);
});
test('fallback never skips a held interval, including independently timed keys',async()=>{
 const f=fixture({wallClockPolicy:'input-duration-priority'});f.world.costMs=2000;f.clock.start();
 const pending=f.clock.schedule([{key:'w',frames:60},{key:'Shift',frames:12}],60);
 for(let i=0;i<40;i++)f.advance(50);
 const result=await pending;
 assert.equal(f.clock.error,null);assert(f.clock.fallbackActivated);assert(f.clock.droppedIdleWallSeconds>0);
 near(f.world.wSeconds,1);near(f.world.sprintSeconds,.2);near(result.inputTiming.maxAppliedDurationErrorSeconds,0);
 assert.equal(f.keys.size,0);
});
test('fallback can compress waiting debt without changing a not-yet-started action',async()=>{
 const f=fixture({wallClockPolicy:'input-duration-priority'});f.clock.start();
 f.clock.fallbackActivated=true;f.stall(8000);
 const pending=f.clock.schedule([{key:'w',frames:60}],60);near(f.world.wSeconds,0);
 f.advance(1000);const result=await pending;near(f.world.wSeconds,1);
 assert(f.clock.droppedIdleWallSeconds>=7);near(result.inputTiming.maxAppliedDurationErrorSeconds,0);
});
test('a terminal reached during backlog cancels an action that has not started',async()=>{
 const f=fixture();f.world.afterUpdate=()=>{if(f.world.elapsed>=.5-1e-8){f.state.failed=true;f.state.active=false;}};
 f.clock.start();f.stall(5000);const result=await f.clock.schedule([{key:'w',frames:60}],60);
 assert.equal(result.inputTiming.cancelledBeforeStart,true);near(f.world.elapsed,.5);near(f.world.wSeconds,0);
 assert.equal(f.events.length,0);assert.deepEqual(f.notifications,['terminal']);assert.equal(f.clock.error,null);
});
test('terminal conditions interrupt a held action at the actual terminal simulation step',async()=>{
 const f=fixture();f.world.afterUpdate=()=>{if(f.world.elapsed>=.35-1e-8){f.state.complete=true;f.state.active=false;}};
 f.clock.start();const pending=f.clock.schedule([{key:'w',frames:60}],60);f.advance(8000);
 const result=await pending;near(f.world.wSeconds,.35);assert.equal(f.keys.size,0);
 assert.equal(result.inputTiming.termination,'game-terminal');assert.equal(result.inputTiming.keyTimings[0].interrupted,true);
});
test('normal actions retain wall delivery and simulation-duration measurements',async()=>{
 const f=fixture();f.clock.start();const pending=f.clock.schedule([{key:'w',frames:60},{key:'Shift',frames:12}],60);
 for(let i=0;i<20;i++)f.advance(50);
 const result=await pending;near(result.advanced,60);near(result.inputTiming.maxReleaseLateSeconds,0);
 assert.deepEqual(JSON.parse(JSON.stringify(result.inputTiming.keyTimings.map(k=>[k.key,k.appliedSeconds]))),[['Shift',.2],['w',1]]);
});
test('single-edge interactions are not repeated during catch-up',async()=>{
 const f=fixture();f.clock.start();const pending=f.clock.schedule([{key:'f',frames:12}],12);f.advance(5000);await pending;
 assert.equal(f.events.filter(e=>e.type==='keydown'&&e.key==='f'&&!e.repeat).length,1);
 assert.equal(f.clock.error,null);assert.equal(f.keys.size,0);
});
test('pre-action fractional remainder cannot lengthen or shorten the input',async()=>{
 const f=fixture();f.clock.start();f.advance(40);const pending=f.clock.schedule([{key:'w',frames:60}],60);
 near(f.world.elapsed,.04);near(f.world.wSeconds,0);f.advance(960);assert(f.keys.has('w'));
 f.advance(40);const result=await pending;near(result.inputTiming.keyTimings[0].appliedSeconds,1);near(f.world.wSeconds,1);
});
test('an exact synchronization barrier includes the fractional remaining time',async()=>{
 const f=fixture();f.clock.start();f.stall(1234);await f.clock.synchronize();near(f.world.elapsed,1.234);near(f.clock.remainder,0);
});
test('video yields to a lagging clock, while a recovered clock renders a new frame',async()=>{
 const env=Object.create(RealtimeServerEnvironment.prototype),previous=Buffer.from('previous'),fresh=Buffer.from('fresh');
 let lagSeconds=.4,renders=0;const frames=[];
 Object.assign(env,{lastRecordedImage:previous,state:async()=>({realtimeClock:{lagSeconds}}),
  observe:async()=>{renders++;return fresh;},recordRealtimeFrame:async image=>frames.push(image),rejectTerminal:e=>{throw e;}});
 await env.captureRealtimeFrame();assert.equal(renders,0);assert.equal(frames[0],previous);assert.equal(env.deferredVideoCaptures,1);assert.equal(env.capturing,false);
 lagSeconds=.05;await env.captureRealtimeFrame();assert.equal(renders,1);assert.equal(frames[1],fresh);
});
test('video yields to an active keyboard window even when physics is on time',async()=>{
 const env=Object.create(RealtimeServerEnvironment.prototype),previous=Buffer.from('previous');
 let renders=0;const frames=[];
 Object.assign(env,{actionScheduling:true,lastRecordedImage:previous,state:async()=>({realtimeClock:{lagSeconds:0}}),
  observe:async()=>{renders++;return Buffer.from('should not render');},recordRealtimeFrame:async image=>frames.push(image),
  rejectTerminal:e=>{throw e;}});
 await env.captureRealtimeFrame();assert.equal(renders,0);assert.equal(frames[0],previous);
 assert.equal(env.deferredVideoCaptures,1);assert.equal(env.capturing,false);
});
test('a queued capture finishes before realtime input is armed and the guard always clears',async()=>{
 const env=Object.create(RealtimeServerEnvironment.prototype),order=[];let releaseCapture;
 Object.assign(env,{observationQueue:new Promise(resolve=>{releaseCapture=resolve;}),
  heldKeys:new Set(),heldButtons:new Set(),synchronizeRealtime:async()=>{order.push('catchup');},state:async()=>({active:true,complete:false,failed:false}),
  evaluate:async()=>{order.push('schedule');return {advanced:60};}});
 const input=[{frames:60,keys:['w'],mouse:{dx:0,dy:0}}];
 const pending=env.stepSequence(input);await Promise.resolve();assert.equal(env.actionScheduling,true);
 assert.deepEqual(order,[]);await assert.rejects(()=>env.stepSequence(input),/Concurrent realtime action/);
 order.push('capture-finished');releaseCapture();assert.equal((await pending).advanced,60);
 assert.deepEqual(order,['capture-finished','catchup','schedule']);assert.equal(env.actionScheduling,false);
 env.state=async()=>{throw Error('fixture state error');};
 await assert.rejects(()=>env.stepSequence(input),/fixture state error/);assert.equal(env.actionScheduling,false);
});
test('realtime health compares each screenshot only to its own serialized canvas readback',async()=>{
 const sharp=createRequire(import.meta.url)('sharp');
 const frames=await Promise.all(['#253030','#158025'].map(background=>sharp({create:{width:240,height:360,channels:3,background}}).png().toBuffer()));
 const env=Object.create(RealtimeServerEnvironment.prototype),order=[];
 Object.assign(env,{observationQueue:Promise.resolve(),observationReferences:new WeakMap(),queuedObservations:0,synchronizeRealtime:async()=>{}});
 let probe=0,shot=0;
 env.evaluate=async()=>{const n=probe++;order.push('readback-'+n);return {region:{left:0,top:0,width:240,height:360},map:{x:24,y:160,width:192,height:192},reference:'data:image/png;base64,'+frames[n].toString('base64'),frames:n};};
 env.page={screenshot:async()=>{const n=shot++;await new Promise(r=>setTimeout(r,5));order.push('screenshot-'+n);return frames[n];}};
 const images=await Promise.all([env.observe(),env.observe()]);
 assert.deepEqual(order,['readback-0','screenshot-0','readback-1','screenshot-1']);
 for(const [i,image]of images.entries()){
  const health=await env.inspectRenderHealth(image);assert.equal(health.healthy,true);assert.equal(health.referenceFrame,i);assert.equal(health.sameFrameReference,true);
 }
 assert.equal(probe,2,'health check must not render a later frame');assert.equal(env.queuedObservations,0);
});
test('untimed opt-out restores the original calibrated duration even on an exception',()=>{
 const mission={maxDuration:20};
 assert.equal(stepWithTimePolicy(mission,false,()=>mission.maxDuration),Infinity);assert.equal(mission.maxDuration,20);
 assert.equal(stepWithTimePolicy(mission,true,()=>mission.maxDuration),20);
 assert.throws(()=>stepWithTimePolicy(mission,false,()=>{throw Error('step failed');}));assert.equal(mission.maxDuration,20);
});
test('round budgets and natural termination policy are explicit and baseline remains timed',()=>{
 assert.equal(realtimeRoundBudget(73.633).maxRounds,74);assert.equal(realtimeRoundBudget(150).maxRounds,150);
 assert.equal(realtimeRoundBudget(0).maxRounds,300);assert.throws(()=>realtimeRoundBudget(Infinity));
 for(const c of ['chase','follow','escape'])assert(taskTimeLimitEnabled(c,'round-budget'));
 for(const c of ['indoor','outdoor-road','outdoor-foot','water','stairs','air']){
  assert(!taskTimeLimitEnabled(c,'round-budget'));assert(taskTimeLimitEnabled(c,'task-defined'));
 }
 for(const id of ['c01-n04','c01-n05','c01-n06','c01-n17','c01-n18','c06-n09','c06-n05'])assert(taskTimeLimitEnabled('outdoor-road','round-budget',id));
 assert.throws(()=>batchVariant({harness:'codex',clockMode:'realtime'},['c11-n99']));
 assert(realtimeRules('Keys held through the end of a turn retain their state. Including the same key in the next turn continues the hold.').includes('game continues running'));
});
test('a game ending during an unfinished model response gets its normal outcome and one round',async t=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'gta-realtime-test-'));t.after(()=>fs.rm(dir,{recursive:true,force:true}));
 const sharp=createRequire(import.meta.url)('sharp');
 const jpeg=await sharp({create:{width:1280,height:720,channels:3,background:'#123456'}}).jpeg().toBuffer();
 let done=false,resolve;const terminal=new Promise(r=>{resolve=r;});
 const env={clockMode:'realtime',frames:0,errors:[],failedResources:[],renderer:'gpu',selectedRenderer:'gpu',
  open:async()=>({renderer:'gpu'}),reset:async()=>{},state:async()=>({active:!done,failed:done,complete:false,maxDuration:2,elapsed:done?2:0}),
  observe:async()=>jpeg,startRealtime:async()=>{setTimeout(()=>{done=true;env.frames=120;resolve({hostTerminal:true});},20);},
  waitForTerminal:()=>terminal,stopRealtime:async()=>{},releaseInputs:async()=>{},close:async()=>{}};
 const result=await runEpisode({env,taskId:'c01-n04',system:'Rules',instruction:'Drive.',adapter:createActionAdapter(),
  policy:async()=>new Promise(()=>{}),maxRounds:300,output:dir,name:'test',contextMode:'external'});
 assert.equal(result.status,'task_failure');assert.equal(result.rounds,1);assert.equal(result.maxRounds,2);
 assert.equal(result.terminalDuringInference,true);assert.equal(result.video.includesInferenceWait,true);
});
