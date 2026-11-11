import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {reuseCompletedPrefix} from '../scripts/server-eval/reuse-batch.mjs';

async function fixture(t){
 const base=await fs.mkdtemp(path.join(os.tmpdir(),'reuse-batch-'));
 t.after(()=>fs.rm(base,{recursive:true}));
 const source=path.join(base,'source'),output=path.join(base,'output');
 await fs.mkdir(source);await fs.mkdir(output);
 const tasks=['c01-n04','c10-n01'];
 const harnessHashes=Object.fromEntries(['environment.mjs','state-snapshot.mjs','protocol.mjs','advance-frames.mjs','move-relative.mjs','context.mjs'].map(k=>[k,'fixture-hash']));
 const config={protocol:'gui-server-turns-v2',model:'gpt-6.1-sol',endpoint:'http://127.0.0.1:8080/v1/chat/completions',policy:'model',thinking:'enabled','reasoning-effort':'xhigh',
  'max-tokens':32768,'max-rounds':300,seed:1234,quality:'low',renderer:'gpu','video-fps':10,crf:28,language:'en',viewport:[1280,720],canvas2d:'software',pageCompositing:'software',
  systemPromptHash:'system-hash',adapterHash:'adapter-hash',harnessHashes,tasks:tasks.join(','),instructions:Object.fromEntries(tasks.map(k=>[k,'play the game']))};
 const staticHashes={runtime:'fixture'};
 const results=tasks.map((taskId,index)=>({taskId,index,seed:1234,archive:`${String(index).padStart(4,'0')}-${taskId}.tar.gz`,checkpointDirectory:`checkpoints/${index}`,
  success:index===0,status:index===0?'success':'task_failure',harnessHashes,staticHashes}));
 for(const r of results){await fs.writeFile(path.join(source,r.archive),'immutable archive '+r.taskId);await fs.mkdir(path.join(source,r.checkpointDirectory),{recursive:true});await fs.writeFile(path.join(source,r.checkpointDirectory,'manifest.json'),'immutable journal');}
 const summary={running:false,requested:2,completedEpisodes:2,results};
 const save=async()=>{await fs.writeFile(path.join(source,'config.json'),JSON.stringify(config));await fs.writeFile(path.join(source,'summary.json'),JSON.stringify(summary));};
 await save();
 return {source,output,config,summary,staticHashes,tasks:[...tasks,'c01-n02'],save};
}

test('imports success AND task failure, preserving seeds, archives and checkpoint bytes without replay',async t=>{
 const f=await fixture(t),before=await fs.readFile(path.join(f.source,'summary.json'));
 const results=await reuseCompletedPrefix(f);
 assert.equal(results.length,2);assert.equal(results[1].status,'task_failure');
 for(const r of results){
  assert.equal(r.reused,true);assert.match(r.reusedFrom.sha256,/^[0-9a-f]{64}$/);
  assert.equal((await fs.stat(path.join(f.source,r.archive))).ino,(await fs.stat(path.join(f.output,r.archive))).ino);
  assert.equal(await fs.readFile(path.join(f.output,r.checkpointDirectory,'manifest.json'),'utf8'),'immutable journal');
 }
 assert.deepEqual(await fs.readFile(path.join(f.source,'summary.json')),before);
 assert.equal(JSON.parse(await fs.readFile(path.join(f.output,'reuse-manifest.json'),'utf8')).reusedEpisodes,2);
});

for(const key of ['model','reasoning-effort','max-tokens','systemPromptHash','adapterHash'])test('rejects changed '+key+' before linking any archive',async t=>{
 const f=await fixture(t);const config={...f.config,[key]:'different'};
 await assert.rejects(reuseCompletedPrefix({...f,config}),/configuration mismatch/);
 assert.deepEqual(await fs.readdir(f.output),[]);
});

test('rejects changed instructions and executor/dataset hashes',async t=>{
 const f=await fixture(t);
 await assert.rejects(reuseCompletedPrefix({...f,config:{...f.config,instructions:{...f.config.instructions,'c01-n04':'different'}}}),/instruction mismatch/);
 await assert.rejects(reuseCompletedPrefix({...f,staticHashes:{runtime:'different'}}),/dataset\/executor mismatch/);
 await assert.rejects(reuseCompletedPrefix({...f,config:{...f.config,harnessHashes:{...f.config.harnessHashes,'context.mjs':'different'}}}),/executor mismatch/);
 assert.deepEqual(await fs.readdir(f.output),[]);
});

test('does not mix legacy Chat results with a Responses/summary experiment',async t=>{
 const f=await fixture(t);
 await assert.rejects(reuseCompletedPrefix({...f,config:{...f.config,api:'responses','reasoning-summary':'auto'}}),/configuration mismatch: api/);
 f.config.api='responses';f.config['reasoning-summary']='auto';await f.save();
 await assert.rejects(reuseCompletedPrefix({...f,config:{...f.config,'reasoning-summary':'off'}}),/configuration mismatch: reasoning-summary/);
 assert.deepEqual(await fs.readdir(f.output),[]);
 const results=await reuseCompletedPrefix(f);assert.equal(results.length,2);
});

test('rejects running, incomplete and evaluation-error source batches',async t=>{
 const f=await fixture(t);f.summary.running=true;await f.save();
 await assert.rejects(reuseCompletedPrefix(f),/finished batch/);
 f.summary.running=false;f.summary.requested=3;await f.save();
 await assert.rejects(reuseCompletedPrefix(f),/finished batch/);
 f.summary.requested=2;f.summary.results[1].status='error';await f.save();
 await assert.rejects(reuseCompletedPrefix(f),/evaluation-error/);
 assert.deepEqual(await fs.readdir(f.output),[]);
});

test('requires exact task prefix and original per-task seed',async t=>{
 const f=await fixture(t);
 await assert.rejects(reuseCompletedPrefix({...f,tasks:[f.tasks[1],f.tasks[0],f.tasks[2]]}),/exact new task prefix/);
 f.summary.results[0].seed=500;await f.save();
 await assert.rejects(reuseCompletedPrefix(f),/seed mismatch/);
 assert.deepEqual(await fs.readdir(f.output),[]);
});

test('refuses same-directory reuse, unsafe paths, symlinks and overwrite',async t=>{
 const f=await fixture(t);
 await assert.rejects(reuseCompletedPrefix({...f,output:f.source}),/new output/);
 const r=f.summary.results[0],original=r.archive;r.archive='../escape.tar.gz';await f.save();
 await assert.rejects(reuseCompletedPrefix(f),/archive name/);
 r.archive=original;await f.save();await fs.rename(path.join(f.source,original),path.join(f.source,'actual.tar.gz'));await fs.symlink('actual.tar.gz',path.join(f.source,original));
 await assert.rejects(reuseCompletedPrefix(f),/Invalid reused archive/);
 await fs.unlink(path.join(f.source,original));await fs.rename(path.join(f.source,'actual.tar.gz'),path.join(f.source,original));
 await fs.writeFile(path.join(f.output,original),'already here');
 await assert.rejects(reuseCompletedPrefix(f),{code:'EEXIST'});
 assert.equal(await fs.readFile(path.join(f.output,original),'utf8'),'already here');
});
