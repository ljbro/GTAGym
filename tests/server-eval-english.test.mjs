import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {loadPrompts,composeSystemPrompt} from '../scripts/server-eval/prompts.mjs';
import * as adapter from '../scripts/server-eval/actions.mjs';
import {KEYS} from '../scripts/server-eval/protocol.mjs';
import {validatedPolicyReply} from '../scripts/server-eval/policy-retry.mjs';
import {ModelContext} from '../scripts/server-eval/context.mjs';
const root=new URL('../',import.meta.url);
const readJSON=async p=>JSON.parse(await fs.readFile(new URL(p,root),'utf8'));
const en=await readJSON('tasks/instructions.json');
const native=await readJSON('tasks/instructions.json');
const originalStatic=await readJSON('tasks/instructions.json');
const sourceCatalog=await readJSON('tasks/catalog.json');
const options={systemPrompt:new URL('scripts/server-eval/system-prompt.en.md',root).pathname,promptsFile:new URL('tasks/instructions.json',root).pathname};
test('all 150 benchmark tasks have explicit English instructions and category-based IDs',async()=>{
 const manifest=await readJSON('configs/benchmark150.json');
 const ids=manifest.categories.flatMap(c=>c.tasks);assert.equal(ids.length,150);assert.equal(new Set(ids).size,150);
 for(const id of ids){
  assert.match(id,/^c(?:0[1-9]|1[01])-n[0-9]{2}$/);
  const text=en.instructions[id];assert.equal(typeof text,'string',id);assert(text.trim(),id);
  assert(!/\p{Script=Han}/u.test(text),id);assert(!/PLACEHOLDER|output.*pixel coordinate|\[x,\s*y\]/i.test(text),id);
 }
});
test('English Markdown is the exact system prompt for native and static observations',async()=>{
 const p=await loadPrompts({...options,tasks:Object.keys(en.instructions)});assert.equal(p.language,'en');
 const system=composeSystemPrompt(p.system);assert(!/\p{Script=Han}/u.test(system));assert.equal(system,await fs.readFile(options.systemPrompt,'utf8'));
 for(const id of ['c07-n01','c10-n01','c11-n01']){
  const context=new ModelContext(system,p.instructions[id],{staticOriginal:/^c(?:10|11)-n/.test(id)});
  context.observe({round:1,gameSeconds:0,image:Buffer.from('PNG'),mime:'image/png'});
  assert.equal(context.messages()[0].content,p.system);
  assert(!/\p{Script=Han}/u.test(JSON.stringify(context.messages())));assert.equal(context.messages()[1].content[0].text,en.instructions[id]);
 }
 for(const match of p.system.matchAll(/```json\n([\s\S]*?)\n```/g))adapter.parse(match[1]);
 for(const key of KEYS)assert(p.system.includes('`'+key+'`'),key);
 assert(p.system.includes('1280x720'));assert(p.system.includes('(640,360)'));
 assert.equal(composeSystemPrompt(p.system,{description:'Chinese-only adapter'},'en'),p.system);
});
test('English instructions require explicit task entries',async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'gta-english-prompts-'));
 try{
  const file=path.join(dir,'prompts.json');await fs.writeFile(file,JSON.stringify({language:'en',instructions:{}}));
  await assert.rejects(()=>loadPrompts({...options,promptsFile:file,tasks:[Object.keys(originalStatic.instructions)[0]]}),/Missing instruction/);
 }finally{await fs.rm(dir,{recursive:true,force:true});}
});
test('default prompt selection uses the reviewed English library',async()=>{
 const id=Object.keys(originalStatic.instructions)[0];
 const p=await loadPrompts({systemPrompt:new URL('scripts/server-eval/system-prompt.md',root).pathname,promptsFile:new URL('tasks/instructions.json',root).pathname,tasks:['c07-n01',id]});
 assert.equal(p.language,'en');assert.equal(p.instructions[id],en.instructions[id]);assert.equal(p.instructions['c07-n01'],native.instructions['c07-n01']);
 assert.equal(composeSystemPrompt(p.system),await fs.readFile(new URL('scripts/server-eval/system-prompt.md',root),'utf8'));
});
test('Format correction feedback remains English',async()=>{
 let calls=0;
 const result=await validatedPolicyReply({messages:[{role:'system',content:'English system'}],language:'en',parse:adapter.parse,maxAttempts:2,request:async messages=>{
  calls++;if(calls===1)return {raw:'invalid JSON'};
  assert(!/\p{Script=Han}/u.test(JSON.stringify(messages)));assert(messages.at(-1).content.includes('still paused'));
  return {raw:'{"keys":[],"mouse":{"move":{"dx":0,"dy":0}}}'};
 }});
 assert.equal(result.attempts.length,2);
});
test('English instructions preserve special interactions, vehicles and numeric conditions',()=>{
 const i=en.instructions;
 assert.equal(i['c09-n01'],'Walk into the bank vault, collect the hidden cash, and retreat.');
 assert.match(i['c09-n02'],/wall-facing.*Crouch into cover/);
 assert.equal(i['c07-n01'],'Reach the target rooftop window.');
 assert.match(i['c01-n09'],/yellow SUV/);assert.match(i['c01-n07'],/motorcycle.*car wash/);
 assert.match(i['c04-n04'],/first companion.*1\.6 seconds.*left side/);
 assert.match(i['c08-n02'],/60 meters.*two seconds/);assert.match(i['c08-n04'],/three seconds.*two seconds/);
 assert.equal(i['c06-n10'],'Board the yacht.');
 assert.match(i['c10-n01'],/head.*white-shirted.*hostage/);
 assert.match(i['c11-n02'],/enemies.*farmhouse balconies ahead/);
 assert.match(i['c11-n07'],/two enemies.*garage/);
 assert.match(i['c11-n09'],/two enemies.*street corner/);
 assert.match(i['c11-n10'],/three enemies in front of the green dumpster/);
});
test('Task instructions omit hidden interaction keys and unsupported cues',()=>{
 const i=en.instructions;
 for(const id of ['c09-n01','c09-n02','c09-n03','c07-n01','c05-n06','c05-n14','c06-n10'])assert.doesNotMatch(i[id],/press |labeled CASH|pickup truck|stern|roller shutter/i,id);
 assert.equal(i['c09-n03'],'Leave the warehouse.');
 assert.equal(i['c09-n08'],'Reach the target position in the factory.');
 for(const id of ['c04-n01','c04-n03'])assert.equal(i[id],'Intercept the motorcycle ahead.');
 assert.doesNotMatch(i['c09-n06'],/Some doors/);
 assert.doesNotMatch(i['c09-n07'],/safe area/);
});
test('Reviewed translations preserve target relations without adding visual attributes',()=>{
 const i=en.instructions;
 assert.match(i['c01-n10'],/Align.*yellow SUV.*display window.*crash through it into the room/);
 assert.match(i['c10-n16'],/police lights on/);
 assert.doesNotMatch(i['c10-n16'],/flashing/);
 assert.match(i['c11-n12'],/bald man in a white shirt.*behind the gray yard wall.*to the right of the blue dumpster/);
 // The Chinese instructions intentionally removed distractor exclusions.
 for(const segment of ['082','086','087','096','103']){
  const row=(sourceCatalog).find(x=>x.kind==='sniper'&&x.sourceId.toLowerCase().replaceAll('_','-')===`gta-task-008752-segment-${segment}`);if(row)assert.doesNotMatch(i[row.id],/Do not shoot|not the other/i);
 }
 for(const id of ['c10-n18'])assert.match(i[id],/fallen personnel/);
});
