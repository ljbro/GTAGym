import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {gunzipSync} from 'node:zlib';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import {unusableModelContent,captureModelResponse,guardKimiResponse,findKimiEvaluations,stopKimiEvaluations,broadcastKimiStop,watchKimiStops} from '../scripts/server-eval/kimi-response-guard.mjs';

const exec=promisify(execFile),root=fileURLToPath(new URL('../',import.meta.url));
const sharp=createRequire(import.meta.url)('sharp');
async function fixture(t){const dir=await fs.mkdtemp(path.join(os.tmpdir(),'gta-kimi-response-'));t.after(()=>fs.rm(dir,{recursive:true,force:true}));return dir;}
const response=()=>new Response('{}',{status:200,headers:{'content-type':'application/json','x-request-id':'provider-123'}});
const sample={id:'sample-response',choices:[{message:{role:'assistant',content:'',reasoning_content:'provider diagnostic reasoning',tool_calls:[],unknown_field:{nested:true}},finish_reason:'stop'}],usage:{completion_tokens:70},provider_extra:{raw:true}};

test('probe catches missing, null, array and whitespace content, and leaves nonempty text alone',()=>{
 for(const content of [undefined,null,[],{},'', ' \n\t'])assert(unusableModelContent({choices:[{message:{content}}]}));
 assert(unusableModelContent({}));assert(unusableModelContent(null));
 assert(!unusableModelContent({choices:[{message:{content:'{"keys":[]}'}}]}));
});

test('capture retains the complete raw response, unknown fields, headers and image input, without the API key',async t=>{
 const output=await fixture(t),request={model:'kimi-k3',messages:[{role:'user',content:[{type:'image_url',image_url:{url:'data:image/jpeg;base64,YWJj'}}]}]};
 const rawBody=Buffer.from(' \n'+JSON.stringify(sample)+'\n');
 const incident=await captureModelResponse({output,taskId:'c02-n02',round:3,model:'kimi-k3',endpoint:'https://example.invalid/v1/chat/completions',request,response:response(),rawBody,body:sample,secret:'private-key-not-in-requests'});
 assert.deepEqual(gunzipSync(await fs.readFile(path.join(incident.directory,incident.files.response))),rawBody);
 assert.deepEqual(JSON.parse(gunzipSync(await fs.readFile(path.join(incident.directory,incident.files.parsedResponse)))),sample);
 assert.deepEqual(JSON.parse(gunzipSync(await fs.readFile(path.join(incident.directory,incident.files.request)))),request);
 assert.equal(incident.headers['x-request-id'],'provider-123');
 assert.equal(incident.providerRequestId,'sample-response');
 for(const name of await fs.readdir(incident.directory))assert.equal((await fs.stat(path.join(incident.directory,name))).mode&0o777,0o600);
 const reflected={choices:[{message:{content:''}}],echo:'super-secret'};
 const safe=await captureModelResponse({output,taskId:'c02-n02',round:4,model:'kimi-k3',endpoint:'https://example.invalid/',request,response:response(),rawBody:JSON.stringify(reflected),body:reflected,secret:'super-secret'});
 assert(!gunzipSync(await fs.readFile(path.join(safe.directory,safe.files.response))).toString().includes('super-secret'));
});

test('empty reply stops before format retry; normal replies create no incident',async t=>{
 const output=await fixture(t),events=[],args={root:output,output,taskId:'c02-n02',round:3,model:'kimi-k3',endpoint:'https://example.invalid/',request:{messages:[]},response:response(),rawBody:JSON.stringify(sample),body:sample,
  onDetected:()=>events.push('latched'),onCaptured:()=>events.push('captured')};
 await assert.rejects(guardKimiResponse(args),error=>error.name==='EmptyModelResponseError'&&!!error.modelResponseIncident.directory);
 assert.deepEqual(events,['latched','captured']);
 const marker=JSON.parse(await fs.readFile(path.join(output,'.cache/server-eval-control/kimi-response-stop.json'),'utf8'));
 assert.equal(marker.round,3);
 await guardKimiResponse({...args,body:{choices:[{message:{content:'{"keys":[]}'}}]}});
 assert.equal((await fs.readdir(path.join(output,'api-incidents'))).length,1);
});

