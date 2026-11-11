import fs from 'node:fs/promises';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {setTimeout as sleep} from 'node:timers/promises';
import {INITIAL_USER_PROMPT} from './public-observation.mjs';

export const INITIAL_OBSERVATION_FILE='initial-observation.json';

/** Trusted-host entry point only. Not registered as a model tool or resource. */
export async function prepareInitialObservation(session){
 const snapshot=await session.observe();
 if(session.closed)throw Error('Session closed before the initial observation was published');
 if(!session.directoryReady)throw Error('The evaluator output directory could not be created');
 const file=path.join(session.options.output,INITIAL_OBSERVATION_FILE);
 const temp=path.join(session.options.output,`.initial-observation-${randomUUID()}.tmp`);
 try{
  const handle=await fs.open(temp,'wx',0o600);
  try{await handle.writeFile(JSON.stringify(snapshot));await handle.sync();}finally{await handle.close();}
  // Atomic create-only publication: readers see complete JSON and an existing
  // initial observation is never overwritten with a later screenshot.
  await fs.link(temp,file);
 }finally{await fs.unlink(temp).catch(error=>{if(error.code!=='ENOENT')throw error;});}
 return snapshot;
}

/** Host-side read: never expose this path or filesystem capability to the model. */
export async function waitForInitialObservation(directory,{timeoutMs=600000,signal}={}){
 if(!Number.isFinite(timeoutMs)||timeoutMs<=0)throw Error('Invalid bootstrap timeout');
 const deadline=performance.now()+timeoutMs;
 while(true){
  signal?.throwIfAborted();
  try{
   const snapshot=JSON.parse(await fs.readFile(path.join(directory,INITIAL_OBSERVATION_FILE),'utf8'));
   validateInitialObservation(snapshot);return snapshot;
  }catch(error){if(error.code!=='ENOENT')throw error;}
  const remaining=deadline-performance.now();
  if(remaining<=0)throw Error('Timed out waiting for the evaluator initial observation');
  await sleep(Math.min(100,remaining),undefined,{signal});
 }
}

function validateInitialObservation(snapshot){
 const metadata=snapshot?.metadata;
 if(metadata?.done||metadata?.outcome==='evaluation_error')throw Error('The game ended during host bootstrap; inspect evaluator logs');
 if(!metadata||metadata.width!==1280||metadata.height!==720||metadata.outcome!=='active'||
  metadata.done!==false||typeof metadata.observation_id!=='string'||typeof snapshot.image!=='string'||!snapshot.image||
  !['image/jpeg','image/png'].includes(snapshot.mimeType))throw Error('Invalid initial observation');
 if(Object.keys(metadata).some(key=>!['task_id','observation_id','width','height','done','outcome'].includes(key)))throw Error('Unexpected initial-observation metadata');
}

/** Multimodal input for the harness host to submit before its first model turn.
 * Adapt the image part to the harness's native input API as needed.
 * The only evaluator-supplied text is the shared neutral startup prompt.
 */
export function initialUserMessage(snapshot){
 validateInitialObservation(snapshot);
 return {role:'user',content:[
  {type:'text',text:INITIAL_USER_PROMPT},
  {type:'image_url',image_url:{url:`data:${snapshot.mimeType};base64,${snapshot.image}`}},
 ]};
}
