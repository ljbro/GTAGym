import type {V2} from './city-types.ts';
import type {BoatSpec} from './native-boat-motion.ts';
import type {NativeWaterSpec} from './native-water-motion.ts';
import {walkLength} from './generated-walk-tasks.ts';
import {effectiveWalkTurns} from './outdoor-walk-generator.ts';
import {assertWalkGoalLandmark,type WalkGoalLandmark} from './walk-goal-landmark.ts';
import {npcRules,type NpcRules} from './native-npc-rules.ts';
import {ESCAPE_MAX_SECONDS} from './native-escape-survival.ts';

export const OUTDOOR_DATASET_SCHEMA='gtabench.outdoor.v1';
export const GENERATED_OUTDOOR_ID=/^rl-outdoor-[a-z0-9][a-z0-9-]{0,83}$/;
export const OUTDOOR_VEHICLES=['walk','swim','drive','boat'] as const;
export type OutdoorVehicle=typeof OUTDOOR_VEHICLES[number];
export type OutdoorObjective='arrival'|'follow'|'intercept'|'escape';
export type OutdoorFlags={follow:boolean;intercept:boolean;escape:boolean};
export type GeneratedOutdoorTask=OutdoorFlags&{
 id:string;title:string;vehicle:OutdoorVehicle;objective:OutdoorObjective;seed:number;
 category:'outdoor-foot'|'outdoor-road'|'water'|'follow'|'chase'|'escape';
 instruction:{en:string;zh:string};points:V2[];length:number;turnCount:number;maxDuration:number;
 routeRole:'npc'|'player'|'escape-reference';playerSpawn:{point:V2;yaw:number;gap:number};
 startDepth:number;goalDepth:number;goalLandmark?:WalkGoalLandmark;
 actors?:{speed?:number;initialDistance?:number;pursuers?:{point:V2;yaw:number;speed:number}[];reinforcementSpeeds?:number[]};
 validation:{status:'geometry-verified'|'physics-verified';scope:string;frames?:number;controllerSeconds?:number};
};
export type GeneratedOutdoorDataset={schema:typeof OUTDOOR_DATASET_SCHEMA;split:'train'|'validation';generatorVersion:string;config:Record<string,unknown>;provenance:Record<string,unknown>;tasks:GeneratedOutdoorTask[]};

export function outdoorObjective(flags:OutdoorFlags):OutdoorObjective{
 if(['follow','intercept','escape'].some(k=>typeof flags[k as keyof OutdoorFlags]!=='boolean'))throw Error('Objective flags must be booleans');
 if(Number(flags.follow)+Number(flags.intercept)+Number(flags.escape)>1)throw Error('Follow, intercept and escape are mutually exclusive');
 return flags.follow?'follow':flags.intercept?'intercept':flags.escape?'escape':'arrival';
}
export function outdoorCategory(vehicle:OutdoorVehicle,objective:OutdoorObjective):GeneratedOutdoorTask['category']{
 return objective==='intercept'?'chase':objective!=='arrival'?objective:vehicle==='walk'?'outdoor-foot':vehicle==='drive'?'outdoor-road':'water';
}
export function outdoorNpcRules(task:Pick<GeneratedOutdoorTask,'vehicle'|'objective'>):NpcRules{
 const kind=task.objective==='intercept'?'chase':'follow';
 if(task.vehicle==='walk'||task.vehicle==='drive')return {...npcRules(kind,task.vehicle),headStart:0};
 // Water targets must not inherit the 31.8 m/s car profile. Both are below
 // the corresponding player's top speed, retaining the benchmark's 60% ratio.
 return {kind,speed:task.vehicle==='boat'?4.8:1.44,headStart:0,radius:task.vehicle==='boat'?200:20};
}
export function resolvedOutdoorNpcRules(task:GeneratedOutdoorTask):NpcRules{return {...outdoorNpcRules(task),...(task.actors?.speed!==undefined?{speed:task.actors.speed}:{})};}
export function outdoorPlayerGap(vehicle:OutdoorVehicle,objective:OutdoorObjective){return objective==='intercept'?55:objective!=='follow'?0:vehicle==='drive'?20:vehicle==='boat'?12:4;}
export function outdoorInstruction(vehicle:OutdoorVehicle,objective:OutdoorObjective,goalDepth=0):{en:string;zh:string}{
 const en={walk:'Walk',swim:'Swim',drive:'Drive',boat:'Drive the boat'}[vehicle],zh={walk:"walking",swim:"swimming",drive:"Drive a car",boat:"Pilot a motorboat"}[vehicle];
 if(objective==='escape')return {en:`${en} to evade the police. Remain outside all police detection sectors for 60 continuous seconds within 3 minutes. Three continuous seconds of exposure means capture.`,zh:`${en} to evade the police. Remain outside all police detection sectors for 60 continuous seconds within 3 minutes. Three continuous seconds of exposure means capture.`};
 if(objective==='intercept')return {en:'Intercept the target car before it reaches its destination. Collide with its front and block it until it slows to a stop.',zh:'Intercept the target car before it reaches its destination. Collide with its front and block it until it slows to a stop.'};
 if(objective==='follow'){const radius=outdoorNpcRules({vehicle,objective}).radius;return {en:`${en} to follow the blue target until it reaches its destination. Stay within ${radius} metres throughout.`,zh:`${en} to follow the blue target until it reaches its destination. Stay within ${radius} metres throughout.`};}
 return {en:`${en} to the marked destination${vehicle==='swim'&&goalDepth>0?` at a depth of ${goalDepth} metres`:''}.`,zh:`${en} to the marked destination${vehicle==='swim'&&goalDepth>0?` at a depth of ${goalDepth} metres`:''}.`};
}

