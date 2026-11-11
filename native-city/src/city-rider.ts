import {AbstractMesh,Animation,AnimationGroup,Quaternion,TransformNode,Vector3,type Scene} from '@babylonjs/core';
import {loadLocalCharacter,characterProgress,type LocalCharacter} from './city-local-characters.ts';
import {PLAYER_CHARACTER,PLAYER_ASSET_BASE} from './city-player-character.ts';
import {WALK_SPEED,RUN_SPEED} from './city-walk.ts';
import {createTraversalPoseOverride,type LocomotionPose} from './offmap-navigation-traversal-pose.ts';
import type {TraversalState} from './offmap-navigation-traversal.ts';
import {createNativeSwimPose} from './native-swim-pose.ts';
import {createPoliceOutfit} from './native-police-outfit.ts';
import {loadGroundAnimation,type GroundAnimationAsset} from './native-ground-animation.ts';
import {createGroundArmPose} from './native-ground-arm-pose.ts';
import {createGroundPosture} from './native-ground-posture.ts';
import {createGroundWalkPose} from './native-ground-walk-pose.ts';
import {createGroundIdlePose} from './native-ground-idle-pose.ts';
import {createNativeJetskiPose,MOTORCYCLE_FIT,ATV_FIT,BOAT_HELM_FIT,rescueRideFit} from './native-jetski-pose.ts';
export type TraversalPoseDiagnostics=ReturnType<ReturnType<typeof createTraversalPoseOverride>['stats']>;

export type RiderPose={x:number;y:number;z:number;yaw:number;speed:number;swimDepth?:number;swimPitch?:number;ridePitch?:number;rideRoll?:number};
export type CityRider={
 meshes:AbstractMesh[];
 name:string;
 setEnabled(enabled:boolean):void;
 setPose(pose:RiderPose,dt:number):void;
 setTraversalPose(state:TraversalState|null):void;
 setLocomotionPose(state:LocomotionPose|null):void;
 traversalPoseStats():TraversalPoseDiagnostics;
 groundArmStats():ReturnType<ReturnType<typeof createGroundArmPose>['stats']>|null;
 groundPostureStats():ReturnType<ReturnType<typeof createGroundPosture>['stats']>|null;
 groundWalkStats():ReturnType<ReturnType<typeof createGroundWalkPose>['stats']>|null;
 groundIdleStats():ReturnType<ReturnType<typeof createGroundIdlePose>['stats']>|null;
 swimPoseStats():ReturnType<Awaited<ReturnType<typeof createNativeSwimPose>>['stats']>|null;
 setJetskiSeated(enabled:boolean):void;
 setBoatHelmSeated(enabled:boolean,blend?:number,kind?:'yacht'|'zodiac'):void;
 setMotorcycleSeated(enabled:boolean):void;
 setAtvSeated(enabled:boolean):void;
 /** 0 = hanging from boom, 1 = car passenger; null restores standing. */
 setRescuePose(progress:number|null):void;
 jetskiPoseStats():ReturnType<ReturnType<typeof createNativeJetskiPose>['stats']>;
 dispose():void;
};

type RiderPresentationMode='ground'|'swim';
export type CityRiderOptions={character?:LocalCharacter&{sourceHeight:number};assetBase?:string;police?:boolean};

