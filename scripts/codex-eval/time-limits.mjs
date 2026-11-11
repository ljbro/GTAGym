// Inference latency is not a game failure condition. Native evaluations stop
// at the game's terminal state or action-round budget by default. A wall limit
// is an optional host watchdog, independent of the per-request timeout.
export const DEFAULT_WALL_SECONDS=0;
export class HarnessWallTimeoutError extends Error {
 constructor(seconds){super('Harness wall-clock limit exceeded');this.name='HarnessWallTimeoutError';this.code='HARNESS_WALL_TIMEOUT';this.limitSeconds=seconds;}
}
export function parseWallSeconds(value=DEFAULT_WALL_SECONDS){
 const seconds=Number(value);
 if(!Number.isSafeInteger(seconds)||seconds!==0&&(seconds<30||seconds>86400))throw Error('Invalid wallSeconds');
 return seconds;
}
export function startWallTimer(value,onExpire){
 const seconds=parseWallSeconds(value);
 if(seconds===0)return null;
 const timer=setTimeout(onExpire,seconds*1000);timer.unref();return timer;
}
