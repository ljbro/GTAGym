import test from 'node:test';
import assert from 'node:assert/strict';
import {modelTransport,modelEndpoint,responsesURL,resumeModelTransport,responsesInput,responsesRequest,modelRequest} from '../scripts/server-eval/model-request.mjs';
import {completionURL} from '../scripts/server-eval/protocol.mjs';
import {modelReply,saveModelResponse} from '../scripts/server-eval/model-response.mjs';
import {ModelContext} from '../scripts/server-eval/context.mjs';

const raw='{"keys":[],"wait_seconds":0.1}';
const messages=[{role:'system',content:'exact Markdown prompt'},
 {role:'user',content:[{type:'text',text:'exact instruction'},{type:'image_url',image_url:{url:'data:image/jpeg;base64,YWJj'}}]},
 {role:'assistant',content:raw},{role:'user',content:[{type:'image_url',image_url:{url:'data:image/png;base64,ZGVm',detail:'high'}}]}];
const response=(status='completed')=>({id:'response-id',object:'response',status,
 output:[{type:'reasoning',summary:[{type:'summary_text',text:'The purple route bends right; slow before steering.'}],encrypted_content:'opaque'},
  {type:'message',role:'assistant',content:[{type:'output_text',text:raw}]}],
 usage:{input_tokens:100,output_tokens:30,total_tokens:130,input_tokens_details:{cached_tokens:50},output_tokens_details:{reasoning_tokens:20}},
});

test('new OpenAI runs request Responses summaries; other models retain Chat Completions',()=>{
 for(const model of ['gpt-6.1-sol','GPT-6-Astra','openai/gpt-6-astra','o3'])assert.deepEqual(modelTransport({model}),{api:'responses',reasoningSummary:'auto'});
 for(const model of ['glm-5.3-flash','kimi-k3','deepseek-flash','Qwen3.8-27B'])assert.deepEqual(modelTransport({model}),{api:'chat-completions',reasoningSummary:'off'});
 assert.deepEqual(modelTransport({model:'gpt-6-astra',api:'chat-completions'}),{api:'chat-completions',reasoningSummary:'off'});
 assert.throws(()=>modelTransport({model:'gpt-6-astra',api:'bogus'}));
 assert.throws(()=>modelTransport({model:'gpt-6-astra',reasoningSummary:'full-chain'}));
});

test('convert existing endpoint forms without adding duplicate version or leaking credentials',()=>{
 for(const base of ['http://localhost:8080','http://localhost:8080/v1/','http://localhost:8080/v1/chat/completions','http://localhost:8080/v1/responses'])assert.equal(responsesURL(base),'http://localhost:8080/v1/responses');
 assert.equal(responsesURL('https://example.invalid/openai/v1/chat/completions'),'https://example.invalid/openai/v1/responses');
 assert.equal(modelEndpoint('https://example.invalid/v1/responses','chat-completions'),'https://example.invalid/v1/chat/completions');
 assert.equal(modelEndpoint('https://example.invalid/v1/chat/completions','responses'),'https://example.invalid/v1/responses');
 assert.equal(modelEndpoint('https://example.invalid/v1/','chat-completions'),completionURL('https://example.invalid/v1/'));
 assert.throws(()=>modelEndpoint('https://example.invalid/v1','bogus'));
 for(const url of ['file:///tmp/x','https://secret:pass@example.invalid','https://example.invalid/v1?key=secret','https://example.invalid/#fragment']){
  assert.throws(()=>responsesURL(url));assert.throws(()=>modelEndpoint(url,'chat-completions'));
 }
});

test('Responses request preserves current images and original assistant JSON without server-side history',()=>{
 const original=JSON.stringify(messages),request=responsesRequest({model:'gpt-6.1-sol',messages,maxTokens:32768,reasoningEffort:'xhigh'});
 assert.deepEqual(request.reasoning,{effort:'xhigh',summary:'auto'});assert.equal(request.max_output_tokens,32768);
 assert.equal(request.store,false);assert.equal(request.stream,false);assert.equal(request.truncation,'disabled');
 assert.deepEqual(request.input,[{role:'system',content:'exact Markdown prompt'},
  {role:'user',content:[{type:'input_text',text:'exact instruction'},{type:'input_image',image_url:'data:image/jpeg;base64,YWJj',detail:'auto'}]},
  {role:'assistant',content:raw},{role:'user',content:[{type:'input_image',image_url:'data:image/png;base64,ZGVm',detail:'high'}]}]);
 for(const key of ['messages','tools','previous_response_id','conversation','temperature','thinking','max_tokens','reasoning_effort'])assert(!Object.hasOwn(request,key));
 assert.equal(JSON.stringify(messages),original);
 assert.throws(()=>responsesInput([{role:'tool',content:'not used'}]));
 assert.throws(()=>responsesInput([{role:'user',content:[{type:'unsupported'}]}]));
});

