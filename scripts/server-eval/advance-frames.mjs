/** Runs inside the server browser. Keep self-contained for page.evaluate(). */
export async function advanceFrames({frames,dx,dy,keys,transitionTimeoutMs=30000}){
 const c=window.__SHENCHENGJI_CITY__,w=c.world,canvas=document.querySelector('#game');
 const terminal=()=>{const s=c.stats.nativeTask;return !s.active||s.complete||s.failed;};
 let n=0;
 for(;n<frames;n++){
  const began=performance.now();
  while(!terminal()&&(w.nativeFlightLoading||w.vehicleBoardingLoading)){
   if(performance.now()-began>=transitionTimeoutMs)throw Error(w.vehicleBoardingLoading?'Vehicle boarding timed out':'Aircraft boarding timed out');
   // Wall-clock loading only: no update, animation, mouse, frame or video time.
   await new Promise(resolve=>setTimeout(resolve,16));
  }
  if(terminal())break;
  const aircraft=!!w.flight?.active;
  if(aircraft?w.taskFlightPaused:w.paused)throw Error('Unexpected paused environment');
  const epoch=w.nativeFlightTransitionId??0;
  if(epoch!==(w.__evalFlightInputEpoch??0)){
   // Boarding clears world.keys. Restore still-held levels, not toggle edges:
   // repeating F must NOT immediately disembark; V/G must NOT toggle twice.
   const codes={Shift:'ShiftLeft',Control:'ControlLeft',Space:'Space'};
   for(const key of keys){
    const code=codes[key]??(key.startsWith('Numpad')?key:'Key'+key.toUpperCase());
    if(!w.keys.has(code))window.dispatchEvent(new KeyboardEvent('keydown',{key,code,repeat:true,bubbles:true}));
   }
   w.__evalFlightInputEpoch=epoch;
  }
  if(dx||dy){
   const rect=canvas.getBoundingClientRect(),x=rect.left+rect.width/2,y=rect.top+rect.height/2;
   if(document.pointerLockElement!==canvas)canvas.dispatchEvent(new PointerEvent('pointerenter',{pointerType:'mouse',clientX:x,clientY:y}));
   canvas.dispatchEvent(new PointerEvent('pointermove',{bubbles:true,pointerId:1,pointerType:'mouse',clientX:x+dx,clientY:y+dy,movementX:dx,movementY:dy}));
  }
  w.engine._deltaTime=1000/60;w.update(1/60);w.scene.onBeforeAnimationsObservable.notifyObservers(w.scene);w.scene._animationRatio=1;w.scene._animate(1000/60);w.scene.onAfterAnimationsObservable.notifyObservers(w.scene);
 }
 return n;
}
