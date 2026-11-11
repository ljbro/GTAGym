// Internal training inference can wait behind long multimodal generations.
// Native http has no Undici 300s headers deadline; the caller owns the deadline.
import http from 'node:http';
import {setTimeout as delay} from 'node:timers/promises';

const CONNECT_ERRORS=new Set(['ECONNREFUSED','EHOSTUNREACH','ENETUNREACH','EAI_AGAIN','ENOTFOUND']);
export function isTrainingSessionEndpoint(endpoint){
 const url=new URL(endpoint);
 return url.protocol==='http:'&&/^\/sessions\/[^/]+\/v1\/(responses|chat\/completions)$/.test(url.pathname);
}
export async function sessionFetch(endpoint,options,{onAttempt=()=>{},retryDelayMs=2000,maxAttempts=3,limit=128*1024**2}={}){
 if(!isTrainingSessionEndpoint(endpoint))throw Error('Expected direct internal training session endpoint');
 for(let attempt=1;;attempt++){
  options.signal?.throwIfAborted();
  try{
   const response=await new Promise((resolve,reject)=>{
    const req=http.request(endpoint,{method:options.method,headers:{...options.headers,'accept-encoding':'identity'},signal:options.signal},res=>{
     const chunks=[];let bytes=0;
     res.on('error',reject);
     res.on('aborted',()=>reject(Object.assign(Error('Training response interrupted'),{code:'RESPONSE_INTERRUPTED'})));
     res.on('data',chunk=>{bytes+=chunk.length;if(bytes>limit){res.destroy(Error('Response too large'));return;}chunks.push(chunk);});
     res.on('end',()=>{
      try{
       const headers=new Headers();for(const [key,value] of Object.entries(res.headers))if(value!==undefined)headers.set(key,Array.isArray(value)?value.join(', '):value);
       resolve(new Response(Buffer.concat(chunks),{status:res.statusCode,headers}));
      }catch(error){reject(error);}
     });
    });
    req.on('error',reject);req.end(options.body);
   });
   onAttempt({attempt,status:response.status});return response;
  }catch(error){
   onAttempt({attempt,error:error.message,code:error.code??error.cause?.code??null});
   // Retry only failures that cannot have reached inference. A reset/body
   // failure might already have recorded sampled tokens: never replay it here.
   if(options.signal?.aborted||attempt>=maxAttempts||!CONNECT_ERRORS.has(error.code))throw error;
   await delay(retryDelayMs,undefined,{signal:options.signal});
  }
 }
}
