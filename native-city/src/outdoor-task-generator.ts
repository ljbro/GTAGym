import type {V2} from './city-types.ts';
import {walkLength,type GeneratedWalkTask} from './generated-walk-tasks.ts';
import {DEFAULT_WALK_GENERATOR,generateWalkTask,walkRandom,searchWalkCandidates,smoothWalkPath,effectiveWalkTurns,type WalkGeneratorEnvironment} from './outdoor-walk-generator.ts';
import {isWalkGoalLandmarkChoice,type WalkGoalLandmarkChoice} from './walk-goal-landmark.ts';
import {OUTDOOR_VEHICLES,outdoorObjective,outdoorCategory,outdoorInstruction,outdoorNpcRules,outdoorPlayerGap,type OutdoorVehicle,type OutdoorFlags,type GeneratedOutdoorTask} from './generated-outdoor-tasks.ts';
import {ESCAPE_MAX_SECONDS} from './native-escape-survival.ts';

export const OUTDOOR_GENERATOR_VERSION='outdoor-controller-v2-rendered-water';
export type OutdoorGeneratorConfig=OutdoorFlags&{vehicle:OutdoorVehicle;distance:number;minTurns:number;maxTurns:number;tolerance:number;count:number;seed:number;prefix:string;attempts:number;maxVisited:number;minSeparation:number;timeMultiplier:number;landmark:WalkGoalLandmarkChoice;startDepth:number;goalDepth:number};
export type OutdoorGeneratorEnvironment={
 walk:WalkGeneratorEnvironment;roads:{nodes:readonly V2[];edges:readonly Map<number,number>[];startIndices?:readonly number[]};
 ground:(x:number,z:number)=>number;driveClear:(x:number,z:number,yaw:number)=>boolean;driveSpawnClear?:(x:number,z:number,yaw:number)=>boolean;
 water:{starts:readonly V2[];height:number;clear:(x:number,z:number,margin?:number)=>boolean};
};
export const DEFAULT_OUTDOOR_GENERATOR:OutdoorGeneratorConfig={vehicle:'walk',distance:100,minTurns:0,maxTurns:3,tolerance:.1,count:4,seed:42,prefix:'sample',attempts:40,maxVisited:30000,minSeparation:20,timeMultiplier:1.5,follow:false,intercept:false,escape:false,landmark:'none',startDepth:0,goalDepth:0};
export function validateOutdoorGeneratorConfig(c:OutdoorGeneratorConfig){
 const objective=outdoorObjective(c);
 if(!OUTDOOR_VEHICLES.includes(c.vehicle)||c.intercept&&c.vehicle!=='drive')throw Error('Interception only supports driving a car');
 for(const key of ['distance','minTurns','maxTurns','tolerance','count','seed','attempts','maxVisited','minSeparation','timeMultiplier','startDepth','goalDepth'] as const)if(!Number.isFinite(c[key]))throw Error('Invalid '+key);
 const maximum={walk:1000,swim:1500,drive:15000,boat:6000}[c.vehicle];
 if(c.distance<20||c.distance>maximum||c.tolerance<0||c.tolerance>.3||c.minSeparation<0||c.minSeparation>2000||c.timeMultiplier<1||c.timeMultiplier>5)throw Error('Invalid distance, tolerance, separation or deadline multiplier');
 for(const key of ['seed','count','minTurns','maxTurns','attempts','maxVisited'] as const)if(!Number.isInteger(c[key])||c[key]<0)throw Error('Invalid '+key);
 if(c.seed<1||c.seed>0xffffffff||c.count<1||c.count>1000||c.maxTurns<c.minTurns||c.maxTurns>20||c.attempts<1||c.attempts>200||c.maxVisited<100||c.maxVisited>200000||!/^[a-z0-9][a-z0-9-]{0,35}$/.test(c.prefix))throw Error('Invalid seed, count, turns, budget or name');
 if(!isWalkGoalLandmarkChoice(c.landmark)||(c.landmark!=='none'&&(c.vehicle!=='walk'||objective!=='arrival')))throw Error('Goal landmarks require a walking arrival task');
 if(![c.startDepth,c.goalDepth].every(v=>v>=0&&v<=20)||(c.vehicle!=='swim'&&(c.startDepth!==0||c.goalDepth!==0)))throw Error('Only swimming supports depth');
}
export function outdoorDeadline(c:OutdoorGeneratorConfig,length:number){
 if(c.escape)return ESCAPE_MAX_SECONDS;
 const speed=c.follow||c.intercept?outdoorNpcRules({vehicle:c.vehicle,objective:outdoorObjective(c)}).speed:{walk:1.6,swim:1.4,drive:18,boat:8}[c.vehicle];
 return (length/speed+(c.vehicle==='swim'?Math.abs(c.goalDepth-c.startDepth)/1.2:0))*c.timeMultiplier+(c.follow||c.intercept?10:0);
}
function trimTo(points:readonly V2[],distance:number):V2[]{
 const out:V2[]=[[...points[0]]];let left=distance;
 for(let i=1;i<points.length;i++){const a=points[i-1],b=points[i],d=Math.hypot(b[0]-a[0],b[1]-a[1]);if(d<1e-6)continue;if(left<=d){if(left>.01)out.push([a[0]+(b[0]-a[0])*left/d,a[1]+(b[1]-a[1])*left/d]);break;}out.push([...b]);left-=d;}
 return out;
}
/** Dijkstra routes have no repeated nodes/edges or turn-padding loops. */
export function roadRouteCandidates(start:number,env:OutdoorGeneratorEnvironment,c:OutdoorGeneratorConfig){
 const g=env.roads,dist=new Map<number,number>([[start,0]]),parents=new Map<number,number>(),queue:{id:number;distance:number}[]=[{id:start,distance:0}],settled=new Set<number>(),targets:number[]=[];
 const push=(item:{id:number;distance:number})=>{let i=queue.length;queue.push(item);while(i){const p=(i-1)>>1;if(queue[p].distance<=item.distance)break;queue[i]=queue[p];i=p;}queue[i]=item;};
 const pop=()=>{const first=queue[0],last=queue.pop()!;if(queue.length){let i=0;while(i*2+1<queue.length){let k=i*2+1;if(k+1<queue.length&&queue[k+1].distance<queue[k].distance)k++;if(queue[k].distance>=last.distance)break;queue[i]=queue[k];i=k;}queue[i]=last;}return first;};
 while(queue.length&&settled.size<c.maxVisited){const v=pop();if(settled.has(v.id)||dist.get(v.id)!==v.distance)continue;settled.add(v.id);
  if(v.distance>=c.distance*(1-c.tolerance))targets.push(v.id);
  if(v.distance>c.distance*(1+c.tolerance))continue;
  for(const [next,d] of g.edges[v.id]??[]){if(!Number.isFinite(d)||d<=0||v.distance+d>c.distance*(1+c.tolerance)+150||v.distance+d>=(dist.get(next)??Infinity))continue;dist.set(next,v.distance+d);parents.set(next,v.id);push({id:next,distance:v.distance+d});}
 }
 const candidates:V2[][]=[];
 for(let i=0;i<targets.length;i+=Math.max(1,Math.floor(targets.length/100))){const p:V2[]=[];for(let id:number|undefined=targets[i];id!==undefined;id=parents.get(id))p.push([...g.nodes[id]]);p.reverse();candidates.push(trimTo(p,c.distance));}
 return candidates;
}
function driveRouteClear(points:readonly V2[],env:OutdoorGeneratorEnvironment){
 for(let i=1;i<points.length;i++){const a=points[i-1],b=points[i],length=Math.hypot(b[0]-a[0],b[1]-a[1]),yaw=Math.atan2(b[0]-a[0],b[1]-a[1]),steps=Math.ceil(length/1.5);let old=env.ground(...a);
  for(let j=0;j<=steps;j++){const x=a[0]+(b[0]-a[0])*j/steps,z=a[1]+(b[1]-a[1])*j/steps,y=env.ground(x,z);if(!env.driveClear(x,z,yaw)||!Number.isFinite(y)||Math.abs(y-old)>.4)return false;old=y;}
 }return true;
}
export function outdoorSpawn(points:readonly V2[],c:OutdoorGeneratorConfig,env:OutdoorGeneratorEnvironment){
 const a=points[0],b=points[1],yaw=Math.atan2(b[0]-a[0],b[1]-a[1]),gap=outdoorPlayerGap(c.vehicle,outdoorObjective(c));
 const clear=(p:V2)=>c.vehicle==='drive'?(env.driveSpawnClear??env.driveClear)(...p,yaw):c.vehicle==='walk'?env.walk.clear(...p):env.water.clear(...p,c.vehicle==='boat'?4:1);
 if(!gap)return clear(a)?{point:[...a] as V2,yaw,gap:0}:null;
 // NPC always starts at route distance zero. The player's safe lead-in is
 // independent, never a consumed prefix of the NPC's requested distance.
 for(const scale of [1,.85,.7]){const d=gap*scale,point:V2=[a[0]-Math.sin(yaw)*d,a[1]-Math.cos(yaw)*d];if(!clear(point))continue;
  let safe=true;for(let t=0;t<=d;t+=.5)if(!clear([a[0]-Math.sin(yaw)*t,a[1]-Math.cos(yaw)*t])){safe=false;break;}
  if(safe)return {point,yaw,gap:d};
 }return null;
}

