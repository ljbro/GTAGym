import fs from 'node:fs/promises';
import path from 'node:path';
import {gzip,gunzip} from 'node:zlib';
import {promisify} from 'node:util';
import {execFile} from 'node:child_process';

const zip=promisify(gzip),unzip=promisify(gunzip),exec=promisify(execFile);
const roundName=n=>String(n).padStart(6,'0');
async function atomic(file,data){
 const tmp=file+'.tmp',handle=await fs.open(tmp,'w',0o600);
 try{await handle.writeFile(data);await handle.sync();}finally{await handle.close();}
 await fs.rename(tmp,file);
 const dir=await fs.open(path.dirname(file),'r');try{await dir.sync();}finally{await dir.close();}
}

/** Per-round compressed write-ahead journal, independent of the open tar stream.
 * Only a committed round is a resumable boundary; a partial action is never retried
 * against a half-mutated browser. This is replay recovery, NOT a world snapshot. */
export class CheckpointJournal {
 constructor(directory){this.directory=directory;}
 async init(config){
  await fs.mkdir(path.dirname(this.directory),{recursive:true});
  await fs.mkdir(this.directory); // never overwrite an earlier run
  await atomic(path.join(this.directory,'manifest.json'),JSON.stringify({version:1,kind:'verified-action-replay',config}));
 }
 async save(record,image,phase){
  const value={phase,record,image:image.toString('base64')};
  await atomic(path.join(this.directory,roundName(record.round)+'.json.gz'),await zip(JSON.stringify(value)));
 }
}

/** Read without extracting arbitrary archive paths. Legacy completed archives
 * can be used too; their state checks are weaker than new journal records. */
export async function loadCheckpoint(source,startRound){
 source=path.resolve(source);const directory=(await fs.stat(source)).isDirectory();
 let config,records,getImage;
 if(directory){
  const manifest=JSON.parse(await fs.readFile(path.join(source,'manifest.json'),'utf8'));
  if(manifest.version!==1||manifest.kind!=='verified-action-replay')throw Error('Unsupported checkpoint');
  config=manifest.config;records=[];
  const read=async n=>JSON.parse((await unzip(await fs.readFile(path.join(source,roundName(n)+'.json.gz')))).toString());
  for(const name of (await fs.readdir(source)).filter(n=>/^\d{6}\.json\.gz$/.test(n)).sort()){
   const value=await read(Number(name.slice(0,6)));if(value.phase==='committed')records.push(value.record);
  }
  getImage=async n=>Buffer.from((await read(n)).image,'base64');
 }else{
  if(!source.endsWith('.tar.gz'))throw Error('Resume source must be a checkpoint directory or .tar.gz');
  const {stdout}=await exec('python3',['-c',`import json,tarfile,sys,re
out={'records':[]}
with tarfile.open(sys.argv[1], 'r|gz') as t:
 for m in t:
  if m.name in ('config.json','result.json') or re.fullmatch(r'rounds/\\d{6}\\.json',m.name):
   if m.size>8388608: raise ValueError('Oversized checkpoint record')
   d=json.load(t.extractfile(m))
   if m.name=='config.json':out['config']=d
   elif m.name=='result.json':out['environment']=d.get('environment',{})
   elif d.get('after') and d.get('transition') and not d.get('error'):out['records'].append(d)
print(json.dumps(out))`,source],{maxBuffer:64*1024*1024});
  const archive=JSON.parse(stdout);({config,records}=archive);
  const run=JSON.parse(await fs.readFile(path.join(path.dirname(source),'config.json'),'utf8'));
  config={...run,...config,build:archive.environment?.build};
  getImage=async n=>(await exec('tar',['-xOzf',source,`observations/${roundName(n)}.${/^c(?:10|11)-n/.test(config.taskId)||config.taskId.startsWith('rl-task-shooting-')?'png':'jpg'}`],{encoding:'buffer',maxBuffer:16*1024*1024})).stdout;
 }
 records.sort((a,b)=>a.round-b.round);
 const firstGap=records.findIndex((r,i)=>r.round!==i+1);
 if(firstGap>=0)records=records.slice(0,firstGap);
 const nextRound=startRound??records.length+1;
 if(!Number.isInteger(nextRound)||nextRound<1||nextRound>records.length+1)throw Error(`Resume round must be between 1 and ${records.length+1}`);
 return {source,config,nextRound,records:records.slice(0,nextRound-1),getImage};
}

/** Do not silently continue a replay that drifted. Absolute wall/animation
 * offsets and rendering pixels are deliberately not considered world state. */
export function verifyReplayState(expected,actual,label){
 if((expected.stateVersion??1)!==(actual.stateVersion??1))throw Error(`Replay state schema mismatch at ${label}: old position/mode records cannot verify corrected telemetry; start a new run`);
 const fields=['stateVersion','taskId','active','complete','failed','elapsed','maxDuration','mode','paused','actor','mousePosition','viewport','replayState','staticTask'];
 function compare(a,b,key){
  if(a===undefined)return; // older archives have fewer diagnostic fields
  if(typeof a==='number'){
   if(!Number.isFinite(b)||Math.abs(a-b)>(key.endsWith('elapsed')?1e-6:.01))throw Error(`Replay diverged at ${label}.${key}`);
  }else if(a&&typeof a==='object'){
   if(!b||typeof b!=='object'||Array.isArray(a)&&a.length!==b.length)throw Error(`Replay diverged at ${label}.${key}`);
   for(const k of Object.keys(a))compare(a[k],b[k],key+'.'+k);
  }else if(a!==b)throw Error(`Replay diverged at ${label}.${key}`);
 }
 for(const key of fields)compare(expected[key],actual[key],key);
}
