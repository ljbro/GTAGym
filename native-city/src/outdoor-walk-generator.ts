import type {V2} from './city-types.ts';
import {walkLength,type GeneratedWalkTask} from './generated-walk-tasks.ts';
import {chooseWalkGoalLandmark,isWalkGoalLandmarkChoice,placeWalkGoalLandmark,walkGoalInstruction,type WalkGoalLandmarkChoice} from './walk-goal-landmark.ts';
export {goalLandmarkBlocks} from './walk-goal-landmark.ts';

export const WALK_GENERATOR_VERSION='grid-walk-v3';
export type WalkGeneratorConfig={length:number;tolerance:number;minTurns:number;maxTurns:number;seed:number;count:number;cellSize:number;attempts:number;maxVisited:number;minSeparation:number;timeMultiplier:number;prefix:string;landmark?:WalkGoalLandmarkChoice};
export type WalkGeneratorEnvironment={starts:readonly V2[];clear:(x:number,z:number)=>boolean;height:(x:number,z:number)=>number};
export const DEFAULT_WALK_GENERATOR:WalkGeneratorConfig={length:100,tolerance:.1,minTurns:1,maxTurns:3,seed:42,count:4,cellSize:2,attempts:40,maxVisited:100000,minSeparation:30,timeMultiplier:1,prefix:'sample',landmark:'none'};
export function validateWalkGeneratorConfig(config:WalkGeneratorConfig){
 for(const key of Object.keys(DEFAULT_WALK_GENERATOR) as (keyof WalkGeneratorConfig)[])if(key!=='prefix'&&key!=='landmark'&&!Number.isFinite(config[key]))throw Error(`Invalid ${key}`);
 if(!isWalkGoalLandmarkChoice(config.landmark??'none'))throw Error('Invalid goal landmark choice');
 if(config.length<20||config.length>1000||config.tolerance<0||config.tolerance>.3||config.cellSize<.5||config.cellSize>3||config.minSeparation<0||config.timeMultiplier<1||config.timeMultiplier>3)throw Error('Invalid generator length, tolerance, resolution or multiplier');
 for(const key of ['seed','count','minTurns','maxTurns','attempts','maxVisited'] as const)if(!Number.isInteger(config[key])||config[key]<0)throw Error(`Invalid ${key}`);
 if(config.seed>0xffffffff||config.count<1||config.count>1000||config.maxTurns<config.minTurns||config.maxTurns>20||config.attempts<1||config.attempts>1000||config.maxVisited<100||config.maxVisited>1000000||!/^[a-z0-9][a-z0-9-]{0,35}$/.test(config.prefix))throw Error('Invalid generator count, seed, turns, budget or prefix');
}
export function walkRandom(seed:number){let s=seed>>>0;return ()=>{s=(s+0x6d2b79f5)>>>0;let t=s;t=Math.imul(t^(t>>>15),t|1);t^=t+Math.imul(t^(t>>>7),t|61);return ((t^(t>>>14))>>>0)/4294967296;};}
type Cell={x:number;z:number;distance:number;previous:number};
class Heap{
 values:{key:number;distance:number}[]=[];
 push(item:{key:number;distance:number}){let i=this.values.length;this.values.push(item);while(i){const parent=(i-1)>>1;if(this.values[parent].distance<=item.distance)break;this.values[i]=this.values[parent];i=parent;}this.values[i]=item;}
 pop(){const first=this.values[0],last=this.values.pop()!;if(this.values.length){let i=0;while(i*2+1<this.values.length){let child=i*2+1;if(child+1<this.values.length&&this.values[child+1].distance<this.values[child].distance)child++;if(this.values[child].distance>=last.distance)break;this.values[i]=this.values[child];i=child;}this.values[i]=last;}return first;}
}
export function clearWalkSegment(a:V2,b:V2,env:WalkGeneratorEnvironment,sampleStep=.5){
 const distance=Math.hypot(b[0]-a[0],b[1]-a[1]),steps=Math.max(1,Math.ceil(distance/sampleStep));let last=env.height(...a);
 if(!Number.isFinite(last)||!env.clear(...a))return false;
 for(let i=1;i<=steps;i++){const x=a[0]+(b[0]-a[0])*i/steps,z=a[1]+(b[1]-a[1])*i/steps,y=env.height(x,z);if(!Number.isFinite(y)||Math.abs(y-last)>.35||!env.clear(x,z))return false;last=y;}
 return true;
}
/** Collision-checked string pulling removes diagonal stair-steps and artificial detours. */
export function smoothWalkPath(path:readonly V2[],env:WalkGeneratorEnvironment):V2[]{
 if(path.length<2)return path.map(p=>[...p]);
 // Collapse exact collinear grid runs first. Testing visibility against every
 // 2 m sample of the same straight edge wastes most of the batch-generation
 // time. Never collapse a reversal; every retained edge is still body-checked.
 const corners:V2[]=[];
 for(const p of path){while(corners.length>1){const a=corners.at(-2)!,b=corners.at(-1)!,ux=b[0]-a[0],uz=b[1]-a[1],vx=p[0]-b[0],vz=p[1]-b[1];if(Math.abs(ux*vz-uz*vx)>1e-7||ux*vx+uz*vz<=0)break;corners.pop();}corners.push([...p]);}
 const result:V2[]=[[...corners[0]]];let index=0;
 while(index<corners.length-1){let next=corners.length-1;while(next>index+1&&!clearWalkSegment(corners[index],corners[next],env))next--;if(!clearWalkSegment(corners[index],corners[next],env))throw Error('Unwalkable grid edge');result.push([...corners[next]]);index=next;}
 return result;
}
/** Count substantial bends, not every small curve or sampled grid corner. */
export function effectiveWalkTurns(points:readonly V2[],minimumDegrees=35){
 const turns:{index:number;degrees:number;direction:'left'|'right'}[]=[];
 for(let i=1;i<points.length-1;i++){const a=points[i-1],b=points[i],c=points[i+1],ux=b[0]-a[0],uz=b[1]-a[1],vx=c[0]-b[0],vz=c[1]-b[1];const degrees=Math.atan2(uz*vx-ux*vz,ux*vx+uz*vz)*180/Math.PI;if(Math.abs(degrees)>=minimumDegrees)turns.push({index:i,degrees,direction:degrees>0?'right':'left'});}
 return turns;
}

