import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {TokenUsageLedger,normalizeTokenUsage} from '../scripts/server-eval/token-usage.mjs';
import {summarizeTokenUsage} from '../scripts/server-eval/summarize-token-usage.mjs';
import {validatedPolicyReply} from '../scripts/server-eval/policy-retry.mjs';
import {retryEmptyResponse,emptyResponseState} from '../scripts/server-eval/empty-response-retry.mjs';
const usage={prompt_tokens:100,completion_tokens:30,total_tokens:130,prompt_tokens_details:{cached_tokens:40},completion_tokens_details:{reasoning_tokens:20}};
async function fixture(t,model='fixture'){
 const output=await fs.mkdtemp(path.join(os.tmpdir(),'gta-token-usage-'));t.after(()=>fs.rm(output,{recursive:true,force:true}));
 return {output,ledger:new TokenUsageLedger(output,{model})};
}
test('Chat and Responses usage aliases never double-count tokens, reasoning or cache',()=>{
 const actual=normalizeTokenUsage({...usage,input_tokens:100,output_tokens:30,input_tokens_details:{cached_tokens:40},output_tokens_details:{reasoning_tokens:20}});
 assert.deepEqual(actual,{inputTokens:100,outputTokens:30,totalTokens:130,reasoningTokens:20,cachedInputTokens:40,cacheWriteInputTokens:0,complete:true});
 assert.equal(normalizeTokenUsage({prompt_tokens:0,completion_tokens:0}).totalTokens,0);
 assert.equal(normalizeTokenUsage(undefined),null);
});
test('network failure, missing and partial usage remain visible and are not invented',async t=>{
 const {output,ledger}=await fixture(t);
 const pending=ledger.begin('c01-n04',1);await ledger.flush();
 assert.equal(JSON.parse(await fs.readFile(path.join(output,'token-usage.json'),'utf8')).totals.pendingRequests,1);
 await ledger.failure(pending);await ledger.response(ledger.begin('c01-n04',1),{});
 await ledger.response(ledger.begin('c01-n04',1),{usage:{total_tokens:9}});
 await ledger.response(ledger.begin('c01-n04',2),{usage});
 await ledger.finish();const s=ledger.snapshot();
 assert.equal(s.running,false);assert.equal(s.totals.requestsStarted,4);assert.equal(s.totals.failedRequests,1);
 assert.equal(s.totals.responsesMissingUsage,1);assert.equal(s.totals.responsesPartialUsage,1);assert.equal(s.totals.pendingRequests,0);
 assert.equal(s.totals.inputTokens,100);assert.equal(s.totals.outputTokens,30);assert.equal(s.totals.totalTokens,139);
 await assert.rejects(ledger.response(pending,{usage}),/already settled/);
 assert.equal(s.byTask['c01-n04'].requestsStarted,4);
});
test('format corrections and empty retries each count once, including the accepted reply',async t=>{
 const {ledger}=await fixture(t);let n=0;
 const result=await validatedPolicyReply({messages:[],parse:raw=>{if(raw!=='ok')throw Error('bad');},request:async()=>{
  const ticket=ledger.begin('task',1);await ledger.response(ticket,{usage});return {raw:++n<3?'bad':'ok',usage};
 }});
 assert.equal(result.attempts.length,3);assert.equal(ledger.snapshot().totals.totalTokens,390);
 n=0;const state=emptyResponseState();
 await retryEmptyResponse(async()=>{const ticket=ledger.begin('task',2);await ledger.response(ticket,{usage});return {raw:++n<3?'':'ok',emptyReply:n<3,usage};},{state,wait:async()=>{}});
 assert.equal(ledger.snapshot().totals.requestsStarted,6);assert.equal(ledger.snapshot().totals.inputTokens,600);
});
test('concurrent responses serialize snapshots and combined models add only each ledger once',async t=>{
 const one=await fixture(t,'one'),two=await fixture(t,'two');
 await Promise.all(Array.from({length:4},(_,round)=>one.ledger.response(one.ledger.begin('task-'+round,1),{usage})));
 await two.ledger.response(two.ledger.begin('task',1),{usage});await Promise.all([one.ledger.finish(),two.ledger.finish()]);
 const saved=JSON.parse(await fs.readFile(path.join(one.output,'token-usage.json'),'utf8'));assert.equal(saved.totals.requestsStarted,4);
 const combined=await summarizeTokenUsage([{model:'one',output:one.output},{model:'two',output:two.output}]);
 assert.equal(combined.totals.inputTokens,500);assert.equal(combined.totals.outputTokens,150);assert.equal(combined.totals.totalTokens,650);
 assert.equal(combined.models.length,2);assert.equal(combined.models[0].running,false);
});
