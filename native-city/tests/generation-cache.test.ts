import test from 'node:test';
import assert from 'node:assert/strict';
import {GenerationCache} from '../src/generation-cache.ts';
test('batch geometry caches stay bounded across many unique queries without changing deterministic clearance',()=>{
 const cache=new GenerationCache<string,boolean>(7),clear=(x:number)=>x%3!==0;
 for(let round=0;round<100;round++)for(let x=0;x<30;x++){
  const key=String(x);if(!cache.has(key))cache.set(key,clear(x));assert.equal(cache.get(key),clear(x));assert(cache.size<=7);
 }
 cache.clear();cache.set('same',true);for(let i=0;i<30;i++)cache.set('same',false);assert.equal(cache.size,1);assert.equal(cache.get('same'),false);
 assert.throws(()=>new GenerationCache(0));
});
