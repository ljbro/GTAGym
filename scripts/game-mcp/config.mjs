import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {loadPrompts} from '../server-eval/prompts.mjs';
import {TRAINING_ID,parseTrainingDataset,trainingDatasetPath} from '../../native-city/src/training-task-schema.ts';
import {createActionAdapter} from '../server-eval/actions.mjs';

export const root=fileURLToPath(new URL('../../',import.meta.url));
export const help=`GTAbench MCP — one fixed task, server-only browser, stdio transport.

Install: npm ci (from the repository root)
Run: node scripts/game-mcp/server.mjs --task c01-n04

 --task ID                 Required; task is fixed for this process (no agent reset).
 --url URL                 Local game URL (default http://127.0.0.1:4200/).
 --renderer auto|gpu|cpu    auto prefers server GPU; CPU is still server-only.
 --language en|zh          Read existing Markdown/instructions (default en).
 --seed N                  Episode seed (default 1234).
 --quality low|medium|high  Existing environment quality (default low).
 --max-rounds N            Accepted action budget (default 300; static <=20).
 --max-action-seconds N    Trusted key/wait duration cap (default 1).
 --max-calls N             Action handler calls, including retries/semantic errors (default 1000).
 --bootstrap on|off        Host writes the private initial observation (default on; off: discovery only).
 --idle-seconds N          Close idle session, not game time (default 1800; 0 disables).
 --video-fps N             Simulation-time video FPS dividing 60 (default 10).
 --crf N                   H264 CRF (default 28).
 --output DIRECTORY        New private result directory; never overwritten.
 --agent-label TEXT        Result label, not an API model selection (default external-harness).
 --training-dataset FILE   Explicit opt-in: a generated dataset basename; rl-task-* IDs.

No model API key is required. stdout is MCP only; diagnostics go to stderr.
The objective is shown only at the top-left of the initial screenshot, not in text.
Only game_step is model-callable. The host supplies initial-observation.json as initial model input.
The external harness owns its history; this service imposes no image-history cap.
Connect with an MCP client; this is not an HTTP/web page server.
`;

export async function loadConfig(args){
 const o={task:'',url:'http://127.0.0.1:4200/',renderer:'auto',language:'en',seed:'1234',quality:'low',
  'max-rounds':'300','max-action-seconds':'1','max-calls':'1000','idle-seconds':'1800','video-fps':'10',crf:'28',bootstrap:'on',
  output:path.join(root,'.cache/mcp-eval',new Date().toISOString().replace(/[:.]/g,'-')+'-'+randomUUID().slice(0,8)),
  'agent-label':'external-harness','training-dataset':'','clock-mode':'stepped'};
 for(let i=0;i<args.length;i+=2){const key=args[i]?.replace(/^--/,'');if(!args[i]?.startsWith('--')||!Object.hasOwn(o,key)||!args[i+1])throw Error('Unknown or missing option: '+args[i]);o[key]=args[i+1];}
 const generated=TRAINING_ID.test(o.task);
 if(!['stepped','realtime'].includes(o['clock-mode'])||o['clock-mode']==='realtime'&&(generated||/^c(?:10|11)-n/.test(o.task)||o.language!=='en'))throw Error('Realtime mode requires an English native 3D benchmark task');
 if(!generated&&!/^(c\d{2}-n\d{2,3}|c(?:09|10|11)-n\d{2,3})$/.test(o.task))throw Error('A valid --task is required');
 if(!['auto','gpu','cpu'].includes(o.renderer)||!['en','zh'].includes(o.language)||!['low','medium','high'].includes(o.quality)||!['on','off'].includes(o.bootstrap))throw Error('Invalid renderer, language, quality or bootstrap');
 for(const [key,min,max] of [['seed',1,4294967295],['max-rounds',1,100000],['max-calls',1,1000000],['idle-seconds',0,86400],['video-fps',1,60],['crf',0,51]]){
  o[key]=Number(o[key]);if(!Number.isInteger(o[key])||o[key]<min||o[key]>max)throw Error('Invalid '+key);
 }
 if(60%o['video-fps'])throw Error('video-fps must divide 60');
 const maxActionSeconds=Number(o['max-action-seconds']);createActionAdapter({maxSeconds:maxActionSeconds});
 if(maxActionSeconds!==1&&o.language!=='en')throw Error('Duration ablation currently requires English Markdown');
 if(!o['agent-label'].trim()||o['agent-label'].length>100)throw Error('Invalid agent-label');
 const url=new URL(o.url);
 if(o['clock-mode']==='realtime')url.searchParams.set('evaluationTimePolicy','round-budget');
 if(!['http:','https:'].includes(url.protocol)||!['127.0.0.1','localhost','[::1]'].includes(url.hostname)||url.username||url.password||url.hash)throw Error('--url must be a credential-free loopback game URL');
 let trainingTask;
 if(generated){
  if(!o['training-dataset'])throw Error('Training task requires --training-dataset FILE');
  const dataset=parseTrainingDataset(JSON.parse(await fs.readFile(path.join(root,trainingDatasetPath(o['training-dataset'])),'utf8')));
  trainingTask=dataset.tasks.find(t=>t.id===o.task);if(!trainingTask)throw Error('Task is not in the selected training dataset');
  if(['outdoorDataset','walkDataset'].some(k=>url.searchParams.has(k))||url.searchParams.has('trainingDataset')&&url.searchParams.get('trainingDataset')!==o['training-dataset'])throw Error('Conflicting training dataset URL');
  url.searchParams.set('trainingDataset',o['training-dataset']);
 }else if(o['training-dataset']||['trainingDataset','outdoorDataset','walkDataset'].some(k=>url.searchParams.has(k)))throw Error('Training dataset cannot modify a benchmark episode');
 const catalog=JSON.parse(await fs.readFile(new URL('../../tasks/catalog.json',import.meta.url),'utf8'));
 if(!generated&&!catalog.some(t=>t.id===o.task))throw Error('Task is excluded from the current benchmark');
 const prompts=await loadPrompts({systemPrompt:path.join(root,'scripts/server-eval',o.language==='en'?'system-prompt.en.md':'system-prompt.md'),promptsFile:path.join(root,'tasks/instructions.json'),tasks:generated?[]:[o.task]});
 const encoders=execFileSync('ffmpeg',['-hide_banner','-encoders'],{encoding:'utf8',stdio:['ignore','pipe','pipe']});
 if(!encoders.includes('libx264'))throw Error('ffmpeg with libx264 is required');
 return {taskId:o.task,url:url.href,renderer:o.renderer,language:o.language,seed:o.seed,quality:o.quality,
  maxRounds:/^c(?:10|11)-n/.test(o.task)||trainingTask?.shooting?Math.min(20,o['max-rounds']):o['max-rounds'],maxCalls:o['max-calls'],idleSeconds:o['idle-seconds'],videoFPS:o['video-fps'],crf:o.crf,
  output:path.resolve(o.output),agentLabel:o['agent-label'],system:prompts.system,instruction:trainingTask?.instruction[o.language]??prompts.instructions[o.task],bootstrap:o.bootstrap,maxActionSeconds,clockMode:o['clock-mode']};
}
