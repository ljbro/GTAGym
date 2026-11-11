import test from 'node:test';
import assert from 'node:assert/strict';
import {appUrl} from '../src/app-url.ts';

test('repository assets resolve beneath root and nested proxy entry pages',()=>{
 for(const entry of ['https://example.test/','https://example.test/index.html','https://example.test/notebook/proxy/4200/','https://example.test/notebook/proxy/4200/index.html?task=x']){
  const base=new URL('.',entry).href;
  for(const asset of ['/city/city.json','/assets/car.glb','/characters/offmapbench/player.glb','/tasks/catalog.json']){
   assert.equal(appUrl(asset,entry),base+asset.slice(1));
   assert.equal(appUrl(appUrl(asset,entry),entry),base+asset.slice(1));
  }
  assert.equal(appUrl('/city/poster.jpg?v=2#test',entry),base+'city/poster.jpg?v=2#test');
 }
});
test('external URLs, data, blobs, relative and unrelated requests remain unchanged',()=>{
 const entry='https://example.test/notebook/proxy/4200/';
 for(const url of ['https://cdn.example.test/city/a.glb','//cdn.example.test/assets/a.js','blob:https://example.test/abc','data:image/png;base64,abc','./city/a.glb','/api/test'])assert.equal(appUrl(url,entry),url);
});
