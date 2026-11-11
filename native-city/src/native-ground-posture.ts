import {Matrix,Quaternion,TransformNode,Vector3,type Scene} from '@babylonjs/core';

const RAD=Math.PI/180;
export const GROUND_HEAD_PITCH={walk:4*RAD,run:8*RAD,maxCorrection:24*RAD,neckShare:.7};
/** Post-animation pitch correction. Preserve root, feet, shoulders and gait.
 * Restore the authored rotations before every animation evaluation. Calibrate
 * bone axes in bind space instead of assuming an Euler axis on a mirrored rig. */
export function createGroundPosture(scene:Scene,anchor:TransformNode,nodes:readonly TransformNode[]){
 const names=new Map(nodes.map(n=>[n.name.toLowerCase().split(':').at(-1)!,n]));
 const neck=names.get('neck_01'),head=names.get('head');
 let enabled=false,disposed=false,weight=0,runBlend=0;
 let saved:{node:TransformNode;quaternion:Quaternion|null;euler:Vector3}[]=[];
 let sample:{before:number;after:number;correction:number;weight:number}|null=null;
 const up=head?Vector3.TransformNormal(Vector3.TransformNormal(Vector3.Up(),anchor.computeWorldMatrix(true)),Matrix.Invert(head.computeWorldMatrix(true))).normalize():Vector3.Up();
 function restore(){for(const s of saved){s.node.rotationQuaternion=s.quaternion;s.node.rotation.copyFrom(s.euler);s.node.computeWorldMatrix(true);}saved=[];}
 function pitch(){
  const local=Vector3.TransformNormal(Vector3.TransformNormal(up,head!.computeWorldMatrix(true)),Matrix.Invert(anchor.computeWorldMatrix(true))).normalize();
  return Math.atan2(local.z,local.y);
 }
 function rotate(node:TransformNode,angle:number){
  const parent=node.parent as TransformNode|null,world=anchor.computeWorldMatrix(true);
  const axis=Vector3.TransformNormal(Vector3.Right(),world).normalize();
  const inverse=parent?Matrix.Invert(parent.computeWorldMatrix(true)):Matrix.Identity();
  // Axial vectors gain a determinant sign under the glTF reflected parent.
  const local=Vector3.TransformNormal(axis,inverse).normalize().scaleInPlace(inverse.determinant()<0?-1:1);
  const original=node.rotationQuaternion?.clone()??Quaternion.FromEulerVector(node.rotation);
  saved.push({node,quaternion:node.rotationQuaternion?.clone()??null,euler:node.rotation.clone()});
  node.rotationQuaternion=Quaternion.RotationAxis(local,angle).multiply(original).normalize();node.computeWorldMatrix(true);
 }
 function apply(){
  sample=null;if(!enabled||disposed||!head||!neck||weight<1e-5)return;
  const before=pitch(),limit=GROUND_HEAD_PITCH.walk+(GROUND_HEAD_PITCH.run-GROUND_HEAD_PITCH.walk)*runBlend;
  // Soft limit retains a little authored head bob instead of locking the head.
  const correction=Math.min(GROUND_HEAD_PITCH.maxCorrection,Math.max(0,before-limit)*.9)*weight;
  if(correction>1e-7){rotate(neck,-correction*GROUND_HEAD_PITCH.neckShare);rotate(head,-correction*(1-GROUND_HEAD_PITCH.neckShare));}
  sample={before,after:pitch(),correction,weight};
 }
 const beforeObserver=scene.onBeforeAnimationsObservable.add(restore),afterObserver=scene.onAfterAnimationsObservable.add(apply);
 return {
  setEnabled(value:boolean){enabled=value;if(!value){restore();sample=null;}},
  setGait(walk:number,run:number){weight=Math.max(0,Math.min(1,walk+run));runBlend=weight>1e-5?Math.max(0,Math.min(1,run/weight)):0;},
  stats:()=>({ready:!!head&&!!neck,enabled,weight,runBlend,sample}),
  dispose(){if(disposed)return;restore();disposed=true;scene.onBeforeAnimationsObservable.remove(beforeObserver);scene.onAfterAnimationsObservable.remove(afterObserver);},
 };
}
