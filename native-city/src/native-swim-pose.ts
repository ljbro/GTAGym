import {Quaternion,TransformNode,Vector3,type Scene} from '@babylonjs/core';
type Clip={duration:number;frames:number[][]};
type SwimAsset={version:number;bones:string[];clips:Record<'Swim_Fwd_Loop'|'Swim_Idle_Loop',Clip>};
let assetRequest:Promise<SwimAsset>|null=null;
function loadAsset(){
 return assetRequest??=(async()=>{
  const response=await fetch('characters/animations/quaternius-swim.json',{signal:AbortSignal.timeout(30000)});
  if(!response.ok)throw Error("Swimming animation failed to load ("+response.status+')');
  const data=await response.json() as SwimAsset;
  if(data.version!==1||!data.bones.length||!data.clips.Swim_Fwd_Loop||!data.clips.Swim_Idle_Loop)throw Error("Invalid swimming animation format");
  return data;
 })().catch(e=>{assetRequest=null;throw e;});
}
export function sampleSwimClip(clip:Clip,phase:number,bone:number){
 const frame=((phase%1)+1)%1*(clip.frames.length-1),i=Math.floor(frame),offset=bone*4;
 return Quaternion.Slerp(Quaternion.FromArray(clip.frames[i],offset),Quaternion.FromArray(clip.frames[i+1],offset),frame-i).normalize();
}
/** Quaternius CC0 authored swimming clips, baked onto Franklin's actual rig.
 * Only water placement is procedural; no IK overwrites the authored arm motion. */
export async function createNativeSwimPose(scene:Scene,anchor:TransformNode,nodes:readonly TransformNode[]){
 const asset=await loadAsset();if(scene.isDisposed)throw Error("Swimming animation loading canceled");
 const byName=new Map(nodes.map(n=>[n.name.toLowerCase().split(':').at(-1)!,n]));
 const missing=asset.bones.filter(name=>!byName.has(name));if(missing.length)throw Error("Swimming skeleton missing: "+missing.join(', '));
 const joints=asset.bones.map(name=>byName.get(name)!);
 const pelvis=byName.get('pelvis')!,head=byName.get('head')!;
 const arms=['l','r'].map(s=>['upperarm','lowerarm','hand'].map(n=>byName.get(n+'_'+s)!));
 const pos=(n:TransformNode)=>{n.computeWorldMatrix(true);return n.getAbsolutePosition().clone();};
 let pose:{x:number;y:number;z:number;yaw:number;speed:number;swimDepth?:number;swimPitch?:number}|null=null;
 let phase=0,idlePhase=0,blend=0,enabled=false,frames=0;
 const saved=new Map<TransformNode,Quaternion>();
 const restore=()=>{for(const [n,q] of saved)n.rotationQuaternion=q;saved.clear();};
 const apply=()=>{
  if(!enabled||!pose)return;
  // glTF handedness stays below anchor; both baked clips use that source basis.
  anchor.rotationQuaternion=Quaternion.RotationYawPitchRoll(pose.yaw,(pose.swimPitch??0)*blend,0);
  anchor.position.set(pose.x,pose.y,pose.z);
  joints.forEach((n,i)=>{
   saved.set(n,n.rotationQuaternion?.clone()??Quaternion.FromEulerVector(n.rotation));
   n.rotationQuaternion=Quaternion.Slerp(sampleSwimClip(asset.clips.Swim_Idle_Loop,idlePhase,i),sampleSwimClip(asset.clips.Swim_Fwd_Loop,phase,i),blend).normalize();
  });
  const hip=pos(pelvis),target=new Vector3(pose.x,pose.y-(.67*(1-blend)+.03*blend)-(pose.swimDepth??0),pose.z);
  anchor.position.addInPlace(target.subtract(hip));anchor.computeWorldMatrix(true);
  // The source mannequin has different neck proportions. Keep its breathing
  // stroke at the waterline; fade this correction when intentionally pitching down.
  const lift=Math.max(0,pose.y+.02-(pose.swimDepth??0)-pos(head).y)*(1-Math.min(1,Math.abs(pose.swimPitch??0)/.35));
  anchor.position.y+=lift;anchor.computeWorldMatrix(true);frames++;
 };
 const before=scene.onBeforeAnimationsObservable.add(restore),after=scene.onAfterAnimationsObservable.add(apply);
 return {
  setEnabled(value:boolean){enabled=value;if(!value)restore();},
  update(p:NonNullable<typeof pose>,dt:number){pose=p;const step=Math.max(0,Math.min(.1,Number.isFinite(dt)?dt:0));blend+=(Math.min(1,Math.abs(p.speed)/1.1)-blend)*(1-Math.exp(-step*7));phase=(phase+step/asset.clips.Swim_Fwd_Loop.duration)%1;idlePhase=(idlePhase+step/asset.clips.Swim_Idle_Loop.duration)%1;},
  stats(){return {ready:true,source:'quaternius-cc0',clips:['Swim_Fwd_Loop','Swim_Idle_Loop'],missing,frames,phase,idlePhase,blend,hips:pos(pelvis).asArray(),head:pos(head).asArray(),hands:arms.map(a=>pos(a[2]).asArray()),feet:['l','r'].map(s=>pos(byName.get('foot_'+s)!).asArray()),arms:arms.map(([upper,lower,hand])=>{const a=pos(upper),b=pos(lower),d=pos(hand);return {shoulder:a.asArray(),elbow:b.asArray(),wrist:d.asArray(),upperLength:Vector3.Distance(a,b),lowerLength:Vector3.Distance(b,d),flexion:Math.acos(Math.max(-1,Math.min(1,Vector3.Dot(b.subtract(a).normalize(),d.subtract(b).normalize()))))*180/Math.PI,upperRotation:upper.rotationQuaternion!.asArray(),lowerRotation:lower.rotationQuaternion!.asArray()};})};},
  dispose(){restore();scene.onBeforeAnimationsObservable.remove(before);scene.onAfterAnimationsObservable.remove(after);},
 };
}
