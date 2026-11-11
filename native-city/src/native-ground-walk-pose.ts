import {Matrix,Quaternion,TransformNode,Vector3,type AbstractMesh,type Scene} from '@babylonjs/core';

// Visual estimates from the c03-n02 walking cycle, not extracted GTA animation.
// Preserve the existing foot contacts, stride clock, shoulder yaw and roll.
export const RELAXED_WALK={torsoPitch:4*Math.PI/180,torsoCorrection:.8};
/** Keep the authored stride phase, with a relaxed shoulder offset and an elbow
 * that opens on the backswing instead of remaining locked at a fixed angle. */
export function relaxedArmAngles(swing:number,runBlend:number){
 const r=Math.max(0,Math.min(1,runBlend)),deg=Math.PI/180;
 const walkFlex=(10+3*Math.sin(Math.max(-1,Math.min(1,swing/.24))*Math.PI/2))*deg;
 const runFlex=(68+8*Math.sin(Math.max(-1,Math.min(1,swing/.48))*Math.PI/2))*deg;
 return {upper:(-6-2*r)*deg+swing*(.85+.05*r),flex:walkFlex+(runFlex-walkFlex)*r};
}
export function createGroundWalkPose(scene:Scene,anchor:TransformNode,nodes:readonly TransformNode[],meshes:readonly AbstractMesh[]=[]){
 const byName=new Map(nodes.map(n=>[n.name.toLowerCase().split(':').at(-1)!,n]));
 const rotation=(n:TransformNode)=>n.rotationQuaternion?.clone()??Quaternion.FromEulerVector(n.rotation);
 const bindRotation=(n:TransformNode)=>{const bone=meshes.flatMap(m=>m.skeleton?.bones??[]).find(b=>b.getTransformNode()===n);if(!bone)return rotation(n);const q=Quaternion.Identity();bone.getRestMatrix().decompose(undefined,q);return q;};
 const spine=byName.get('spine_01'),neck=byName.get('neck_01');
 const arms=['l','r'].flatMap(side=>{
  const upper=byName.get('upperarm_'+side),lower=byName.get('lowerarm_'+side),hand=byName.get('hand_'+side);
  return upper&&lower&&hand?[{upper,lower,hand,bind:[bindRotation(upper),bindRotation(lower)]}]:[];
 });
 let enabled=false,weight=0,movingWeight=0,runBlend=0,disposed=false;
 let saved:{node:TransformNode;quaternion:Quaternion|null;euler:Vector3}[]=[];
 let sample:{before:number;after:number;weight:number}|null=null;
 const position=(n:TransformNode)=>n.computeWorldMatrix(true).getTranslation();
 function direction(a:TransformNode,b:TransformNode){
  return Vector3.TransformNormal(position(b).subtract(position(a)),Matrix.Invert(anchor.computeWorldMatrix(true))).normalize();
 }
 function save(node:TransformNode){if(!saved.some(s=>s.node===node))saved.push({node,quaternion:node.rotationQuaternion?.clone()??null,euler:node.rotation.clone()});}
 function aim(node:TransformNode,tip:TransformNode,target:Vector3,blend=weight){
  const parent=node.parent as TransformNode|null;
  const inverse=parent?Matrix.Invert(parent.computeWorldMatrix(true)):Matrix.Identity();
  const current=Vector3.TransformNormal(position(tip).subtract(position(node)),inverse).normalize();
  const desired=Vector3.TransformNormal(Vector3.TransformNormal(target,anchor.computeWorldMatrix(true)),inverse).normalize();
  if(current.lengthSquared()<1e-8||desired.lengthSquared()<1e-8)return;
  const delta=Quaternion.Identity();Quaternion.FromUnitVectorsToRef(current,desired,delta);
  const original=node.rotationQuaternion?.clone()??Quaternion.FromEulerVector(node.rotation);
  save(node);
  node.rotationQuaternion=Quaternion.Slerp(Quaternion.Identity(),delta,blend).multiply(original).normalize();
  node.computeWorldMatrix(true);
 }
 function restore(){for(const s of saved){s.node.rotationQuaternion=s.quaternion;s.node.rotation.copyFrom(s.euler);s.node.computeWorldMatrix(true);}saved=[];}
 function apply(){
  sample=null;if(!enabled||disposed||movingWeight<1e-5||!spine||!neck||arms.length!==2)return;
  const torso=direction(spine,neck),before=Math.atan2(torso.z,torso.y);
  // Save the authored arm phase before rotating its ancestor. Do not drive
  // arms from wall time: pausing, reversing and blending must stay deterministic.
  const authored=arms.map(c=>direction(c.upper,c.lower));
  if(weight>1e-5&&before>RELAXED_WALK.torsoPitch){
   const yz=Math.hypot(torso.y,torso.z),target=before-(before-RELAXED_WALK.torsoPitch)*RELAXED_WALK.torsoCorrection;
   // Retain part of the authored pitch oscillation, rather than a rigid torso.
   aim(spine,neck,new Vector3(torso.x,yz*Math.cos(target),yz*Math.sin(target)));
  }
  arms.forEach((c,i)=>{
   const upper=authored[i],swing=Math.atan2(upper.z,-upper.y),target=relaxedArmAngles(swing,runBlend);
   const chain=[c.upper,c.lower],originals=chain.map(rotation);
   chain.forEach((node,j)=>{save(node);node.rotationQuaternion=c.bind[j].clone();node.computeWorldMatrix(true);});
   const side=upper.x,yz=Math.sqrt(Math.max(0,1-side*side));
   aim(c.upper,c.lower,new Vector3(side,-Math.cos(target.upper)*yz,Math.sin(target.upper)*yz),1);
   const lowerSide=side*.25,lowerYZ=Math.sqrt(1-lowerSide*lowerSide),angle=target.upper+target.flex;
   aim(c.lower,c.hand,new Vector3(lowerSide,-Math.cos(angle)*lowerYZ,Math.sin(angle)*lowerYZ),1);
   const targets=chain.map(rotation);
   chain.forEach((node,j)=>{node.rotationQuaternion=Quaternion.Slerp(originals[j],targets[j],movingWeight).normalize();node.computeWorldMatrix(true);});
  });
  const after=direction(spine,neck);sample={before,after:Math.atan2(after.z,after.y),weight};
 }
 // Install before the palm/head correctors, which consume this final arm pose.
 // Reverse the idle -> walk overlay stack before the next animation sample.
 const before=scene.onBeforeAnimationsObservable.add(restore,-1,true),after=scene.onAfterAnimationsObservable.add(apply);
 return {
  setEnabled(value:boolean){enabled=value;if(!value){restore();sample=null;}},
  setGait(walk:number,run=0){weight=Math.max(0,Math.min(1,walk));const running=Math.max(0,Math.min(1,run));movingWeight=Math.min(1,weight+running);runBlend=weight+running>1e-5?running/(weight+running):0;},
  stats:()=>({ready:!!spine&&!!neck&&arms.length===2,enabled,weight,movingWeight,runBlend,sample}),
  dispose(){if(disposed)return;restore();disposed=true;scene.onBeforeAnimationsObservable.remove(before);scene.onAfterAnimationsObservable.remove(after);},
 };
}
