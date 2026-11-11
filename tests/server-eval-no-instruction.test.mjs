import test from 'node:test';
import assert from 'node:assert/strict';
import {loadPrompts} from '../scripts/server-eval/prompts.mjs';
import {ModelContext} from '../scripts/server-eval/context.mjs';
const options={systemPrompt:new URL('../scripts/server-eval/system-prompt.en.md',import.meta.url).pathname,promptsFile:new URL('../tasks/instructions.json',import.meta.url).pathname,tasks:['c07-n02','c06-n02']};
test('generic-objective mode substitutes play the game, leaving normal defaults unchanged',async()=>{
 const normal=await loadPrompts(options);
 const ablation=await loadPrompts({...options,instructionMode:'none'});
 assert.equal(ablation.system,normal.system);
 assert.equal(ablation.language,'en');
 for(const id of options.tasks){assert(normal.instructions[id].length>0);assert.equal(ablation.instructions[id],'play the game');}
 await assert.rejects(loadPrompts({...options,instructionMode:'invalid'}),/Invalid instruction mode/);
 await assert.rejects(loadPrompts({...options,tasks:['missing-task'],instructionMode:'none'}),/Missing instruction/);
});
test('generic objective remains visible after history pruning',async()=>{
 const prompts=await loadPrompts({...options,instructionMode:'none'});
 const ctx=new ModelContext(prompts.system,prompts.instructions['c07-n02']);
 for(let round=1;round<=21;round++){
  ctx.observe({round,image:Buffer.from('image')});
  assert.deepEqual(ctx.messages()[1].content[0],{type:'text',text:'play the game'});
  ctx.reply('{"keys":[]}');
 }
});
test('image-only user messages remain instruction-free before and after history pruning',()=>{
 const ctx=new ModelContext('shared system','');
 for(let round=1;round<=21;round++){
  ctx.observe({round,image:Buffer.from('image')});
  const messages=ctx.messages();
  assert.deepEqual(messages[0],{role:'system',content:'shared system'});
  for(const m of messages.filter(m=>m.role==='user'))assert.deepEqual(m.content.map(c=>c.type),['image_url']);
  assert(ctx.rounds.length<=10);
  ctx.reply('{"keys":[]}');
 }
});