test('reasoning summary is independent from effort and is never requested in the legacy chat body',()=>{
 for(const summary of ['auto','concise','detailed'])assert.equal(responsesRequest({model:'gpt-6-astra',messages,maxTokens:300,reasoningSummary:summary}).reasoning.summary,summary);
 assert(!Object.hasOwn(responsesRequest({model:'gpt-6-astra',messages,maxTokens:300,reasoningSummary:'off'}),'reasoning'));
 const request=modelRequest({model:'gpt-6.1-sol',api:'chat-completions',messages,maxTokens:32768,reasoningEffort:'xhigh'});
 assert.equal(request.max_completion_tokens,32768);assert.deepEqual(request.messages,messages);assert(!Object.hasOwn(request,'input'));assert(!Object.hasOwn(request,'reasoning'));
});

test('only final output text is parsed as actions; summary and commentary never contaminate JSON',()=>{
 const body=response();body.output.splice(1,0,{type:'message',role:'assistant',phase:'commentary',content:[{type:'output_text',text:'Ignore this commentary.'}]});
 body.output.at(-1).phase='final_answer';
 const result=modelReply(body,{api:'responses'});assert.equal(result.raw,raw);assert.equal(result.finishReason,'stop');
 assert.equal(result.usage.prompt_tokens,100);assert.equal(result.usage.completion_tokens,30);assert.equal(result.usage.completion_tokens_details.reasoning_tokens,20);
 assert.deepEqual(result.modelResponse,body);assert.equal(body.usage.prompt_tokens,undefined);
 const saved={};saveModelResponse(saved,result);assert.equal(saved.reasoning.status,'summary_only');assert(saved.reasoning.textAvailable);
 assert.equal(saved.modelResponse.output[0].summary[0].text,'The purple route bends right; slow before steering.');
});

test('reasoning-only and incomplete responses do not fabricate actions; provider errors retain complete evidence',()=>{
 const only=response();only.output=only.output.slice(0,1);assert.equal(modelReply(only,{api:'responses'}).raw,'');
 const partial=response('incomplete');partial.incomplete_details={reason:'max_output_tokens'};assert.equal(modelReply(partial,{api:'responses'}).finishReason,'length');
 const failed={...response('failed'),error:{message:'reasoning summary not supported'}};
 assert.throws(()=>modelReply(failed,{api:'responses'}),e=>e.name==='ModelResponseError'&&e.modelResponse===failed);
 assert.throws(()=>modelReply({choices:[{message:{content:raw}}]},{api:'responses'}),/expected output array/);
 assert.throws(()=>modelReply(response('in_progress'),{api:'responses'}),/did not finish/);
});

test('Responses conversion obeys the same 10-image/oldest-five pruning and never adds reasoning to history',()=>{
 const context=new ModelContext('system','instruction');
 for(let round=1;round<=16;round++){
  context.observe({round,image:Buffer.from('frame'+round)});
  const request=responsesRequest({model:'gpt-6-astra',messages:context.messages(),maxTokens:1000});
  const images=request.input.flatMap(m=>Array.isArray(m.content)?m.content:[]).filter(p=>p.type==='input_image');
  assert.equal(images.length,context.rounds.length);assert(images.length<=10);
  assert.equal(request.input.filter(m=>m.role==='assistant').length,images.length-1);
  if(round===11)assert.deepEqual(context.rounds,[6,7,8,9,10,11]);
  if(round===16)assert.deepEqual(context.rounds,[11,12,13,14,15,16]);
  assert(!JSON.stringify(request.input).includes('purple route bends'));
  context.reply(modelReply(response(),{api:'responses'}).raw);
 }
});

test('legacy checkpoints pin Chat API/off; new checkpoints pin summary and API and reject silent changes',()=>{
 const old={model:'gpt-6.1-sol'};
 assert.deepEqual(resumeModelTransport(old),{api:'chat-completions',reasoningSummary:'off'});
 assert.throws(()=>resumeModelTransport(old,{api:'responses',explicitAPI:true}),/API mismatch/);
 assert.throws(()=>resumeModelTransport(old,{reasoningSummary:'auto',explicitSummary:true}),/summary mismatch/);
 const current={model:'gpt-6-astra',api:'responses','reasoning-summary':'auto'};
 assert.deepEqual(resumeModelTransport(current),{api:'responses',reasoningSummary:'auto'});
 assert.throws(()=>resumeModelTransport(current,{api:'chat-completions',explicitAPI:true}),/API mismatch/);
 assert.throws(()=>resumeModelTransport(current,{reasoningSummary:'off',explicitSummary:true}),/summary mismatch/);
});
