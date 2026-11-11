import test from 'node:test';
import assert from 'node:assert/strict';
import {NullEngine,Scene,TransformNode,MeshBuilder,Skeleton,Bone,Matrix,Quaternion,Vector3,VertexBuffer} from '@babylonjs/core';
import {createGroundArmPose,GROUND_PALM_BEND_LIMIT} from '../src/native-ground-arm-pose.ts';
for(const mirrored of [false,true])test('skin palm correction preserves wrist position and does not accumulate; mirrored='+mirrored,()=>{
 const engine=new NullEngine(),scene=new Scene(engine),frame=new TransformNode('frame',scene);frame.rotation.y=.73;frame.scaling.set(mirrored?-1:1,1,1);
 const nodes:TransformNode[]=[],meshes=[];
 for(const side of ['l','r']){
  const lower=new TransformNode('lowerarm_'+side,scene),hand=new TransformNode('hand_'+side,scene);lower.parent=frame;lower.position.x=side==='l'?-.3:.3;hand.parent=lower;hand.position.y=1;hand.rotationQuaternion=Quaternion.Identity();
  const mesh=MeshBuilder.CreateBox('palm-'+side,{size:.025},scene);mesh.parent=frame;mesh.position.set(lower.position.x,1.065,0);
  const skeleton=new Skeleton('s-'+side,'s-'+side,scene),bone=new Bone('hand_'+side,skeleton,null,Matrix.Identity());bone.linkTransformNode(hand);mesh.skeleton=skeleton;
  const count=mesh.getTotalVertices();mesh.setVerticesData(VertexBuffer.MatricesIndicesKind,new Float32Array(count*4));const weights=new Float32Array(count*4);for(let i=0;i<count;i++)weights[i*4]=1;mesh.setVerticesData(VertexBuffer.MatricesWeightsKind,weights);
  nodes.push(lower,hand);meshes.push(mesh);
 }
 const correction=createGroundArmPose(scene,nodes,meshes);assert(correction.stats().ready);correction.setEnabled(true);
 const hands=nodes.filter(n=>n.name.startsWith('hand'));
 for(const hand of hands)hand.rotationQuaternion=Quaternion.RotationAxis(Vector3.Forward(),Math.PI/3);
 const before=hands.map(h=>h.computeWorldMatrix(true).getTranslation().clone()),poses=hands.map(h=>h.rotationQuaternion!.clone());
 for(let i=0;i<40;i++){
  scene.onAfterAnimationsObservable.notifyObservers(scene);
  for(let j=0;j<hands.length;j++)assert(hands[j].computeWorldMatrix(true).getTranslation().equalsWithEpsilon(before[j],1e-6));
  assert(correction.stats().samples.every(s=>s.before>.9&&Math.abs(s.after-GROUND_PALM_BEND_LIMIT)<1e-7));
  scene.onBeforeAnimationsObservable.notifyObservers(scene);hands.forEach((h,j)=>assert(h.rotationQuaternion!.equalsWithEpsilon(poses[j],1e-7)));
 }
 scene.onAfterAnimationsObservable.notifyObservers(scene);correction.setEnabled(false);hands.forEach((h,j)=>assert(h.rotationQuaternion!.equalsWithEpsilon(poses[j],1e-7)));
 scene.onAfterAnimationsObservable.notifyObservers(scene);assert.equal(correction.stats().samples.length,0);
 correction.dispose();correction.dispose();scene.dispose();engine.dispose();
});
test('missing skin/hand joints safely leaves other avatars unchanged',()=>{
 const engine=new NullEngine(),scene=new Scene(engine),pose=createGroundArmPose(scene,[],[]);pose.setEnabled(true);scene.onAfterAnimationsObservable.notifyObservers(scene);assert.equal(pose.stats().ready,false);assert.deepEqual(pose.stats().samples,[]);pose.dispose();scene.dispose();engine.dispose();
});
