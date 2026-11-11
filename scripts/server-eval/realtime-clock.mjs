/** Trusted realtime simulation. Input timestamps survive delayed JS callbacks.
 * Every elapsed step is simulated, including terminal checks during catch-up. */
export function installRealtimeClock({wallClockPolicy='strict'}={}){
 const c=window.__SHENCHENGJI_CITY__,w=c.world;
 if(w.__evalRealtime)throw Error('Realtime clock already installed');
 const EPS=1e-6,waiters=[];
 const code=key=>({Shift:'ShiftLeft',Control:'ControlLeft',Space:'Space'}[key]??(key.startsWith('Numpad')?key:'Key'+key.toUpperCase()));
 const keyEvent=(type,key,repeat=false)=>window.dispatchEvent(new KeyboardEvent(type,{key,code:code(key),bubbles:true,repeat}));
 const edgeTriggered=key=>['f','v','g','e','q'].includes(key.toLowerCase());
 if(!['strict','input-duration-priority'].includes(wallClockPolicy))throw Error('Invalid realtime wall clock policy');
 const clock={version:wallClockPolicy==='strict'?'timestamped-input-catchup-v1':'timestamped-input-priority-v2',
  wallClockPolicy,wallElapsedMs:0,droppedIdleWallSeconds:0,fallbackActivated:false,degradationEvents:0,
  frames:0,simMs:0,wallMs:0,last:0,running:false,pending:null,error:null,
  remainder:0,loadingSeconds:0,maxLagSeconds:0,maxReleaseLateSeconds:0,maxContinuousReleaseLateSeconds:0,
  maxInputDispatchLateSeconds:0,maxAppliedDurationErrorSeconds:0,maxPumpGapMs:0,
  catchingUp:false,recoveries:0,catchupSince:null,catchupLimitSeconds:30,
  spans:{},recentLongWork:[],inputEvents:[],lastPumpAt:null};
 const loading=()=>!!(w.nativeFlightLoading||w.vehicleBoardingLoading);
 const terminal=()=>{const s=c.stats.nativeTask;return !s.active||s.complete||s.failed;};
 clock.noteSpan=(name,ms)=>{
  const s=clock.spans[name]??={count:0,totalMs:0,maxMs:0};s.count++;s.totalMs+=ms;s.maxMs=Math.max(s.maxMs,ms);
  if(ms>=50){clock.recentLongWork.push({name,ms,simulationSeconds:clock.simMs/1000});if(clock.recentLongWork.length>24)clock.recentLongWork.shift();}
 };
 const measure=(name,fn)=>{const began=performance.now();try{return fn();}finally{clock.noteSpan(name,performance.now()-began);}};
 const lag=()=>{clock.remainder=Math.max(0,(clock.wallMs-clock.simMs)/1000);clock.maxLagSeconds=Math.max(clock.maxLagSeconds,clock.remainder);};
 const sampleWall=()=>{
  const now=performance.now(),dt=Math.max(0,now-clock.last);clock.last=now;
  if(loading())clock.loadingSeconds+=dt/1000;else{clock.wallMs+=dt;clock.wallElapsedMs+=dt;}
  lag();return now;
 };
 // Under persistent overload, compress only simulation debt with no held
 // inputs. Active key intervals are never shortened, stretched or skipped.
 // Wall/simulation equivalence is explicitly relinquished and measured.
 const relaxIdleDebt=()=>{
  if(!clock.fallbackActivated)return;
  const p=clock.pending;if(p?.started)return;
  const drop=Math.min(Math.max(0,clock.wallMs-clock.simMs-1000),p?Math.max(0,p.startMs-clock.simMs):Infinity);
  if(drop<=EPS)return;
  clock.wallMs-=drop;clock.droppedIdleWallSeconds+=drop/1000;
  if(p){p.startMs-=drop;p.endMs-=drop;for(const e of p.events)e.at-=drop;}
  for(const waiter of waiters)waiter.target=Math.max(clock.simMs,waiter.target-drop);
  lag();
 };
 const logInput=(type,key,at)=>{
  const entry={type,key,scheduledSeconds:at/1000,appliedSeconds:clock.simMs/1000,
   dispatchLateSeconds:Math.max(0,(clock.wallMs-at)/1000)};
  clock.maxInputDispatchLateSeconds=Math.max(clock.maxInputDispatchLateSeconds,entry.dispatchLateSeconds);
  clock.inputEvents.push(entry);if(clock.inputEvents.length>128)clock.inputEvents.shift();
 };
 const releaseKey=(p,key,interrupted=false)=>{
  if(!p.keys.includes(key))return;
  keyEvent('keyup',key);p.keys=p.keys.filter(k=>k!==key);
  const deadline=p.deadlines.find(k=>k.key===key),requestedSeconds=deadline.frames/60;
  const appliedSeconds=(clock.simMs-p.startMs)/1000;
  const actualSeconds=(performance.now()-p.deliveredStartWall)/1000;
  const lateSeconds=Math.max(0,actualSeconds-requestedSeconds);
  const dispatchLateSeconds=Math.max(0,(clock.wallMs-(p.startMs+deadline.frames*1000/60))/1000);
  clock.maxReleaseLateSeconds=Math.max(clock.maxReleaseLateSeconds,lateSeconds);
  if(!edgeTriggered(key))clock.maxContinuousReleaseLateSeconds=Math.max(clock.maxContinuousReleaseLateSeconds,lateSeconds);
  if(!interrupted)clock.maxAppliedDurationErrorSeconds=Math.max(clock.maxAppliedDurationErrorSeconds,Math.abs(appliedSeconds-requestedSeconds));
  p.keyTimings.push({key,requestedSeconds,appliedSeconds,actualSeconds,lateSeconds,dispatchLateSeconds,
   edgeTriggered:edgeTriggered(key),interrupted});
  logInput('keyup',key,p.startMs+deadline.frames*1000/60);
 };
 const finishAction=(reason=null)=>{
  const p=clock.pending;if(!p)return;
  for(const key of [...p.keys])releaseKey(p,key,true);
  clock.pending=null;
  p.resolve({advanced:p.started?(clock.simMs-p.startMs)*60/1000:0,
   inputTiming:{policy:clock.version,wallSeconds:(performance.now()-p.acceptedWall)/1000,
    scheduledStartSeconds:p.startMs/1000,scheduledEndSeconds:p.endMs/1000,
    appliedStartSeconds:p.started?p.startMs/1000:null,appliedEndSeconds:clock.simMs/1000,
    cancelledBeforeStart:!p.started,termination:reason,keyTimings:p.keyTimings,
    maxReleaseLateSeconds:Math.max(0,...p.keyTimings.map(k=>k.lateSeconds)),
    maxAppliedDurationErrorSeconds:Math.max(0,...p.keyTimings.filter(k=>!k.interrupted).map(k=>Math.abs(k.appliedSeconds-k.requestedSeconds)))}});
 };
 const settleWaiters=()=>{for(let i=waiters.length-1;i>=0;i--){const item=waiters[i];
  if(clock.error||!clock.running||clock.simMs+EPS>=item.target){waiters.splice(i,1);clock.error?item.reject(Error(clock.error)):item.resolve({frames:clock.frames,lagSeconds:clock.remainder});}
 }};
 clock.start=()=>{if(!clock.running&&!clock.error){clock.running=true;clock.last=performance.now();clock.lastPumpAt=clock.last;}};
 clock.stop=()=>{clock.running=false;finishAction(terminal()?'game-terminal':'clock-stopped');settleWaiters();};
 let notified=false;
 const notify=error=>{if(!notified){notified=true;void window.__evalRealtimeTerminal(error);}};
 const fail=message=>{
  clock.failure={lagSeconds:clock.remainder,loadingSeconds:clock.loadingSeconds,
   catchupSeconds:clock.catchupSince===null?0:(performance.now()-clock.catchupSince)/1000,
   action:clock.pending?{startSeconds:clock.pending.startMs/1000,deadlines:clock.pending.deadlines,started:clock.pending.started}:null,
   spans:JSON.parse(JSON.stringify(clock.spans)),recentLongWork:[...clock.recentLongWork],inputEvents:[...clock.inputEvents]};
  clock.error=message;clock.stop();notify(message);
 };
 const applyEvent=(p,event)=>{
  if(event.type==='start'){
   p.started=true;p.deliveredStartWall=performance.now();
   for(const {key}of p.deadlines){p.keys.push(key);keyEvent('keydown',key);logInput('keydown',key,event.at);}
  }else if(event.type==='release')releaseKey(p,event.key);
  else finishAction();
 };
 const pump=()=>{
  if(!clock.running)return;
  try{
   const now=sampleWall();
   clock.maxPumpGapMs=Math.max(clock.maxPumpGapMs,now-(clock.lastPumpAt??now));clock.lastPumpAt=now;
   if(loading()){clock.catchupSince=null;return;}
   if(terminal()){clock.stop();notify();return;}
   if(clock.remainder>.15){
    clock.catchingUp=true;clock.catchupSince??=now;
    // A single blocking render is recoverable. Only sustained inability to
    // catch up fails; accumulated simulation time is never discarded.
    if(now-clock.catchupSince>clock.catchupLimitSeconds*1000){
     if(clock.wallClockPolicy==='strict')throw Error('Realtime simulation could not catch up within 30 seconds');
     if(!clock.fallbackActivated){clock.fallbackActivated=true;clock.degradationEvents++;}
    }
   }
   relaxIdleDebt();
   const target=clock.wallMs,began=performance.now();let iterations=0;
   while(!terminal()&&!loading()){
    if(iterations++>0&&performance.now()-began>(clock.catchingUp?20:12))break;
    const p=clock.pending,event=p?.events[0];
    if(event&&event.at<=clock.simMs+EPS){p.events.shift();applyEvent(p,event);continue;}
    const waiterBoundary=waiters.length?Math.min(...waiters.map(x=>x.target).filter(t=>t>clock.simMs+EPS)):Infinity;
    const end=Math.min(clock.simMs+50,event?.at??Infinity,waiterBoundary);
    if(end>target+EPS)break;
    const dt=(end-clock.simMs)/1000;if(dt<=0)throw Error('Non-monotonic realtime input timeline');
    const aircraft=!!w.flight?.active;
    if(aircraft?w.taskFlightPaused:w.paused)throw Error('Unexpected paused realtime environment');
    if(p?.started){
     const epoch=w.nativeFlightTransitionId??0;
     if(epoch!==w.__evalFlightInputEpoch){for(const key of p.keys)keyEvent('keydown',key,true);w.__evalFlightInputEpoch=epoch;}
    }
    w.engine._deltaTime=dt*1000;measure('update',()=>w.update(dt));
    measure('animate',()=>{w.scene.onBeforeAnimationsObservable.notifyObservers(w.scene);w.scene._animationRatio=dt*60;
     w.scene._animate(dt*1000);w.scene.onAfterAnimationsObservable.notifyObservers(w.scene);});
    clock.simMs=end;clock.frames=end*60/1000;lag();settleWaiters();
   }
   lag();
   if(clock.catchingUp&&clock.remainder<=.05+EPS){clock.catchingUp=false;clock.catchupSince=null;clock.recoveries++;}
   settleWaiters();
   if(terminal()){clock.stop();notify();}
  }catch(error){fail(error.message);}
 };
 clock.schedule=(keys,total)=>{
  if(clock.error)return Promise.reject(Error(clock.error));
  if(!clock.running||terminal())return Promise.resolve({advanced:0});
  if(clock.pending)throw Error('Concurrent realtime action');
  sampleWall();
  return new Promise(resolve=>{
   const startMs=clock.wallMs,endMs=startMs+total*1000/60;
   clock.pending={startMs,endMs,keys:[],deadlines:keys,resolve,acceptedWall:performance.now(),started:false,keyTimings:[],
    events:[{type:'start',at:startMs},...keys.map(k=>({type:'release',key:k.key,at:startMs+k.frames*1000/60})),{type:'finish',at:endMs}]
     .sort((a,b)=>a.at-b.at)};
   pump();
  });
 };
 // Admission barrier for instantaneous camera/button operations and fresh
 // observations. The fixed target avoids chasing a moving wall deadline.
 clock.synchronize=()=>{
  if(clock.error)return Promise.reject(Error(clock.error));
  if(!clock.running)return Promise.resolve({frames:clock.frames,lagSeconds:clock.remainder});
  sampleWall();
  return new Promise((resolve,reject)=>{waiters.push({target:clock.wallMs,resolve,reject});pump();});
 };
 clock.diagnostics=()=>({version:clock.version,frames:clock.frames,error:clock.error,failure:clock.failure??null,
  wallClockPolicy:clock.wallClockPolicy,wallElapsedSeconds:clock.wallElapsedMs/1000,simulatedSeconds:clock.simMs/1000,
  fallbackActivated:clock.fallbackActivated,degradationEvents:clock.degradationEvents,droppedIdleWallSeconds:clock.droppedIdleWallSeconds,
  lagSeconds:clock.remainder,maxLagSeconds:clock.maxLagSeconds,loadingSeconds:clock.loadingSeconds,
  catchingUp:clock.catchingUp,recoveries:clock.recoveries,maxPumpGapMs:clock.maxPumpGapMs,
  maxReleaseLateSeconds:clock.maxReleaseLateSeconds,maxContinuousReleaseLateSeconds:clock.maxContinuousReleaseLateSeconds,
  maxInputDispatchLateSeconds:clock.maxInputDispatchLateSeconds,maxAppliedDurationErrorSeconds:clock.maxAppliedDurationErrorSeconds,
  spans:clock.spans,recentLongWork:clock.recentLongWork});
 clock.timer=setInterval(pump,8);w.__evalRealtime=clock;
}
