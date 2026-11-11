import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {ModelContext} from '../scripts/server-eval/context.mjs';
import {loadPrompts,composeSystemPrompt} from '../scripts/server-eval/prompts.mjs';
import * as adapter from './fixtures/wait-adapter.mjs';
import {build} from 'esbuild';

const promptsFile=fileURLToPath(new URL('../tasks/instructions.json',import.meta.url));
const systemPrompt=fileURLToPath(new URL('../scripts/server-eval/system-prompt.md',import.meta.url));
const json=JSON.parse(await fs.readFile(promptsFile,'utf8'));
const prompts={...json,...await loadPrompts({systemPrompt,promptsFile,tasks:['c01-n04','c07-n04','c08-n02']})};

test('shared prompt is loaded from editable Markdown, not duplicated in JSON',async()=>{
 assert.equal(prompts.system,await fs.readFile(systemPrompt,'utf8'));
 assert(prompts.system.trim().length>0);
 assert(!Object.hasOwn(json,'system'),'no second system prompt copy in JSON');
 assert.equal(typeof prompts.instructions,'object');
});

test('every active native task has a reviewed instruction; no archived or merged IDs',async()=>{
 const root=fileURLToPath(new URL('../',import.meta.url));
 // Read the actual catalog without instantiating the city or changing production exports.
 const bundled=await build({stdin:{contents:"import {TASKS,NATIVE_AIR_TASKS} from './native-city/src/native-task-system.ts'; export default [...TASKS,...NATIVE_AIR_TASKS];",resolveDir:root},bundle:true,platform:'node',format:'esm',write:false,loader:{'.css':'empty'},define:{'import.meta.env':'{}'},plugins:[{name:'read-native-catalog',setup(b){b.onLoad({filter:/native-task-system\.ts$/},async a=>({contents:(await fs.readFile(a.path,'utf8'))+'\nexport {TASKS,NATIVE_AIR_TASKS};',loader:'ts'}));}}]});
 const {default:raw}=await import('data:text/javascript;base64,'+Buffer.from(bundled.outputFiles[0].text).toString('base64'));
 const tasks=raw.filter((t,i,a)=>a.findIndex(other=>other.id===t.id)===i);
 assert.deepEqual(Object.keys(json.instructions).filter(id=>!/^c(?:10|11)-n/.test(id)).sort(),tasks.map(t=>t.id).sort());
 assert.equal(json.instructionTemplate,undefined,'unknown IDs must fail, not become placeholder episodes');
 for(const t of tasks){const instruction=json.instructions[t.id];assert(instruction.trim().length>0,t.id);assert(!/PLACEHOLDER|To be filled in|To be added/i.test(instruction),t.id);
  // Instructions intentionally state the objective briefly; shared rules live
  // in the editable system prompt, not repeated in every task instruction.
  if(t.category==='escape')assert.match(instruction,/evade|escape/i,t.id);
  if(t.category==='follow')assert.match(instruction,/follow/i,t.id);
  if(t.category==='air')assert.match(instruction,/land.*(?:two|2) seconds/i,t.id);
 }
 for(const id of ['c01-n07','c01-n12','c03-n06','c05-n14','c05-n13','c01-n03'])assert.match(json.instructions[id],/motorcycle|Bagger/i);
 assert.equal(json.instructions['c07-n01'],'Reach the target rooftop window.');
 assert.match(json.instructions['c09-n02'],/wall-facing.*Crouch into cover/);
 for(const id of ['c09-n01','c09-n02','c09-n03'])assert.doesNotMatch(json.instructions[id],/press\s*[EQ]/i);
 assert.equal(json.instructions['c06-n10'],'Board the yacht.');
 assert(!json.instructions['c09-n09']);assert(!json.instructions['c09-n10']);
 await assert.rejects(loadPrompts({systemPrompt,promptsFile,tasks:['unknown-task']}),/Missing instruction/);
 console.log('Native instructions covered:',tasks.length);
});

test('Markdown is read verbatim, once per load; edits apply to next run snapshot',async t=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'gta-prompts-'));t.after(()=>fs.rm(dir,{recursive:true}));
 const file=path.join(dir,'custom.md'),original="# Custom\n\nChinese Instructions. \n\n- Rule A\n";
 await fs.writeFile(file,original);
 const first=await loadPrompts({systemPrompt:file,promptsFile,tasks:['c01-n04']});
 assert.equal(first.system,original);assert.equal(first.systemPromptPath,file);
 await fs.writeFile(file,'# Edited\n\nRule B\n');
 const second=await loadPrompts({systemPrompt:file,promptsFile,tasks:['c01-n04']});
 assert.equal(first.system,original);assert.equal(second.system,'# Edited\n\nRule B\n');
 assert.deepEqual(first.instructions,second.instructions);
});

