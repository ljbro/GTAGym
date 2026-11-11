/** Runs in the evaluator browser. G is aircraft gear during a task; the free
 * roam drone shortcut must not pause an on-foot task or expose a free camera. */
export function installTaskKeyGate(){
 if(window.__gtaTaskKeyGateInstalled)return;
 window.__gtaTaskKeyGateInstalled=true;
 window.addEventListener('keydown',event=>{
  if(event.code!=='KeyG')return;
  const city=window.__SHENCHENGJI_CITY__;
  if(city?.stats?.nativeTask?.active&&!city.world.flight?.active){
   event.preventDefault();event.stopImmediatePropagation();
  }
 },{capture:true});
}
