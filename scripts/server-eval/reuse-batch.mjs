import fs from 'node:fs/promises';
import {createReadStream} from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';

const terminal=new Set(['success','task_failure','round_limit']);
const compatible=['protocol','model','endpoint','policy','thinking','reasoning-effort','max-tokens','max-rounds',
 'seed','quality','renderer','video-fps','crf','language','viewport','canvas2d','pageCompositing','systemPromptHash','adapterHash'];
async function checksum(file){const hash=createHash('sha256');for await(const chunk of createReadStream(file))hash.update(chunk);return hash.digest('hex');}
async function linkTree(source,target){
 const stat=await fs.lstat(source);if(stat.isSymbolicLink())throw Error('Refusing symlink in reused checkpoint');
 if(stat.isFile())return fs.link(source,target);
 if(!stat.isDirectory())throw Error('Unsupported checkpoint entry');
 await fs.mkdir(target);
 for(const item of await fs.readdir(source))await linkTree(path.join(source,item),path.join(target,item));
}

/** Import completed outcomes, including failures, without inference or replay.
 * The source task order must be the new task prefix, preserving native seeds,
 * archive names and original index metadata. Original files are never edited. */
export async function reuseCompletedPrefix({source,output,config,tasks,staticHashes}){
 source=await fs.realpath(source);output=await fs.realpath(output);
 if(source===output)throw Error('Reuse requires a new output directory');
 const original=JSON.parse(await fs.readFile(path.join(source,'config.json'),'utf8'));
 const summary=JSON.parse(await fs.readFile(path.join(source,'summary.json'),'utf8'));
 const results=[...summary.results].sort((a,b)=>a.index-b.index);
 if(summary.running!==false||!results.length||summary.completedEpisodes!==results.length||summary.requested!==results.length)throw Error('Reuse source must be a completely finished batch');
 for(const key of compatible)if(JSON.stringify(original[key])!==JSON.stringify(config[key]))throw Error('Reuse configuration mismatch: '+key);
 if((original.api??'chat-completions')!==(config.api??'chat-completions'))throw Error('Reuse configuration mismatch: api');
 if((original['reasoning-summary']??'off')!==(config['reasoning-summary']??'off'))throw Error('Reuse configuration mismatch: reasoning-summary');
 if(original.tasks!==results.map(r=>r.taskId).join(','))throw Error('Reuse source task order mismatch');
 const prepared=[];
 for(const [index,result] of results.entries()){
  if(result.index!==index||result.taskId!==tasks[index])throw Error('Reused tasks must be the exact new task prefix');
  if(!terminal.has(result.status)||!!result.success!==(result.status==='success')||result.error)throw Error('Cannot reuse an incomplete or evaluation-error result');
  if(original.instructions[result.taskId]!==config.instructions[result.taskId])throw Error('Reuse instruction mismatch: '+result.taskId);
  if(result.seed!==(/^c(?:10|11)-n/.test(result.taskId)?config.seed:config.seed+index))throw Error('Reuse seed mismatch');
  if(staticHashes&&JSON.stringify(result.staticHashes)!==JSON.stringify(staticHashes))throw Error('Reuse static dataset/executor mismatch');
  for(const key of ['environment.mjs','state-snapshot.mjs','protocol.mjs','advance-frames.mjs','move-relative.mjs','context.mjs']){
   if(result.harnessHashes?.[key]!==config.harnessHashes?.[key])throw Error('Reuse executor mismatch: '+key);
  }
  if(!/^[A-Za-z0-9_-]+\.tar\.gz$/.test(result.archive))throw Error('Invalid reused archive name');
  const archive=path.join(source,result.archive),stat=await fs.lstat(archive);
  if(!stat.isFile()||stat.isSymbolicLink())throw Error('Invalid reused archive');
  const checkpoint=result.checkpointDirectory;
  if(checkpoint){
   const absolute=path.resolve(source,checkpoint);
   if(!absolute.startsWith(source+path.sep)||!path.relative(source,absolute).startsWith('checkpoints'+path.sep))throw Error('Unsafe reused checkpoint path');
   if(!(await fs.lstat(absolute)).isDirectory())throw Error('Missing reused checkpoint directory');
  }
  prepared.push({result,archive,sha256:await checksum(archive)});
 }
 // Validate every result before materializing any artifacts.
 const reused=[];
 for(const {result,archive,sha256} of prepared){
  await fs.link(archive,path.join(output,result.archive));
  if(result.checkpointDirectory){
   const target=path.join(output,result.checkpointDirectory);
   await fs.mkdir(path.dirname(target),{recursive:true});
   await linkTree(path.join(source,result.checkpointDirectory),target);
  }
  reused.push({...result,reused:true,reusedFrom:{batch:source,archive:result.archive,sha256}});
 }
 await fs.writeFile(path.join(output,'reuse-manifest.json'),JSON.stringify({version:1,source,createdAt:new Date().toISOString(),
  reusedEpisodes:reused.length,tasks:reused.map(r=>r.taskId),artifacts:'immutable hard links; original source unchanged',
  results:reused.map(r=>({taskId:r.taskId,status:r.status,archive:r.archive,sha256:r.reusedFrom.sha256,seed:r.seed}))},null,2),{flag:'wx'});
 return reused;
}