test('process group stop only signals verified Kimi runners in this repository',async t=>{
 const repo=await fixture(t),other=await fixture(t),proc=path.join(repo,'fake-proc');await fs.mkdir(proc);
 async function processFixture(pid,{model='kimi-k3',cwd=repo,executable='/usr/bin/node'}={}){
  const dir=path.join(proc,String(pid));await fs.mkdir(dir);
  await fs.symlink(cwd,path.join(dir,'cwd'));
  await fs.writeFile(path.join(dir,'cmdline'),[executable,'scripts/server-eval/run.mjs','--model',model,''].join('\0'));
  await fs.writeFile(path.join(dir,'stat'),`${pid} (node) S ${Array(18).fill('0').join(' ')} ${pid*100} 0`);
 }
 await processFixture(1001);await processFixture(1002,{model:'glm-5.3-flash'});await processFixture(1003,{model:'deepseek-flash'});
 await processFixture(1004,{cwd:other});await processFixture(1005,{executable:'/usr/bin/rg'});
 const targets=await findKimiEvaluations({root:repo,procRoot:proc});assert.deepEqual(targets.map(t=>t.pid),[1001]);assert.equal(targets[0].startTime,'100100');
 const calls=[];await stopKimiEvaluations({root:repo,procRoot:proc,kill:(...args)=>calls.push(args)});
 assert.deepEqual(calls,[[1001,'SIGTERM']]);
});

test('stop watcher ignores stale markers and catches a new incident from another process',async t=>{
 const repo=await fixture(t),startedAt=Date.now(),events=[];
 await broadcastKimiStop(repo,{id:'stale',runnerPid:99999,detectedAt:new Date(startedAt-1000).toISOString()});
 const close=watchKimiStops({root:repo,startedAt,intervalMs:5,onStop:e=>events.push(e)});t.after(close);
 await new Promise(r=>setTimeout(r,30));assert.equal(events.length,0);
 await broadcastKimiStop(repo,{id:'new',runnerPid:99999,detectedAt:new Date(startedAt+1).toISOString()});
 const deadline=Date.now()+1000;while(!events.length&&Date.now()<deadline)await new Promise(r=>setTimeout(r,5));
 assert.equal(events.length,1);assert.equal(events[0].id,'new');
});

