/** Same public GUI action shape, one original static action per model turn. */
import {sniperScroll} from './scroll-action.mjs';
import {validateMouseMove} from './mouse-move.mjs';
export function staticAction(action,{kind,cursor,width,height,sourceWidth=width,sourceHeight=height}){
 // Static scenes move beneath a fixed reticle; policy deltas are right/up positive.
 cursor={x:width/2,y:height/2};
 if(Object.hasOwn(action,'buttons'))throw Error('Top-level buttons is unsupported; use mouse.buttons');
 const mouse=action.mouse===undefined?{}:action.mouse;
 if(!mouse||typeof mouse!=='object'||Array.isArray(mouse))throw Error('Invalid mouse object');
 const buttons=mouse.buttons===undefined?[]:mouse.buttons;
 if(!Array.isArray(buttons))throw Error('mouse.buttons must be an array');
 if(Object.keys(mouse).some(k=>!['move','scroll','buttons'].includes(k)))throw Error('Unknown mouse field; use mouse.move:{dx,dy}, not move_to');
 if(buttons.length+Number(mouse.move!==undefined)+Number(mouse.scroll!==undefined)!==1)throw Error('Static tasks require exactly one operation per answer (look OR button OR zoom)');
 if(mouse.move!==undefined||mouse.scroll!==undefined){
  if(action.mouse.scroll!==undefined){
   if(kind!=='sniper')throw Error('Wheel zoom is only supported in sniper tasks');
   return {action:sniperScroll(action.mouse.scroll),cursor};
  }
  const p=validateMouseMove(action.mouse.move);
  // Policy coordinates are display pixels; the unchanged shooting scorer uses
  // original-image pixels. Sniper already uses a 1280x720 camera viewport.
  const sx=kind==='shooting'?sourceWidth/width:1,sy=kind==='shooting'?sourceHeight/height:1;
  return {action:{type:'look',dx:p.dx*sx,dy:(p.dy===0?0:-p.dy)*sy},cursor};
 }
 if(buttons.length){
  const b=buttons[0];
  if(!['left','right'].includes(b.button)||!['down','up'].includes(b.event))throw Error('Invalid mouse button edge');
  if(kind==='shooting'&&(b.button!=='left'||b.event!=='down'))throw Error('Ordinary shooting only supports left down (RT)');
  return {action:{type:'button',button:b.button==='left'?'RT':'LT',event:b.event},cursor};
 }
 throw Error('Static tasks use mouse movement, buttons and sniper wheel zoom; no keyboard zoom');
}
