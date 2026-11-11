import {chromium} from 'playwright';
import {validateAction,isHardwareGPU} from './protocol.mjs';
import {advanceFrames} from './advance-frames.mjs';
import {moveRelative} from './move-relative.mjs';
import {validateMouseMove} from '../../tasks/mouse-move.mjs';
import {validateScroll} from '../../tasks/scroll-action.mjs';
import {inspectMinimapSpill} from './render-health.mjs';
import {readEnvironmentState} from './state-snapshot.mjs';
import {installTaskKeyGate} from './task-key-gate.mjs';

/** Privileged harness only. The policy receives screenshots, never this object. */
export class ServerEnvironment {
 constructor({url='http://127.0.0.1:4200/',seed=1,width=1280,height=720,quality='low',id='env',renderer='auto',videoFPS=10,signal,accelerated2D=false,gpuCompositing=false}={}){
  if(!['auto','gpu','cpu'].includes(renderer))throw Error('Invalid renderer');
  if(!Number.isInteger(videoFPS)||60%videoFPS!==0||videoFPS<1||videoFPS>60)throw Error('videoFPS must divide 60');
  Object.assign(this,{url,seed,width,height,quality,id,renderer,videoFPS,signal,accelerated2D,gpuCompositing});this.errors=[];this.failedResources=[];this.frames=0;
  this.heldKeys=new Set();this.heldButtons=new Set();
 }
 async open(){
  this.signal?.throwIfAborted();
  const began=performance.now();
  // GPU WebGL is read back into server-side software page compositing. Merely
  // disabling Canvas2D acceleration did not eliminate the minimap spill.
  // The two booleans are diagnostic A/B escape hatches, not model controls.
  const launch=mode=>chromium.launch({headless:true,args:['--no-sandbox','--no-proxy-server','--use-gl=angle',mode==='gpu'?'--use-angle=gl-egl':'--use-angle=swiftshader',...(mode==='cpu'?['--enable-unsafe-swiftshader']:[]),...(!this.accelerated2D?['--disable-accelerated-2d-canvas']:[]),...(!this.gpuCompositing?['--disable-gpu-compositing']:[]),'--ignore-gpu-blocklist','--disable-dev-shm-usage','--disable-background-timer-throttling','--disable-renderer-backgrounding','--mute-audio',...(this.diagnosticBrowserArgs??[])]});
  this.selectedRenderer=this.renderer==='cpu'?'cpu':'gpu';
  try{
   this.browser=await launch(this.selectedRenderer);
   this.signal?.throwIfAborted();
   const probe=await this.browser.newPage();
   const info=await probe.evaluate(()=>{const gl=document.createElement('canvas').getContext('webgl2');if(!gl)return null;const ext=gl.getExtension('WEBGL_debug_renderer_info');return {renderer:ext?gl.getParameter(ext.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER)};});
   await probe.close();
   if(!info||(this.selectedRenderer==='gpu'&&!isHardwareGPU(info)))throw Error('No verified server hardware WebGL: '+JSON.stringify(info));
  }catch(error){
   await this.browser?.close();if(this.renderer!=='auto')throw error;
   this.signal?.throwIfAborted();
   this.fallbackReason=error.message;this.selectedRenderer='cpu';this.browser=await launch('cpu');
  }
  this.signal?.throwIfAborted();
  this.context=await this.browser.newContext({viewport:{width:this.width,height:this.height},deviceScaleFactor:1});
  await this.context.addInitScript(seed=>{let s=seed>>>0;Math.random=()=>{s=(s+0x6D2B79F5)>>>0;let t=s;t=Math.imul(t^(t>>>15),t|1);t^=t+Math.imul(t^(t>>>7),t|61);return ((t^(t>>>14))>>>0)/4294967296;};},this.seed);
  this.page=await this.context.newPage();this.page.setDefaultTimeout(60000);
  this.page.on('pageerror',e=>this.errors.push(e.stack||e.message));
  this.page.on('response',r=>{if(r.status()>=400)this.failedResources.push({status:r.status(),url:r.url()});});
  const url=new URL(this.url);url.searchParams.set('quality',this.quality);
  await this.page.goto(url.href,{waitUntil:'domcontentloaded'});
  await this.page.waitForFunction(()=>window.__SHENCHENGJI_CITY__?.ready,null,{timeout:300000});
  await this.page.waitForSelector('#city-loading',{state:'detached',timeout:90000});
  await this.evaluate(installTaskKeyGate);
  this.gpu=await this.evaluate(()=>{
   const w=window.__SHENCHENGJI_CITY__.world;w.engine.stopRenderLoop();w.keys.clear();
   w.__evalMousePosition={x:Math.floor(window.innerWidth/2),y:Math.floor(window.innerHeight/2)};
   // Babylon normally uses wall time for animation. Zero-time observations must
   // not advance bones by the duration of model inference or video encoding.
   w.scene.animate=()=>{w.scene._animationRatio=0;w.scene._animate(0);w.scene.onAfterAnimationsObservable.notifyObservers(w.scene);};
   return w.engine.getGlInfo();
  });
  if(this.selectedRenderer==='gpu'&&!isHardwareGPU(this.gpu))throw Error('Hardware WebGL required; refusing software fallback: '+this.gpu.renderer);
  this.build=await this.evaluate(()=>[...document.scripts].find(s=>s.type==='module')?.src);
  this.bootMs=performance.now()-began;
  this.ready=true;
  return {gpu:this.gpu,renderer:this.selectedRenderer,canvas2d:this.accelerated2D?'accelerated':'software',pageCompositing:this.gpuCompositing?'gpu':'software',fallbackReason:this.fallbackReason,executionHost:'server',build:this.build,bootMs:this.bootMs};
 }
 async evaluate(fn,arg){
  if(this.broken)throw Error('Server browser is unresponsive');
  let timer;
  try{return await Promise.race([this.page.evaluate(fn,arg),new Promise((_,reject)=>{timer=setTimeout(()=>{this.broken=true;void this.browser?.close().catch(()=>{});reject(Error('Server browser operation timed out after 60 seconds'));},60000);})]);}
  finally{clearTimeout(timer);}
 }
 async reset(taskId){
  if(!/^(c\d{2}-n\d{2,3}|c(?:09|10|11)-n\d{2,3}|rl-walk-[a-z0-9][a-z0-9-]{0,71}|rl-outdoor-[a-z0-9][a-z0-9-]{0,83}|rl-task-(road|outdoor|aquatic|vertical|aviation|indoor|follow|pursuit|evasion|shooting)-[a-z0-9][a-z0-9-]{0,57})$/.test(taskId))throw Error('Invalid task ID');
  this.isStatic=/^c(?:10|11)-n/.test(taskId)||taskId.startsWith('rl-task-shooting-');
  await this.evaluate(seed=>{window.__SHENCHENGJI_CITY__.world.__staticSeed=seed;},this.seed);
  // Fresh browser per episode: never reuse physics, NPCs or browser storage.
  if(this.taskId)throw Error('Create a fresh environment for the next episode');
  this.taskId=taskId;
  this.instruction=await this.evaluate(id=>{
   const picker=document.querySelector('#native-task-picker'),option=[...picker.options].find(o=>o.value===id);
   if(!option)throw Error('Unknown native task '+id);
   document.querySelector('#native-task-button').click();
   picker.value=id;picker.dispatchEvent(new Event('change',{bubbles:true}));
   const instruction=option.textContent+'\n'+document.querySelector('#native-task-objective').textContent;
   document.querySelector('#native-task-start').click();return instruction;
  },taskId);
  const started=await this.page.waitForFunction(id=>{
   const c=window.__SHENCHENGJI_CITY__,s=c?.stats?.nativeTask;
   if(s?.taskId!==id)return false;
   const reason=s.reason||document.querySelector('#native-result-reason')?.textContent;
   if(s.failed)return {error:reason||'Scene preparation failed'};
   if(s.complete)return {error:reason||'Task ended before initialization completed'};
   return s.active&&!c.world.paused?{ready:true}:false;
  },taskId,{timeout:180000});
  let startup;
  try{startup=await started.jsonValue();}finally{await started.dispose();}
  if(startup.error)throw Error(`Task ${taskId} failed to start: ${startup.error}`);
  await this.page.locator(this.isStatic?'#static-shooting-canvas':'#game').focus();
  if(this.isStatic)await this.evaluate(()=>{const w=window.__SHENCHENGJI_CITY__.world;w.__evalMousePosition={...w.staticTask.cursor};});
  // Update camera/HUD at zero simulated delta. Never credit warm-up time.
  await this.evaluate(()=>{const w=window.__SHENCHENGJI_CITY__.world;w.update(0);});
  await this.render();
  this.initial=await this.state();return this.initial;
 }
 async render(){
  if(!this.ready)throw Error('Server game did not finish loading; no observation available');
  await this.evaluate(async()=>{const w=window.__SHENCHENGJI_CITY__.world;if(w.staticTask){w.staticTask.render();return;}const check=()=>{if(w.engine._gl?.isContextLost())throw Error('WebGL context lost; refusing a blank model observation');};check();w.refreshNavigation?.();w.engine._deltaTime=0;for(let i=0;i<2;i++){w.scene.render();await new Promise(r=>requestAnimationFrame(r));check();}});
 }
 async state(){if(!this.ready)throw Error('Server game did not finish loading');return this.evaluate(readEnvironmentState);}
 async observe({type='png',quality=80}={}){await this.render();if(this.isStatic){const data=await this.evaluate(()=>window.__SHENCHENGJI_CITY__.world.staticTask.screenshot());return Buffer.from(data.split(',')[1],'base64');}const image=await this.page.screenshot({type,...(type==='jpeg'?{quality}:{}),timeout:60000});await this.evaluate(()=>{if(window.__SHENCHENGJI_CITY__.world.engine._gl?.isContextLost())throw Error('WebGL context lost during capture; refusing a blank model observation');});return image;}
 async inspectRenderHealth(image){
  if(this.isStatic)return {healthy:true,skipped:'static-original'};
  const probe=await this.evaluate(()=>{
   const map=document.querySelector('#minimap'),game=document.querySelector('#game');
   if(!map||!game||getComputedStyle(map).display==='none')return null;
   const m=map.getBoundingClientRect(),g=game.getBoundingClientRect();
   if(!m.width||!m.height||!g.width||!g.height)return null;
   const left=Math.max(0,Math.floor(m.x-32)),top=Math.max(0,Math.floor(m.y-m.height*.8));
   const region={left,top,width:Math.min(innerWidth,Math.ceil(m.right+16))-left,height:Math.min(innerHeight,Math.ceil(m.bottom+24))-top};
   const canvas=document.createElement('canvas');canvas.width=region.width;canvas.height=region.height;
   const ctx=canvas.getContext('2d',{willReadFrequently:true});
   // Read before WebGL's non-preserved back buffer is discarded. No world step.
   const w=window.__SHENCHENGJI_CITY__.world;w.engine._deltaTime=0;w.scene.render();
   ctx.drawImage(game,(left-g.x)*game.width/g.width,(top-g.y)*game.height/g.height,region.width*game.width/g.width,region.height*game.height/g.height,0,0,region.width,region.height);
   return {region,map:m.toJSON(),reference:canvas.toDataURL('image/png')};
  });
  if(!probe)return {healthy:true,skipped:'no-visible-minimap'};
  return inspectMinimapSpill(image,{...probe,reference:Buffer.from(probe.reference.split(',')[1],'base64')});
 }
 async restart(taskId){
  await this.close();
  this.ready=false;this.broken=false;this.taskId=undefined;this.isStatic=false;
  this.frames=0;this.errors=[];this.failedResources=[];this.heldKeys=new Set();this.heldButtons=new Set();
  const boot=await this.open();await this.reset(taskId);return boot;
 }
 async staticTrace(){return this.evaluate(()=>window.__SHENCHENGJI_CITY__.world.staticTask?.trace());}
 async syncButtonPointer(){
  // Policy input is center-referenced. Position Chromium's physical cursor at
  // that center before native button edges, without a second look event.
  if(await this.evaluate(()=>document.pointerLockElement===document.querySelector('#game')))return;
  const p=(await this.state()).mousePosition;
  await this.evaluate(()=>{const w=window.__SHENCHENGJI_CITY__.world;w.__evalPointerMute=new AbortController();for(const type of ['pointermove','mousemove'])window.addEventListener(type,e=>e.stopImmediatePropagation(),{capture:true,signal:w.__evalPointerMute.signal});});
  try{await this.page.mouse.move(p.x,p.y);await this.evaluate(()=>new Promise(resolve=>requestAnimationFrame(resolve)));}finally{await this.evaluate(()=>window.__SHENCHENGJI_CITY__.world.__evalPointerMute.abort());}
 }
 async stepStatic(action,{onFrame,signal=this.signal}={}){
  signal?.throwIfAborted();const started=performance.now();
  await this.evaluate(action=>{const w=window.__SHENCHENGJI_CITY__.world;w.staticTask.stepGui(action,{composite:true});w.__evalMousePosition={...w.staticTask.cursor};w.update(0);},action);
  if(onFrame)await onFrame(await this.observe(),0);
  return {advanced:0,wallMs:performance.now()-started,state:await this.state(),heldKeys:[],executedSeconds:0};
 }
 async step(input,options={}){return this.stepSequence([input],options);}
 async releaseInputs({keepKeys=[],keepButtons=[]}={}){
  const keys=[...this.heldKeys].filter(k=>!keepKeys.includes(k)),buttons=[...this.heldButtons].filter(b=>!keepButtons.includes(b));
  const releases=await Promise.allSettled(keys.map(async k=>{await this.page.keyboard.up(k);this.heldKeys.delete(k);}).concat(buttons.map(async b=>{await this.page.mouse.up({button:b});this.heldButtons.delete(b);})));
  const errors=releases.filter(r=>r.status==='rejected').map(r=>r.reason);
  if(errors.length){await this.browser?.close().catch(()=>{});this.heldKeys.clear();this.heldButtons.clear();throw new AggregateError(errors,'Failed to release game inputs');}
 }
 async stepSequence(inputs,{onFrame,signal=this.signal,preserveKeys=false,moveBy,buttonEdges=[],scroll}={}){
  const started=performance.now(),heldKeys=this.heldKeys,heldButtons=this.heldButtons;let advanced=0;
  try{
   // Independent input deadlines may require more than 16 transport chunks.
   // At least one frame per chunk and the 300-frame round cap still bound work.
   if(!Array.isArray(inputs)||inputs.length>300)throw Error('Invalid input sequence');
   if(scroll!==undefined)validateScroll(scroll);
   if(scroll!==undefined&&moveBy!==undefined)throw Error('Cannot move and scroll in the same mouse operation');
   if(!Array.isArray(buttonEdges)||buttonEdges.length>2||buttonEdges.some(b=>!b||!['left','right'].includes(b.button)||!['down','up'].includes(b.event))||new Set(buttonEdges.map(b=>b.button)).size!==buttonEdges.length)throw Error('Invalid button edges');
   // Validate the whole sequence before sending even its first keydown.
   const actions=inputs.map(validateAction);
   if(actions.reduce((sum,a)=>sum+a.frames,0)>300)throw Error('Input sequence exceeds 300 frames');
   signal?.throwIfAborted();
   const before=await this.state();if(!before.active)throw Error('Episode is not active');
   if(moveBy!==undefined){
    validateMouseMove(moveBy);
   }
   await this.page.locator('#game').focus();
   if(moveBy!==undefined){signal?.throwIfAborted();await this.evaluate(moveRelative,moveBy);}
   if(buttonEdges.length)await this.syncButtonPointer();
   for(const {button,event} of buttonEdges){if(event==='down'){if(!heldButtons.has(button)){await this.page.mouse.down({button});heldButtons.add(button);}}else{await this.page.mouse.up({button});heldButtons.delete(button);}}
   if(scroll!==undefined)await this.evaluate(scroll=>{
    const w=window.__SHENCHENGJI_CITY__.world,p=w.__evalMousePosition;
    document.querySelector('#game').dispatchEvent(new WheelEvent('wheel',{bubbles:true,cancelable:true,deltaMode:0,deltaY:(scroll.direction==='up'?-1:1)*100*scroll.steps,clientX:p.x,clientY:p.y}));w.update(0,true);
   },scroll);
   if(!actions.length){
    await this.releaseInputs({keepButtons:preserveKeys?[...heldButtons]:[]});await this.render();
    // An instantaneous camera-only round still needs a visible video sample,
    // but neither simulation frames nor task time advance.
    if(onFrame)await onFrame(await this.observe({type:'jpeg'}),this.frames/60);
    return {advanced:0,wallMs:performance.now()-started,state:await this.state(),heldKeys:[]};
   }
   sequence:for(const action of actions){
    signal?.throwIfAborted();
    const state=await this.state();if(!state.active||state.complete||state.failed)break;
    for(const k of heldKeys)if(!action.keys.includes(k)){await this.page.keyboard.up(k);heldKeys.delete(k);}
    for(const b of heldButtons)if(!preserveKeys&&!action.buttons.includes(b)){await this.page.mouse.up({button:b});heldButtons.delete(b);}
    for(const k of action.keys)if(!heldKeys.has(k)){heldKeys.add(k);await this.page.keyboard.down(k);}
    for(const b of action.buttons)if(!heldButtons.has(b)){heldButtons.add(b);await this.page.mouse.down({button:b});}
    let segmentFrames=0;
    while(segmentFrames<action.frames){
     signal?.throwIfAborted();
     const count=Math.min(action.frames-segmentFrames,60/this.videoFPS-this.frames%(60/this.videoFPS));
     const n=await this.evaluate(advanceFrames,{frames:count,dx:action.mouse.dx/action.frames,dy:action.mouse.dy/action.frames,keys:action.keys});
     advanced+=n;segmentFrames+=n;this.frames+=n;
     if(onFrame&&n&&this.frames%(60/this.videoFPS)===0)await onFrame(await this.observe({type:'jpeg'}),this.frames/60);
     if(n<count)break sequence;
    }
   }
   signal?.throwIfAborted();
   const state=await this.state();
   // Only keys still held on the final simulated frame can cross a round.
   // Legacy low-level callers keep the old release-at-end behavior by default.
   const keep=preserveKeys&&state.active&&!state.complete&&!state.failed;
   await this.releaseInputs({keepKeys:keep?[...heldKeys]:[],keepButtons:keep?[...heldButtons]:[]});
   await this.render();
   return {advanced,wallMs:performance.now()-started,state:await this.state(),heldKeys:[...heldKeys],heldButtons:[...heldButtons]};
  }catch(error){
   try{await this.releaseInputs();}catch(releaseError){throw new AggregateError([error,releaseError],'Action failed and input cleanup failed');}
   throw error;
  }
 }
 async assertFrozen(ms=300){const a=await this.state();await new Promise(r=>setTimeout(r,ms));const b=await this.state();if(['elapsed','worldTime','animationTime','actor','mousePosition','mode','paused','replayState'].some(k=>JSON.stringify(a[k])!==JSON.stringify(b[k])))throw Error('Environment advanced during model thinking');return true;}
 async close(){try{await this.releaseInputs();}finally{await this.browser?.close();}}
}