async function runnerFixture(t,workers,{mode='stop-kimi',scenario='first-fault',tasks='c01-n04,c02-n02,c03-n01',model='kimi-k3',apiArguments=[]}={}){
 const dir=await fixture(t),scripts=path.join(dir,'scripts/server-eval');await fs.mkdir(scripts,{recursive:true});
 const original=path.join(root,'scripts/server-eval');
 for(const name of await fs.readdir(original)){
  if(name==='run.mjs')await fs.copyFile(path.join(original,name),path.join(scripts,name));
  else await fs.symlink(path.join(original,name),path.join(scripts,name));
 }
 for(const name of ['tasks','native-city','.git'])await fs.symlink(path.join(root,name),path.join(dir,name));
 const output=path.join(dir,'results');await fs.mkdir(output);
 const image=(await sharp({create:{width:128,height:72,channels:3,background:'#336699'}}).jpeg().toBuffer()).toString('base64');
 const runArgs=['--tasks',tasks,'--workers',String(workers),'--renderer','gpu','--model',model,'--endpoint','https://example.invalid/v1/chat/completions','--thinking','enabled','--reasoning-effort','max','--max-tokens','32768','--max-rounds','3','--system-prompt',path.join(root,'scripts/server-eval/system-prompt.en.md'),'--prompts',path.join(root,'tasks/instructions.json'),...(mode?['--empty-response',mode]:[]),...apiArguments,'--output',output];
 const bootstrap=`
  import {ServerEnvironment} from ${JSON.stringify(new URL('../scripts/server-eval/environment.mjs',import.meta.url).href)};
  const p=ServerEnvironment.prototype,image=Buffer.from(${JSON.stringify(image)},'base64');
  p.open=async function(){this.frames=0;this.errors=[];this.failedResources=[];return {renderer:'fixture',executionHost:'server',build:'fixture'};};
  p.reset=async function(id){this.taskId=id;};p.observe=async()=>image;p.render=async()=>{};p.close=async()=>{};p.releaseInputs=async()=>{};p.assertFrozen=async()=>true;
  p.state=async function(){const complete=this.taskId==='c01-n04'&&this.frames>=${scenario==='two-rounds'?120:60};return {active:!complete,complete,failed:false,elapsed:this.frames/60,worldTime:this.frames/60,actor:{x:this.frames}};};
  p.inspectRenderHealth=async()=>({healthy:true});
  p.stepSequence=async function(inputs,{onFrame}={}){const n=inputs.reduce((s,a)=>s+a.frames,0);this.frames+=n;await onFrame?.(image,this.frames/60);return {advanced:n,state:await this.state(),heldKeys:[],heldButtons:[]};};
  let calls=0;
  globalThis.fetch=async(url,{signal,body})=>{
   calls++;const input=JSON.parse(body);console.log(JSON.stringify({event:'fixture_request',call:calls,url:String(url),input}));
   if(${workers}===2&&calls===2)return new Promise((resolve,reject)=>{signal.addEventListener('abort',()=>reject(signal.reason),{once:true});if(signal.aborted)reject(signal.reason);});
   const scenario=${JSON.stringify(scenario)},empty=scenario==='recover'?calls<3:['format','two-rounds'].includes(scenario)?false:${workers}===2||calls>1;
   const content=scenario==='format'&&calls===1?'nonempty invalid JSON':empty?'':'{"keys":[{"key":"w","duration_seconds":1}]}';
   if(scenario==='endpoint-unsupported')return new Response('{"error":{"message":"Responses unsupported"}}',{status:404});
   if(input.input)return new Response(JSON.stringify({id:'fixture-response-'+calls,object:'response',status:'completed',
    output:[{type:'reasoning',summary:[{type:'summary_text',text:'fixture reasoning summary '+calls}]},
     ...(scenario==='reasoning-only'?[]:[{type:'message',role:'assistant',content:[{type:'output_text',text:content}]}])],
    usage:{input_tokens:100,output_tokens:70,total_tokens:170,output_tokens_details:{reasoning_tokens:50}},provider_field:{retain:true}}),{headers:{'content-type':'application/json'}});
   return new Response(JSON.stringify({id:'fixture-response',choices:[{message:{role:'assistant',content,reasoning_content:'fixture diagnostic reasoning',provider_field:{retain:true}},finish_reason:'stop'}],usage:{completion_tokens:70}}),{headers:{'content-type':'application/json','x-request-id':'fixture-request-id'}});
  };
  process.argv=[process.execPath,${JSON.stringify(path.join(scripts,'run.mjs'))},...${JSON.stringify(runArgs)}];
  await import(${JSON.stringify(new URL('file://'+path.join(scripts,'run.mjs')).href)});
 `;
 let stdout='';
 try{({stdout}=await exec(process.execPath,['--input-type=module','-e',bootstrap],{cwd:dir,env:{...process.env,GTA_AGENT_API_KEY:'fixture-only-key'},timeout:30000,maxBuffer:2*1024*1024}));}
 catch(error){stdout=error.stdout??'';assert.equal(error.code,1,error.stderr??error.message);}
 return {output,stdout,summary:JSON.parse(await fs.readFile(path.join(output,'summary.json'),'utf8'))};
}