/** Bounded 8-neighbour shortest-path search over actual walk clearance, not a road random walk.
 * Length is an estimate at cellSize resolution, refined by collision-checked line of sight.
 * It is NOT an exact continuous navmesh distance and does not cover jumping/climbing shortcuts.
 */
export function searchWalkCandidates(start:V2,env:WalkGeneratorEnvironment,config:WalkGeneratorConfig){
 if(!env.clear(...start))return {candidates:[] as V2[][],visited:0,budgetExhausted:false};
 const step=config.cellSize,limit=config.length*(1+config.tolerance)*1.12,extent=Math.ceil(limit/step)+1,width=extent*2+1,encode=(x:number,z:number)=>(x+extent)*width+z+extent;
 const origin=encode(0,0),cells=new Map<number,Cell>([[origin,{x:0,z:0,distance:0,previous:-1}]]),queue=new Heap(),settled=new Set<number>(),clear=new Map<number,boolean>();
 queue.push({key:origin,distance:0});clear.set(origin,true);
 const point=(x:number,z:number):V2=>[start[0]+x*step,start[1]+z*step];
 const free=(x:number,z:number)=>{if(Math.abs(x)>extent||Math.abs(z)>extent)return false;const key=encode(x,z);if(!clear.has(key))clear.set(key,env.clear(...point(x,z)));return clear.get(key)!;};
 const targets:number[]=[];const directions=[[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]];
 while(queue.values.length&&settled.size<config.maxVisited){
  const item=queue.pop(),cell=cells.get(item.key)!;if(settled.has(item.key)||cell.distance!==item.distance)continue;settled.add(item.key);
  if(cell.distance>=config.length*(1-config.tolerance)&&Math.hypot(cell.x*step,cell.z*step)>=config.length*.5)targets.push(item.key);
  for(const [dx,dz]of directions){const x=cell.x+dx,z=cell.z+dz,distance=cell.distance+step*Math.hypot(dx,dz);if(distance>limit||!free(x,z)||dx&&dz&&(!free(cell.x+dx,cell.z)||!free(cell.x,cell.z+dz)))continue;
   const key=encode(x,z);if(distance>=(cells.get(key)?.distance??Infinity)||!clearWalkSegment(point(cell.x,cell.z),point(x,z),env))continue;
   cells.set(key,{x,z,distance,previous:item.key});queue.push({key,distance});
  }
 }
 // Fixed sampling of settled targets bounds expensive visibility refinement.
 const candidates:V2[][]=[];for(let i=0;i<targets.length;i+=Math.max(1,Math.floor(targets.length/100))){const path:V2[]=[];for(let key=targets[i];key!==-1;key=cells.get(key)!.previous){const c=cells.get(key)!;path.push(point(c.x,c.z));}candidates.push(path.reverse());}
 return {candidates,visited:settled.size,budgetExhausted:queue.values.length>0&&settled.size>=config.maxVisited};
}

