// Remember the release request, not the pause state when its asynchronous
// event arrives: a cached aircraft can finish boarding before that event.
const intentionalReleases=new WeakSet<Element>();
export function releaseOffmapPointerLock(doc:Document=document){
 const target=doc.pointerLockElement;
 if(!target||intentionalReleases.has(target))return;
 intentionalReleases.add(target);
 try{doc.exitPointerLock();}catch(error){intentionalReleases.delete(target);throw error;}
}

/** Register before weapon capture listeners: the first click captures, never fires. */
export function createOffmapMouse(canvas:HTMLCanvasElement,hooks:{available:()=>boolean;paused:()=>boolean;look:(dx:number,dy:number)=>void;sensitivity?:()=>number;unlock:()=>void;message:(s:string)=>void;changed?:()=>void}){
 const abort=new AbortController(),signal=abort.signal;let pending=false,locked=false,disposed=false,previous:{x:number;y:number}|null=null;
 const isLocked=()=>document.pointerLockElement===canvas;
 async function capture(){
  if(disposed||pending||isLocked()||!hooks.available()||hooks.paused())return;
  intentionalReleases.delete(canvas);canvas.focus();pending=true;
  try{await canvas.requestPointerLock();}catch{locked=isLocked();if(!disposed)hooks.message("Browser did not allow pointer lock; You can still move the mouse within the view to turn, Click to retry locking on");}
  finally{pending=false;}
 }
 canvas.addEventListener('pointerdown',e=>{if(e.button!==0||!hooks.available()||hooks.paused()||isLocked())return;e.preventDefault();e.stopImmediatePropagation();void capture();},{capture:true,signal});
 // One capture listener owns locked motion, including ADS; never apply it twice
 // through the older drag handler or the weapon's standalone input handler.
 canvas.addEventListener('pointerenter',e=>{previous={x:e.clientX,y:e.clientY};},{signal});
 canvas.addEventListener('pointerleave',()=>{previous=null;},{signal});
 window.addEventListener('blur',()=>{previous=null;},{signal});
 canvas.addEventListener('pointermove',e=>{
  if(e.pointerType==='touch')return; // Touch remains a deliberate drag gesture.
  if(!hooks.available()||hooks.paused()){previous=null;return;}
  const lockedNow=isLocked(),dx=lockedNow?e.movementX:previous?e.clientX-previous.x:0,dy=lockedNow?e.movementY:previous?e.clientY-previous.y:0;
  previous=lockedNow?null:{x:e.clientX,y:e.clientY};
  const s=hooks.sensitivity?.()??1;if(dx||dy)hooks.look(dx*s,dy*s);
  // Hover works before browser pointer-lock consent; capture also suppresses
  // legacy dragging and weapon look so each event rotates the camera once.
  e.stopImmediatePropagation();
 },{capture:true,signal});
 window.addEventListener('keydown',e=>{
  if(e.code!=='Space'||!hooks.available()||hooks.paused()||e.target instanceof HTMLElement&&e.target.closest('input,textarea,select,button,[contenteditable=true]'))return;
  // Space is also the walking jump/vault/climb action. Prevent page scrolling,
  // but let the world keyboard listener receive it, even if pointer lock fails
  // or is already active. Only the first pointer click is capture-exclusive.
  e.preventDefault();if(!e.repeat)void capture();
 },{capture:true,signal});
 document.addEventListener('pointerlockchange',()=>{
  const next=isLocked(),lost=locked&&!next,requested=!next&&intentionalReleases.delete(canvas);
  locked=next;previous=null;
  // A queued acquisition event must not consume the release marker before
  // lock loss. A fresh capture clears stale markers before requesting a lock.
  if(lost&&!requested)hooks.unlock();hooks.changed?.();
 },{signal});
 document.addEventListener('pointerlockerror',()=>{pending=false;locked=isLocked();hooks.message("Mouse lock failed; You can still move the mouse within the view to turn");},{signal});
 return {capture,isLocked,sync(){if(!hooks.available()||hooks.paused()){previous=null;if(isLocked())releaseOffmapPointerLock();}},dispose(){disposed=true;abort.abort();if(isLocked())releaseOffmapPointerLock();}};
}
