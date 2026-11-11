import test from 'node:test';
import assert from 'node:assert/strict';
import {validatedPolicyReply} from '../scripts/server-eval/policy-retry.mjs';
import {parse} from '../scripts/server-eval/actions.mjs';
const good='{"keys":[{"key":"w","duration_seconds":1}]}';
test('format retry preserves current image/history, saves bad attempts and accepts only validated JSON',async()=>{
 const messages=[{role:'system',content:'protocol'},{role:'user',content:[{type:'image_url',image_url:{url:'data:image/jpeg;base64,a'}}]}],before=JSON.stringify(messages),requests=[];
 const response=await validatedPolicyReply({messages,parse,request:async m=>{requests.push(m);return {raw:requests.length===1?'explanation\n'+good:good};}});
 assert.equal(requests.length,2);assert.equal(response.raw,good);assert.equal(response.attempts.length,2);assert(response.attempts[0].validationError);
 assert.equal(JSON.stringify(messages),before);assert.equal(requests[1][1],messages[1]);assert.equal(requests[1].length,4);
});
test('at most three attempts; all failures remain attached; no unvalidated action is returned',async()=>{
 let calls=0;await assert.rejects(validatedPolicyReply({messages:[],parse,request:async()=>{calls++;return {raw:'bad'};}}),e=>e.attempts.length===3&&/after 3/.test(e.message));assert.equal(calls,3);
});
test('transport/auth errors are not retried as formatting failures',async()=>{
 let calls=0;await assert.rejects(validatedPolicyReply({messages:[],parse,request:async()=>{calls++;throw Error('Model HTTP 401');}}),/401/);assert.equal(calls,1);
});
test('cancellation prevents another format attempt',async()=>{
 const controller=new AbortController();let calls=0;
 await assert.rejects(validatedPolicyReply({messages:[],parse,signal:controller.signal,request:async()=>{calls++;return {raw:'bad'};},onRetry:()=>controller.abort(Error('stop'))}),/stop/);assert.equal(calls,1);
});
