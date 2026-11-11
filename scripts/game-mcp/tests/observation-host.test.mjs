import test from 'node:test';
import assert from 'node:assert/strict';
import {HostObservations} from '../observation-host.mjs';

const snapshot=n=>({metadata:{observation_id:'private:'+n,done:false,outcome:'active'},image:'PIXELS_'+n,mimeType:'image/png'});
const call=(id,request_id='action-'+id,action={keys:[],wait_seconds:0.1})=>({jsonrpc:'2.0',id,method:'tools/call',params:{name:'game_step',arguments:{request_id,action}}});
const response=(id,n)=>({jsonrpc:'2.0',id,result:{structuredContent:snapshot(n).metadata,content:[{type:'image',data:snapshot(n).image,mimeType:'image/png'}]}});
const generation=(host,path='/responses')=>host.modelRequest({type:'api_start',id:'model',method:'POST',path});
const fixture=()=>{const host=new HostObservations();host.initialize(snapshot(0));generation(host);return host;};
const code=value=>JSON.parse(value.reply.result.content[0].text).code;

test('uncertain retries retain their binding and completed retries never repeat an image',()=>{
 const host=fixture();
 const first=host.request(call(1,'same')),retry=host.request(call(2,'same'));
 assert.equal(first.forward.params.arguments.observation_id,'private:0');
 assert.deepEqual(first.forward.params.arguments,retry.forward.params.arguments);
 assert.equal(code(host.request(call(3,'other'))),'ACTION_IN_PROGRESS');
 assert.equal(code(host.request(call(4,'same',{keys:[],wait_seconds:0.2}))),'REQUEST_ID_CONFLICT');
 assert.equal(host.response(response(1,1)).result.content[0].type,'image');
 assert.equal(JSON.parse(host.response(response(2,1)).result.content[0].text).code,'ACTION_ALREADY_COMPLETED');
 generation(host);assert.equal(host.request(call(5)).forward.params.arguments.observation_id,'private:1');
 host.response(response(5,2));
 assert.equal(code(host.request(call(6,'same'))),'ACTION_ALREADY_COMPLETED');
 assert.equal(host.current.metadata.observation_id,'private:2','old receipt must never rewind current state');
 generation(host);assert.equal(host.request(call(7)).forward.params.arguments.observation_id,'private:2');
});

test('two actions from one generation cannot consume successive screenshots',()=>{
 const host=fixture();host.request(call(1));host.response(response(1,1));
 const stale=host.request(call(2));assert(!stale.forward);assert(stale.reply.result.isError);
 assert.equal(code(stale),'STALE_OBSERVATION');assert(stale.reply.result.content.every(p=>p.type==='text'));
 // Token counting and compaction are not a new gameplay inference.
 generation(host,'/models');generation(host,'/responses/compact');
 assert(!host.request(call(3)).forward);
 generation(host,'/chat/completions');assert(host.request(call(4)).forward);
});

test('the first model-authored action wins even when the second RPC arrives first',()=>{
 const host=fixture(),first=call(1,'first'),extra=call(2,'second');
 host.modelResponse([first,extra].map(message=>({type:'function_call',arguments:JSON.stringify(message.params.arguments)})));
 assert.equal(code(host.request(extra)),'EXTRA_ACTION');
 const accepted=host.request(first);assert(accepted.forward);
 assert.equal(host.response(response(first.id,1)).result.content[0].type,'image');
 assert.equal(code(host.request(call(3,'second'))),'EXTRA_ACTION');
 generation(host);host.modelResponse([{type:'function_call',arguments:JSON.stringify(call(4).params.arguments)}]);
 assert(host.request(call(4)).forward);
});

test('one generation cannot submit another action after its first action fails validation',()=>{
 const host=fixture();host.request(call(1));
 host.response({jsonrpc:'2.0',id:1,result:{isError:true,content:[{type:'text',text:'Invalid action'}]}});
 assert.equal(code(host.request(call(2))),'ACTION_ALREADY_SUBMITTED');
 assert.equal(host.current.metadata.observation_id,'private:0');
 generation(host);assert(host.request(call(3)).forward);
 const malformed=fixture();const bad=call(1);bad.params.arguments.action=null;
 assert.equal(code(malformed.request(bad)),'INVALID_ACTION');
 assert.equal(code(malformed.request(call(2))),'ACTION_ALREADY_SUBMITTED');
 generation(malformed);assert(malformed.request(call(3)).forward);
});

