import test from 'node:test';
import assert from 'node:assert/strict';
import {assetRetryDelay,assetFailureMessage} from '../src/asset-retry.ts';
const page='https://example.test/session/proxy/4200/';
const asset=page+'assets/interiors/door.glb';
test('transient model/proxy failures get four bounded retries',()=>{
 for(const status of [0,408,429,502,503,504]){
  assert.deepEqual([0,1,2,3,4].map(i=>assetRetryDelay(asset,status,i,page)),[1000,2000,4000,8000,-1]);
 }
 assert.equal(assetRetryDelay('https://example.test/assets/boat.glb',0,0,'https://example.test/'),1000);
});
test('never retry missing/auth/invalid resources or unrelated URLs',()=>{
 for(const status of [200,400,401,403,404,500])assert.equal(assetRetryDelay(asset,status,0,page),-1);
 for(const url of ['https://cdn.test/assets/a.glb','https://example.test/assets/a.glb',page+'api/save','blob:https://example.test/abc'])assert.equal(assetRetryDelay(url,0,0,page),-1);
 for(const index of [-1,1.5,NaN,5])assert.equal(assetRetryDelay(asset,0,index,page),-1);
});
test('download failure explains recovery without hiding original diagnostics',()=>{
 const e=new Error('Unable to load model: Error status: 0 - Unable to load '+asset);
 assert.match(assetFailureMessage(e),/Restart/i);assert(assetFailureMessage(e).endsWith(e.message));
 assert.equal(assetFailureMessage(new Error('invalid GLB')),'invalid GLB');
});
