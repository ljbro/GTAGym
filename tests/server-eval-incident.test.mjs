import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {execFileSync,spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import {EventEmitter} from 'node:events';
import {inspectMinimapSpill} from '../scripts/server-eval/render-health.mjs';
import {healthyObservation} from '../scripts/server-eval/render-recovery.mjs';
import {runEpisode} from '../scripts/server-eval/episode.mjs';
import {waitForIncident} from '../scripts/server-eval/incident-environment.mjs';
import * as adapter from './fixtures/wait-adapter.mjs';
const sharp=createRequire(import.meta.url)('sharp');
const region={left:0,top:0,width:240,height:360},map={x:24,y:160,width:192,height:192};
const png=rgb=>sharp({create:{width:240,height:360,channels:3,background:{r:rgb[0],g:rgb[1],b:rgb[2]}}}).png().toBuffer();
test('diagnostic detector covers green, blue and black; leaves matching scenes/JPEG alone',async()=>{
 const reference=await png([100,100,100]);
 for(const color of [[40,190,40],[30,80,210],[0,0,0]]){
  assert.equal((await inspectMinimapSpill(await png(color),{reference,region,map,allColors:true})).healthy,false);
 }
 assert.equal((await inspectMinimapSpill(reference,{reference,region,map,allColors:true})).healthy,true);
 assert.equal((await inspectMinimapSpill(await sharp(reference).jpeg({quality:80}).toBuffer(),{reference,region,map,allColors:true})).healthy,true);
 assert.equal((await inspectMinimapSpill(await png([0,0,0]),{reference,region,map,allColors:true,exclusions:[{x:0,y:0,width:240,height:360}]})).healthy,true);
});
test('hold uses first evidence only; no confirmation or recovery',async()=>{
 let shots=0,checks=0,faults=0;
 await assert.rejects(healthyObservation({env:{observe:async()=>{shots++;return Buffer.from('first');},inspectRenderHealth:async()=>{checks++;return {healthy:false};}},holdFirst:true,recover:()=>assert.fail('restart'),onFault:async({image})=>{faults++;assert.equal(image.toString(),'first');}}),/held/);
 assert.deepEqual([shots,checks,faults],[1,1,1]);
});
for(const failSave of [false,true])test(`held episode preserves inputs/browser and archives completed rounds, saveFailure=${failSave}`,async t=>{
 const output=await fs.mkdtemp(path.join(os.tmpdir(),'gta-incident-unit-'));t.after(()=>fs.rm(output,{recursive:true}));
 const image=await sharp(await png([40,50,60])).jpeg().toBuffer();let calls=0,closed=0,released=0,observations=0;
 const env={frames:0,errors:[],failedResources:[],open:async()=>({build:'test'}),reset:async()=>{},assertFrozen:async()=>true,
  state:async()=>({active:true,elapsed:env.frames/60}),observe:async()=>{observations++;return image;},
  inspectRenderHealth:async()=>({healthy:env.frames===0,kind:'minimap-composite-mismatch'}),
  preserveIncident:async({directory})=>{env.incidentHeld=true;env.incident={directory};if(failSave)throw Error('disk unavailable');return env.incident;},
  releaseInputs:async()=>{released++;},close:async()=>{closed++;},
  step:async(action,{onFrame})=>{env.frames+=action.frames;await onFrame(image,env.frames/60);return {advanced:action.frames,state:await env.state()};}};
 const result=await runEpisode({env,taskId:'c08-n02',system:'s',instruction:'i',adapter,output,name:'incident',maxRounds:3,checkpoint:true,renderFaultMode:'preserve',policy:async()=>{calls++;return {raw:'{"action":"wait","duration_seconds":0.1}'};}});
 assert.equal(result.status,'render_anomaly',JSON.stringify(result));assert.equal(result.rounds,1);assert.equal(calls,1);
 assert.deepEqual([closed,released,observations],[0,0,2]);assert.equal(result.renderHealth.restarts,0);
 assert.equal(result.renderHealth.faults[0].confirmed,false);
 assert.equal(!!result.incidentSaveError,failSave);
 const files=execFileSync('tar',['-tzf',path.join(output,result.archive)],{encoding:'utf8'});
 assert(files.includes('rounds/000001.json'));assert(files.includes('diagnostics/render-1-first.jpg'));
 assert(!files.includes('confirmation.jpg'));assert(!files.includes('observations/final'));
});
test('waiting never closes until explicit signal; aborted entry also releases browser',async()=>{
 const browser=new EventEmitter();let connected=true,closes=0;browser.isConnected=()=>connected;
 const env={browser,close:async()=>{closes++;connected=false;browser.emit('disconnected');}};
 const controller=new AbortController(),waiting=waitForIncident(env,controller.signal);
 await new Promise(r=>setTimeout(r,20));assert.equal(closes,0);controller.abort();await waiting;assert.equal(closes,1);
 connected=true;await waitForIncident(env,controller.signal);assert.equal(closes,2);
});
for(const workers of [1,8])test(`real runner queue stops after first suspect and stays alive until SIGTERM, workers=${workers}`,{timeout:15000},async t=>{
 const output=await fs.mkdtemp(path.join(os.tmpdir(),'gta-incident-queue-'));t.after(()=>fs.rm(output,{recursive:true}));
 const tasks=['c08-n02','c08-n01','c08-n03','c08-n04','c08-n05','c08-n06','c08-n07','c08-n08','c06-n02'].slice(0,workers+1);
 const child=spawn(process.execPath,['--import',fileURLToPath(new URL('fixtures/incident-runner-env.mjs',import.meta.url)),
  'scripts/server-eval/run.mjs','--tasks',tasks.join(','),'--policy','smoke','--workers',String(workers),'--max-rounds','3','--render-fault','preserve','--output',output],{cwd:process.cwd(),stdio:['ignore','pipe','pipe']});
 t.after(()=>{if(child.exitCode===null)child.kill('SIGKILL');});let stdout='',stderr='';
 child.stdout.on('data',d=>{stdout+=d;});child.stderr.on('data',d=>{stderr+=d;});
 const ended=new Promise(resolve=>child.once('exit',resolve));
 await new Promise((resolve,reject)=>{
  const timer=setTimeout(()=>{clearInterval(poll);reject(Error(stdout+stderr));},10000);
  const poll=setInterval(()=>{if(stdout.includes('"event":"debug_wait"')){clearInterval(poll);clearTimeout(timer);resolve();}},20);
 });
 const summary=JSON.parse(await fs.readFile(path.join(output,'summary.json'),'utf8'));
 assert.equal(summary.running,false);assert.equal(summary.browserHeld,true);assert.equal(summary.haltReason,'render_anomaly');
 assert.deepEqual(summary.pendingTasks,[tasks.at(-1)]);assert.equal(summary.results.length,workers);
 assert.equal(summary.results.filter(r=>r.status==='render_anomaly').length,1);
 assert.equal(summary.results.filter(r=>r.status==='interrupted').length,workers-1);
 assert.equal(summary.peakActive,workers);
 const events=stdout.trim().split('\n').map(line=>JSON.parse(line));
 const stop=events.find(e=>e.event==='incident_stop_all');assert(stop);assert.equal(stop.stoppedPeers.length,workers-1);
 const heldTask=summary.results.find(r=>r.status==='render_anomaly').taskId;
 assert(!events.some(e=>e.event==='fixture_browser_closed'&&e.taskId===heldTask));
 assert.equal(events.filter(e=>e.event==='start').length,workers);
 assert.equal(child.exitCode,null);assert(!stdout.includes('"event":"request"'));
 child.kill('SIGTERM');await ended;assert(stdout.includes('fixture_browser_closed'),stdout+stderr);
});