/** Host-only input. Training IDs may never shadow the frozen benchmark. */
export function parseOutdoorDataset(input:unknown):GeneratedOutdoorDataset{
 const d=input as GeneratedOutdoorDataset;
 if(!d||d.schema!==OUTDOOR_DATASET_SCHEMA||!['train','validation'].includes(d.split)||typeof d.generatorVersion!=='string'||!d.generatorVersion||!d.config||!d.provenance||!Array.isArray(d.tasks)||!d.tasks.length||d.tasks.length>10000)throw Error('Invalid outdoor dataset');
 const ids=new Set<string>();
 for(const t of d.tasks){
  if(!t||!GENERATED_OUTDOOR_ID.test(t.id)||ids.has(t.id))throw Error('Invalid or duplicate outdoor training ID');ids.add(t.id);
  if(!OUTDOOR_VEHICLES.includes(t.vehicle)||t.objective!==outdoorObjective(t)||t.category!==outdoorCategory(t.vehicle,t.objective))throw Error('Invalid outdoor vehicle/objective/category');
  if(t.intercept&&t.vehicle!=='drive')throw Error('Interception only supports driving a car');
  if(!Number.isInteger(t.seed)||t.seed<1||t.seed>0xffffffff||typeof t.title!=='string'||!t.title||t.title.length>200||!t.instruction||['en','zh'].some(k=>typeof t.instruction[k as 'en'|'zh']!=='string'||!t.instruction[k as 'en'|'zh'].trim()||t.instruction[k as 'en'|'zh'].length>2000))throw Error('Invalid outdoor task metadata');
  if(!Array.isArray(t.points)||t.points.length<2||t.points.length>10000||t.points.some(p=>!Array.isArray(p)||p.length!==2||p.some(v=>!Number.isFinite(v)||Math.abs(v)>20000)))throw Error('Invalid outdoor route');
  const length=walkLength(t.points);
  if(t.points.slice(1).some((p,i)=>Math.hypot(p[0]-t.points[i][0],p[1]-t.points[i][1])<.01))throw Error('Duplicate outdoor route point');
  if(!Number.isFinite(t.length)||length<15||length>16000||Math.abs(length-t.length)>.01||t.turnCount!==effectiveWalkTurns(t.points).length||!Number.isFinite(t.maxDuration)||t.maxDuration<=0||t.maxDuration>7200)throw Error('Invalid outdoor length, turns or deadline');
  if(![t.startDepth,t.goalDepth].every(v=>Number.isFinite(v)&&v>=0&&v<=20)||(t.vehicle!=='swim'&&(t.startDepth!==0||t.goalDepth!==0)))throw Error('Only swimming supports depth');
  if(t.escape&&t.maxDuration!==ESCAPE_MAX_SECONDS)throw Error('Escape must use the benchmark survival deadline');
  if(t.actors){const a=t.actors;if(a.speed!==undefined&&(!Number.isFinite(a.speed)||a.speed<=0||a.speed>80)||a.initialDistance!==undefined&&(!Number.isFinite(a.initialDistance)||a.initialDistance<=0||a.initialDistance>2000))throw Error('Invalid generated actor parameters');
   if(a.pursuers!==undefined&&(!t.escape||!Array.isArray(a.pursuers)||a.pursuers.length<1||a.pursuers.length>8||a.pursuers.some(p=>!Array.isArray(p.point)||p.point.length!==2||p.point.some(v=>!Number.isFinite(v)||Math.abs(v)>20000)||!Number.isFinite(p.yaw)||!Number.isFinite(p.speed)||p.speed<=0||p.speed>80)))throw Error('Invalid generated pursuers');
   if(a.reinforcementSpeeds!==undefined&&(!t.escape||!Array.isArray(a.reinforcementSpeeds)||!a.reinforcementSpeeds.length||a.reinforcementSpeeds.length>1000||a.reinforcementSpeeds.some(v=>!Number.isFinite(v)||v<=0||v>80)))throw Error('Invalid reinforcement speed samples');}
  const role=t.follow||t.intercept?'npc':t.escape?'escape-reference':'player',spawn=t.playerSpawn;
  if(t.routeRole!==role||!spawn||!Array.isArray(spawn.point)||spawn.point.length!==2||!spawn.point.every(v=>Number.isFinite(v)&&Math.abs(v)<=20000)||!Number.isFinite(spawn.yaw)||!Number.isFinite(spawn.gap)||spawn.gap<0||Math.abs(spawn.gap-Math.hypot(spawn.point[0]-t.points[0][0],spawn.point[1]-t.points[0][1]))>.01)throw Error('Invalid separate player spawn / route role');
  if(role==='npc'?(spawn.gap<2||spawn.gap>(t.follow?outdoorNpcRules(t).radius:200)):(spawn.gap!==0))throw Error('Player lead-in must not consume the NPC route');
  if(t.validation?.status!=='physics-verified'||typeof t.validation.scope!=='string'||!t.validation.scope)throw Error('Outdoor routes must pass their movement-controller validation');
  if(t.goalLandmark!==undefined){if(t.vehicle!=='walk'||t.objective!=='arrival')throw Error('Fixed landmarks are only supported for walking arrival tasks');assertWalkGoalLandmark(t.goalLandmark,t.points);}
 }
 return structuredClone(d);
}
export async function loadOutdoorDatasetFromUrl(search:string,base:string,fetcher:typeof fetch=fetch):Promise<GeneratedOutdoorDataset|undefined>{
 const query=new URLSearchParams(search),filename=query.get('outdoorDataset');if(filename===null)return undefined;
 if(query.has('walkDataset'))throw Error('Choose one training dataset per game instance');
 if(!/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,95}\.json$/.test(filename))throw Error('outdoorDataset must be a basename, not a URL or path');
 const response=await fetcher(new URL(`training-tasks/outdoor-walk/${filename}`,base),{cache:'no-store'});
 if(!response.ok)throw Error(`Outdoor dataset load failed: ${response.status}`);
 return parseOutdoorDataset(await response.json());
}

