import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {renderCodexAgents,codexAgentsURL} from '../build-codex-agents.mjs';
import {harnessRules} from '../rules.mjs';
import {actionSchema} from '../tools.mjs';
import * as adapter from '../../server-eval/actions.mjs';

test('Codex AGENTS is built only from reviewed Markdown and stays under its loading budget',async()=>{
 const content=await renderCodexAgents();
 assert.equal(await fs.readFile(codexAgentsURL,'utf8'),content);
 assert(Buffer.byteLength(content)<32*1024);assert(!content.includes('{{ENVIRONMENT_RULES}}'));
 const system=await fs.readFile(new URL('../../server-eval/system-prompt.en.md',import.meta.url),'utf8');
 assert(content.includes(harnessRules(system,{language:'en'}).trim()),'shared environment rules must not drift from MCP');
});
test('Codex reads the visual objective and owns its history, without bare JSON or task-text leakage',async()=>{
 const content=await renderCodexAgents();
 assert(content.includes('top-left of the initial screenshot'));
 assert(!content.includes('## History'));assert(!content.includes('Image and message history are managed by the harness'));
 assert(!content.includes('at most 10 screenshots'));assert(!content.includes('oldest five screenshot turns'));
 assert(!content.includes('Output nothing other than JSON'));assert(!/c\d{2}-n\d{2,3}|static-(?:shooting|sniper)-gta-task-/.test(content));
 assert(!content.includes('game://task'));assert(content.includes('game_step.action'));
 assert(!content.includes('observation_id'));
 assert(!content.includes('game_observe'));assert(content.includes('in the initial user message'));
 assert(content.includes('reuse the same `request_id` and identical action when retrying an uncertain call'));
});
test('reviewed compact guidance removes History and changes only the introduction and action transport',async()=>{
 const system=await fs.readFile(new URL('../../server-eval/system-prompt.en.md',import.meta.url),'utf8');
 const content=await renderCodexAgents(),blocks=system.trim().split(/\r?\n\r?\n/);
 const original=blocks.filter((text,i)=>text!=='## History'&&blocks[i-1]!=='## History'),adapted=content.trim().split(/\r?\n\r?\n/);
 assert.equal(adapted.length,original.length,'do not append new behavioral guidance');
 const changed=original.flatMap((text,i)=>text===adapted[i]?[]:[{before:text,after:adapted[i]}]);
 assert.equal(changed.length,2,'outside the removed History section, only introduction and action transport may differ');
 assert(changed[0].before.startsWith('You are a game-playing agent'));
 assert(changed[1].before.startsWith('Control the game through the unified action interface.'));
 const originalRole=original[0].replace(' No task receives additional round-number or elapsed-time metadata.','');
 assert.equal(adapted[0],originalRole+' The task instruction appears only in the top-left of the initial screenshot supplied by the evaluator in the initial user message. Subsequent action results do not repeat it.');
 assert.deepEqual(adapted.filter(text=>text.startsWith('## ')),original.filter(text=>text.startsWith('## ')));
 assert(Buffer.byteLength(content)<Buffer.byteLength(system)*1.05,'keep guidance close to original size');
});
test('English MCP rules remove the fixed history section and keep the objective in the introduction',async()=>{
 for(const [language,file] of [['en','system-prompt.en.md']]){
  const source=await fs.readFile(new URL('../../server-eval/'+file,import.meta.url),'utf8');
  const content=harnessRules(source,{language});
  assert(!/^## (?:History|History)$/mi.test(content));
  assert(!/at most 10 screenshots|Contains at most 10 images|20 turns of complete history|20 Rounds of full history/i.test(content));
  assert(content.split(/\r?\n\r?\n/)[0].includes(language==='en'?'in the initial user message':"Top left of the first screenshot"));
  assert(content.includes('game_step.action'));assert(!content.includes('game_observe'));
 }
});
test('all original operation examples are unchanged and pass the existing action parser',async()=>{
 const content=await renderCodexAgents(),examples=[...content.matchAll(/```json\s*\n([\s\S]*?)\n```/g)];
 const system=await fs.readFile(new URL('../../server-eval/system-prompt.en.md',import.meta.url),'utf8');
 assert.deepEqual(examples.map(e=>e[1]),[...system.matchAll(/```json\s*\n([\s\S]*?)\n```/g)].map(e=>e[1]));
 assert.equal(examples.length,5);
 for(const [,json] of examples){
  const action=JSON.parse(json);assert(actionSchema.safeParse(action).success);adapter.parse(JSON.stringify(action));
 }
});
