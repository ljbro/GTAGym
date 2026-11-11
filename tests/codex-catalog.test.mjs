import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {extractBundledCatalog,gatewayCatalog,loadGatewayCatalog} from '../scripts/codex-eval/cli-catalog.mjs';
test('version-matched catalog extraction handles quoted braces and new model_messages metadata',()=>{
 const source={models:[{slug:'gpt-6.1-sol',model_messages:{base_instructions:'Keep the original {instructions} and "quotes"'},context_window:400000,use_responses_lite:true,tool_mode:'code_mode',experimental_supported_tools:['a']}]};
 const embedded=Buffer.concat([Buffer.from('\0garbage\0'),Buffer.from(JSON.stringify(source,null,2)),Buffer.from('\0other strings')]);
 assert.deepEqual(extractBundledCatalog(embedded),source);
 const adapted=gatewayCatalog(source,'gpt-6.1-sol');assert.equal(adapted.models[0].use_responses_lite,false);assert.equal(adapted.models[0].tool_mode,null);
 assert.deepEqual({...adapted.models[0],use_responses_lite:true,tool_mode:'code_mode'},source.models[0]);
 assert.equal(source.models[0].use_responses_lite,true,'do not mutate global/bundled metadata');
 assert.throws(()=>gatewayCatalog(source,'imaginary-model'));assert.throws(()=>extractBundledCatalog(Buffer.from('not a catalog')));
});
test('explicit catalogs reject oversized, relative, malformed and mismatched metadata',async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'gta-catalog-')),file=path.join(dir,'models.json');
 try{
  await fs.writeFile(file,JSON.stringify({models:[{slug:'custom',base_instructions:'',context_window:1000}]}));
  assert.equal((await loadGatewayCatalog(file,'custom')).models[0].base_instructions,'');
  await assert.rejects(loadGatewayCatalog('relative.json','custom'),/absolute/);
  await assert.rejects(loadGatewayCatalog(file,'other'),/absent/);
  assert.throws(()=>gatewayCatalog({models:[{slug:'custom'}]},'custom'),/instructions/);
  assert.throws(()=>gatewayCatalog({models:[null]},'custom'),/Invalid/);
  await fs.writeFile(file,Buffer.alloc(8*1024*1024+1));await assert.rejects(loadGatewayCatalog(file,'custom'),/8 MiB/);
 }finally{await fs.rm(dir,{recursive:true,force:true});}
});
