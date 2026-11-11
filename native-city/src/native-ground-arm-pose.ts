import {Matrix,Quaternion,TransformNode,Vector3,VertexBuffer,type AbstractMesh,type Scene} from '@babylonjs/core';

export const GROUND_PALM_BEND_LIMIT=8*Math.PI/180;
/** Fit the palm axis from this skin's actual hand-dominant vertices, not the
 * mismatched donor finger joints. Preserve gait, fingers and joint positions.
 * Only ordinary ground locomotion; never contact/vehicle/swim poses. */
export function createGroundArmPose(scene:Scene,nodes:readonly TransformNode[],meshes:readonly AbstractMesh[]){
 const byName=new Map(nodes.map(n=>[n.name.toLowerCase().split(':').at(-1)!,n]));
 const position=(node:TransformNode)=>{node.computeWorldMatrix(true);return node.getAbsolutePosition().clone();};
 const chains=['l','r'].flatMap(side=>{
  const lower=byName.get('lowerarm_'+side),hand=byName.get('hand_'+side);if(!lower||!hand)return [];
  const inverse=Matrix.Invert(hand.computeWorldMatrix(true)),sum=Vector3.Zero();let weight=0;
  for(const mesh of meshes){
   const skeleton=mesh.skeleton;if(!skeleton)continue;
   const bone=skeleton.bones.find(b=>b.getTransformNode()===hand);if(!bone)continue;
   const index=bone.getIndex(),positions=mesh.getVerticesData(VertexBuffer.PositionKind),joints=mesh.getVerticesData(VertexBuffer.MatricesIndicesKind),weights=mesh.getVerticesData(VertexBuffer.MatricesWeightsKind);
   if(index===null||!positions||!joints||!weights)continue;
   const world=mesh.computeWorldMatrix(true);
   for(let i=0;i<positions.length/3;i++){
    let w=0;for(let k=0;k<4;k++)if(joints[i*4+k]===index)w+=weights[i*4+k];if(w<.7)continue;
    const p=Vector3.TransformCoordinates(Vector3.TransformCoordinates(Vector3.FromArray(positions,i*3),world),inverse);
    if(p.length()<.015||p.length()>.20)continue;sum.addInPlace(p.scale(w));weight+=w;
   }
  }
  if(!weight||sum.lengthSquared()<1e-8)return [];
  return [{side,lower,hand,axis:sum.scale(1/weight).normalize()}];
 });
 let enabled=false,disposed=false,saved:{node:TransformNode;rotation:Quaternion|null;euler:Vector3}[]=[];
 let diagnostics:{side:string;before:number;after:number;correction:number}[]=[];
 function restore(){for(const s of saved){s.node.rotationQuaternion=s.rotation;s.node.rotation.copyFrom(s.euler);s.node.computeWorldMatrix(true);}saved=[];}
 function apply(){
  diagnostics=[];if(!enabled||disposed)return;
  for(const c of chains){
   const parent=c.hand.parent as TransformNode;parent.computeWorldMatrix(true);
   const forearm=Vector3.TransformNormal(position(c.hand).subtract(position(c.lower)),Matrix.Invert(parent.getWorldMatrix())).normalize();
   const old=c.hand.rotationQuaternion?.clone()??Quaternion.FromEulerVector(c.hand.rotation),matrix=Matrix.Identity();old.toRotationMatrix(matrix);
   const palm=Vector3.TransformNormal(c.axis,matrix).normalize(),angle=Math.acos(Math.max(-1,Math.min(1,Vector3.Dot(palm,forearm))));
   const correction=Math.max(0,angle-GROUND_PALM_BEND_LIMIT);
   if(correction>1e-7){
    const delta=Quaternion.Identity();Quaternion.FromUnitVectorsToRef(palm,forearm,delta);
    saved.push({node:c.hand,rotation:c.hand.rotationQuaternion?.clone()??null,euler:c.hand.rotation.clone()});
    c.hand.rotationQuaternion=Quaternion.Slerp(Quaternion.Identity(),delta,correction/angle).multiply(old).normalize();c.hand.computeWorldMatrix(true);
   }
   (c.hand.rotationQuaternion??old).toRotationMatrix(matrix);
   const correctedPalm=Vector3.TransformNormal(c.axis,matrix).normalize();
   const afterAngle=Math.acos(Math.max(-1,Math.min(1,Vector3.Dot(correctedPalm,forearm))));
   diagnostics.push({side:c.side,before:angle,after:afterAngle,correction});
  }
 }
 const before=scene.onBeforeAnimationsObservable.add(restore),after=scene.onAfterAnimationsObservable.add(apply);
 return {setEnabled(value:boolean){enabled=value;if(!value)restore();},stats:()=>({ready:chains.length===2,enabled,samples:diagnostics}),dispose(){if(disposed)return;restore();disposed=true;scene.onBeforeAnimationsObservable.remove(before);scene.onAfterAnimationsObservable.remove(after);}};
}
