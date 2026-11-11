import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {fileURLToPath} from 'node:url';
import {parseArgs} from 'node:util';
import {spawn} from 'node:child_process';
import {selectFullTasks} from './server-eval/full-selection.mjs';
import {modelSettings,providerEndpoint} from './codex-eval/providers.mjs';
import {batchVariant} from './codex-eval/batch-variant.mjs';

const root=fileURLToPath(new URL('../',import.meta.url));
const read=async p=>JSON.parse(await fs.readFile(p,'utf8'));
const resolve=p=>path.resolve(root,p);
export async function evaluationPlan(config,{protocol=config.protocol}={}){
 if(!['json','codex'].includes(protocol))throw Error('protocol must be json or codex');
 if(config.apiKey||config.api_key||config.token||config.password)throw Error('Use keyEnv or keyFile; never embed credentials in a configuration');
 const language=config.language??'en';
 if(!['en','zh'].includes(language))throw Error('language must be en or zh');
 const manifest=await read(resolve(config.manifest??'configs/benchmark150.json'));
 const prompts=await read(resolve('tasks/instructions.json'));
 const expected=Object.keys(prompts.instructions);
 const all=selectFullTasks(manifest,expected),tasks=config.tasks===undefined||config.tasks==='all'?all:
  config.tasks==='online'?all.filter(id=>!/^c(?:10|11)-n/.test(id)):config.tasks;
 if(!Array.isArray(tasks)||!tasks.length||new Set(tasks).size!==tasks.length||tasks.some(id=>!all.includes(id)))throw Error('tasks must be all, online or a nonempty subset of the benchmark task IDs');
 const maxActionSeconds=config.maxActionSeconds??1,clockMode=config.clockMode??'stepped';
 if(protocol==='json'&&(maxActionSeconds!==1||clockMode!=='stepped'))throw Error('Paper timing ablations use the Codex protocol');
 if(protocol==='codex')batchVariant({harness:'codex',taskIds:tasks,maxActionSeconds,clockMode},all);
 if(maxActionSeconds!==1&&language!=='en')throw Error('Duration ablation requires English Markdown');
 const settings=modelSettings({model:config.model,api:config.api,effort:config.effort,contextWindow:config.contextWindow,reasoningSummary:config.reasoningSummary});
 const baseURL=config.baseURL;if(!baseURL)throw Error('baseURL is required');
 providerEndpoint(baseURL,settings.api);
 const workers=config.workers??4,maxRounds=config.maxRounds??300,maxTokens=config.maxTokens??32768,requestSeconds=config.requestSeconds??1200;
 for(const [name,n,lo,hi]of [['workers',workers,1,8],['maxRounds',maxRounds,1,100000],['maxTokens',maxTokens,128,65536],['requestSeconds',requestSeconds,5,3600]]){
  if(!Number.isInteger(n)||n<lo||n>hi)throw Error('Invalid '+name);
 }
 const keyEnv=config.keyEnv??'GTA_AGENT_API_KEY';if(!/^[A-Z_][A-Z0-9_]*$/.test(keyEnv))throw Error('Invalid keyEnv');
 if(config.keyFile&&config.keyEnv)throw Error('Choose keyFile or keyEnv');
 const url=new URL(config.url??'http://127.0.0.1:4200/');
 if(!['http:','https:'].includes(url.protocol)||url.username||url.password)throw Error('Invalid game URL');
 const output=resolve(config.output??`.cache/server-eval/${protocol}-${Date.now()}`);
 const renderer=config.renderer??'gpu',quality=config.quality??'low';
 if(!['gpu','cpu','auto'].includes(renderer)||!['low','medium','high'].includes(quality))throw Error('Invalid renderer or quality');
 if(protocol==='codex'&&renderer!=='gpu')throw Error('Codex batch evaluations require renderer: gpu');
 if(config.resume&&protocol!=='codex')throw Error('Use the JSON checkpoint/recovery commands documented in docs/evaluation.md');
 return {protocol,manifest,all,tasks,settings,baseURL,workers,maxRounds,maxTokens,requestSeconds,keyEnv,maxActionSeconds,clockMode,
  keyFile:config.keyFile?resolve(config.keyFile):null,url:url.href,output,language,renderer,quality,seed:config.seed??1234,
  wallSeconds:config.wallSeconds??10800,videoFPS:config.videoFPS??10,crf:config.crf??28,
  codexBin:config.codexBin??process.env.CODEX_BIN??'codex',resume:config.resume===true,
  quotaRecovery:config.quotaRecovery??{enabled:settings.family==='kimi'}};
}