test('serial real runner keeps completed archive, captures entire empty response, and never starts the next task',async t=>{
 const {output,stdout,summary}=await runnerFixture(t,1);
 assert.equal(summary.running,false);assert.equal(summary.haltReason,'empty_model_response');assert.equal(summary.completedEpisodes,2);assert.equal(summary.successes,1);assert.equal(summary.errors,1);
 assert.deepEqual(summary.pendingTasks,['c03-n01']);assert.equal((stdout.match(/fixture_request/g)??[]).length,2);assert(!stdout.includes('format_retry'));
 const first=summary.results[0],failed=summary.results[1];assert.equal(first.status,'success');assert.equal(failed.status,'error');
 const saved=JSON.parse((await exec('tar',['-xOzf',path.join(output,first.archive),'result.json'])).stdout);assert.equal(saved.status,'success');
 const normal=JSON.parse((await exec('tar',['-xOzf',path.join(output,first.archive),'rounds/000001.json'])).stdout);
 assert.equal(normal.modelResponse.choices[0].message.reasoning_content,'fixture diagnostic reasoning');
 assert.equal(normal.reasoning.status,'text_returned');assert.equal(normal.attempts[0].modelResponseRef,'modelResponse');
 const last=JSON.parse((await exec('tar',['-xOzf',path.join(output,failed.archive),'rounds/000001.json'])).stdout);assert(last.modelResponseIncident);
 assert.equal(last.modelResponse.choices[0].message.content,'');
 assert.equal(last.modelResponse.choices[0].message.reasoning_content,'fixture diagnostic reasoning');
 const incident=failed.modelResponseIncident,body=JSON.parse(gunzipSync(await fs.readFile(path.join(incident.directory,'response.json.gz'))));
 assert.deepEqual(body.choices[0].message.provider_field,{retain:true});assert.equal(body.choices[0].message.content,'');assert.equal(body.choices[0].message.reasoning_content,'fixture diagnostic reasoning');
 const request=JSON.parse(gunzipSync(await fs.readFile(path.join(incident.directory,'request.json.gz'))));assert(request.messages.some(m=>Array.isArray(m.content)&&m.content.some(p=>p.type==='image_url')));
 assert.equal((await fs.readdir(output)).filter(n=>n.endsWith('.partial')).length,0);
});

test('parallel runner cancels peer inference immediately and archives both episodes without starting pending tasks',async t=>{
 const {stdout,summary}=await runnerFixture(t,2);
 assert.equal(summary.haltReason,'empty_model_response');assert.equal(summary.completedEpisodes,2);assert.equal(summary.peakActive,2);assert.deepEqual(summary.pendingTasks,['c03-n01']);
 assert.equal(summary.results.filter(r=>r.status==='error').length,1);assert.equal(summary.results.filter(r=>r.status==='interrupted').length,1);
 assert(!stdout.includes('format_retry'));assert(summary.results.every(r=>r.archive?.endsWith('.tar.gz')));
});

