import type {V2} from './city-types.ts';
import {assertWalkGoalLandmark,type WalkGoalLandmark} from './walk-goal-landmark.ts';

export const WALK_DATASET_SCHEMA='gtabench.outdoor-walk.v1';
export const GENERATED_WALK_ID=/^rl-walk-[a-z0-9][a-z0-9-]{0,71}$/;
export type GeneratedWalkTask={
 id:string;title:string;category:'outdoor-foot';mode:'walk';seed:number;
 instruction:{en:string;zh:string};points:V2[];length:number;turnCount:number;
 goalLandmark?:WalkGoalLandmark;
 maxDuration:number;validation:{status:'geometry-verified'|'walk-verified';scope:string;frames?:number};
};
export type GeneratedWalkDataset={schema:typeof WALK_DATASET_SCHEMA;split:'train'|'validation';generatorVersion:string;config:Record<string,unknown>;provenance:Record<string,string>;tasks:GeneratedWalkTask[]};
export function walkLength(points:readonly V2[]){let length=0;for(let i=1;i<points.length;i++)length+=Math.hypot(points[i][0]-points[i-1][0],points[i][1]-points[i-1][1]);return length;}

/** Trusted-host dataset input, never an agent tool. Reject malformed data before registration. */
export function parseWalkDataset(input:unknown):GeneratedWalkDataset{
 const d=input as GeneratedWalkDataset;
 if(!d||d.schema!==WALK_DATASET_SCHEMA||!['train','validation'].includes(d.split)||typeof d.generatorVersion!=='string'||!d.generatorVersion||!d.config||!d.provenance||!Array.isArray(d.tasks)||d.tasks.length<1||d.tasks.length>10000)throw Error('Invalid outdoor walking dataset');
 const ids=new Set<string>();
 for(const task of d.tasks){
  if(!task||typeof task.id!=='string'||!GENERATED_WALK_ID.test(task.id)||ids.has(task.id))throw Error('Invalid or duplicate training task ID');ids.add(task.id);
  if(task.category!=='outdoor-foot'||task.mode!=='walk'||!Number.isInteger(task.seed)||task.seed<0||task.seed>0xffffffff||typeof task.title!=='string'||!task.title||task.title.length>200)throw Error('Invalid training task metadata');
  if(!task.instruction||['en','zh'].some(language=>typeof task.instruction[language as 'en'|'zh']!=='string'||!task.instruction[language as 'en'|'zh'].trim()||task.instruction[language as 'en'|'zh'].length>2000))throw Error('Invalid training instruction');
  if(!Array.isArray(task.points)||task.points.length<2||task.points.length>2000||task.points.some(p=>!Array.isArray(p)||p.length!==2||p.some(v=>!Number.isFinite(v)||Math.abs(v)>20000)))throw Error('Invalid training route points');
  const length=walkLength(task.points);
  if(!Number.isFinite(task.length)||length<15||length>2500||Math.abs(task.length-length)>.01||!Number.isInteger(task.turnCount)||task.turnCount<0||task.turnCount>100||!Number.isFinite(task.maxDuration)||task.maxDuration<=0||task.maxDuration>3600)throw Error('Invalid training route length, turns or deadline');
  if(task.validation?.status!=='walk-verified'||typeof task.validation.scope!=='string')throw Error('Training routes must pass walking validation before registration');
  if(task.goalLandmark!==undefined)assertWalkGoalLandmark(task.goalLandmark,task.points);
 }
 return structuredClone(d);
}

/** Only explicit, basename-only opt-in URLs load training data; default benchmark stays unchanged. */
export async function loadWalkDatasetFromUrl(search:string,base:string,fetcher:typeof fetch=fetch):Promise<GeneratedWalkDataset|undefined>{
 const filename=new URLSearchParams(search).get('walkDataset');if(filename===null)return undefined;
 if(!/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,95}\.json$/.test(filename))throw Error('walkDataset must be a dataset filename, not a URL or path');
 const response=await fetcher(new URL(`training-tasks/outdoor-walk/${filename}`,base),{cache:'no-store'});
 if(!response.ok)throw Error(`Walking training dataset load failed: ${response.status}`);
 return parseWalkDataset(await response.json());
}
