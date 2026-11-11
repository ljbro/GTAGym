import test from 'node:test';
import assert from 'node:assert/strict';
import {linkPosition,walkTraversalPose,type WalkLink} from '../src/native-walk-traversal.ts';
import {vaultPrompt} from '../src/native-vault-prompt.ts';
const link:WalkLink={id:'railing',kind:'vault',from:{x:0,y:0,z:-1.15},to:{x:0,y:0,z:1.15},top:1.1,duration:1.15,triggerRadius:.6,vaultGrip:{x:0,y:1.085,z:0}};
test('vault progresses horizontally while lifting, clears rail and settles at ground height',()=>{
 for(const l of [link,{...link,from:link.to,to:link.from}]){
  assert.deepEqual(linkPosition(l,0),l.from);assert.deepEqual(linkPosition(l,1),l.to);
  for(let i=0;i<=100;i++){
   const t=i/100,p=linkPosition(l,t),s=walkTraversalPose(l,t,p,0)!;
   if(Math.abs(p.z)<.305)assert(p.y>=1.12);
   assert(s.vaultContact);assert.equal(s.mantleContact,undefined);
  }
  assert.notEqual(linkPosition(l,.15).z,l.from.z,'vault must not be a vertical elevator');
 }
});
test('vault hint appears at either reachable side and hides out of range or in motion',()=>{
 const links=[link,{...link,id:'reverse',from:link.to,to:link.from}];
 for(const l of links){
  const w={active:true,grounded:true,traversing:false,x:l.from.x,z:l.from.z,feetY:0,yaw:Math.atan2(l.to.x-l.from.x,l.to.z-l.from.z)};
  assert.equal(vaultPrompt(links,w),"Press Space to vault over the railing");
  assert.equal(vaultPrompt(links,{...w,yaw:w.yaw+Math.PI}),"Face the railing, Press Space to vault");
  for(const changes of [{active:false},{grounded:false},{traversing:true},{x:10},{feetY:2}])assert.equal(vaultPrompt(links,{...w,...changes}),'');
 }
 assert.equal(vaultPrompt(links,null),'');
});
