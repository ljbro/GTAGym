export const KEYS = ['w','a','s','d','Shift','Control','Space','e','f','q','c','v','g','Numpad4','Numpad5','Numpad6','Numpad8'];
// Internal frame-chunk validator, not the model-facing GUI schema.
// Prompts come exclusively from system-prompt*.md plus actions.mjs.

export function validateAction(value) {
 if (!value || typeof value !== 'object' || Array.isArray(value)) throw Error('Action must be an object');
 if (Object.keys(value).some(k=>!['keys','frames','mouse','buttons'].includes(k))) throw Error('Unknown action field');
 const {keys,frames,mouse={dx:0,dy:0},buttons=[]}=value;
 if (!Array.isArray(keys)||keys.some(k=>!KEYS.includes(k))||new Set(keys).size!==keys.length) throw Error('Invalid keys');
 if (!Number.isInteger(frames)||frames<1||frames>120) throw Error('frames must be in [1,120]');
 if (!mouse||typeof mouse!=='object'||Array.isArray(mouse)||Object.keys(mouse).some(k=>!['dx','dy'].includes(k))||![mouse.dx,mouse.dy].every(n=>Number.isFinite(n)&&Math.abs(n)<=640)) throw Error('Invalid mouse delta');
 if (!Array.isArray(buttons)||buttons.some(b=>!['left','right'].includes(b))||new Set(buttons).size!==buttons.length) throw Error('Invalid buttons');
 return {keys:[...keys],frames,mouse:{...mouse},buttons:[...buttons]};
}
export function completionURL(base) {
 const u=new URL(base);if(!['http:','https:'].includes(u.protocol)||u.username||u.password||u.search||u.hash)throw Error('Invalid model endpoint');
 const pathname=u.pathname.replace(/\/$/,'');
 u.pathname=pathname.endsWith('/chat/completions')?pathname:pathname+(pathname.endsWith('/v1')?'':'/v1')+'/chat/completions';
 return u.href;
}
export function isHardwareGPU(info){return /nvidia|radeon|intel|apple/i.test(info?.renderer??'')&&!/swiftshader|llvmpipe|software/i.test(info?.renderer??'');}
