import test from 'node:test';
import assert from 'node:assert/strict';
import {loadConfig} from '../config.mjs';
import fs from 'node:fs/promises';

test('configuration pins the task, existing Markdown/instruction and server-only renderer',async()=>{
 const config=await loadConfig(['--task','c01-n04']);assert.equal(config.taskId,'c01-n04');assert.equal(config.renderer,'auto');
 assert.equal(config.language,'en');assert(config.system.includes('relative mouse displacement'));
 const prompts=JSON.parse(await fs.readFile(new URL('../../../tasks/instructions.json',import.meta.url),'utf8'));
 assert.equal(config.instruction,prompts.instructions['c01-n04']);assert.equal(config.maxRounds,300);assert.equal(config.bootstrap,'on');
 assert.equal((await loadConfig(['--task','c01-n04','--bootstrap','off'])).bootstrap,'off');
});
test('static episode budget is capped at 20; unremade/excluded tasks cannot be requested',async()=>{
 const config=await loadConfig(['--task','c11-n02']);assert.equal(config.maxRounds,20);
 await assert.rejects(loadConfig(['--task','c11-n30']),/excluded/);
 await assert.rejects(loadConfig(['--task','c10-n25']),/excluded/);
});
test('host configuration rejects remote/credential URLs and unknown or invalid settings',async()=>{
 for(const args of [[],['--task','../../x'],['--task','c01-n04','--url','http://example.com/'],['--task','c01-n04','--url','http://secret@localhost/'],['--task','c01-n04','--max-rounds','0'],['--task','c01-n04','--video-fps','7'],['--task','c01-n04','--bootstrap','other'],['--task','c01-n04','--allow-evaluate','yes']])await assert.rejects(loadConfig(args));
});
test('only the retained walking dataset is available and cannot modify benchmark episodes',async()=>{
 for(const args of [
  ['--task','rl-task-outdoor-test-0001'],
  ['--task','rl-task-outdoor-test-0001','--training-dataset','../secret.json'],
  ['--task','c01-n04','--training-dataset','tasks.json'],
  ['--task','c01-n04','--url','http://localhost:4200/?trainingDataset=tasks.json'],
  ['--task','c01-n04','--url','http://localhost:4200/?walkDataset=test.json'],
  ['--task','c01-n04','--url','http://localhost:4200/?outdoorDataset=test.json'],
 ])await assert.rejects(loadConfig(args));
});
test('the retained 50 walking tasks supply their own instructions with the unchanged system prompt',async()=>{
 const dataset=JSON.parse(await fs.readFile(new URL('../../../training-tasks/outdoor-walk/tasks.json',import.meta.url),'utf8'));
 assert.equal(dataset.tasks.length,50);
 for(const row of [dataset.tasks[0],dataset.tasks[6],dataset.tasks.at(-1)]){
  const config=await loadConfig(['--task',row.id,'--training-dataset','tasks.json']);
  assert.equal(new URL(config.url).searchParams.get('trainingDataset'),'tasks.json');
  assert.equal(config.instruction,row.instruction.en);
  assert.equal(config.system,await fs.readFile(new URL('../../server-eval/system-prompt.en.md',import.meta.url),'utf8'));
 }
 await assert.rejects(loadConfig(['--task',dataset.tasks[0].id,'--training-dataset','tasks.json','--url','http://localhost/?outdoorDataset=old.json']),/Conflicting/);
});
