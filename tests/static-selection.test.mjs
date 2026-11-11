import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const read=p=>JSON.parse(fs.readFileSync(new URL('../'+p,import.meta.url)));
test('one catalog contains exactly the 150 benchmark tasks and their current image configurations',()=>{
 const catalog=read('tasks/catalog.json'),benchmark=read('configs/benchmark150.json'),instructions=read('tasks/instructions.json').instructions;
 const ids=benchmark.categories.flatMap(c=>c.tasks);
 assert.deepEqual(catalog.map(r=>r.id),ids);assert.deepEqual(Object.keys(instructions),ids);
 assert.equal(catalog.filter(r=>r.kind==='native').length,103);
 assert.equal(catalog.filter(r=>r.kind==='shooting').length,24);
 assert.equal(catalog.filter(r=>r.kind==='sniper').length,23);
 for(const row of catalog){
  assert.equal(row.instruction,instructions[row.id]);
  assert(!row.originalConfig&&!row.previousConfigs);
  if(row.kind!=='native')assert.equal(row.config,row.id+'/task.json');
 }
 assert(!fs.existsSync(new URL('../static-tasks/',import.meta.url)));
 assert(!fs.existsSync(new URL('../tasks/training/',import.meta.url)));
});
