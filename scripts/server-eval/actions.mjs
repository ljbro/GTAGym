import {KEYS,validateAction} from './protocol.mjs';
import {validateScroll} from '../../tasks/scroll-action.mjs';
import {validateMouseMove} from '../../tasks/mouse-move.mjs';

export const LIMITS=Object.freeze({maxSeconds:1,maxReplyBytes:16384});
// Metadata only; the model receives system-prompt*.md verbatim.
export const description=`Action Protocol gui-actions-v7(Plain Text JSON, Do Not Use tools). keys Required, Each item {key,duration_seconds}, Supported keys: ${KEYS.join(', ')}. Duration (0,1] game seconds, All Keys Start Simultaneously, End Independently, Keys held at the end of a round remain held across rounds. mouse Can Be Omitted or {}, May include move:{dx,dy} or scroll:{direction:"up"or"down",steps:1}(Choose one of two), And buttons:[{button:"left"or"right",event:"down"or"up"}]. move Is a relative pixel displacement, dx Directly right, dy Directly up, -640<=dx<=640, -360<=dy<=360; (0,0) Do Not Move, Repeated displacement takes effect again, Do Not Accept move_to or x/y. Zero Mouse Latency, Execute before keyboard input, Do not keep turning; Native 3D Rotate the camera at the current sensitivity. Standardize screenshots 1280×720, No mouse position text or pointer overlay. Keep mouse buttons held across rounds, requires up Release; Scroll wheel steps for 1~6 Integer. Normal shooting filters out right-click and scroll wheel input; Ignore movement when the sniper scope is inactive, Do not accumulate displacement. Shooting/Sniping keyboard input ignore duration, The combination sequence starts with the right mouse button→Move or zoom→Left Mouse Button, One target, one shot to finish, At most 20 wheel; For multiple sniper targets, the bullet count equals the target count, Any shot that misses all living targets causes immediate failure, At most 20 wheel. keys:[] Can be configured wait_seconds:(0,1] Wait; Shooting/Sniper waiting still counts as only one round. Top floor only keys/mouse/wait_seconds. Execute only after a full validation pass; Formatting and network retries do not advance the game. Freeze during inference, Release inputs on termination. `;
export const smokeAction=round=>({keys:[{key:'w',duration_seconds:round%2?.1:.25}],mouse:{move:{dx:0,dy:0}}});
export const descriptionEn=`Action protocol gui-actions-v7 (plain-text JSON, no tools). Required keys entries are {key,duration_seconds}; allowed keys: ${KEYS.join(', ')}. Each duration is in (0,1] game seconds. Keys start together, expire independently, and may stay held across turns. Optional mouse (or {}) accepts move:{dx,dy} OR scroll:{direction:"up" or "down",steps:1}, plus buttons:[{button:"left" or "right",event:"down" or "up"}]. move uses relative pixels: positive dx right, positive dy up, -640<=dx<=640, -360<=dy<=360. (0,0) does not move; repeated deltas apply again. move_to and x/y are rejected. Mouse operations take zero game time before keyboard input and do not keep turning. Native 3D retains camera sensitivity. Screenshots are 1280x720 without cursor text or overlays. Button holds persist until up; scroll.steps is an integer 1–6. Ordinary shooting ignores right-button and scroll controls. Unscoped sniper movement is ignored without accumulation. Shooting/sniping ignores keyboard durations, allows scope→move/zoom→fire composition, ends after one shot with at most 20 turns for single-target tasks. Multi-target sniping allows one bullet per target and at most 20 turns; any shot that does not hit a live target fails immediately. keys:[] permits wait_seconds in (0,1]; static waiting only consumes a turn. Only keys/mouse/wait_seconds are allowed at the top level. Validate the full reply before execution; format/network retries do not advance the game. Freeze during inference and release inputs on termination.`;