/** OffMapBench's Franklin, with native in-place skeletal clips and glTF handedness. */
export async function createCityRider(scene:Scene,mode:RiderPresentationMode='ground',options:CityRiderOptions={}):Promise<CityRider>{
 const manifest=options.character??PLAYER_CHARACTER;
 const isPlayer=manifest.id==='franklin';
 const assetBase=options.assetBase??(isPlayer?PLAYER_ASSET_BASE:'/characters');
 if(isPlayer)characterProgress('player','loading',0,"Franklin · Loading character");
 let result:Awaited<ReturnType<typeof loadLocalCharacter>>;
 try{result=await loadLocalCharacter(scene,manifest,n=>{if(isPlayer)characterProgress('player','loading',n,"Franklin · Textures and skeletons "+Math.round(n*100)+'%');},{base:assetBase,style:'realistic'});}
 catch(e){if(isPlayer)characterProgress('player','error',0,"Franklin Loading failed, Still Drivable · "+(e as Error).message);throw e;}
 let groundAsset:GroundAnimationAsset|null=null;
 try{if(isPlayer&&mode==='ground')groundAsset=await loadGroundAnimation();}
 catch(e){result.dispose();if(isPlayer)characterProgress('player','error',0,"Franklin Ground animation loading failed, Can retry");throw e;}
 const anchor=new TransformNode(options.police?'native-foot-police':isPlayer?'player-offmap-franklin':'native-npc-'+manifest.id,scene);
 // Both OffMapBench human rigs are exported at 1.933 m. Keep source geometry,
 // textures and handedness unchanged and normalize the complete rig together.
 anchor.scaling.setAll(manifest.displayHeight/manifest.sourceHeight);
 const source=result.meshes[0];source.parent=anchor;
 const traversalPose=createTraversalPoseOverride(scene,result.transformNodes,groundAsset??undefined);
 const outfit=options.police?createPoliceOutfit(scene,result.transformNodes,result.materials):null;
 const meshes=[...result.meshes.filter(m=>m.getTotalVertices()>0),...outfit?.meshes??[]];
 for(const mesh of meshes){
  mesh.isPickable=false;mesh.receiveShadows=true;mesh.alwaysSelectAsActiveMesh=true;
  mesh.doNotSyncBoundingInfo=false;
 }
 const find=(name:string)=>result.animationGroups.find(a=>a.name.toLowerCase().includes(name));
 const idle=find('idle'),walk=find('walk'),run=find('run');
 if(!idle||!walk||!run){outfit?.dispose();result.dispose();anchor.dispose();if(isPlayer)characterProgress('player','error',0,"Character Idle / walking / Incomplete running animation, Can retry");throw Error("Character Idle / walking / Incomplete running animation");}
 const groundIdle=mode==='ground'?createGroundIdlePose(scene,anchor,result.transformNodes,meshes):null;
 const groundWalk=mode==='ground'?createGroundWalkPose(scene,anchor,result.transformNodes,meshes):null;
 const groundArms=mode==='ground'?createGroundArmPose(scene,result.transformNodes,meshes):null;
 const groundPosture=mode==='ground'?createGroundPosture(scene,anchor,result.transformNodes):null;
 const groups=[idle,walk,run].filter((g):g is AnimationGroup=>!!g);
 for(const group of groups){group.start(true);group.setWeightForAllAnimatables(group===idle?1:0);}
 // One neutral phase clock keeps left/right contacts aligned while blending
 // clips of different lengths. It continues even when a clip has zero weight.
 const phaseAnimation=new Animation('rider-stride-clock','phase',1,Animation.ANIMATIONTYPE_FLOAT,Animation.ANIMATIONLOOPMODE_CYCLE);
 phaseAnimation.setKeys([{frame:0,value:0},{frame:1,value:1}]);
 const phaseClock=scene.beginDirectAnimation({phase:0},[phaseAnimation],0,1,true);
 walk?.syncAllAnimationsWith(phaseClock);run?.syncAllAnimationsWith(phaseClock);
 const walkStride=manifest.gait.walk.cycleSeconds*manifest.gait.walk.authoredSpeed;
 const runStride=manifest.gait.run.cycleSeconds*manifest.gait.run.authoredSpeed;
 let enabled=false,walkWeight=0,runWeight=0,disposed=false,mantleActive=false;
 let swimPose:Awaited<ReturnType<typeof createNativeSwimPose>>|null=null;
 try{if(mode==='swim')swimPose=await createNativeSwimPose(scene,anchor,result.transformNodes);}
 catch(error){phaseClock.stop();traversalPose.dispose();groundIdle?.dispose();groundWalk?.dispose();groundArms?.dispose();groundPosture?.dispose();outfit?.dispose();result.dispose();anchor.dispose();throw error;}
 const rescueFit=rescueRideFit(0);
 const helmFit={...BOAT_HELM_FIT};
 let jetskiPose=createNativeJetskiPose(scene,anchor,result.transformNodes);let seated=false,rideKind:'jetski'|'motorcycle'|'atv'|'rescue'|'helm'='jetski';
 let traversalActive=false,locomotionOverride=false;
 function updateGroundArms(){const active=enabled&&!seated&&!traversalActive&&!locomotionOverride;groundWalk?.setEnabled(active);groundIdle?.setEnabled(active);groundArms?.setEnabled(active);groundPosture?.setEnabled(active);}
 anchor.setEnabled(false);
 for(const group of groups)group.pause();
 phaseClock.pause();
 function setEnabled(value:boolean){
  if(disposed||enabled===value)return;
  enabled=value;anchor.setEnabled(value);swimPose?.setEnabled(value);jetskiPose.setEnabled(value&&seated);
  updateGroundArms();
  if(value)phaseClock.restart();else phaseClock.pause();
  if(value)for(const group of groups)group.play(true);
  else for(const group of groups)group.pause();
 }
 if(isPlayer)characterProgress('player','ready',1,"Franklin Ready");
 function setSeated(value:boolean,kind:typeof rideKind){if(rideKind!==kind){jetskiPose.dispose();jetskiPose=createNativeJetskiPose(scene,anchor,result.transformNodes,kind==='helm'?helmFit:kind==='rescue'?rescueFit:kind==='atv'?ATV_FIT:kind==='motorcycle'?MOTORCYCLE_FIT:undefined);rideKind=kind;}seated=value;updateGroundArms();jetskiPose.setEnabled(enabled&&value);}
 return {meshes,name:manifest.name,setEnabled,setBoatHelmSeated(value,blend=1,kind='yacht'){const t=Math.max(0,Math.min(1,blend)),small=kind==='zodiac';Object.assign(helmFit,BOAT_HELM_FIT,{lean:small?.12:.03,footHeight:-.9+(small?.64:.44)*t,footForward:.06+.38*t,handForward:(small?.65:.48)*t,handHeight:-.3+(small?.54:.52)*t});setSeated(value,'helm');},setJetskiSeated(value){setSeated(value,'jetski');},setMotorcycleSeated(value){setSeated(value,'motorcycle');},setAtvSeated(value){setSeated(value,'atv');},setRescuePose(progress){if(progress===null){if(rideKind==='rescue')setSeated(false,'rescue');return;}Object.assign(rescueFit,rescueRideFit(progress));setSeated(true,'rescue');},jetskiPoseStats:()=>jetskiPose.stats(),setTraversalPose:state=>{traversalActive=!!state?.active;updateGroundArms();mantleActive=!!state?.active&&!!(state.mantleContact||state.vaultContact);traversalPose.set(state);},setLocomotionPose:state=>{locomotionOverride=!!state;updateGroundArms();traversalPose.setLocomotion(state);},groundArmStats:()=>groundArms?.stats()??null,traversalPoseStats:()=>traversalPose.stats(),swimPoseStats:()=>swimPose?.stats()??null,setPose(pose,dt){
  if(disposed)return;
  anchor.position.set(pose.x,pose.y,pose.z);anchor.rotation.y=pose.yaw;
  if(!enabled)return;
  if(seated){jetskiPose.update(pose);idle?.setWeightForAllAnimatables(1);walk?.setWeightForAllAnimatables(0);run?.setWeightForAllAnimatables(0);phaseClock.speedRatio=0;return;}
  if(mode==='swim'){
   // y is the water surface; swimDepth adds real underwater presentation.
   // dt=0 freezes strokes when paused instead of advancing on render time.
   swimPose!.update(pose,dt);
   idle?.setWeightForAllAnimatables(1);walk?.setWeightForAllAnimatables(0);run?.setWeightForAllAnimatables(0);
   phaseClock.speedRatio=0;
   return;
  }
  // Translation over a ledge is not a walking stride. Blend to the idle base
  // beneath the contact pose instead of running the legs during the transfer.
  const speed=mantleActive?0:Math.abs(pose.speed),moving=speed>.1;
  const running=options.police?1:Math.min(1,Math.max(0,(speed-WALK_SPEED-.2)/(RUN_SPEED-WALK_SPEED-.2)));
  const smooth=1-Math.exp(-Math.max(0,Math.min(.1,dt))*12);
  walkWeight+=((moving?1-running:0)-walkWeight)*smooth;
  runWeight+=((moving?running:0)-runWeight)*smooth;
  groundPosture?.setGait(walkWeight,runWeight);
  groundIdle?.setGait(walkWeight,runWeight);
  groundWalk?.setGait(walkWeight,runWeight);
  idle?.setWeightForAllAnimatables(Math.max(0,1-walkWeight-runWeight));
  walk?.setWeightForAllAnimatables(walkWeight);run?.setWeightForAllAnimatables(runWeight);
  const movingWeight=walkWeight+runWeight,runBlend=movingWeight>.001?runWeight/movingWeight:0;
  phaseClock.speedRatio=moving?speed/(walkStride+(runStride-walkStride)*runBlend):0;
  if(options.police&&dt<=0)phaseClock.speedRatio=0;
 },groundPostureStats:()=>groundPosture?.stats()??null,groundWalkStats:()=>groundWalk?.stats()??null,groundIdleStats:()=>groundIdle?.stats()??null,dispose(){
  if(disposed)return;disposed=true;
  phaseClock.stop();traversalPose.dispose();groundIdle?.dispose();groundWalk?.dispose();groundArms?.dispose();groundPosture?.dispose();swimPose?.dispose();jetskiPose.dispose();
  outfit?.dispose();result.dispose();anchor.dispose();
 }};
}
