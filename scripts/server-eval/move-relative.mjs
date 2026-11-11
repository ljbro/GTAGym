/** Zero-time relative input, serialized into the server browser. No
 * camera setters: the normal canvas listener receives one pointer movement. */
export function moveRelative({dx,dy:up}){
 const c=window.__SHENCHENGJI_CITY__,w=c.world,canvas=document.querySelector('#game');
 if(w.nativeFlightLoading)throw Error('Cannot move mouse during aircraft loading');
 if(w.flight?.active?w.taskFlightPaused:w.paused)throw Error('Unexpected paused environment');
 if(!w.__evalMousePosition)throw Error('Relative mouse is not initialized');
 if(![dx,up].every(Number.isFinite)||Math.abs(dx)>640||Math.abs(up)>360)throw Error('mouse.move outside displacement range');
 const from={x:window.innerWidth/2,y:window.innerHeight/2};
 // DOM movementY is positive downward; policy dy is positive upward.
 const dy=-up,x=from.x+dx,y=from.y+dy;
 w.__evalMousePosition=from;
 if(dx||dy){
  // Rebase the unlocked listener without a reverse/recentering movement event.
  // Pointer lock consumes movementX/Y directly; both paths use the same delta.
  if(document.pointerLockElement!==canvas)canvas.dispatchEvent(new PointerEvent('pointerenter',{pointerType:'mouse',clientX:from.x,clientY:from.y}));
  canvas.dispatchEvent(new PointerEvent('pointermove',{bubbles:true,pointerId:1,pointerType:'mouse',clientX:x,clientY:y,movementX:dx,movementY:dy}));
  // Present the new camera immediately; physics/task/animation delta stays 0.
  w.update(0,true);
 }
 return {...w.__evalMousePosition};
}
