import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createRequire} from 'node:module';
import {execFileSync} from 'node:child_process';
import {gunzipSync} from 'node:zlib';
import {run,parseCli,codexArguments,EARLY_STOP_FEEDBACK} from '../scripts/codex-eval/run.mjs';
import {startGateway} from '../scripts/codex-eval/gateway.mjs';
import {GameSession} from '../scripts/game-mcp/session.mjs';
import {runEpisode} from '../scripts/server-eval/episode.mjs';
import {recoverRenderer} from '../scripts/server-eval/render-recovery.mjs';
import {GAME_TOOL} from '../scripts/codex-eval/policy.mjs';
const sharp=createRequire(import.meta.url)('sharp');
const image=await sharp({create:{width:1280,height:720,channels:3,background:'#334455'}}).jpeg().toBuffer();

class Env {
 constructor({finish=false}={}){this.frames=0;this.actions=0;this.finish=finish;this.errors=[];this.failedResources=[];this.heldKeys=new Set(['w']);this.heldButtons=new Set(['right']);}
 async open(){return {build:'fixture'};}
 async reset(){}
 async state(){return {taskId:'c01-n04',active:!(this.finish&&this.actions),complete:!!(this.finish&&this.actions),failed:false,elapsed:this.frames/60,actor:{x:this.frames,z:0}};}
 async observe(){return image;}
 async assertFrozen(){return true;}
 async close(){}
}
const adapter={descriptionEn:'fixture',parse:JSON.parse,execute:async(env)=>{env.actions++;env.frames+=6;return {advanced:6,wallMs:0};}};
test('feedback is archived and checkpointed as one frozen round; actions and feedback share the cap',async t=>{
 const output=await fs.mkdtemp(path.join(os.tmpdir(),'gta-feedback-budget-'));t.after(()=>fs.rm(output,{recursive:true,force:true}));
 const env=new Env();
 const result=await runEpisode({env,taskId:'c01-n04',system:'s',instruction:'i',adapter,contextMode:'external',maxRounds:3,output,name:'budget',checkpoint:true,policy:async(_messages,{round})=>round===2?{raw:'{}'}:{raw:'',evaluatorFeedback:EARLY_STOP_FEEDBACK}});
 assert.equal(result.status,'round_limit',JSON.stringify(result));assert.equal(result.rounds,3);assert.equal(result.earlyStopFeedbackRounds,2);assert.equal(env.frames,6);assert.equal(env.actions,1);
 assert.deepEqual([...env.heldKeys],['w']);assert.deepEqual([...env.heldButtons],['right']);
 const record=JSON.parse(execFileSync('tar',['-xOzf',path.join(output,result.archive),'rounds/000001.json'],{encoding:'utf8'}));
 assert.equal(record.kind,'early_stop_feedback');assert.equal(record.evaluatorFeedback,EARLY_STOP_FEEDBACK);assert.deepEqual(record.before,record.after);assert.equal(record.transition.advanced,0);assert(!record.action);
 const journal=JSON.parse(gunzipSync(await fs.readFile(path.join(output,'checkpoints/budget/000001.json.gz'))));assert.equal(journal.phase,'committed');
});
test('renderer recovery never executes a feedback round',async()=>{
 const state={taskId:'c01-n04',elapsed:0,actor:{x:0,z:0}};let actions=0;
 await recoverRenderer({env:{restart:async()=>({build:'fixture'}),state:async()=>state,assertFrozen:async()=>true},taskId:'c01-n04',build:'fixture',initial:state,adapter:{execute:()=>{actions++;throw Error('feedback is not an action');}},records:[{round:1,before:state,after:state,evaluatorFeedback:EARLY_STOP_FEEDBACK}]});
 assert.equal(actions,0);
});

for(const stopOnly of [false,true])test(`real native Codex resumes the SAME history with feedback and image (only early stops=${stopOnly})`,{timeout:60000},async t=>{
 const directory=await fs.mkdtemp(path.join(os.tmpdir(),'gta-early-stop-native-'));t.after(()=>fs.rm(directory,{recursive:true,force:true}));
 const keyFile=path.join(directory,'key');await fs.writeFile(keyFile,'fixture-only');
 const options=parseCli(['--task','c01-n04','--model','Qwen3.8-27B','--base-url','https://not-used.test','--key-file',keyFile,'--output',path.join(directory,'run'),'--max-rounds','3','--renderer','cpu',...(process.env.GTA_TEST_CODEX_BIN?['--codex-bin',process.env.GTA_TEST_CODEX_BIN]:[])]);
 let calls=0,session;const env=new Env({finish:!stopOnly});
 const report=await run(options,{
  sessionFactory:settings=>session=new GameSession(settings,{environmentFactory:async()=>env,episodeRunner:args=>runEpisode({...args,adapter})}),
  gatewayFactory:settings=>startGateway({...settings,fetcher:async(_url,req)=>{
   calls++;const body=JSON.parse(req.body);
   if(calls>1){assert(JSON.stringify(body.input).includes(EARLY_STOP_FEEDBACK));assert(JSON.stringify(body.input).includes('Premature answer.'));assert.equal(body.input.filter(p=>p.type==='message'&&p.role==='user'&&p.content?.some?.(c=>c.type==='input_image')).length,calls);}
   const item=!stopOnly&&calls===2?{type:'function_call',id:'fc_2',call_id:'call_2',name:GAME_TOOL,arguments:JSON.stringify({request_id:'step',action:{keys:[],wait_seconds:0.1}}),status:'completed'}:{type:'message',id:'msg_'+calls,role:'assistant',status:'completed',content:[{type:'output_text',text:'Premature answer.',annotations:[]}]};
   return Response.json({id:'resp_'+calls,object:'response',model:options.model,status:'completed',output:[item],usage:{input_tokens:10,output_tokens:5,total_tokens:15}});
  }})
 });
 assert.equal(report.status,'completed');assert.equal(report.earlyStopFeedbackRounds,stopOnly?3:1);assert.equal(report.evaluationRounds,stopOnly?3:2);assert.equal(report.acceptedActions,stopOnly?0:1);
 assert.equal(report.gameResult.status,stopOnly?'round_limit':'success');assert.equal(env.frames,stopOnly?0:6);assert.equal(calls,stopOnly?3:2);
 assert.equal(new Set(report.nativeTurns.map(t=>t.threadId)).size,1);assert(!codexArguments({workspace:'/tmp/work',image:'/tmp/a.jpg'}).includes('--ephemeral'));
 const native=gunzipSync(await fs.readFile(path.join(options.output,'codex.jsonl.gz'))).toString();assert.equal(native.split('\n').filter(l=>l.includes('"type":"thread.started"')).length,calls);
 assert.equal(session.result.rounds,report.evaluationRounds);
});