test('default retry mode recovers on the third unchanged request and commits exactly one round',async t=>{
 const {output,stdout,summary}=await runnerFixture(t,1,{mode:null,scenario:'recover',tasks:'c01-n04'});
 assert.equal(summary.haltReason,null);assert.equal(summary.completedEpisodes,1);assert.equal(summary.successes,1);assert.equal(summary.errors,0);
 const events=stdout.split('\n').filter(Boolean).map(line=>JSON.parse(line)),requests=events.filter(e=>e.event==='fixture_request');
 assert.equal(requests.length,3);assert.deepEqual(requests.map(r=>r.input),[requests[0].input,requests[0].input,requests[0].input]);
 assert.equal(events.filter(e=>e.event==='action').length,1);assert.equal(events.filter(e=>e.event==='format_retry').length,0);
 assert.deepEqual(events.filter(e=>e.event==='empty_response_retry').map(e=>e.delayMs),[2000,4000]);
 assert.equal(events.filter(e=>e.event==='empty_response_detected').length,0);
 const saved=summary.results[0],record=JSON.parse((await exec('tar',['-xOzf',path.join(output,saved.archive),'rounds/000001.json'])).stdout);
 assert.equal(record.emptyResponseAttempts.length,3);assert.equal(record.transition.advanced,60);assert.equal(record.freezeVerified,true);assert.equal(saved.rounds,1);
 assert.deepEqual(record.emptyResponseAttempts.map(a=>a.kind),['empty','empty','nonempty']);
 const evidence=await Promise.all(record.emptyResponseAttempts.map(async a=>JSON.parse(gunzipSync(await fs.readFile(path.join(a.capture.directory,'response.json.gz'))))));
 assert.deepEqual(evidence.map(b=>b.choices[0].message.content),['','','{"keys":[{"key":"w","duration_seconds":1}]}']);
 assert.equal((await fs.readdir(path.join(output,'api-incidents'))).length,3);
 assert.deepEqual(JSON.parse(gunzipSync(await fs.readFile(path.join(output,saved.checkpointDirectory,'000001.json.gz')))).record.emptyResponseAttempts,record.emptyResponseAttempts);
 assert.equal(JSON.parse(await fs.readFile(path.join(output,'config.json'),'utf8'))['empty-response'],'retry');
});

test('default retry mode stops the queue only after three empty replies and preserves prior success',async t=>{
 const {output,stdout,summary}=await runnerFixture(t,1,{mode:'retry'});
 assert.equal(summary.haltReason,'empty_model_response');assert.equal(summary.successes,1);assert.equal(summary.errors,1);assert.equal(summary.completedEpisodes,2);
 assert.deepEqual(summary.pendingTasks,['c03-n01']);assert.equal((stdout.match(/fixture_request/g)??[]).length,4);assert(!stdout.includes('format_retry'));
 const failed=summary.results[1];assert.equal(failed.rounds,0);assert.equal(failed.simulatedSeconds,0);assert.equal(failed.modelResponseIncident.retryExhausted,true);
 const record=JSON.parse((await exec('tar',['-xOzf',path.join(output,failed.archive),'rounds/000001.json'])).stdout);
 assert.equal(record.emptyResponseAttempts.length,3);assert.equal(record.attempts.length,0);
 assert(record.emptyResponseAttempts.every(a=>a.raw===''&&a.usage.completion_tokens===70));
 const journal=JSON.parse(gunzipSync(await fs.readFile(path.join(output,failed.checkpointDirectory,'000001.json.gz'))));
 assert.equal(journal.phase,'error');assert.deepEqual(journal.record.emptyResponseAttempts,record.emptyResponseAttempts);
 const events=stdout.split('\n').filter(Boolean).map(line=>JSON.parse(line));
 assert.equal(events.filter(e=>e.event==='empty_response_detected').length,1);assert.equal(events.filter(e=>e.event==='empty_response_retry').length,2);
});

test('nonempty invalid JSON still uses original format corrections, not empty retries or group stop',async t=>{
 const {output,stdout,summary}=await runnerFixture(t,1,{mode:'retry',scenario:'format',tasks:'c01-n04'});
 assert.equal(summary.successes,1);assert.equal(summary.haltReason,null);
 assert.equal((stdout.match(/fixture_request/g)??[]).length,2);assert(stdout.includes('format_retry'));assert(!stdout.includes('empty_response_retry'));
 const record=JSON.parse((await exec('tar',['-xOzf',path.join(output,summary.results[0].archive),'rounds/000001.json'])).stdout);
 assert.equal(record.attempts.length,2);assert(!record.emptyResponseAttempts);
});

