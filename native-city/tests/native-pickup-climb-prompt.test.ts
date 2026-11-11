import test from 'node:test';
import assert from 'node:assert/strict';
import {makePickupClimbLayout} from '../src/native-pickup-climb-layout.ts';
import {pickupClimbPrompt} from '../src/native-pickup-climb-prompt.ts';
test('pickup hints progress from ground to hood, never show roof action on the ground',()=>{
 for(const yaw of [0,.7,Math.PI])for(const side of [-1,1]){
  const p=makePickupClimbLayout(123,456,2,yaw,side),[hood,roof]=p.links;
  const walker={active:true,grounded:true,traversing:false,x:hood.from.x,z:hood.from.z,feetY:hood.from.y,yaw:Math.atan2(hood.to.x-hood.from.x,hood.to.z-hood.from.z)};
  assert.equal(pickupClimbPrompt(p,walker),"Press Space to climb onto the pickup");
  walker.yaw+=Math.PI;assert.match(pickupClimbPrompt(p,walker),/^Face the front of the pickup truck/i);
  Object.assign(walker,{x:hood.to.x,z:hood.to.z,feetY:hood.to.y,yaw});
  assert.equal(pickupClimbPrompt(p,walker),"Press Space to get onto the roof");
  assert.equal(pickupClimbPrompt(p,{...walker,feetY:p.y}), '');
  assert.equal(pickupClimbPrompt(p,{...walker,x:roof.to.x,z:roof.to.z,feetY:roof.to.y}), '');
  for(const override of [{active:false},{grounded:false},{traversing:true},{x:9999}])assert.equal(pickupClimbPrompt(p,{...walker,...override}),'');
  assert.equal(pickupClimbPrompt(p,null),'');
 }
});
