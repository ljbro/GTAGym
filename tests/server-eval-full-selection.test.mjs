import test from 'node:test';
import assert from 'node:assert/strict';
import {selectFullTasks} from '../scripts/server-eval/full-selection.mjs';
const plan=()=>({scope:'all',categories:[{category:'road',available:2,tasks:['a','b']},{category:'air',available:1,tasks:['c']},{category:'indoor',available:1,tasks:['d']}]});
test('full selection prioritizes aviation and interleaves every remaining task',()=>{
 assert.deepEqual(selectFullTasks(plan(),['a','b','c','d']),['c','a','d','b']);
});
test('new indoor tasks are included without a hardcoded historical total',()=>{
 const p=plan();p.categories[2].tasks.push('e','f','g');p.categories[2].available=4;
 assert.deepEqual(selectFullTasks(p,['a','b','c','d','e','f','g']),['c','a','d','b','e','f','g']);
});
test('incomplete, unknown, duplicate and stale category selections are rejected',()=>{
 assert.throws(()=>selectFullTasks(plan(),['a','b','c','d','e']),/missing=e/);
 assert.throws(()=>selectFullTasks(plan(),['a','b','c']),/unknown=d/);
 const duplicate=plan();duplicate.categories[2].tasks=['a'];assert.throws(()=>selectFullTasks(duplicate,['a','b','c','d']),/Duplicate/);
 const stale=plan();stale.categories[0].available=3;assert.throws(()=>selectFullTasks(stale,['a','b','c','d']),/category/);
 assert.throws(()=>selectFullTasks({...plan(),scope:'sample'},['a']),/full task plan/);
});
