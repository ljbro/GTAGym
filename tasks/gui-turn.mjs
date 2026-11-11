import {staticAction} from './gui-action.mjs?v=relative-up-v1';
import {validateScroll} from './scroll-action.mjs';

export const COMPOSITE_PROTOCOL='gui-composite-v2';

/** Compile and validate the whole reply before changing the environment.
 * Scope edge -> mouse move/zoom -> fire edge, without intermediate observations.
 * The source engine is discrete; these are zero-time operations, not extra turns.
 */
export function staticTurn(input,state){
 if(!input||typeof input!=='object'||Array.isArray(input))throw Error('Expected GUI action object');
 if(Object.hasOwn(input,'buttons'))throw Error('Top-level buttons is unsupported; use mouse.buttons');
 if(!Array.isArray(input.keys))throw Error('keys must be an array');
 // Waiting consumes one discrete model turn, not simulation time or a source
 // engine action. Validate it even for direct runtime callers.
 if(Object.hasOwn(input,'wait_seconds')&&(!Number.isFinite(input.wait_seconds)||input.wait_seconds<=0||input.wait_seconds>1||input.keys.length))throw Error('wait_seconds must be in (0,1] and requires keys:[]');
 // Keyboard entries are intentionally ignored; they consume no game time.
 const mouse=input.mouse===undefined?{}:input.mouse;
 if(!mouse||typeof mouse!=='object'||Array.isArray(mouse)||Object.keys(mouse).some(k=>!['move','scroll','buttons'].includes(k)))throw Error('Invalid mouse object; use mouse.move:{dx,dy}, not move_to');
 if(mouse.move!==undefined&&mouse.scroll!==undefined)throw Error('mouse cannot combine move and scroll');
 const buttons=mouse.buttons===undefined?[]:mouse.buttons;
 if(!Array.isArray(buttons)||buttons.length>2)throw Error('At most two mouse button edges per turn');
 const seen=new Set();
 for(const b of buttons){
  if(!b||Object.keys(b).some(k=>!['button','event'].includes(k))||!['left','right'].includes(b.button)||!['down','up'].includes(b.event)||seen.has(b.button))throw Error('Invalid or duplicate mouse button edge');
  seen.add(b.button);
 }
 // Ignore well-formed scope/zoom controls for ordinary shooting only. Keep
 // schema validation and preserve the other operations in a combined reply.
 if(mouse.scroll!==undefined)validateScroll(mouse.scroll);
 const shooting=state.kind==='shooting';
 const movement=mouse.move!==undefined?{move:mouse.move}:mouse.scroll!==undefined&&!shooting?{scroll:mouse.scroll}:null;
 const atoms=[...buttons.filter(b=>b.button==='right'&&!shooting).map(b=>({keys:[],mouse:{buttons:[b]}})),
  ...(movement?[{keys:[],mouse:movement}]:[]),
  ...buttons.filter(b=>b.button==='left').map(b=>({keys:[],mouse:{buttons:[b]}}))];
 const actions=[];let cursor={x:state.width/2,y:state.height/2};
 for(const atom of atoms){const converted=staticAction(atom,{...state,cursor});actions.push(converted.action);cursor=converted.cursor;}
 return {actions,cursor};
}

/** Grouped traces count model replies, not the flattened source operations. */
export function validateCompositeTrace(actions,record,{maxSteps=20}={}){
 const budget=record.max_steps??20,counts=record.turn_action_counts;
 // Historical scored traces remain readable; this does not accept the old
 // top-level buttons action schema. Only v2 introduces zero-operation turns.
 if(![COMPOSITE_PROTOCOL,'gui-composite-v1'].includes(record.action_protocol)||!Number.isInteger(budget)||budget<1||budget>maxSteps)throw Error('invalid_composite_protocol_or_budget');
 const minimum=record.action_protocol===COMPOSITE_PROTOCOL?0:1;
 if(!Array.isArray(actions)||!Array.isArray(counts)||counts.length!==record.model_steps||counts.length>budget||counts.some(n=>!Number.isInteger(n)||n<minimum||n>3)||counts.reduce((s,n)=>s+n,0)!==actions.length)throw Error('invalid_composite_turn_boundaries');
 let offset=0;
 for(const count of counts){
  let previous=-1;
  for(const a of actions.slice(offset,offset+count)){
   const phase=a?.type==='look'?1:a?.type==='button'?({LT:0,UP:1,DOWN:1,RT:2}[a.button]??-1):-1;
   if(phase<=previous)throw Error('invalid_composite_action_order');
   previous=phase;
  }
  offset+=count;
 }
}
