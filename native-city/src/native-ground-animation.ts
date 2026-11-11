import {Animation,AnimationGroup,Quaternion,Vector3,type Scene,type TransformNode} from '@babylonjs/core';
export type GroundClip={duration:number;loop:boolean;strideMetres?:number;frames:number[][];pelvisPositions:number[][]};
export type GroundAnimationAsset={version:1;bones:string[];root:{rotation:number[];position:number[]};clips:Record<'Walk_Loop'|'Sprint_Loop'|'ClimbUp_1m',GroundClip>};
let request:Promise<GroundAnimationAsset>|null=null;
export function loadGroundAnimation(){
 return request??=(async()=>{const r=await fetch('characters/animations/quaternius-ground-v1.json',{signal:AbortSignal.timeout(30000)});if(!r.ok)throw Error("Ground animation loading failed ("+r.status+')');const data=await r.json() as GroundAnimationAsset;if(data.version!==1||!data.bones?.length||!data.clips?.Walk_Loop||!data.clips?.Sprint_Loop||!data.clips?.ClimbUp_1m)throw Error("Invalid ground animation data");return data;})().catch(e=>{request=null;throw e;});
}
export function sampleGroundRotation(clip:GroundClip,progress:number,bone:number){
 const p=clip.loop?((progress%1)+1)%1:Math.max(0,Math.min(1,progress)),f=p*(clip.frames.length-1),i=Math.min(clip.frames.length-2,Math.floor(f));
 return Quaternion.Slerp(Quaternion.FromArray(clip.frames[i],bone*4),Quaternion.FromArray(clip.frames[i+1],bone*4),f-i).normalize();
}
/** Strictly the two forward c07-n01 links, not ladders, generic mantles or vaults. */
export function usesPickupClimbAnimation(state:{active:boolean;descriptorId:string|null;mantleContact?:{ascending?:boolean}}|null){
 return !!state?.active&&state.mantleContact?.ascending===true&&(state.descriptorId==='climb:pickup-hood'||state.descriptorId==='climb:pickup-roof');
}
export function createGroundAnimationGroups(scene:Scene,nodes:readonly TransformNode[],asset:GroundAnimationAsset){
 const byName=new Map(nodes.map(n=>[n.name.toLowerCase().split(':').at(-1)!,n]));
 for(const name of [...asset.bones,'root'])if(!byName.has(name))throw Error("Ground animation is missing a skeleton "+name);
 const make=(name:'Walk_Loop'|'Sprint_Loop')=>{
  const clip=asset.clips[name],fps=(clip.frames.length-1)/clip.duration,group=new AnimationGroup('Quaternius_'+name,scene);
  const add=(target:TransformNode,property:string,type:number,values:(Quaternion|Vector3)[])=>{const animation=new Animation(name+'_'+target.name+'_'+property,property,fps,type,Animation.ANIMATIONLOOPMODE_CYCLE);animation.setKeys(values.map((value,frame)=>({frame,value})));group.addTargetedAnimation(animation,target);};
  asset.bones.forEach((name,i)=>add(byName.get(name)!,'rotationQuaternion',Animation.ANIMATIONTYPE_QUATERNION,clip.frames.map(f=>Quaternion.FromArray(f,i*4))));
  add(byName.get('pelvis')!,'position',Animation.ANIMATIONTYPE_VECTOR3,clip.pelvisPositions.map(p=>Vector3.FromArray(p)));
  add(byName.get('root')!,'position',Animation.ANIMATIONTYPE_VECTOR3,clip.frames.map(()=>Vector3.FromArray(asset.root.position)));
  add(byName.get('root')!,'rotationQuaternion',Animation.ANIMATIONTYPE_QUATERNION,clip.frames.map(()=>Quaternion.FromArray(asset.root.rotation)));
  return group;
 };
 const walk=make('Walk_Loop'),run=make('Sprint_Loop');return {walk,run,dispose(){walk.dispose();run.dispose();}};
}
