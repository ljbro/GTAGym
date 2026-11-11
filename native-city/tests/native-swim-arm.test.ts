import test from 'node:test';import assert from 'node:assert/strict';
import {Matrix,Vector3} from '@babylonjs/core';
import {swimArmTarget,swimBoneFrame} from '../src/native-swim-arm.ts';
import {swimCycle} from '../src/native-swim-cycle.ts';
import {traversalElbow} from '../src/offmap-navigation-traversal-pose.ts';
test('swim arms keep a reachable 15–100 degree elbow throughout blended stroke cycles',()=>{
 const origin=Vector3.Zero(),a=.27,b=.22;
 for(const blend of [0,.25,.5,.75,1])for(let phase=0;phase<Math.PI*2;phase+=.01)for(const key of ['leftHand','rightHand'] as const){
  const v=swimCycle(phase,blend)[key],target=swimArmTarget(origin,new Vector3(v.side,v.up,v.forward).scale(a+b),a,b);
  const side=key==='leftHand'?1:-1,joint=traversalElbow(origin,target,a,b,new Vector3(side,.55,-.35));
  assert(Math.abs(joint.length()-a)<1e-6);assert(Math.abs(Vector3.Distance(joint,target)-b)<1e-6);
  const flex=Math.acos(Vector3.Dot(joint.normalizeToNew(),target.subtract(joint).normalize()))*180/Math.PI;assert(flex>=14.999&&flex<=100.001);
  const frame=swimBoneFrame(joint,Vector3.Cross(joint,target.subtract(joint))),matrix=Matrix.Identity();frame.toRotationMatrix(matrix);
  assert(Vector3.Distance(Vector3.TransformNormal(Vector3.Up(),matrix),joint.normalizeToNew())<1e-5);
 }
});
