import {Matrix,Quaternion,TransformNode,Vector3,type AbstractMesh,type Scene} from '@babylonjs/core';

// Use this mesh's bind frames, not the donor idle's arm roll. The elbow bind
// was refitted to Franklin's sleeve, while the old rotation clips were retained.
// Targets are in character space (+Z forward), independent of world heading.
export const RELAXED_IDLE={upperPitch:-12*Math.PI/180,lowerPitch:-5*Math.PI/180,outward:8*Math.PI/180};
export function createGroundIdlePose(scene:Scene,anchor:TransformNode,nodes:readonly TransformNode[],meshes:readonly AbstractMesh[]=[]){
 const byName=new Map(nodes.map(n=>[n.name.toLowerCase().split(':').at(-1)!,n]));
 const rotation=(n:TransformNode)=>n.rotationQuaternion?.clone()??Quaternion.FromEulerVector(n.rotation);
 const bindRotation=(n:TransformNode)=>{
  const bone=meshes.flatMap(m=>m.skeleton?.bones??[]).find(b=>b.getTransformNode()===n);
  if(!bone)return rotation(n);
  const q=Quaternion.Identity();bone.getRestMatrix().decompose(undefined,q);return q;
 };
 const position=(n:TransformNode)=>n.computeWorldMatrix(true).getTranslation();
 const local=(p:Vector3)=>Vector3.TransformNormal(p,Matrix.Invert(anchor.computeWorldMatrix(true)));
 const arms=['l','r'].flatMap(side=>{
  const upper=byName.get('upperarm_'+side),lower=byName.get('lowerarm_'+side),hand=byName.get('hand_'+side);
  if(!upper||!lower||!hand)return [];
  return [{upper,lower,hand,side:Math.sign(local(position(upper).subtract(position(anchor))).x)||1,
   bind:[bindRotation(upper),bindRotation(lower)]}];
 });
 let enabled=false,weight=1,disposed=false;
 let saved:{node:TransformNode;q:Quaternion|null;euler:Vector3}[]=[];
 function restore(){for(const s of saved){s.node.rotationQuaternion=s.q;s.node.rotation.copyFrom(s.euler);s.node.computeWorldMatrix(true);}saved=[];}
 function aim(node:TransformNode,tip:TransformNode,target:Vector3){
  const parent=node.parent as TransformNode|null,inverse=parent?Matrix.Invert(parent.computeWorldMatrix(true)):Matrix.Identity();
  const from=Vector3.TransformNormal(position(tip).subtract(position(node)),inverse).normalize();
  const to=Vector3.TransformNormal(Vector3.TransformNormal(target,anchor.computeWorldMatrix(true)),inverse).normalize();
  const delta=Quaternion.Identity();Quaternion.FromUnitVectorsToRef(from,to,delta);
  node.rotationQuaternion=delta.multiply(rotation(node)).normalize();node.computeWorldMatrix(true);
 }
 function apply(){
  if(!enabled||disposed||weight<1e-5||arms.length!==2)return;
  for(const c of arms){
   const chain=[c.upper,c.lower],originals=chain.map(rotation);
   chain.forEach((node,i)=>{saved.push({node,q:node.rotationQuaternion?.clone()??null,euler:node.rotation.clone()});node.rotationQuaternion=c.bind[i].clone();node.computeWorldMatrix(true);});
   const outward=Math.sin(RELAXED_IDLE.outward),vertical=Math.cos(RELAXED_IDLE.outward);
   aim(c.upper,c.lower,new Vector3(c.side*outward,-vertical*Math.cos(RELAXED_IDLE.upperPitch),vertical*Math.sin(RELAXED_IDLE.upperPitch)));
   aim(c.lower,c.hand,new Vector3(0,-Math.cos(RELAXED_IDLE.lowerPitch),Math.sin(RELAXED_IDLE.lowerPitch)));
   // Blend whole local poses once; blending parent rotations before computing
   // child targets would double-weight the correction at start/stop transitions.
   const targets=chain.map(rotation);
   chain.forEach((node,i)=>{node.rotationQuaternion=Quaternion.Slerp(originals[i],targets[i],weight).normalize();node.computeWorldMatrix(true);});
  }
 }
 const before=scene.onBeforeAnimationsObservable.add(restore),after=scene.onAfterAnimationsObservable.add(apply);
 return {setEnabled(value:boolean){enabled=value;if(!value)restore();},setGait(walk:number,run:number){weight=Math.max(0,Math.min(1,1-walk-run));},
  stats:()=>({ready:arms.length===2,enabled,weight}),dispose(){if(disposed)return;restore();disposed=true;scene.onBeforeAnimationsObservable.remove(before);scene.onAfterAnimationsObservable.remove(after);}};
}