test('300 accepted actions plus extra calls and retries produce exactly 300 images',()=>{
 const host=new HostObservations();host.initialize(snapshot(0));let delivered=0,forwarded=0,id=0;
 for(let round=0;round<300;round++){
  generation(host);const requestId='round-'+round;
  const first=host.request(call(++id,requestId));assert(first.forward);forwarded++;
  // The same inference may issue more calls while the first is running.
  const concurrent=host.request(call(++id));assert(!concurrent.forward);assert.equal(code(concurrent),'ACTION_IN_PROGRESS');
  const rpc=first.forward.id,result=host.response(response(rpc,round+1));
  delivered+=result.result.content.filter(p=>p.type==='image').length;
  for(const next of [call(++id),call(++id,requestId),call(++id,requestId)]){
   const extra=host.request(next);assert(extra.reply);assert(!extra.forward);
   assert(extra.reply.result.content.every(p=>p.type==='text'));
  }
 }
 assert.equal(forwarded,300);assert.equal(delivered,300);
 assert.equal(host.receipts.size,300,'discarded calls do not consume the action/receipt budget');
 assert.equal(host.current.metadata.observation_id,'private:300');
});

test('identical pixels after two real actions are still two distinct valid observations',()=>{
 const host=fixture();host.request(call(1));const one=response(1,1);one.result.content[0].data='UNCHANGED';
 assert.equal(host.response(one).result.content[0].type,'image');
 generation(host);host.request(call(2));const two=response(2,2);two.result.content[0].data='UNCHANGED';
 assert.equal(host.response(two).result.content[0].type,'image');
 assert.equal(host.current.metadata.observation_id,'private:2');
});

test('transport uncertainty preserves the original binding and blocks new actions',()=>{
 const host=fixture();const request=host.request(call(1,'uncertain'));
 // No response: delivery/execution may have occurred. Only an identical retry
 // may reach the server, whose durable receipt owns the actual execution.
 generation(host);assert.equal(code(host.request(call(2))),'ACTION_IN_PROGRESS');
 assert.deepEqual(host.request(call(3,'uncertain')).forward.params.arguments,request.forward.params.arguments);
 assert.equal(code(host.request(call(4,'uncertain',{keys:[{key:'w',duration_seconds:1}]}))),'REQUEST_ID_CONFLICT');
});

test('private fields, malformed arguments and reused RPC IDs cannot bypass the boundary',()=>{
 const host=fixture();
 for(const args of [null,[],{}, {request_id:'x',observation_id:'forged',action:{keys:[]}},
  {request_id:'x',action:null},{request_id:'bad id',action:{keys:[]}}]){
  const message=call(1);message.params.arguments=args;
  assert.equal(code(host.request(message)),'INVALID_ACTION');
 }
 generation(host);
 const first=call(1);host.request(first);
 assert.equal(code(host.request(first)),'ACTION_IN_PROGRESS');
 const reordered=call(2,'action-1',{wait_seconds:0.1,keys:[]});
 assert(host.request(reordered).forward,'JSON property ordering does not change an action');
 assert.throws(()=>host.initialize(snapshot(1)),/replaced/);
 assert.throws(()=>new HostObservations().initialize({...snapshot(0),metadata:{}}),/version/);
});

test('protocol discovery passes through and only the no-model smoke bypasses generation fencing',()=>{
 const host=new HostObservations();const listing={jsonrpc:'2.0',id:1,method:'tools/list'};
 assert.deepEqual(host.request(listing),{forward:listing});
 assert.equal(code(host.request(call(2))),'HOST_NOT_READY');
 host.initialize(snapshot(0));assert(!host.request(call(3)).forward);
 const smoke=new HostObservations({requireGeneration:false});smoke.initialize(snapshot(0));
 assert(smoke.request(call(1)).forward);
});