export function generateWalkTask(env:WalkGeneratorEnvironment,config:WalkGeneratorConfig,index:number,previous:readonly GeneratedWalkTask[]=[]){
 validateWalkGeneratorConfig(config);if(!env.starts.length)throw Error('No candidate walking starts');
 const seed=(config.seed+Math.imul(index+1,2654435761))>>>0,random=walkRandom(seed),landmarkKind=chooseWalkGoalLandmark(config.landmark??'none',seed),diagnostics={attempts:0,visited:0,budgetExhausted:0,rejected:{spawn:0,length:0,turns:0,duplicate:0,landmark:0}};
 for(let attempt=0;attempt<config.attempts;attempt++){
  diagnostics.attempts++;const start=env.starts[Math.floor(random()*env.starts.length)];
  if(!env.clear(...start)){diagnostics.rejected.spawn++;continue;}
  if(previous.some(t=>Math.hypot(t.points[0][0]-start[0],t.points[0][1]-start[1])<config.minSeparation)){diagnostics.rejected.duplicate++;continue;}
  const result=searchWalkCandidates(start,env,config);diagnostics.visited+=result.visited;if(result.budgetExhausted)diagnostics.budgetExhausted++;
  for(let i=result.candidates.length-1;i>0;i--){const j=Math.floor(random()*(i+1));[result.candidates[i],result.candidates[j]]=[result.candidates[j],result.candidates[i]];}
  for(const raw of result.candidates){
   const points=smoothWalkPath(raw,env),length=walkLength(points),turnCount=effectiveWalkTurns(points).length;
   if(Math.abs(length-config.length)>config.length*config.tolerance+1e-7){diagnostics.rejected.length++;continue;}
   if(turnCount<config.minTurns||turnCount>config.maxTurns||points.slice(1).some((p,i)=>Math.hypot(p[0]-points[i][0],p[1]-points[i][1])<3)){diagnostics.rejected.turns++;continue;}
   const goal=points.at(-1)!;
   if(previous.some(t=>Math.hypot(t.points.at(-1)![0]-goal[0],t.points.at(-1)![1]-goal[1])<config.minSeparation)){diagnostics.rejected.duplicate++;continue;}
   let goalLandmark;
   if(landmarkKind)try{goalLandmark=placeWalkGoalLandmark(landmarkKind,points,env);}catch{diagnostics.rejected.landmark++;continue;}
   const instruction=walkGoalInstruction(landmarkKind);
   const task:GeneratedWalkTask={id:`rl-walk-${config.prefix}-${String(index+1).padStart(4,'0')}`,title:`${instruction.en.replace(/\.$/,'')} (${Math.round(length)} m)`,category:'outdoor-foot',mode:'walk',seed,instruction,points,length,turnCount,maxDuration:length/1.6*config.timeMultiplier,...goalLandmark?{goalLandmark}:{},validation:{status:'geometry-verified',scope:'8-neighbour shortest grid route with collision-checked visibility smoothing; not an exact continuous or traversal-aware shortest path'}};
   return {task,diagnostics};
  }
 }
 throw Error(`No valid walking task within search budget: ${JSON.stringify(diagnostics)}`);
}
