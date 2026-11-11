import test from 'node:test';
import assert from 'node:assert/strict';
import {verifyBrowserGPU} from '../scripts/server-eval/browser-affinity.mjs';

function fixture(){
 const cdp={detached:false,async send(){return {processInfo:[{id:21,type:'GPU'}]};},async detach(){this.detached=true;}};
 return {cdp,browser:{async newBrowserCDPSession(){return cdp;}}};
}
const xml=uuid=>`<nvidia_smi_log><gpu id="0"><uuid>${uuid}</uuid><process_info><pid>21</pid><used_memory>640 MiB</used_memory></process_info></gpu></nvidia_smi_log>`;
test('GPU affinity waits for delayed accounting and still proves the exact UUID',async()=>{
 const {browser,cdp}=fixture();let samples=0;
 const result=await verifyBrowserGPU(browser,{uuid:'GPU-expected'},{pollMs:1,timeoutMs:1000,
  inventory:()=>++samples<3?'<nvidia_smi_log/>':xml('GPU-expected')});
 assert.equal(samples,3);assert.equal(result.verified,true);assert.equal(result.verificationAttempts,3);assert.equal(cdp.detached,true);
});
test('an actual wrong GPU is rejected immediately',async()=>{
 const {browser,cdp}=fixture();let samples=0;
 await assert.rejects(()=>verifyBrowserGPU(browser,{uuid:'GPU-expected'},{pollMs:1,timeoutMs:1000,
  inventory:()=>{samples++;return xml('GPU-other');}}),/Graphics GPU selection failed/);
 assert.equal(samples,1);assert.equal(cdp.detached,true);
});
test('missing GPU evidence has a finite deadline and no software fallback',async()=>{
 const {browser,cdp}=fixture();
 await assert.rejects(()=>verifyBrowserGPU(browser,{uuid:'GPU-expected'},{pollMs:1,timeoutMs:10,
  inventory:()=>'<nvidia_smi_log/>'}),/Graphics GPU selection failed/);
 assert.equal(cdp.detached,true);
});
