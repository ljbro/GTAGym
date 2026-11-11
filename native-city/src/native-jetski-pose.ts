import {Matrix,Quaternion,TransformNode,Vector3,type Scene} from '@babylonjs/core';
import {traversalElbow} from './offmap-navigation-traversal-pose.ts';
const pos=(n:TransformNode)=>{n.computeWorldMatrix(true);return n.getAbsolutePosition().clone();};
export type SeatedRideFit={lean:number;hipLift:number;handSide:number;handForward:number;handHeight:number;footSide:number;footForward:number;footHeight:number;kneeSide?:number;rigidContacts?:boolean};
export const BOAT_HELM_FIT:SeatedRideFit={lean:.03,hipLift:0,handSide:.21,handForward:.48,handHeight:.22,footSide:.17,footForward:.44,footHeight:-.46,kneeSide:.15,rigidContacts:true};
const JETSKI_FIT:SeatedRideFit={lean:.16,hipLift:.14,handSide:.31,handForward:.50,handHeight:.20,footSide:.37,footForward:.25,footHeight:-.62};
export const MOTORCYCLE_FIT:SeatedRideFit={lean:.22,hipLift:.14,handSide:.29,handForward:.48,handHeight:.18,footSide:.25,footForward:.12,footHeight:-.55};
export const ATV_FIT:SeatedRideFit={lean:.23,hipLift:.12,handSide:.42,handForward:.49,handHeight:.16,footSide:.55,footForward:.10,footHeight:-.60,kneeSide:2.5};
export function rescueRideFit(progress:number):SeatedRideFit{
 const p=Math.max(0,Math.min(1,progress)),t=p*p*(3-2*p),mix=(a:number,b:number)=>a+(b-a)*t;
 return {lean:mix(0,-.08),hipLift:0,handSide:mix(.2,.23),handForward:mix(0,.35),handHeight:mix(.95,-.15),footSide:.17,footForward:mix(.03,.50),footHeight:mix(-.86,-.52),kneeSide:.3};
}
/** Estimated two-bone riding pose. Vehicle-specific contacts stay explicit. */
export function createNativeJetskiPose(scene:Scene,anchor:TransformNode,nodes:readonly TransformNode[],fit:SeatedRideFit=JETSKI_FIT){
 const names=new Map(nodes.map(n=>[n.name.toLowerCase().split(':').at(-1)!,n]));
 const hips=names.get('pelvis'),chains:{a:TransformNode;b:TransformNode;c:TransformNode;side:number;arm:boolean}[]=[],missing:string[]=[];
 for(const [suffix,side]of [['l',1],['r',-1]]as const)for(const arm of [true,false]){
  const joints=(arm?['upperarm','lowerarm','hand']:['thigh','calf','foot']).map(n=>{const key=n+'_'+suffix,joint=names.get(key);if(!joint)missing.push(key);return joint;});
  if(joints.every(Boolean))chains.push({a:joints[0]!,b:joints[1]!,c:joints[2]!,side,arm});
 }
 if(!hips)missing.push('pelvis');
 let pose:{x:number;y:number;z:number;yaw:number;ridePitch?:number;rideRoll?:number}|null=null,enabled=false,frames=0;
 const saved=new Map<TransformNode,Quaternion>();
 function restore(){for(const [n,q]of saved){n.rotationQuaternion=q;n.computeWorldMatrix(true);}saved.clear();}
 function aim(node:TransformNode,child:TransformNode,target:Vector3){
  const parent=node.parent instanceof TransformNode?node.parent:null;parent?.computeWorldMatrix(true);
  const desired=Vector3.TransformNormal(target.subtract(pos(node)),parent?Matrix.Invert(parent.getWorldMatrix()):Matrix.Identity()).normalize();
  const original=node.rotationQuaternion?.clone()??Quaternion.FromEulerVector(node.rotation),m=Matrix.Identity();original.toRotationMatrix(m);
  const axis=Vector3.TransformNormal(child.position,m).normalize(),delta=Quaternion.Identity();Quaternion.FromUnitVectorsToRef(axis,desired,delta);
  if(!saved.has(node))saved.set(node,original);node.rotationQuaternion=delta.multiply(original).normalize();node.computeWorldMatrix(true);
 }
 function apply(){
  if(!enabled||!pose||!hips||missing.length)return;
  anchor.rotationQuaternion=Quaternion.RotationYawPitchRoll(pose.yaw,fit.lean+(pose.ridePitch??0),pose.rideRoll??0);anchor.computeWorldMatrix(true);
  const hip=new Vector3(pose.x,pose.y+fit.hipLift,pose.z);anchor.position.addInPlace(hip.subtract(pos(hips)));anchor.computeWorldMatrix(true);
  const rotation=Matrix.RotationYawPitchRoll(pose.yaw,pose.ridePitch??0,pose.rideRoll??0);
  const forward=fit.rigidContacts?Vector3.TransformNormal(Vector3.Forward(),rotation):new Vector3(Math.sin(pose.yaw),0,Math.cos(pose.yaw));
  const up=fit.rigidContacts?Vector3.TransformNormal(Vector3.Up(),rotation):Vector3.Up();
  const arms=chains.filter(c=>c.arm),left=pos(arms[0].a).subtract(pos(arms[1].a)).normalize();
  for(const c of chains){
   const a=pos(c.a),b=pos(c.b),end=pos(c.c),target=hip.add(left.scale(c.side*(c.arm?fit.handSide:fit.footSide))).add(forward.scale(c.arm?fit.handForward:fit.footForward)).add(up.scale(c.arm?fit.handHeight:fit.footHeight));
   const pole=c.arm?left.scale(c.side).add(forward.scale(-.25)):forward.add(left.scale(c.side*(fit.kneeSide??.35)));
   aim(c.a,c.b,traversalElbow(a,target,Vector3.Distance(a,b),Vector3.Distance(b,end),pole));aim(c.b,c.c,target);
  }frames++;
 }
 const before=scene.onBeforeAnimationsObservable.add(restore),after=scene.onAfterAnimationsObservable.add(apply);
 return {update(p:NonNullable<typeof pose>){pose=p;},setEnabled(v:boolean){enabled=v;if(!v){restore();anchor.rotationQuaternion=null;}},stats:()=>({ready:!missing.length,missing,frames,hips:hips?pos(hips).asArray():null,hands:chains.filter(c=>c.arm).map(c=>pos(c.c).asArray()),feet:chains.filter(c=>!c.arm).map(c=>pos(c.c).asArray())}),dispose(){restore();scene.onBeforeAnimationsObservable.remove(before);scene.onAfterAnimationsObservable.remove(after);}};
}