test('retry exhaustion cancels a parallel peer and never launches a pending task',async t=>{
 const {stdout,summary}=await runnerFixture(t,2,{mode:'retry'});
 assert.equal(summary.haltReason,'empty_model_response');assert.equal(summary.completedEpisodes,2);assert.equal(summary.peakActive,2);assert.deepEqual(summary.pendingTasks,['c03-n01']);
 assert.equal(summary.results.filter(r=>r.status==='error').length,1);assert.equal(summary.results.filter(r=>r.status==='interrupted').length,1);
 const events=stdout.split('\n').filter(Boolean).map(line=>JSON.parse(line));
 assert.equal(events.filter(e=>e.event==='fixture_request').length,4);assert.equal(events.filter(e=>e.event==='empty_response_retry').length,2);
 assert.equal(events.filter(e=>e.event==='empty_response_detected').length,1);assert.equal(events.filter(e=>e.event==='action').length,0);
 assert(summary.results.every(r=>r.archive?.endsWith('.tar.gz')));
});

test('other models keep their original empty-reply format retry behavior',async t=>{
 const {output,stdout,summary}=await runnerFixture(t,1,{mode:'retry',scenario:'recover',tasks:'c01-n04',model:'glm-5.3-flash'});
 assert.equal(summary.successes,1);assert.equal(summary.haltReason,null);
 assert.equal((stdout.match(/fixture_request/g)??[]).length,3);assert(!stdout.includes('empty_response_retry'));assert(stdout.includes('format_retry'));
 const record=JSON.parse((await exec('tar',['-xOzf',path.join(output,summary.results[0].archive),'rounds/000001.json'])).stdout);
 assert.equal(record.attempts.length,3);assert(!record.emptyResponseAttempts);
 assert.equal(record.modelResponse.choices[0].message.reasoning_content,'fixture diagnostic reasoning');
 assert.equal(record.attempts[0].modelResponse.choices[0].message.content,'');
 assert.equal(record.attempts[1].modelResponse.choices[0].message.content,'');
 assert.equal(record.attempts[2].modelResponseRef,'modelResponse');
});

test('OpenAI real runner sends Responses summaries by default and archives both turns without feeding summaries back',async t=>{
 const {output,stdout,summary}=await runnerFixture(t,1,{mode:null,model:'gpt-6.1-sol',scenario:'two-rounds',tasks:'c01-n04'});
 assert.equal(summary.successes,1);assert.equal(summary.errors,0);assert.equal(summary.results[0].rounds,2);
 const requests=stdout.split('\n').filter(Boolean).map(line=>JSON.parse(line)).filter(e=>e.event==='fixture_request');
 assert.equal(requests.length,2);
 for(const request of requests){
  assert.equal(request.url,'https://example.invalid/v1/responses');
  assert.deepEqual(request.input.reasoning,{effort:'max',summary:'auto'});assert.equal(request.input.max_output_tokens,32768);
  assert.equal(request.input.store,false);assert(!request.input.messages);assert(!request.input.previous_response_id);
  assert(!JSON.stringify(request.input).includes('fixture reasoning summary'));
 }
 const second=requests[1].input.input;
 assert.equal(second.filter(m=>m.role==='assistant').length,1);
 assert.equal(second.find(m=>m.role==='assistant').content,'{"keys":[{"key":"w","duration_seconds":1}]}');
 assert.equal(second.flatMap(m=>Array.isArray(m.content)?m.content:[]).filter(p=>p.type==='input_image').length,2);
 const config=JSON.parse(await fs.readFile(path.join(output,'config.json'),'utf8'));
 assert.equal(config.api,'responses');assert.equal(config['reasoning-summary'],'auto');
 const result=summary.results[0];
 for(let round=1;round<=2;round++){
  const name=String(round).padStart(6,'0');
  const record=JSON.parse((await exec('tar',['-xOzf',path.join(output,result.archive),'rounds/'+name+'.json'])).stdout);
  assert.equal(record.modelResponse.output[0].summary[0].text,'fixture reasoning summary '+round);
  assert.equal(record.reasoning.status,'summary_only');assert.equal(record.usage.completion_tokens,70);
  assert.equal(record.attempts[0].modelResponseRef,'modelResponse');assert.equal(record.transition.advanced,60);
  const checkpoint=JSON.parse(gunzipSync(await fs.readFile(path.join(output,result.checkpointDirectory,name+'.json.gz'))));
  assert.deepEqual(checkpoint.record.modelResponse,record.modelResponse);
 }
 const manifest=JSON.parse(await fs.readFile(path.join(output,result.checkpointDirectory,'manifest.json'),'utf8'));
 assert.equal(manifest.config.api,'responses');assert.equal(manifest.config['reasoning-summary'],'auto');
});

