import type {V2} from './city-types.ts';
import {placeWalkVehicle,vehicleBlocks,vehicleLocal,type VehiclePose} from './native-walk-vehicle-layout.ts';
import manifest from '../../assets/task-vehicles/manifest.json' with {type:'json'};

/** Existing licensed, metre-normalized GLBs only; never accept a dataset asset URL. */
export const WALK_GOAL_LANDMARKS={
 'motorcycle-green':{en:'the green motorcycle',zh:'the green motorcycle'},
 motorcycle:{en:'the motorcycle',zh:'the motorcycle'},
 pickup:{en:'the pickup truck',zh:'the pickup truck'},
 van:{en:'the white van',zh:'the white van'},
 sedan:{en:'the sedan',zh:'the sedan'},
 convertible:{en:'the red convertible',zh:'the red convertible'},
} as const;
export type WalkGoalLandmarkKind=keyof typeof WALK_GOAL_LANDMARKS;
export type WalkGoalLandmarkChoice=WalkGoalLandmarkKind|'none'|'random';
export type WalkGoalLandmark={kind:WalkGoalLandmarkKind;pose:VehiclePose};
type Environment={clear:(x:number,z:number)=>boolean;height:(x:number,z:number)=>number};
export function isWalkGoalLandmarkKind(value:unknown):value is WalkGoalLandmarkKind{return typeof value==='string'&&Object.hasOwn(WALK_GOAL_LANDMARKS,value);}
export function isWalkGoalLandmarkChoice(value:unknown):value is WalkGoalLandmarkChoice{return value==='none'||value==='random'||isWalkGoalLandmarkKind(value);}
export function walkGoalLandmarkSize(kind:WalkGoalLandmarkKind){
 const asset=manifest.sources.flatMap(s=>s.outputs).find(o=>o.file===`${kind}.glb`);
 if(!asset)throw Error(`Missing landmark asset metadata: ${kind}`);
 return {width:asset.bounds.max[0]-asset.bounds.min[0],depth:asset.bounds.max[2]-asset.bounds.min[2]};
}
export function chooseWalkGoalLandmark(choice:WalkGoalLandmarkChoice,seed:number):WalkGoalLandmarkKind|undefined{
 if(choice==='none')return undefined;if(choice!=='random')return choice;
 // Independent deterministic stream: choosing a prop must not consume route RNG.
 let h=Math.imul(seed^0x5bd1e995,0x85ebca6b);h=Math.imul(h^(h>>>16),0xc2b2ae35);h=(h^(h>>>16))>>>0;
 const kinds=Object.keys(WALK_GOAL_LANDMARKS) as WalkGoalLandmarkKind[];return kinds[h%kinds.length];
}
export function walkGoalInstruction(kind?:WalkGoalLandmarkKind){return kind?{en:`Walk to ${WALK_GOAL_LANDMARKS[kind].en}.`,zh:`Walk to ${WALK_GOAL_LANDMARKS[kind].en}.`}:{en:'Walk to the marked destination.',zh:'Walk to the marked destination.'};}
export function goalLandmarkBlocks(landmark:WalkGoalLandmark|undefined,x:number,z:number){return !!landmark&&vehicleBlocks(landmark.pose,x,z);}

/** Continuous segment/expanded OBB intersection, including zero-length edges. */
function blocksRoute(pose:VehiclePose,points:readonly V2[]){
 for(let i=1;i<points.length;i++){
  const a=vehicleLocal(pose,...points[i-1]),b=vehicleLocal(pose,...points[i]);let enter=0,exit=1;
  for(let axis=0;axis<2;axis++){
   const half=(axis===0?pose.width:pose.depth)/2+.75,d=b[axis]-a[axis];
   if(Math.abs(d)<1e-10){if(Math.abs(a[axis])>half){enter=2;break;}}
   else{const low=(-half-a[axis])/d,high=(half-a[axis])/d;enter=Math.max(enter,Math.min(low,high));exit=Math.min(exit,Math.max(low,high));}
  }
  if(enter<=exit)return true;
 }
 return false;
}
export function assertWalkGoalLandmark(input:unknown,points:readonly V2[]):asserts input is WalkGoalLandmark{
 const landmark=input as WalkGoalLandmark,p=landmark?.pose;
 if(!landmark||!isWalkGoalLandmarkKind(landmark.kind)||!p||['x','z','y','yaw','width','depth'].some(key=>!Number.isFinite(p[key as keyof VehiclePose])))throw Error('Invalid walking goal landmark');
 const size=walkGoalLandmarkSize(landmark.kind),goal=points.at(-1);
 if(!goal||Math.abs(p.x)>20000||Math.abs(p.z)>20000||Math.abs(p.y)>20000||Math.abs(p.yaw)>Math.PI*4||Math.abs(p.width-size.width)>1e-5||Math.abs(p.depth-size.depth)>1e-5||[p.pitch??0,p.roll??0].some(v=>!Number.isFinite(v)||Math.abs(v)>.16)||Math.hypot(p.x-goal[0],p.z-goal[1])>9||blocksRoute(p,points))throw Error('Goal landmark must be near the endpoint, correctly sized and clear of the walking route');
}
/** Revalidate saved placement against current ground; never silently move it at runtime. */
export function verifyWalkGoalLandmark(landmark:WalkGoalLandmark,points:readonly V2[],env:Environment){
 assertWalkGoalLandmark(landmark,points);
 const p=landmark.pose,c=Math.cos(p.yaw),s=Math.sin(p.yaw),du=Math.tan(p.roll??0),dv=-Math.tan(p.pitch??0);
 if(Math.hypot(du,dv)>.15+1e-7)throw Error('Goal landmark slope is too steep');
 const nx=Math.ceil((p.width+.5)/.3),nz=Math.ceil((p.depth+.5)/.3);
 for(let ix=0;ix<=nx;ix++)for(let iz=0;iz<=nz;iz++){
  const u=(ix/nx-.5)*(p.width+.5),v=(iz/nz-.5)*(p.depth+.5),x=p.x+c*u+s*v,z=p.z-s*u+c*v,h=env.height(x,z);
  if(!env.clear(x,z)||!Number.isFinite(h)||Math.abs(h-(p.y-.015+du*u+dv*v))>.065+1e-7)throw Error('Goal landmark footprint is blocked or unsupported by the current ground');
 }
}
export function placeWalkGoalLandmark(kind:WalkGoalLandmarkKind,points:readonly V2[],env:Environment):WalkGoalLandmark{
 const {width,depth}=walkGoalLandmarkSize(kind),pose=placeWalkVehicle(points,1,width,depth,(x,z)=>!env.clear(x,z),env.height),landmark={kind,pose};
 verifyWalkGoalLandmark(landmark,points,env);return landmark;
}