export async function runEvaluation(plan){
 const key=(plan.keyFile?await fs.readFile(plan.keyFile,'utf8'):process.env[plan.keyEnv]??'').trim();
 if(!key)throw Error(`Missing API key; set ${plan.keyEnv} or keyFile`);
 const page=await (await fetch(plan.url,{signal:AbortSignal.timeout(15000)})).text();
 const src=page.match(/<script[^>]*type="module"[^>]*src="([^"]+)"/);
 if(!src)throw Error('No game build found. Run npm run build and npm start first.');
 const build=new URL(src[1],plan.url).href;
 const temp=await fs.mkdtemp(path.join(os.tmpdir(),'gtasuite-eval-'));await fs.chmod(temp,0o700);
 let child;
 const stop=sig=>child?.kill(plan.protocol==='codex'?'SIGUSR1':sig);
 const onTerm=()=>stop('SIGTERM'),onInt=()=>stop('SIGINT');
 process.once('SIGTERM',onTerm);process.once('SIGINT',onInt);
 try{
  const selection={...plan.manifest,build,tasks:plan.tasks,model:plan.settings.model,
   workers:plan.workers,sourceBuild:plan.manifest.build,createdAt:new Date().toISOString()};
  if(plan.protocol==='json'){
   if(plan.resume)throw Error('JSON batch resume must use verified recovery');
   try{await fs.access(path.join(plan.output,'config.json'));throw Error('Output already contains a run; choose a new output');}catch(e){if(e.code!=='ENOENT')throw e;}
   await fs.mkdir(plan.output,{recursive:true,mode:0o700});
   await fs.writeFile(path.join(plan.output,'selection.json'),JSON.stringify(selection,null,2));
   const args=['scripts/server-eval/run.mjs','--tasks',plan.tasks.join(','),'--workers',String(plan.workers),
    '--model',plan.settings.model,'--endpoint',providerEndpoint(plan.baseURL,plan.settings.api),'--api',plan.settings.api,
    '--reasoning-effort',plan.settings.effort,'--reasoning-summary',plan.settings.reasoningSummary,
    '--thinking',plan.settings.family==='gpt'?'':'enabled','--max-tokens',String(plan.maxTokens),
    '--max-rounds',String(plan.maxRounds),'--request-timeout',String(plan.requestSeconds),
    '--url',plan.url,'--renderer',plan.renderer,'--quality',plan.quality,'--seed',String(plan.seed),
    '--system-prompt',resolve(`scripts/server-eval/system-prompt${plan.language==='en'?'.en':''}.md`),
    '--prompts',resolve('tasks/instructions.json'),
    '--adapter',resolve('scripts/server-eval/actions.mjs'),'--format-attempts','3','--request-attempts','3',
    '--video-fps',String(plan.videoFPS),'--crf',String(plan.crf),'--output',plan.output];
   // The raw argument parser treats empty options as absent. Do not emit one.
   const thinking=args.indexOf('--thinking');if(args[thinking+1]==='')args.splice(thinking,2);
   child=spawn(process.execPath,['--experimental-transform-types',...args],{cwd:root,env:{...process.env,GTA_AGENT_API_KEY:key},stdio:'inherit'});
  }else{
   const planFile=path.join(temp,'selection.json'),keyFile=plan.keyFile??path.join(temp,'provider.key'),configFile=path.join(temp,'codex.json');
   await fs.writeFile(planFile,JSON.stringify(selection));
   if(!plan.keyFile)await fs.writeFile(keyFile,key,{mode:0o600});
   const config={...plan.settings,label:'gtasuite-codex',baseURL:plan.baseURL,keyFile,planFile,output:plan.output,
    workers:plan.workers,expectedCount:plan.tasks.length,language:plan.language,
    maxTokens:plan.maxTokens,maxRounds:plan.maxRounds,wallSeconds:plan.wallSeconds,requestSeconds:plan.requestSeconds,
    seed:plan.seed,url:plan.url,harness:'codex',toolViolationPolicy:'record-and-continue',codexBin:plan.codexBin,
    videoFPS:plan.videoFPS,resume:plan.resume,quotaRecovery:plan.quotaRecovery,maxActionSeconds:plan.maxActionSeconds,clockMode:plan.clockMode,
    ...(plan.tasks.length!==plan.all.length?{taskIds:plan.tasks}:{})};
   await fs.writeFile(configFile,JSON.stringify(config),{mode:0o600});
   child=spawn(process.execPath,['--experimental-transform-types','scripts/codex-eval/batch.mjs',configFile],{cwd:root,env:cleanEnvironment(),stdio:'inherit'});
  }
  const code=await new Promise((resolve,reject)=>{child.once('error',reject);child.once('close',code=>resolve(code??1));});
  return code;
 }finally{
  process.removeListener('SIGTERM',onTerm);process.removeListener('SIGINT',onInt);
  await fs.rm(temp,{recursive:true,force:true});
 }
}
function cleanEnvironment(){
 return Object.fromEntries(Object.entries(process.env).filter(([k])=>!/API_KEY|AUTH_TOKEN|ACCESS_TOKEN|PASSWORD/i.test(k)));
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{
  const {values}=parseArgs({options:{config:{type:'string'},protocol:{type:'string'},'dry-run':{type:'boolean'},help:{type:'boolean'}}});
  if(values.help){console.log('npm run eval -- --config configs/json.example.json [--dry-run]\nProtocol: json or codex. Paths in the configuration are relative to the repository root.');}
  else{
   if(!values.config)throw Error('--config is required');
   const config=await read(path.resolve(values.config)),plan=await evaluationPlan(config,{protocol:values.protocol??config.protocol});
   console.log(JSON.stringify({protocol:plan.protocol,model:plan.settings.model,effort:plan.settings.effort,tasks:plan.tasks.length,
    workers:plan.workers,output:plan.output,url:plan.url,maxRounds:plan.maxRounds,maxTokens:plan.maxTokens,
    maxActionSeconds:plan.maxActionSeconds,clockMode:plan.clockMode},null,2));
   if(!values['dry-run'])process.exitCode=await runEvaluation(plan);
  }
 }catch(error){console.error(error.message);process.exitCode=1;}
}