test('Responses format retry retains each summary while only correcting the final text',async t=>{
 const {output,stdout,summary}=await runnerFixture(t,1,{mode:null,model:'gpt-6-astra',scenario:'format',tasks:'c01-n04'});
 assert.equal(summary.successes,1);assert(stdout.includes('format_retry'));
 const record=JSON.parse((await exec('tar',['-xOzf',path.join(output,summary.results[0].archive),'rounds/000001.json'])).stdout);
 assert.equal(record.attempts.length,2);
 assert.equal(record.attempts[0].modelResponse.output[0].summary[0].text,'fixture reasoning summary 1');
 assert.equal(record.modelResponse.output[0].summary[0].text,'fixture reasoning summary 2');
 assert.equal(record.attempts[1].modelResponseRef,'modelResponse');assert.equal(record.reasoning.status,'summary_only');
 const requests=stdout.split('\n').filter(Boolean).map(line=>JSON.parse(line)).filter(e=>e.event==='fixture_request');
 assert(!JSON.stringify(requests[1].input).includes('fixture reasoning summary'));
 assert.equal(requests[1].input.input.find(m=>m.role==='assistant').content,'nonempty invalid JSON');
});

test('summary-only replies exhaust format retries without executing a fabricated action',async t=>{
 const {output,stdout,summary}=await runnerFixture(t,1,{mode:null,model:'gpt-6-astra',scenario:'reasoning-only',tasks:'c01-n04'});
 assert.equal(summary.errors,1);assert.equal(summary.results[0].rounds,0);assert.equal(summary.results[0].simulatedSeconds,0);
 const events=stdout.split('\n').filter(Boolean).map(line=>JSON.parse(line));
 assert.equal(events.filter(e=>e.event==='fixture_request').length,3);assert.equal(events.filter(e=>e.event==='action').length,0);
 const record=JSON.parse((await exec('tar',['-xOzf',path.join(output,summary.results[0].archive),'rounds/000001.json'])).stdout);
 assert.equal(record.reasoning.status,'summary_only');assert.equal(record.attempts.length,3);
 assert.equal(record.attempts[0].modelResponse.output[0].summary[0].text,'fixture reasoning summary 1');
});

test('OpenAI Chat opt-out is explicit; unsupported Responses endpoint never silently falls back',async t=>{
 const legacy=await runnerFixture(t,1,{mode:null,model:'gpt-6.1-sol',scenario:'format',tasks:'c01-n04',apiArguments:['--api','chat-completions','--reasoning-summary','off']});
 assert.equal(legacy.summary.successes,1);
 const requests=legacy.stdout.split('\n').filter(Boolean).map(line=>JSON.parse(line)).filter(e=>e.event==='fixture_request');
 assert(requests.every(r=>r.url.endsWith('/chat/completions')&&r.input.messages&&!r.input.reasoning));
 const failed=await runnerFixture(t,1,{mode:null,model:'gpt-6-astra',scenario:'endpoint-unsupported',tasks:'c01-n04'});
 assert.equal(failed.summary.errors,1);assert.equal(failed.summary.results[0].rounds,0);
 const failures=failed.stdout.split('\n').filter(Boolean).map(line=>JSON.parse(line)).filter(e=>e.event==='fixture_request');
 assert.equal(failures.length,1);assert(failures[0].url.endsWith('/responses'));
});
