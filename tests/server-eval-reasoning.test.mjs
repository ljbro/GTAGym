import test from 'node:test';
import assert from 'node:assert/strict';
import {completionRequest,resumeReasoningEffort,resumeThinking} from '../scripts/server-eval/model-request.mjs';
const base={model:'glm-5.3-flash',messages:[{role:'user',content:'test'}],maxTokens:32768};
test('DeepSeek receives explicit thinking enabled and max without tools or temperature',()=>{
 const r=completionRequest({...base,model:'deepseek-flash',thinking:'enabled',reasoningEffort:'max'});
 assert.deepEqual(r.thinking,{type:'enabled'});assert.equal(r.reasoning_effort,'max');
 assert(!Object.hasOwn(r,'tools'));assert(!Object.hasOwn(r,'temperature'));
 assert(!Object.hasOwn(completionRequest(base),'thinking'));
 assert.throws(()=>completionRequest({...base,thinking:'yes'}),/Invalid thinking/);
 assert.equal(resumeThinking({thinking:'enabled'},''),'enabled');
 assert.equal(resumeThinking({},''),'');
 assert.throws(()=>resumeThinking({thinking:'enabled'},'disabled',true),/mismatch/);
});
test('explicit max is included in the actual request, independently of token budget',()=>{
 const request=completionRequest({...base,reasoningEffort:'max'});
 assert.equal(request.reasoning_effort,'max');assert.equal(request.max_tokens,32768);
 assert.deepEqual(request.messages,base.messages);assert.equal(request.temperature,0);
});
test('omitted effort preserves legacy API-default requests; invalid values fail',()=>{
 assert(!Object.hasOwn(completionRequest(base),'reasoning_effort'));
 for(const value of ['low','high','xhigh','max'])assert.equal(completionRequest({...base,reasoningEffort:value}).reasoning_effort,value);
 for(const value of ['maximum','medium',null,2])assert.throws(()=>completionRequest({...base,reasoningEffort:value}));
});
test('GPT-6.1 Sol sends xhigh using OpenAI fields without vendor thinking or temperature',()=>{
 const request=completionRequest({...base,model:'gpt-6.1-sol',thinking:'enabled',reasoningEffort:'xhigh'});
 assert.equal(request.model,'gpt-6.1-sol');assert.equal(request.reasoning_effort,'xhigh');
 assert.equal(request.max_completion_tokens,32768);assert.deepEqual(request.messages,base.messages);
 for(const key of ['thinking','temperature','max_tokens','tools'])assert(!Object.hasOwn(request,key));
 assert.equal(resumeReasoningEffort({'reasoning-effort':'xhigh'},'xhigh',true),'xhigh');
 assert.throws(()=>resumeReasoningEffort({'reasoning-effort':'xhigh'},'max',true),/mismatch/);
});
test('checkpoints preserve reasoning mode and reject silent changes on resume',()=>{
 assert.equal(resumeReasoningEffort({'reasoning-effort':'max'},''),'max');
 assert.equal(resumeReasoningEffort({'reasoning-effort':'max'},'max',true),'max');
 assert.equal(resumeReasoningEffort({},''),'');
 assert.throws(()=>resumeReasoningEffort({},'max',true),/mismatch/);
 assert.throws(()=>resumeReasoningEffort({'reasoning-effort':'max'},'low',true),/mismatch/);
});
