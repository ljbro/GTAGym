// Preserve the CLI's own version-matched instructions/context metadata while
// adapting only its wire dialect to a standard Responses API gateway.
// An explicit provider catalog may supply metadata for a third-party model.
import fs from 'node:fs/promises';
import path from 'node:path';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';

export function extractBundledCatalog(buffer){
 const marker=Buffer.from('{\n  "models": [');let offset=0;
 while((offset=buffer.indexOf(marker,offset))!==-1){
  const start=offset;let depth=0,quoted=false,escape=false;
  for(;offset<Math.min(start+8*1024*1024,buffer.length);offset++){
   const c=buffer[offset];
   if(quoted){if(escape)escape=false;else if(c===92)escape=true;else if(c===34)quoted=false;continue;}
   if(c===34){quoted=true;continue;}if(c===123||c===91)depth++;
   if(c===125||c===93){depth--;if(depth===0){
    try{
     const value=JSON.parse(buffer.subarray(start,offset+1).toString());
     if(Array.isArray(value.models)&&value.models.length&&value.models.every(m=>typeof m.slug==='string'&&
      (typeof m.base_instructions==='string'||m.model_messages&&typeof m.model_messages==='object')))return value;
    }catch{}
    break;
   }}
  }
  offset=start+marker.length;
 }
 throw Error('Cannot locate the version-matched bundled Codex model catalog; do not fall back to invented model metadata');
}
async function executable(){
 for(const directory of (process.env.PATH??'').split(path.delimiter)){
  const file=path.join(directory,'codex');try{await fs.access(file);return await fs.realpath(file);}catch{}
 }
 throw Error('Codex is not installed');
}
export async function bundledCatalog(){
 try{return JSON.parse(await fs.readFile(new URL('bundled-models.json',import.meta.url),'utf8'));}catch(error){if(error.code!=='ENOENT')throw error;}
 let file=await executable();
 if(file.endsWith('.js')){
  const platforms={'linux:x64':['codex-linux-x64','x86_64-unknown-linux-musl'],'linux:arm64':['codex-linux-arm64','aarch64-unknown-linux-musl'],
   'darwin:x64':['codex-darwin-x64','x86_64-apple-darwin'],'darwin:arm64':['codex-darwin-arm64','aarch64-apple-darwin']};
  const target=platforms[process.platform+':'+process.arch];if(!target)throw Error('Unsupported Codex catalog extraction platform');
  const require=createRequire(file);let vendor;
  try{vendor=path.join(path.dirname(require.resolve('@openai/'+target[0]+'/package.json')),'vendor');}
  catch{vendor=path.resolve(path.dirname(file),'../vendor');}
  file=path.join(vendor,target[1],'bin','codex');
 }
 return extractBundledCatalog(await fs.readFile(file));
}
export function gatewayCatalog(catalog,model){
 if(!Array.isArray(catalog?.models)||!catalog.models.every(m=>m&&typeof m.slug==='string'))throw Error('Invalid Codex model catalog');
 const original=catalog.models.find(m=>m.slug===model)??catalog.models.find(m=>m.slug.toLowerCase()===model.toLowerCase());
 if(!original)throw Error('Model is absent from the pinned CLI catalog; configure a matching CLI/catalog instead of inventing context or instructions');
 if(typeof original.base_instructions!=='string'&&(!original.model_messages||typeof original.model_messages!=='object'))throw Error('Model catalog must include provider-supplied instructions metadata');
 return {models:[{...original,slug:model,use_responses_lite:false,tool_mode:null}]};
}
export async function loadGatewayCatalog(file,model){
 if(!path.isAbsolute(file))throw Error('harness.modelCatalog must be an absolute host path');
 const stat=await fs.stat(file);if(!stat.isFile()||stat.size>8*1024*1024)throw Error('Model catalog must be a file smaller than 8 MiB');
 return gatewayCatalog(JSON.parse(await fs.readFile(file,'utf8')),model);
}
if(process.argv[1]===fileURLToPath(import.meta.url)){
 if(process.argv[2]!=='--output'||!process.argv[3]||process.argv.length!==4)throw Error('Expected --output NEW_CATALOG');
 await fs.writeFile(process.argv[3],JSON.stringify(await bundledCatalog()),{flag:'wx',mode:0o644});
}
