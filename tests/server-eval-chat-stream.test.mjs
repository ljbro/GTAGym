import test from 'node:test';
import assert from 'node:assert/strict';
import {readChatStream} from '../scripts/server-eval/chat-stream.mjs';
import {modelReply,reasoningMetadata} from '../scripts/server-eval/model-response.mjs';
import {transientRequestError} from '../scripts/server-eval/transport-retry.mjs';

const event=body=>'data: '+JSON.stringify(body)+'\r\n\r\n';
function streamed(text,step=7){
 const bytes=new TextEncoder().encode(text);let offset=0,cancelled=false;
 const response=new Response(new ReadableStream({pull(c){if(offset===bytes.length){c.close();return;}const end=Math.min(bytes.length,offset+step);c.enqueue(bytes.slice(offset,end));offset=end;},cancel(){cancelled=true;}}));
 return {response,cancelled:()=>cancelled};
}
const chunk=(delta,other={})=>({id:'test',object:'chat.completion.chunk',created:123,model:'Qwen3.5-9B',choices:[{index:0,delta,finish_reason:null}],...other});

test('SSE preserves reasoning, actions, final usage and original unknown provider fields',async()=>{
 const rows=[chunk({role:'assistant',content:''}),chunk({reasoning:"View Screenshot First."}),chunk({reasoning:' Then decide.'}),chunk({content:'{"keys":[],'}),chunk({content:'"wait_seconds":0.1}'},{choices:[{index:0,delta:{content:'"wait_seconds":0.1}'},finish_reason:'stop'}],provider_extra:'kept'}),
  {id:'test',model:'Qwen3.5-9B',choices:[],usage:{prompt_tokens:10,completion_tokens:20,total_tokens:30}}];
 const {response}=streamed(': heartbeat\r\n\r\n'+rows.map(event).join('')+'data: [DONE]\r\n\r\n',1);
 const body=await readChatStream(response),reply=modelReply(body,{api:'chat-completions'});
 assert.equal(reply.raw,'{"keys":[],"wait_seconds":0.1}');
 assert.equal(body.choices[0].message.reasoning,"View Screenshot First. Then decide.");
 assert.equal(body.choices[0].message.role,'assistant');assert.equal(reply.finishReason,'stop');
 assert.equal(reasoningMetadata(body).status,'text_returned');assert.deepEqual(reply.usage,rows.at(-1).usage);
 assert.deepEqual(body.providerStream.chunks,rows);assert.equal(body.providerStream.complete,true);
});

test('reasoning_content and content are independent; usage-only chunks cannot erase the action',async()=>{
 const rows=[chunk({reasoning_content:'Think.'}),chunk({content:'{}'},{choices:[{index:0,delta:{content:'{}'},finish_reason:'length',stop_reason:99}]}),{choices:[],usage:{total_tokens:3}}];
 const {response}=streamed(rows.map(event).join('')+'data: [DONE]\n\n',10000);
 const body=await readChatStream(response);
 assert.equal(body.choices[0].message.reasoning_content,'Think.');assert.equal(body.choices[0].message.content,'{}');
 assert.equal(body.choices[0].finish_reason,'length');assert.equal(body.choices[0].stop_reason,99);
});

test('truncated streams fail closed and retain partial reasoning for diagnostics',async()=>{
 const rows=[chunk({reasoning:'Partial reasoning.'}),chunk({content:'{"keys":'})];
 const {response}=streamed(rows.map(event).join(''));
 await assert.rejects(readChatStream(response),error=>{
  assert.match(error.message,/terminated/);assert(transientRequestError(error));
  assert.equal(error.modelResponse.providerStream.complete,false);
  assert.equal(error.modelResponse.choices[0].message.reasoning,'Partial reasoning.');return true;
 });
});

test('DONE without a finished choice is rejected, not accepted as an empty model action',async()=>{
 const {response}=streamed(event(chunk({content:'{}'}))+'data: [DONE]\n\n');
 await assert.rejects(readChatStream(response),/terminated before a complete final response/);
});

test('provider errors and malformed SSE JSON are not silently ignored',async()=>{
 await assert.rejects(readChatStream(streamed(event({error:{message:'backend unavailable',code:503}})).response),e=>{
  assert.match(e.message,/backend unavailable/);assert.equal(e.modelResponse.error.code,503);return true;
 });
 await assert.rejects(readChatStream(streamed('data: broken\n\n').response),/invalid JSON/);
});

test('multi-line event data, LF, and a DONE event without a terminal newline work',async()=>{
 const payload=JSON.stringify(chunk({content:'{}'},{choices:[{index:0,delta:{content:'{}'},finish_reason:'stop'}]}),null,2);
 const wire=payload.split('\n').map(line=>'data: '+line).join('\n')+'\n\n'+'data: [DONE]';
 const body=await readChatStream(streamed(wire).response);assert.equal(body.choices[0].message.content,'{}');
});

test('stream transport is opt-in; other models keep their existing non-streaming requests',async()=>{
 const {modelRequest}=await import('../scripts/server-eval/model-request.mjs');
 const request=modelRequest({model:'glm-5.3-flash',api:'chat-completions',maxTokens:32768,messages:[]});
 assert.equal(request.stream,undefined);assert.equal(request.temperature,0);
});