/** No route walls or enforced turn checkpoints: use the existing open bay. */
export function outdoorWaterSpec(t:GeneratedOutdoorTask,waterHeight=-.25,forPlayer=true):NativeWaterSpec&BoatSpec{
 const a=t.points[0],b=t.points[1],d=Math.hypot(b[0]-a[0],b[1]-a[1]),forward:[number,number]=[(b[0]-a[0])/d,(b[1]-a[1])/d];
 const points=forPlayer&&t.routeRole==='npc'?[t.playerSpawn.point,...t.points]:t.points,xs=points.map(p=>p[0]),zs=points.map(p=>p[1]);
 return {id:t.id,path:{points,length:walkLength(points),forward,right:[forward[1],-forward[0]]},waterHeight,
  startDepth:t.startDepth,goalDepth:t.goalDepth,shallowFloorDepth:Math.max(8,t.startDepth+3,t.goalDepth+3),deepFloorDepth:Math.max(8,t.startDepth+3,t.goalDepth+3),entrance:false,
  region:{minX:Math.min(...xs)-80,maxX:Math.max(...xs)+80,minZ:Math.min(...zs)-80,maxZ:Math.max(...zs)+80},
  ...(t.escape?{freeRoamRegion:{minX:a[0]-2000,maxX:a[0]+2000,minZ:a[1]-2000,maxZ:a[1]+2000}}:{}),
  objective:t.escape?'water-escape':'generated-arrival',craft:'zodiac',startAboard:true};
}