export function generateOutdoorTask(env:OutdoorGeneratorEnvironment,c:OutdoorGeneratorConfig,index:number,previous:readonly GeneratedOutdoorTask[]=[]){
 validateOutdoorGeneratorConfig(c);const seed=((c.seed+Math.imul(index+1,2654435761))>>>0)||1,random=walkRandom(seed),objective=outdoorObjective(c),diagnostics={attempts:0,rejected:{length:0,turns:0,clearance:0,spawn:0,duplicate:0}};
 const finish=(points:V2[],landmark?:GeneratedOutdoorTask['goalLandmark'],instruction?:GeneratedOutdoorTask['instruction'])=>{
  const length=walkLength(points),turnCount=effectiveWalkTurns(points).length;
  if(Math.abs(length-c.distance)>c.distance*c.tolerance+1e-6){diagnostics.rejected.length++;return null;}
  if(turnCount<c.minTurns||turnCount>c.maxTurns){diagnostics.rejected.turns++;return null;}
  if(Math.hypot(points.at(-1)![0]-points[0][0],points.at(-1)![1]-points[0][1])<length*.4){diagnostics.rejected.length++;return null;}
  if(previous.some(t=>t.vehicle===c.vehicle&&(Math.hypot(t.points[0][0]-points[0][0],t.points[0][1]-points[0][1])<c.minSeparation||Math.hypot(t.points.at(-1)![0]-points.at(-1)![0],t.points.at(-1)![1]-points.at(-1)![1])<c.minSeparation))){diagnostics.rejected.duplicate++;return null;}
  const playerSpawn=outdoorSpawn(points,c,env);if(!playerSpawn){diagnostics.rejected.spawn++;return null;}
  const instructions=instruction??outdoorInstruction(c.vehicle,objective,c.goalDepth);
  const task:GeneratedOutdoorTask={id:`rl-outdoor-${c.prefix}-${String(index+1).padStart(4,'0')}`,title:instructions.en.replace(/\..*$/,'').slice(0,160),vehicle:c.vehicle,objective,follow:c.follow,intercept:c.intercept,escape:c.escape,category:outdoorCategory(c.vehicle,objective),seed,instruction:instructions,points,length,turnCount,maxDuration:outdoorDeadline(c,length),startDepth:c.startDepth,goalDepth:c.goalDepth,playerSpawn,routeRole:c.follow||c.intercept?'npc':c.escape?'escape-reference':'player',...landmark?{goalLandmark:landmark}:{},validation:{status:'geometry-verified',scope:'Collision-checked shortest grid/road route; movement-controller probe pending'}};
  return {task,diagnostics};
 };
 if(c.vehicle==='walk'){
  for(let i=0;i<c.attempts;i++){diagnostics.attempts++;try{
   const result=generateWalkTask(env.walk,{...DEFAULT_WALK_GENERATOR,length:c.distance,tolerance:c.tolerance,minTurns:c.minTurns,maxTurns:c.maxTurns,seed:(seed+i)>>>0,count:1,prefix:c.prefix,attempts:1,maxVisited:c.maxVisited,minSeparation:c.minSeparation,landmark:c.landmark},0,previous.filter(t=>t.vehicle==='walk') as unknown as GeneratedWalkTask[]);
   const task=finish(result.task.points,result.task.goalLandmark,c.landmark==='none'?undefined:result.task.instruction);if(task)return task;
  }catch(error){if(!(error instanceof Error)||!error.message.startsWith('No valid walking task'))throw error;}}
 }else for(let attempt=0;attempt<c.attempts;attempt++){
  diagnostics.attempts++;let candidates:V2[][];
  if(c.vehicle==='drive'){
   const starts=env.roads.startIndices;if(starts&&!starts.length)throw Error('No road starts inside the requested region');
   const start=starts?starts[Math.floor(random()*starts.length)]:Math.floor(random()*env.roads.nodes.length);if(!env.roads.nodes.length)throw Error('No native road graph');
   candidates=roadRouteCandidates(start,env,c);
  }else{
   if(!env.water.starts.length)throw Error('No safe water start candidates');const start=env.water.starts[Math.floor(random()*env.water.starts.length)],margin=c.vehicle==='boat'?7:1;
   const waterEnv:WalkGeneratorEnvironment={starts:[start],height:()=>env.water.height,clear:(x,z)=>env.water.clear(x,z,margin)};
   const cfg={...DEFAULT_WALK_GENERATOR,length:c.distance,tolerance:c.tolerance,cellSize:Math.max(2,Math.min(20,c.distance/60)),maxVisited:c.maxVisited};
   candidates=searchWalkCandidates(start,waterEnv,cfg).candidates.map(p=>smoothWalkPath(p,waterEnv));
  }
  for(let i=candidates.length-1;i>0;i--){const j=Math.floor(random()*(i+1));[candidates[i],candidates[j]]=[candidates[j],candidates[i]];}
  for(const points of candidates){if(points.length<2)continue;
   if(c.vehicle==='drive'&&!driveRouteClear(points,env)){diagnostics.rejected.clearance++;continue;}
   const result=finish(points);if(result)return result;
  }
 }
 throw Error(`No outdoor route matches the requested dimensions within budget: ${JSON.stringify(diagnostics)}`);
}