function object(value,fields,label){
 if(!value||typeof value!=='object'||Array.isArray(value))throw Error(`${label} must be an object`);
 for(const key of Object.keys(value))if(!fields.includes(key))throw Error(`${label}: unknown field ${key}`);
}
function keyName(key){
 if(typeof key!=='string')throw Error('key must be a string');
 if(/^[A-Z]$/.test(key))return key.toLowerCase();
 return key==='Ctrl'?'Control':key;
}
function duration(value,label,maxSeconds=LIMITS.maxSeconds){
 if(!Number.isFinite(value)||value<=0||value>maxSeconds)throw Error(`${label} must be in (0,${maxSeconds}]`);
 return Math.max(1,Math.ceil(value*60-1e-9));
}
export function parse(raw,{maxSeconds=LIMITS.maxSeconds}={}){
 validateMaxSeconds(maxSeconds);
 if(typeof raw!=='string'||Buffer.byteLength(raw,'utf8')>LIMITS.maxReplyBytes)throw Error('Action reply must be a JSON string of at most 16384 bytes');
 // Accept only a single whole-reply JSON fence, never extract an action from
 // surrounding prose or multiple blocks. Preserve raw in the episode archive.
 const text=raw.trim();
 const fenced=/^```(?:json)?[ \t]*\r?\n([\s\S]*?)\r?\n```$/i.exec(text);
 let value;try{value=JSON.parse(fenced?fenced[1]:text);}catch{throw Error('Action reply must be valid JSON, optionally in one JSON code fence, without explanation');}
 object(value,['keys','mouse','wait_seconds'],'reply');
 if(!Array.isArray(value.keys)||value.keys.length>KEYS.length)throw Error('keys must be an array with at most one entry per allowed key');
 const keys=value.keys.map((input,i)=>{
  object(input,['key','duration_seconds'],`keys[${i}]`);
  return {key:keyName(input.key),duration_seconds:input.duration_seconds,frames:duration(input.duration_seconds,`keys[${i}].duration_seconds`,maxSeconds)};
 });
 if(Object.hasOwn(value,'wait_seconds')){
  duration(value.wait_seconds,'wait_seconds',maxSeconds);
  if(keys.length)throw Error('wait_seconds requires keys:[]');
 }
 let mouse;
 if(value.mouse!==undefined){
  object(value.mouse,['move','scroll','buttons'],'mouse');
  if(value.mouse.move!==undefined&&value.mouse.scroll!==undefined)throw Error('mouse cannot combine move and scroll');
  mouse={};
  if(value.mouse.scroll!==undefined)mouse={scroll:validateScroll(value.mouse.scroll)};
  else if(value.mouse.move!==undefined){
   // Validate before execution so format correction retries on the frozen frame.
   mouse={move:validateMouseMove(value.mouse.move)};
  }
 }
 validateAction({keys:keys.map(k=>k.key),frames:1});
 let buttons;
 if(value.mouse?.buttons!==undefined){
  if(!Array.isArray(value.mouse.buttons)||value.mouse.buttons.length>2)throw Error('mouse.buttons must have at most two entries');
  buttons=value.mouse.buttons.map((b,i)=>{object(b,['button','event'],`mouse.buttons[${i}]`);if(!['left','right'].includes(b.button)||!['down','up'].includes(b.event))throw Error('Invalid button edge');return {...b};});
  if(new Set(buttons.map(b=>b.button)).size!==buttons.length)throw Error('Duplicate mouse button');
  mouse.buttons=buttons;
 }
 const seconds=value.wait_seconds??Math.max(0,...keys.map(k=>k.duration_seconds));
 const frames=seconds?duration(seconds,'round duration_seconds',maxSeconds):0;
 return {keys,...(mouse?{mouse}:{}),...(value.wait_seconds!==undefined?{wait_seconds:value.wait_seconds}:{}),frames,requestedSeconds:seconds,scheduledSeconds:frames/60};
}
export async function execute(env,action,onFrame,{signal,maxSeconds=LIMITS.maxSeconds}={}){
 try{
 // Strip derived metadata then revalidate before sending any keydown.
 object(action,['keys','mouse','wait_seconds','frames','requestedSeconds','scheduledSeconds'],'reply');
 if(!Array.isArray(action.keys))throw Error('keys must be an array');
 action.keys.forEach((key,i)=>object(key,['key','duration_seconds','frames'],`keys[${i}]`));
 const checked=parse(JSON.stringify({keys:action.keys.map(({key,duration_seconds})=>({key,duration_seconds})),...(action.mouse!==undefined?{mouse:action.mouse}:{}),...(Object.hasOwn(action,'wait_seconds')?{wait_seconds:action.wait_seconds}:{})}),{maxSeconds});
 signal?.throwIfAborted();
 if(env.isStatic)return await env.stepStatic({...checked,keys:[],frames:0,requestedSeconds:0,scheduledSeconds:0},{onFrame,signal});
 // Partition one shared clock at input release boundaries. These are transport
 // chunks, not sequential policy actions: every input starts at simulation t=0.
 const boundaries=checked.wait_seconds!==undefined?[checked.frames]:[...new Set(checked.keys.map(k=>k.frames))].sort((a,b)=>a-b);
 const chunks=[];let start=0;
 for(const end of boundaries){
  while(start<end){
   const frames=Math.min(120,end-start);
   chunks.push({keys:checked.keys.filter(k=>k.frames>start).map(k=>k.key),frames});
   start+=frames;
  }
 }
 const result=await env.stepSequence(chunks,{onFrame,signal,preserveKeys:true,...(checked.mouse?.move?{moveBy:checked.mouse.move}:{}),...(checked.mouse?.scroll?{scroll:checked.mouse.scroll}:{}),...(checked.mouse?.buttons?{buttonEdges:checked.mouse.buttons}:{})});
 return {...result,requestedSeconds:checked.requestedSeconds,scheduledSeconds:checked.scheduledSeconds,executedSeconds:result.advanced/60};
 }catch(error){
  try{await env.releaseInputs?.();}catch(releaseError){throw new AggregateError([error,releaseError],'Action failed and input cleanup failed');}
  throw error;
 }
}

function validateMaxSeconds(value){
 // The native sequence validator allows at most 300 frames per decision.
 if(!Number.isFinite(value)||value<1/60||value>5||Math.abs(value*60-Math.round(value*60))>1e-8)throw Error('maxSeconds must be frame-aligned and in [1/60,5]');
}

/** Trusted per-experiment limits, never taken from a model reply or env.
 * Parsing and execution-time revalidation always share the same bound. */
export function createActionAdapter({maxSeconds=1}={}){
 validateMaxSeconds(maxSeconds);
 const limits=Object.freeze({...LIMITS,maxSeconds});
 return Object.freeze({
  LIMITS:limits,
  description:description.replaceAll('(0,1]',`(0,${maxSeconds}]`),
  descriptionEn:descriptionEn.replaceAll('(0,1]',`(0,${maxSeconds}]`),
  parse:raw=>parse(raw,limits),
  execute:(env,action,onFrame,options={})=>execute(env,action,onFrame,{...options,maxSeconds}),
  smokeAction,
 });
}
