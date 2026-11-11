import {setTimeout as sleep} from 'node:timers/promises';

export function transientRequestError(error){
 const status=Number(error.status??String(error.message).match(/Model HTTP (\d+)/)?.[1]);
 if(status)return [408,429,500,502,503,504].includes(status);
 return ['TimeoutError'].includes(error.name)||/fetch failed|terminated|ECONNRESET|ETIMEDOUT|EAI_AGAIN|socket/i.test(error.message??'');
}
/** Retry only inference: no new observation, no released keys, no game ticks. */
export async function retryTransport(request,{maxAttempts=3,signal,onRetry=()=>{},delayMs=2000}={}){
 if(!Number.isInteger(maxAttempts)||maxAttempts<1||maxAttempts>10)throw Error('Invalid request attempt limit');
 const attempts=[];
 for(let i=1;i<=maxAttempts;i++){
  signal?.throwIfAborted();
  try{return {...await request(),transportAttempts:attempts};}
  catch(error){
   // Persist safe machine-readable cause codes (e.g. UND_ERR_HEADERS_TIMEOUT),
   // not stacks or arbitrary nested messages that can contain request secrets.
   const code=error.cause?.code??error.code;
   attempts.push({attempt:i,error:error.message,...(typeof code==='string'&&/^[A-Z0-9_]+$/.test(code)?{code}:{}),time:new Date().toISOString()});
   if(signal?.aborted||!transientRequestError(error)||i===maxAttempts){error.transportAttempts=attempts;throw error;}
   onRetry(attempts.at(-1));await sleep(Math.min(30000,delayMs*2**(i-1)),undefined,{signal});
  }
 }
}
