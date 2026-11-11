import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {evaluationPlan} from './evaluate.mjs';
import {selectFullTasks} from './server-eval/full-selection.mjs';
const root=fileURLToPath(new URL('../',import.meta.url)),read=async p=>JSON.parse(await fs.readFile(path.join(root,p),'utf8'));
for(const name of ['annotations','artifacts','static-tasks','tasks/training','tasks/navigation','tasks/calibrated','eval-viewer','scripts/claude-eval','scripts/remote-harness','scripts/serve-eval-viewer.py','scripts/export-eval-viewer.py',
 'scripts/eval_viewer_store.py','scripts/server-eval/publish-eval-viewer.mjs']){
 try{await fs.access(path.join(root,name));}catch(error){if(error.code==='ENOENT')continue;throw error;}
 throw Error('Internal data or evaluation UI must not be included: '+name);
}
const manifest=await read('configs/benchmark150.json');
const instructions=(await read('tasks/instructions.json')).instructions;
const tasks=selectFullTasks(manifest,Object.keys(instructions));
if(tasks.length!==150)throw Error('Canonical benchmark must contain 150 tasks');
for(const [i,row]of manifest.categories.entries())for(const [j,id]of row.tasks.entries()){
 const expected=`c${String(i+1).padStart(2,'0')}-n${String(j+1).padStart(2,'0')}`;
 if(id!==expected)throw Error('Canonical task ID/category order mismatch: '+id);
}
const catalog=await read('tasks/catalog.json');
let checked=0;
async function local(reference,base){
 if(!reference||typeof reference!=='string')return;
 if(/^[a-z]+:/i.test(reference))throw Error('Task resource must be a repository file: '+reference);
 const file=path.resolve(base,reference);
 if(!file.startsWith(path.resolve(root)+path.sep))throw Error('Task resource escapes repository: '+reference);
 await fs.access(file);checked++;
}
if(catalog.length!==150||catalog.some((row,i)=>row.id!==manifest.categories.flatMap(c=>c.tasks)[i]||row.instruction!==instructions[row.id]))throw Error('Task catalog differs from the frozen benchmark');
const images=catalog.filter(row=>row.kind!=='native');
if(images.length!==47)throw Error('Expected 47 current image tasks');
for(const row of images){
 if(row.originalConfig||row.previousConfigs)throw Error('Historical task configurations are not part of the release');
 const config=path.resolve(root,'tasks',row.config);await local(row.config,path.join(root,'tasks'));
 const cfg=JSON.parse(await fs.readFile(config,'utf8')),base=path.dirname(config);
 for(const stage of cfg.task?.stages??[])await local(stage.image,base);
 for(const layer of cfg.photo_layers??[])await local(layer.file,base);
 for(const ref of [cfg.scene?.image,cfg.initial_observation?.image,cfg.scope_entry?.image])await local(ref,base);
 await local(row.unscopedView?.image,path.join(root,'tasks'));
}
const training=await read('training-tasks/outdoor-walk/tasks.json');
if(training.tasks.length!==50||training.tasks.some(t=>t.category!=='outdoor-foot'||t.resolved.movement!=='walk'))throw Error('Only the retained 50 walking training tasks may be shipped');
for(const name of ['json','codex']){
 const plan=await evaluationPlan(await read(`configs/${name}.example.json`));
 if(plan.tasks.length!==150||plan.maxRounds!==300||plan.maxTokens!==32768)throw Error('Example configuration drifted');
}
const secretPatterns=[/\bsk-(?:kimi-)?[a-zA-Z0-9_-]{24,}\b/,/-----BEGIN (?:RSA |OPENSSH |EC )?PRIVATE KEY-----/];
const excluded=new Set(['.git','node_modules','.cache','dist','public','outputs','results']);
let files=0,bytes=0;
async function scan(dir){
 for(const e of await fs.readdir(dir,{withFileTypes:true})){
  if(excluded.has(e.name))continue;
  const p=path.join(dir,e.name);
  const relative=path.relative(root,p);
  if(relative==='training-tasks/shooting-sources'||relative.startsWith('training-tasks/generated/')&&relative!=='training-tasks/generated/README.md')continue;
  if(e.isSymbolicLink())throw Error('Release cannot depend on filesystem symlinks: '+path.relative(root,p));
  if(e.isDirectory()){await scan(p);continue;}
  const stat=await fs.stat(p);files++;bytes+=stat.size;
  if(stat.size>=100*1024*1024)throw Error('File exceeds GitHub regular Git size limit: '+path.relative(root,p));
  if(/\.(?:mjs|js|ts|json|ya?ml|md|py|html|css|svg|txt)$/.test(p)||/^(?:LICENSE|NOTICE|COPYING|Dockerfile)$/.test(e.name)){
   const s=await fs.readFile(p,'utf8');
   if(/[\u3400-\u9fff]/.test(s))throw Error('Release text must be English: '+path.relative(root,p));
   if(secretPatterns.some(pattern=>pattern.test(s)))throw Error('Potential credential found in '+path.relative(root,p));
   if(/\/inspire\/(?:qb-|hdd\/)/.test(s))throw Error('Private deployment path found in '+path.relative(root,p));
  }
 }
}
await scan(root);
console.log(JSON.stringify({tasks:tasks.length,categories:manifest.categories.length,staticResourceReferences:checked,
 releaseFiles:files,releaseMiB:Number((bytes/1024**2).toFixed(2)),credentialScan:'passed',deploymentPathScan:'passed',englishTextScan:'passed'},null,2));
