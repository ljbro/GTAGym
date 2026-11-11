import test from 'node:test';
import assert from 'node:assert/strict';
import catalog from '../../tasks/catalog.json' with {type:'json'};
import {openLinkedTask} from '../src/native-task-links.ts';

test('all 150 benchmark links select their exact task without starting an episode',()=>{
 for(const task of catalog){
  const opened:(string|undefined)[]=[];
  assert.equal(openLinkedTask('?quality=low&task='+encodeURIComponent(task.id),{tasks:catalog,open:id=>opened.push(id)}),true);
  assert.deepEqual(opened,[task.id]);
 }
});
test('normal game URLs do not change the task menu; malformed and unknown links open the picker',()=>{
 const opened:(string|undefined)[]=[],messages:string[]=[];
 const menu={tasks:catalog,open:(id?:string)=>opened.push(id)};
 assert.equal(openLinkedTask('?quality=low',menu),false);assert.deepEqual(opened,[]);
 for(const search of ['?task=','?task=offmap-old','?task=c01-n99','?task=c01-n01&task=c02-n01','?task=https://example.test/']){
  assert.equal(openLinkedTask(search,menu,message=>messages.push(message)),false);
 }
 assert.equal(opened.length,5);assert(opened.every(id=>id===undefined));assert.equal(messages.length,5);
});