test('missing/empty Markdown fails explicitly; no fallback to old JSON system',async t=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'gta-prompts-'));t.after(()=>fs.rm(dir,{recursive:true}));
 const file=path.join(dir,'empty.md');
 await assert.rejects(loadPrompts({systemPrompt:file,promptsFile,tasks:[]}),/ENOENT/);
 await fs.writeFile(file,' \n\t');
 await assert.rejects(loadPrompts({systemPrompt:file,promptsFile,tasks:[]}),/Markdown is empty/);
 const legacy=path.join(dir,'legacy.json');await fs.writeFile(legacy,JSON.stringify({system:'old',instructions:{}}));
 await assert.rejects(loadPrompts({systemPrompt,promptsFile:legacy,tasks:[]}),/Move the JSON system field/);
});

test('instruction configuration still validates missing tasks and malformed fields',async t=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'gta-prompts-'));t.after(()=>fs.rm(dir,{recursive:true}));
 const file=path.join(dir,'instructions.json');
 for(const invalid of [null,[],{instructions:[]},{instructions:{},instructionTemplate:9}]){
  await fs.writeFile(file,JSON.stringify(invalid));await assert.rejects(loadPrompts({systemPrompt,promptsFile:file,tasks:['c09-n01']}));
 }
 await fs.writeFile(file,JSON.stringify({instructions:{}}));
 await assert.rejects(loadPrompts({systemPrompt,promptsFile:file,tasks:['c09-n01']}),/Missing instruction c09-n01/);
});

test('blank instructions use play the game in both languages without changing nonempty text',async t=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'gta-blank-prompts-'));t.after(()=>fs.rm(dir,{recursive:true}));
 const file=path.join(dir,'instructions.json');
 for(const language of ['zh','en']){
  const instructions={'empty':'','spaces':' \n\t','null':null,'unchanged':'  Original instruction.  '};
  await fs.writeFile(file,JSON.stringify({language,instructions}));
  const loaded=await loadPrompts({systemPrompt,promptsFile:file,tasks:Object.keys(instructions)});
  for(const id of ['empty','spaces','null'])assert.equal(loaded.instructions[id],'play the game');
  assert.equal(loaded.instructions.unchanged,instructions.unchanged);
  await fs.writeFile(file,JSON.stringify({language,instructions:{invalid:42}}));
  await assert.rejects(loadPrompts({systemPrompt,promptsFile:file,tasks:['invalid']}),/Invalid instruction/);
 }
});

test('editing the prompt does not expand placeholder executor capability',()=>{
 assert.match(adapter.description,/ACTION_SPACE_PLACEHOLDER/);
 assert.throws(()=>adapter.parse('{"keys":["w"],"frames":60}'));
 assert.equal(adapter.parse('{"action":"wait","duration_seconds":0.1}').frames,6);
});

test('adapter descriptions never change the Markdown system message',()=>{
 const markdown='# Custom\n\nOnly these rules.\n';
 for(const language of ['zh','en']){
  const hidden={get description(){throw Error('must not read adapter prose');},get descriptionEn(){throw Error('must not read adapter prose');}};
  assert.equal(composeSystemPrompt(markdown,hidden,language),markdown);
 }
 assert.equal(composeSystemPrompt(markdown),markdown);
});

test('same Markdown system across tasks; instruction is separate and survives pruning',()=>{
 const system=composeSystemPrompt(prompts.system);
 for(const taskId of ['c01-n04','c07-n04','c08-n02']){
  const instruction=prompts.instructions[taskId]??prompts.instructionTemplate.replaceAll('{{taskId}}',taskId);
  const context=new ModelContext(system,instruction);
  for(let i=1;i<=11;i++){context.observe({round:i,gameSeconds:i,image:Buffer.from('fixture')});context.reply('{"action":"wait","duration_seconds":0.1}');}
  const messages=context.messages();assert.equal(messages[0].content,prompts.system);assert.equal(messages[1].content[0].text,instruction);
  assert(messages[1].content.some(p=>p.type==='image_url'));
  assert.equal(messages.filter(m=>Array.isArray(m.content)).length,6);
 }
});
