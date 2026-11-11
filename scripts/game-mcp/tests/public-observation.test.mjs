import test from 'node:test';
import assert from 'node:assert/strict';
import {publicObservation,modelMcpMessage,publicGameStepSchema,GAME_MCP_INSTRUCTIONS,GAME_STEP_DESCRIPTION,INITIAL_USER_PROMPT} from '../public-observation.mjs';
import {initialUserMessage} from '../bootstrap.mjs';

const image={type:'image',data:Buffer.from('UNCHANGED_PIXELS').toString('base64'),mimeType:'image/png'};
const metadata={task_id:'PRIVATE_TASK',observation_id:'opaque:0',width:1280,height:720,done:false,outcome:'active'};
const snapshot={metadata,image:image.data,mimeType:image.mimeType};
const observationResult=(id='opaque:1',extra={})=>({jsonrpc:'2.0',id:10,result:{
 structuredContent:{...metadata,observation_id:id,...extra},
 content:[{type:'text',text:JSON.stringify({...metadata,observation_id:id,...extra})},{...image,annotations:{private:'PRIVATE_IMAGE_METADATA'}},
  {type:'text',text:'PRIVATE_EXTRA_TEXT'},{type:'resource',resource:{uri:'private://score',text:'PRIVATE_SCORE'}}],
 _meta:{private:'PRIVATE_RESULT_METADATA'}}});

test('initial image and saved public snapshot contain only pixels and MIME type',()=>{
 assert.deepEqual(publicObservation({...snapshot,private:'PRIVATE_TOP_LEVEL'}),{image:image.data,mimeType:image.mimeType});
 assert.equal(INITIAL_USER_PROMPT,'play the game use game_step');
 const initial=initialUserMessage(snapshot);
 assert.deepEqual(initial.content,[{type:'text',text:INITIAL_USER_PROMPT},{type:'image_url',image_url:{url:`data:${image.mimeType};base64,${image.data}`}}]);
 assert.deepEqual(publicObservation({...snapshot,metadata:{}}),publicObservation(snapshot));
 assert.throws(()=>publicObservation({...snapshot,image:''}),/image/);
 assert.throws(()=>initialUserMessage({...snapshot,metadata:{...metadata,done:true}}),/ended/);
});

test('game projection preserves new pixels but never sends images or private metadata on rejected actions',()=>{
 const original=observationResult(),result=modelMcpMessage(original);
 assert.deepEqual(result,{jsonrpc:'2.0',id:10,result:{content:[image]}});
 assert.deepEqual(modelMcpMessage(result),result,'projection must be safe on both sides of the boundary');
 assert(!JSON.stringify(result).includes('PRIVATE'));assert(!JSON.stringify(result).includes('done'));assert(!JSON.stringify(result).includes('outcome'));
 assert.equal(original.result.structuredContent.task_id,'PRIVATE_TASK','private evaluator result is not mutated');
 const stale=observationResult();stale.result.isError=true;
 stale.result.content.unshift({type:'text',text:'{"code":"STALE_OBSERVATION","message":"Use current observation"}'});
 assert.deepEqual(modelMcpMessage(stale).result,{isError:true,content:[{type:'text',text:'{"code":"STALE_OBSERVATION","message":"Use current observation"}'}]});
 const unsafeError=observationResult();unsafeError.result.isError=true;
 const safeError=modelMcpMessage(unsafeError);assert(safeError.result.content.every(p=>p.type==='text'));
 assert(!JSON.stringify(safeError).includes('PRIVATE'));assert(!JSON.stringify(safeError).includes('observation_id'));
 const validation={jsonrpc:'2.0',id:12,result:{isError:true,content:[{type:'text',text:'{"code":"INVALID_ACTION","message":"keys is required"}'}]}};
 assert.deepEqual(modelMcpMessage(validation),validation,'action repair errors remain available');
 assert.throws(()=>modelMcpMessage({result:{structuredContent:{done:false,outcome:'active'},content:[]}}),/image/,
  'a malformed observation must fail instead of forwarding private fields');
 const listing=modelMcpMessage({result:{tools:[{name:'game_step',description:'Perform an action. Stop when done:true. Use a fresh request_id.',outputSchema:{required:['done','outcome']},inputSchema:{type:'object',properties:{request_id:{type:'string'},observation_id:{type:'string'},action:{type:'object'}},required:['request_id','observation_id','action']}}]}});
 assert.deepEqual(Object.keys(listing.result.tools[0].inputSchema.properties),['request_id','action']);
 assert.deepEqual(listing.result.tools[0].inputSchema.required,['request_id','action']);
 assert(!JSON.stringify(listing).includes('observation_id'));
 assert(!JSON.stringify(listing).includes('done'));assert(!JSON.stringify(listing).includes('outcome'));
});

test('instructions and legacy game resources do not require private versions',()=>{
 const initialized=modelMcpMessage({result:{protocolVersion:'2025-11-25',serverInfo:{name:'game'},instructions:'private'}});
 assert.equal(initialized.result.instructions,GAME_MCP_INSTRUCTIONS);
 assert.equal(GAME_MCP_INSTRUCTIONS,'Use game_step to play the game');
 assert(!GAME_STEP_DESCRIPTION.includes('observation_id'));
 const rules=modelMcpMessage({result:{contents:[{uri:'game://rules',text:'together with a unique `request_id` and the latest `observation_id`; reuse the same arguments when retrying an uncertain call.'}]}});
 assert(!JSON.stringify(rules).includes('observation_id'));
 assert.throws(()=>publicGameStepSchema({type:'object'}),/schema/);
});
