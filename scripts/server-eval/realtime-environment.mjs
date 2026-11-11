import {ServerEnvironment} from './environment.mjs';
import {installRealtimeClock} from './realtime-clock.mjs';
import {moveRelative} from './move-relative.mjs';
import {validateAction} from './protocol.mjs';
import {selectBrowserGPU,verifyBrowserGPU} from './browser-affinity.mjs';
import {existsSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {installRealtimeGeometry} from './realtime-geometry.mjs';
import {installRealtimeMaterials} from './realtime-materials.mjs';
import {inspectMinimapSpill} from './render-health.mjs';

export class RealtimeServerEnvironment extends ServerEnvironment{
 constructor(options){super(options);this.clockMode='realtime';this.recording=Promise.resolve();this.terminal=new Promise((resolve,reject)=>{this.resolveTerminal=resolve;this.rejectTerminal=reject;});this.terminal.catch(()=>{});
  this.graphicsDevice=selectBrowserGPU(Number(process.env.GTA_REALTIME_GPU_INDEX??0));
  const runtime=fileURLToPath(new URL('../../.cache/realtime-graphics-runtime/',import.meta.url));
  if(existsSync(runtime+'VkLayer_MESA_device_select.json'))process.env.VK_LAYER_PATH=[runtime,process.env.VK_LAYER_PATH].filter(Boolean).join(':');
  Object.assign(process.env,{DRI_PRIME:this.graphicsDevice.prime,MESA_VK_DEVICE_SELECT_FORCE_DEFAULT_DEVICE:'1',VK_INSTANCE_LAYERS:'VK_LAYER_MESA_device_select'});
  this.diagnosticBrowserArgs=['--use-angle=vulkan'];
  this.observationQueue=Promise.resolve();this.observationReferences=new WeakMap();this.queuedObservations=0;
 }
 async open(){const report=await super.open();this.gpuPlacement=await verifyBrowserGPU(this.browser,this.graphicsDevice);return {...report,gpuPlacement:this.gpuPlacement};}
 async reset(id){
  if(/^c(?:10|11)-n/.test(id)||id.startsWith('rl-'))throw Error('Realtime ablation requires a native 3D benchmark task');
  const initial=await super.reset(id);
  if(!await this.evaluate(()=>window.__SHENCHENGJI_CITY__.stats.nativeTask.evaluationTimePolicy))throw Error('Game build does not support round-budget timing policy');
  this.geometryIndex=await this.evaluate(installRealtimeGeometry);
  this.materialOptimization=await this.evaluate(installRealtimeMaterials);
  await this.page.exposeFunction('__evalRealtimeTerminal',error=>error?this.rejectTerminal(Error(error)):this.resolveTerminal({hostTerminal:true}));
  await this.evaluate(installRealtimeClock,{wallClockPolicy:'input-duration-priority'});
  // The autonomous clock advances animation; screenshot rendering must not run a second zero-time animation pass.
  await this.evaluate(()=>{window.__SHENCHENGJI_CITY__.world.scene.animate=()=>{};});return initial;
 }
 async render(){
  if(!this.ready)throw Error('Server game did not finish loading; no observation available');
  await this.evaluate(()=>{const w=window.__SHENCHENGJI_CITY__.world;if(w.engine._gl?.isContextLost())throw Error('WebGL context lost');w.refreshNavigation?.();w.engine._deltaTime=0;w.scene.render();});
 }
 async observe({type='png',quality=80}={}){
  // Serialize policy/video captures. Physics keeps running, but no other
  // scene.render() may replace the WebGL canvas between readback and screenshot.
  this.queuedObservations++;
  const capture=this.observationQueue.then(async()=>{
   const admission=performance.now();await this.synchronizeRealtime();this.noteHostSpan('observationCatchup',performance.now()-admission);
   const probe=await this.evaluate(()=>{
    const w=window.__SHENCHENGJI_CITY__.world;
    if(w.engine._gl?.isContextLost())throw Error('WebGL context lost during capture');
    let t=performance.now();w.refreshNavigation?.();w.__evalRealtime?.noteSpan('navigation',performance.now()-t);
    w.engine._deltaTime=0;t=performance.now();w.scene.render();w.__evalRealtime?.noteSpan('render',performance.now()-t);
    t=performance.now();
    const map=document.querySelector('#minimap'),game=document.querySelector('#game');
    if(!map||!game||getComputedStyle(map).display==='none')return null;
    const m=map.getBoundingClientRect(),g=game.getBoundingClientRect();if(!m.width||!m.height||!g.width||!g.height)return null;
    const left=Math.max(0,Math.floor(m.x-32)),top=Math.max(0,Math.floor(m.y-m.height*.8));
    const region={left,top,width:Math.min(innerWidth,Math.ceil(m.right+16))-left,height:Math.min(innerHeight,Math.ceil(m.bottom+24))-top};
    const canvas=document.createElement('canvas');canvas.width=region.width;canvas.height=region.height;
    const ctx=canvas.getContext('2d',{willReadFrequently:true});
    ctx.drawImage(game,(left-g.x)*game.width/g.width,(top-g.y)*game.height/g.height,region.width*game.width/g.width,region.height*game.height/g.height,0,0,region.width,region.height);
    const reference=canvas.toDataURL('image/png');w.__evalRealtime?.noteSpan('readback',performance.now()-t);
    return {region,map:m.toJSON(),reference,frames:w.__evalRealtime?.frames??0};
   });
   const screenshotStart=performance.now();let image;
   try{image=await this.page.screenshot({type,...type==='jpeg'?{quality}:{},timeout:60000});}
   finally{this.noteHostSpan('screenshot',performance.now()-screenshotStart);}
   if(probe)this.observationReferences.set(image,{...probe,reference:Buffer.from(probe.reference.split(',')[1],'base64')});
   return image;
  });
  this.observationQueue=capture.catch(()=>{});
  try{return await capture;}finally{this.queuedObservations--;}
 }
 noteHostSpan(name,ms){const spans=this.hostSpans??={},s=spans[name]??={count:0,totalMs:0,maxMs:0};s.count++;s.totalMs+=ms;s.maxMs=Math.max(s.maxMs,ms);}
 async synchronizeRealtime(){return this.evaluate(()=>window.__SHENCHENGJI_CITY__.world.__evalRealtime?.synchronize());}
 async inspectRenderHealth(image){
  const probe=this.observationReferences.get(image);
  // Never compare a moving screenshot with a newly rendered, later frame.
  if(!probe)return {healthy:true,skipped:'no-visible-minimap'};
  return {...await inspectMinimapSpill(image,probe),referenceFrame:probe.frames,sameFrameReference:true};
 }
 async startRealtime(onFrame){
  if(this.realtimeStarted)return;this.realtimeStarted=true;
  this.onRealtimeFrame=onFrame;this.recordedVideoIndex=0;
  await this.evaluate(()=>window.__SHENCHENGJI_CITY__.world.__evalRealtime.start());
  this.captureTimer=setInterval(()=>{
   if(this.capturing||this.clockStopped||this.queuedObservations||this.actionScheduling)return;this.capturing=true;
   this.recording=this.captureRealtimeFrame();
  },1000/this.videoFPS);
 }
 async captureRealtimeFrame(){
  try{
   const state=await this.state();
   // Video is optional work. Give the physics clock room to catch up before
   // rendering again; model observations still always render a fresh image.
   if(this.actionScheduling||state.realtimeClock?.catchingUp||state.realtimeClock?.lagSeconds>.15){
    this.deferredVideoCaptures=(this.deferredVideoCaptures??0)+1;
    if(this.lastRecordedImage)await this.recordRealtimeFrame(this.lastRecordedImage);
    return;
   }
   const image=await this.observe({type:'jpeg'});await this.state();await this.recordRealtimeFrame(image);
  }catch(e){this.rejectTerminal(e);}finally{this.capturing=false;}
 }
 async recordRealtimeFrame(image){
  const target=Math.floor(this.frames*this.videoFPS/60);
  while(this.recordedVideoIndex<target){this.recordedVideoIndex++;await this.onRealtimeFrame(this.recordedVideoIndex===target?image:this.lastRecordedImage??image,this.recordedVideoIndex/this.videoFPS);}
  this.lastRecordedImage=image;
 }
 async stopRealtime(){
  if(this.clockStopped)return;this.clockStopped=true;clearInterval(this.captureTimer);
  if(this.ready&&!this.broken)await this.evaluate(()=>window.__SHENCHENGJI_CITY__.world.__evalRealtime?.stop());
  await this.recording;
  if(this.realtimeStarted&&this.ready&&!this.broken){const image=await this.observe({type:'jpeg'});await this.state();await this.recordRealtimeFrame(image);}
 }
 waitForTerminal(){return this.terminal;}
 async clockDiagnostics(){
  const simulation=await this.evaluate(()=>{const w=window.__SHENCHENGJI_CITY__.world,clock=w.__evalRealtime;
   return clock?{...clock.diagnostics(),geometry:w.__evalGeometryIndex,materials:w.__evalMaterialDiagnostics}:null;});
  return simulation?{...simulation,hostSpans:this.hostSpans??{}}:null;
 }
 async state(){
  const state=await super.state();
  const clock=state.realtimeClock;
  if(clock?.error)throw Error(clock.error);
  if(clock){this.frames=clock.frames;state.realtimeClock=clock;}
  return state;
 }
 async stepSequence(inputs,{signal,moveBy,buttonEdges=[],scroll}={}){
  if(this.actionScheduling)throw Error('Concurrent realtime action');
  this.actionScheduling=true;
  try{
  // A WebGL/software-compositing readback may synchronously occupy Chromium's
  // main thread. Drain any already admitted capture before arming key timers,
  // and keep optional video captures out of the entire input window. Physics
  // continues throughout; missed video samples use the previous frame.
  await this.observationQueue;
  signal?.throwIfAborted();const began=performance.now();
  const chunks=inputs.map(validateAction),total=chunks.reduce((n,a)=>n+a.frames,0);
  if(total>300)throw Error('Realtime action exceeds 300 frames');
  const admission=performance.now();await this.synchronizeRealtime();this.noteHostSpan('actionCatchup',performance.now()-admission);
  const state=await this.state();if(!state.active||state.complete||state.failed)return {advanced:0,wallMs:0,heldKeys:[],state};
  if(moveBy)await this.evaluate(moveRelative,moveBy);
  if(scroll)await this.evaluate(s=>{document.querySelector('#game').dispatchEvent(new WheelEvent('wheel',{bubbles:true,cancelable:true,deltaY:(s.direction==='up'?-1:1)*100*s.steps}));},scroll);
  if(buttonEdges.length)await this.syncButtonPointer();
  for(const b of buttonEdges){if(b.event==='down'){if(!this.heldButtons.has(b.button)){await this.page.mouse.down({button:b.button});this.heldButtons.add(b.button);}}else{await this.page.mouse.up({button:b.button});this.heldButtons.delete(b.button);}}
  let elapsed=0;const ends=new Map();
  for(const chunk of chunks){elapsed+=chunk.frames;for(const key of chunk.keys)ends.set(key,elapsed);}
  const keys=[...ends].map(([key,frames])=>({key,frames}));for(const k of keys)this.heldKeys.add(k.key);
  const result=await this.evaluate(({keys,total})=>window.__SHENCHENGJI_CITY__.world.__evalRealtime.schedule(keys,total),{keys,total});
  this.heldKeys.clear();await this.state();
  return {...result,wallMs:performance.now()-began,heldKeys:[],heldButtons:[...this.heldButtons],state:await this.state()};
  }finally{this.actionScheduling=false;}
 }
 async assertFrozen(){return false;}
 async close(){try{await this.stopRealtime();}finally{await super.close();}}
}
