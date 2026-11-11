import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {ShootingEnvironment} from '../tasks/engines/shooting-engine.mjs';

const sha=b=>createHash('sha256').update(b).digest('hex');
const pattern=/^\.\.\/training-tasks\/shooting-sources\/[a-f0-9]{64}\/task\.json$/;
const emptyPool=()=>({schema:'gtabench.shooting-pool.v1',pairs:[],provenance:{}});
async function heldImages(root){
 const rows=JSON.parse(await fs.readFile(path.join(root,'tasks/catalog.json'),'utf8')),images=new Set();
 for(const row of rows.filter(r=>r.kind==='shooting')){
  const file=path.resolve(root,'tasks',row.config),cfg=JSON.parse(await fs.readFile(file,'utf8'));
  images.add(sha(await fs.readFile(path.resolve(path.dirname(file),cfg.task.stages[0].image))));
 }
 return {ids:new Set(rows.map(r=>r.id)),images};
}
export async function verifyShootingPair(root,pair){
 if(!pattern.test(pair.config))throw Error('Invalid isolated training shooting source');
 const file=path.resolve(root,'tasks',pair.config),raw=await fs.readFile(file);
 if(sha(raw)!==pair.configSha256)throw Error('Training shooting configuration hash changed');
 const cfg=JSON.parse(raw),stage=cfg.task?.stages?.[0];
 if(!stage||!/^image\.(?:png|jpe?g|webp)$/.test(stage.image))throw Error('Invalid training image path');
 if(sha(await fs.readFile(path.join(path.dirname(file),stage.image)))!==pair.imageSha256)throw Error('Training shooting image hash changed');
 if(stage.width!==pair.width||stage.height!==pair.height||JSON.stringify(cfg.gold.point_xy)!==JSON.stringify(pair.center))throw Error('Shooting manifest does not match its annotation');
 const engine=new ShootingEnvironment(cfg.task,cfg.gold);engine.step({type:'aim',point:pair.center});
 if(!engine.step({type:'fire'}).result.hit)throw Error('Annotated reference point does not pass the original evaluator');
 return cfg;
}

/** Import supplied annotated pairs; never promote unannotated images or reuse
 * a benchmark image as training data. Image bytes and hit annotations survive. */
export async function buildShootingPool(root,source){
 const manifest=JSON.parse(await fs.readFile(source,'utf8'));
 if(!Array.isArray(manifest.pairs)||!manifest.pairs.length)throw Error('Expected a nonempty pairs array');
 const held=await heldImages(root),pool=emptyPool(),seen=new Set(),rejected=[];
 for(const [index,row] of manifest.pairs.entries()){
  const instruction=typeof row.instruction==='string'?row.instruction:row.instruction?.en;
  if(typeof row.config!=='string'||/^[a-z]+:/i.test(row.config)||!instruction?.trim()||/[\u3400-\u9fff]/.test(instruction))throw Error('Each source pair needs a local config and English instruction');
  const sourceFile=path.resolve(path.dirname(source),row.config),cfg=JSON.parse(await fs.readFile(sourceFile,'utf8')),stage=cfg.task?.stages?.[0];
  if(!stage||typeof stage.image!=='string'||/^[a-z]+:/i.test(stage.image))throw Error('Source config needs a local annotated stage image');
  const image=await fs.readFile(path.resolve(path.dirname(sourceFile),stage.image)),imageSha256=sha(image);
  const reason=held.ids.has(row.id)?'held-out-task':held.images.has(imageSha256)?'held-out-identical-image':seen.has(imageSha256)?'duplicate-image':null;
  if(reason){rejected.push({index:index+1,reason});continue;}
  const engine=new ShootingEnvironment(cfg.task,cfg.gold);engine.step({type:'aim',point:cfg.gold.point_xy});
  if(!engine.step({type:'fire'}).result.hit)throw Error('Source target center fails original scoring');
  const ext=path.extname(stage.image).toLowerCase();
  if(!['.png','.jpg','.jpeg','.webp'].includes(ext))throw Error('Unsupported source image format');
  stage.image='image'+ext;cfg.task.instruction=instruction;stage.prompt=instruction;
  const raw=Buffer.from(JSON.stringify(cfg,null,2)+'\n'),key=sha(Buffer.concat([raw,image])),dir=path.join(root,'training-tasks/shooting-sources',key);
  await fs.mkdir(dir,{recursive:true});
  for(const [name,bytes] of [['task.json',raw],[stage.image,image]]){
   try{await fs.writeFile(path.join(dir,name),bytes,{flag:'wx'});}
   catch(e){if(e.code!=='EEXIST'||sha(await fs.readFile(path.join(dir,name)))!==sha(bytes))throw e;}
  }
  pool.pairs.push({index:pool.pairs.length+1,id:row.id??'source-'+(index+1),sourceId:cfg.task.id,
   config:`../training-tasks/shooting-sources/${key}/task.json`,configSha256:sha(raw),imageSha256,
   width:stage.width,height:stage.height,center:cfg.gold.point_xy,instruction:{en:instruction,zh:instruction},quality:cfg.task.quality??'provided'});
  seen.add(imageSha256);
 }
 if(!pool.pairs.length)throw Error('No eligible annotated sources remain after benchmark-image exclusion');
 pool.provenance={source:'User-supplied annotated image/target pairs',manifestSha256:sha(await fs.readFile(source)),
  annotatedCount:manifest.pairs.length,heldOutCount:held.ids.size,rejected,
  splitScope:'Task ID and byte-identical benchmark shooting-image exclusion; no video/scene-level disjointness claim.'};
 return pool;
}
export async function loadShootingPool(root,file){
 if(!file)throw Error('Shooting generation needs --shooting-pool POOL_JSON. Import annotated sources with shooting-pool --source FILE --output DIRECTORY first.');
 const pool=JSON.parse(await fs.readFile(path.resolve(file),'utf8'));
 if(pool.schema!=='gtabench.shooting-pool.v1'||!Array.isArray(pool.pairs)||!pool.pairs.length)throw Error('Invalid shooting pool manifest');
 const held=await heldImages(root),ids=new Set();
 for(const [i,p]of pool.pairs.entries()){
  if(p.index!==i+1||ids.has(p.id)||!p.instruction?.en||held.ids.has(p.id)||held.images.has(p.imageSha256))throw Error('Invalid or held-out training shooting pair');
  ids.add(p.id);await verifyShootingPair(root,p);
 }
 return pool;
}
