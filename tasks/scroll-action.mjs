// One wheel operation remains one original UP/DOWN action in the 20-step budget.
export function validateScroll(value){
 if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).some(k=>!['direction','steps'].includes(k))||!['up','down'].includes(value.direction)||!Number.isInteger(value.steps)||value.steps<1||value.steps>6)throw Error('mouse.scroll requires direction up/down and integer steps in [1,6]');
 return {direction:value.direction,steps:value.steps};
}
export function sniperScroll(value){
 const {direction,steps}=validateScroll(value);
 return {type:'button',button:direction==='up'?'UP':'DOWN',event:'down',duration_ms:160*steps};
}
