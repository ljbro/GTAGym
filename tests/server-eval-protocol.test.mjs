import test from 'node:test';import assert from 'node:assert/strict';
import {validateAction,completionURL,isHardwareGPU} from '../scripts/server-eval/protocol.mjs';
test('strict bounded GUI actions, not debug teleport/autopilot',()=>{
 assert.equal(validateAction({keys:['w','Shift'],frames:120}).mouse.dx,0);
 for(const a of [{keys:['r'],frames:60},{keys:['w','w'],frames:1},{keys:[],frames:0},{keys:[],frames:121},{keys:[],frames:2.5},{keys:[],frames:1,teleport:[0,0]},{keys:[],frames:1,mouse:{dx:NaN,dy:0}},{keys:[],frames:1,buttons:['middle']}])assert.throws(()=>validateAction(a));
});
test('endpoint normalization and renderer verification',()=>{
 assert.equal(completionURL('http://localhost:4000'),'http://localhost:4000/v1/chat/completions');
 assert.equal(completionURL('http://localhost:4000/v1/'),'http://localhost:4000/v1/chat/completions');
 assert.throws(()=>completionURL('http://secret:pass@localhost'));
 assert(isHardwareGPU({renderer:'ANGLE NVIDIA RTX 4090'}));assert(!isHardwareGPU({renderer:'ANGLE Vulkan SwiftShader'}));assert(!isHardwareGPU({renderer:'llvmpipe'}));
});
test('evaluation excludes arrow keys but retains movement and numpad controls',()=>{
 for(const key of ['ArrowUp','ArrowDown','ArrowLeft','ArrowRight'])assert.throws(()=>validateAction({keys:[key],frames:1}),/Invalid keys/);
 for(const key of ['w','a','s','d','Numpad4','Numpad5','Numpad6','Numpad8'])assert.deepEqual(validateAction({keys:[key],frames:1}).keys,[key]);
});
