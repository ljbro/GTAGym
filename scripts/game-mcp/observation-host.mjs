// Trusted evaluator state. Never expose private snapshots to the agent.
// The host retains action receipts and observation versions.
import {createHash} from 'node:crypto';
import {publicObservation} from './public-observation.mjs';
const isObject=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);

function canonical(value){
 if(Array.isArray(value))return value.map(canonical);
 if(isObject(value))return Object.fromEntries(Object.keys(value).sort().map(key=>[key,canonical(value[key])]));
 return value;
}
const fingerprint=action=>createHash('sha256').update(JSON.stringify(canonical(action))).digest('hex');
const version=snapshot=>{
 const id=snapshot?.metadata?.observation_id;
 if(typeof id!=='string'||!id||id.length>100)throw Error('Missing private observation version');
 publicObservation(snapshot);return id;
};
const error=(message,code,text)=>({jsonrpc:'2.0',id:message.id,result:{isError:true,content:[{type:'text',text:JSON.stringify({code,message:text})}]}});
const completed=message=>({jsonrpc:'2.0',id:message.id,result:{content:[{type:'text',text:JSON.stringify({
 code:'ACTION_ALREADY_COMPLETED',message:'This request already executed. No action was repeated; use the screenshot already returned.',
})}]}});

export class HostObservations {
 constructor({requireGeneration=true}={}){
  this.requireGeneration=requireGeneration;this.receipts=new Map();this.pending=new Map();
 }
 initialize(snapshot){
  if(this.current)throw Error('Observation state cannot be replaced');
  this.current=snapshot;this.visible=version(snapshot);
 }
 // Host-only feedback image; never a model-callable observation capability.
 feedback(snapshot){
  if(!this.current||this.inFlight||this.pending.size)throw Error('Observation feedback requires an idle initialized host');
  this.current=snapshot;this.visible=version(snapshot);
  this.generation=undefined;this.generationClaimed=false;this.selectedAction=undefined;
 }
 // Bind actions to the screenshot available when inference began. A second
 // action in the same reply cannot silently consume a newer screenshot.
 modelRequest(frame){
  if(['api_start','api_request'].includes(frame.type)&&frame.method==='POST'&&
   /^\/(?:responses|chat\/completions)$/.test(frame.path)){
   this.generation=this.visible;this.generationClaimed=false;this.selectedAction=undefined;
  }
 }
 modelResponse(items){
  // Native harnesses can dispatch parallel calls on different connections.
  // Select by the provider's output order before releasing it to the harness,
  // rather than letting whichever RPC happens to arrive first win the race.
  const first=items.find(item=>item.type==='function_call');
  this.selectedAction=null;
  if(first)try{this.selectedAction=fingerprint(JSON.parse(first.arguments));}catch{}
 }
 request(message){
  if(message.method!=='tools/call')return {forward:message};
  const args=message.params?.arguments;
  if(this.requireGeneration&&this.selectedAction!==undefined&&fingerprint(args??null)!==this.selectedAction)
   return {reply:error(message,'EXTRA_ACTION','Only the first action in the model response is accepted. This extra action was discarded without execution or a screenshot.')};
  if(!Object.hasOwn(message,'id')||!isObject(args)||Object.keys(args).some(key=>!['request_id','action'].includes(key))||
   typeof args.request_id!=='string'||!/^[-a-zA-Z0-9_]{1,64}$/.test(args.request_id)||!isObject(args.action)){
   this.generationClaimed=true;
   return {reply:error(message,'INVALID_ACTION','Expected request_id (1–64 letters, numbers, hyphens or underscores) and action only.')};
  }
  if(this.pending.has(message.id))return {reply:error(message,'ACTION_IN_PROGRESS','This RPC is already in progress; wait for its result.')};
  const hash=fingerprint(args.action),previous=this.receipts.get(args.request_id);
  if(previous&&previous.fingerprint!==hash)return {reply:error(message,'REQUEST_ID_CONFLICT','This request_id was already used with a different action.')};
  // The executor still owns durable retry receipts. Once the host has received
  // the result, another model call must not append the same image to history.
  if(previous?.succeeded){this.generationClaimed=true;return {reply:completed(message)};}
  let receipt=previous;
  if(!receipt){
   if(!this.current)return {reply:error(message,'HOST_NOT_READY','Wait for the initial screenshot.')};
   if(this.inFlight)return {reply:error(message,'ACTION_IN_PROGRESS','Another action is in progress; retry it with the same request_id or wait for its result.')};
   if(this.requireGeneration&&this.generation!==version(this.current)){
    return {reply:error(message,'STALE_OBSERVATION','Only the first action from a model response can execute. This extra action was discarded; use the screenshot already returned.')};
   }
   if(this.requireGeneration&&this.generationClaimed)return {reply:error(message,'ACTION_ALREADY_SUBMITTED','Only the first action from a model response is accepted. This extra action was discarded; request a new model response before another action.')};
   receipt={fingerprint:hash,observationId:version(this.current)};
   // Claim synchronously before forwarding the action to the executor.
   this.receipts.set(args.request_id,receipt);this.inFlight=receipt;
  }
  this.generationClaimed=true;
  this.pending.set(message.id,receipt);
  return {forward:{...message,params:{...message.params,arguments:{...args,observation_id:receipt.observationId}}}};
 }
 response(message){
  const receipt=this.pending.get(message.id);
  if(!receipt)return message;
  this.pending.delete(message.id);
  // Multiple transports may already be awaiting the same uncertain receipt.
  // Exactly one successful reply may deliver its observation to the model.
  if(receipt.succeeded)return completed(message);
  const metadata=message.result?.structuredContent;
  const image=message.result?.content?.find(part=>part.type==='image');
  if(!message.result?.isError&&metadata&&image){
   const snapshot={metadata,image:image.data,mimeType:image.mimeType},id=version(snapshot);
   this.current=snapshot;this.visible=id;receipt.succeeded=true;
  }
  receipt.completed=true;
  if(this.inFlight===receipt)this.inFlight=null;
  return message;
 }
}
