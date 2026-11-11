/** Only an asynchronous preparation wait, never the entry animation/game clock.
 * A stalled renderer/asset request must not keep F and locomotion locked forever.
 * The caller owns and disposes any partially prepared model on rejection.
 */
export function waitForVehicleBoarding<T>(operation:Promise<T>,signal:AbortSignal,timeoutMs=5000):Promise<T>{
 return new Promise((resolve,reject)=>{
  const abort=()=>finish(()=>reject(signal.reason??new Error('Vehicle boarding cancelled')));
  const timer=setTimeout(()=>finish(()=>reject(new Error('Vehicle boarding preparation timed out'))),timeoutMs);
  let settled=false;
  function finish(done:()=>void){if(settled)return;settled=true;clearTimeout(timer);signal.removeEventListener('abort',abort);done();}
  signal.addEventListener('abort',abort,{once:true});
  // Register both handlers even when already cancelled: late failures are handled.
  operation.then(value=>finish(()=>resolve(value)),error=>finish(()=>reject(error)));
  if(signal.aborted)abort();
 });
}
