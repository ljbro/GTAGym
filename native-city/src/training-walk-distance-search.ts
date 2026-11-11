/** Cooperative reward-side navigation; never part of a model observation.
 * Goal-anchored 8-neighbour A*: no task polyline, checkpoint or turn constraints.
 * Grid distance is an approximation, not a continuous/traversal-aware optimum.
 */
import type {V2} from './city-types.ts';
import type {WalkGeneratorEnvironment} from './outdoor-walk-generator.ts';

export const WALK_DISTANCE_METRIC='goal-grid-walk-v1';
type Entry={x:number;z:number;g:number;f:number};
export type WalkDistanceOptions={cellSize?:number;maxVisited?:number;cutoff?:number};
type Work={visited:number;operations:number};
type DistanceResult={metric:string;status:string;distance:number|null;cellSize:number;visited:number;lowerBound?:number};
class Heap{
 a:Entry[]=[];
 push(e:Entry){let i=this.a.length;this.a.push(e);while(i){const p=(i-1)>>1;if(this.a[p].f<=e.f)break;this.a[i]=this.a[p];i=p;}this.a[i]=e;}
 pop(){const first=this.a[0],last=this.a.pop()!;if(this.a.length){let i=0;while(2*i+1<this.a.length){let c=2*i+1;if(c+1<this.a.length&&this.a[c+1].f<this.a[c].f)c++;if(this.a[c].f>=last.f)break;this.a[i]=this.a[c];i=c;}this.a[i]=last;}return first;}
}
/** Same .5 m body/height probes as clearWalkSegment, yielding between probes. */
function* segment(a:V2,b:V2,env:WalkGeneratorEnvironment,work:Work):Generator<void,boolean>{
 const steps=Math.max(1,Math.ceil(Math.hypot(b[0]-a[0],b[1]-a[1])/.5));
 let last=env.height(...a);const first=Number.isFinite(last)&&env.clear(...a);work.operations++;yield;
 if(!first)return false;
 for(let i=1;i<=steps;i++){
  const x=a[0]+(b[0]-a[0])*i/steps,z=a[1]+(b[1]-a[1])*i/steps,y=env.height(x,z);
  const free=Number.isFinite(y)&&Math.abs(y-last)<=.35&&env.clear(x,z);work.operations++;yield;
  if(!free)return false;last=y;
 }
 return true;
}
function* search(start:V2,goal:V2,env:WalkGeneratorEnvironment,{cellSize=1,maxVisited=100000,cutoff=Infinity}:WalkDistanceOptions,work:Work):Generator<void,DistanceResult>{
 if([...start,...goal,cellSize,maxVisited].some(v=>!Number.isFinite(v))||cellSize<=0||!Number.isInteger(maxVisited)||maxVisited<1||!(cutoff>0))throw Error('Invalid distance request');
 const base={metric:WALK_DISTANCE_METRIC,cellSize};
 if(!env.clear(...goal))return {...base,status:'invalid-goal',distance:null,visited:0};
 work.operations++;yield;
 if(!env.clear(...start))return {...base,status:'unreachable',distance:null,visited:0};
 work.operations++;yield;
 // Straight clear path is optimal in this horizontal walking metric.
 const gap=Math.hypot(goal[0]-start[0],goal[1]-start[1]);
 const beyond=()=>({...base,status:'at-least-cutoff',distance:null,lowerBound:cutoff,visited:work.visited});
 // A proved lower bound is sufficient ONLY when the clipped progress is zero.
 if(gap>=cutoff)return beyond();
 if(yield* segment(start,goal,env,work))return {...base,status:'ok',distance:gap,visited:0};
 const key=(x:number,z:number)=>`${x},${z}`,point=(x:number,z:number):V2=>[goal[0]+x*cellSize,goal[1]+z*cellSize];
 const costs=new Map<string,number>([['0,0',0]]),heap=new Heap();heap.push({x:0,z:0,g:0,f:gap});
 let best=Infinity;
 const directions=[[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]];
 while(heap.a.length){
  const e=heap.pop();if(e.g!==costs.get(key(e.x,e.z)))continue;
  if(e.f>=best)return {...base,status:'ok',distance:best,visited:work.visited};
  if(e.f>=cutoff)return beyond();
  if(work.visited++>=maxVisited)return {...base,status:'budget-exhausted',distance:null,visited:work.visited};
  const p=point(e.x,e.z),remaining=Math.hypot(p[0]-start[0],p[1]-start[1]);
  if(remaining<=cellSize*2&&(yield* segment(p,start,env,work)))best=Math.min(best,e.g+remaining);
  for(const [dx,dz] of directions){
   const x=e.x+dx,z=e.z+dz,q=point(x,z),g=e.g+Math.hypot(dx,dz)*cellSize,k=key(x,z);
   if(g>=(costs.get(k)??Infinity))continue;
   if(dx&&dz&&(!env.clear(...point(e.x+dx,e.z))||!env.clear(...point(e.x,e.z+dz))))continue;
   if(!(yield* segment(p,q,env,work)))continue;
   const f=g+Math.hypot(q[0]-start[0],q[1]-start[1]);if(f>=best)continue;
   costs.set(k,g);heap.push({x,z,g,f});
  }
  work.operations++;yield;
 }
 return {...base,status:Number.isFinite(best)?'ok':'unreachable',distance:Number.isFinite(best)?best:null,visited:work.visited};
}

function job(iterator:Generator<void,DistanceResult>,work:Work){
 let result:DistanceResult|undefined;
 return {advance({maxOperations=2048,maxMilliseconds=15}={}){
  if(!Number.isInteger(maxOperations)||maxOperations<1||!Number.isFinite(maxMilliseconds)||maxMilliseconds<=0||maxMilliseconds>1000)throw Error('Invalid distance slice budget');
  if(result)return result;
  const began=performance.now();
  for(let i=0;i<maxOperations;i++){
   const next=iterator.next();if(next.done){result=next.value;return result;}
   if(performance.now()-began>=maxMilliseconds)break;
  }
  return {metric:WALK_DISTANCE_METRIC,status:'pending',distance:null,visited:work.visited,operations:work.operations};
 }};
}
export function createWalkGoalDistanceSearch(start:V2,goal:V2,env:WalkGeneratorEnvironment,options:WalkDistanceOptions={}){
 const work={visited:0,operations:0};return job(search(start,goal,env,options,work),work);
}
export function walkGoalDistance(start:V2,goal:V2,env:WalkGeneratorEnvironment,options:WalkDistanceOptions={}){
 const computation=createWalkGoalDistanceSearch(start,goal,env,options);
 for(;;){const r=computation.advance();if(r.status!=='pending')return r;}
}

/** Called inside the trusted browser, with fresh caches for each state. */
function* worldSearch(world:any,actor:{x:number;y:number;z:number},goal:{x:number;y:number;z:number},options:WalkDistanceOptions,work:Work):Generator<void,DistanceResult>{
 if(!world.walk||!actor||!goal||[actor.x,actor.y,actor.z,goal.x,goal.y,goal.z].some(v=>!Number.isFinite(v)))throw Error('Missing walking geometry or position');
 const heights=new Map<string,number>(),clearance=new Map<string,boolean>(),key=(x:number,z:number)=>`${x},${z}`;
 const height=(x:number,z:number)=>{const k=key(x,z);if(!heights.has(k))heights.set(k,world.walkingSurfaceHeight(x,z));return heights.get(k)!;};
 const clear=(x:number,z:number)=>{const k=key(x,z);if(!clearance.has(k))clearance.set(k,Number.isFinite(height(x,z))&&world.walk.clear(x,z,height(x,z)));return clearance.get(k)!;};
 if(Math.abs(height(goal.x,goal.z)-goal.y)>1)return {metric:WALK_DISTANCE_METRIC,status:'invalid-goal',distance:null,cellSize:1,visited:0};
 // Do not project a fallen/swimming actor through a bridge onto an upper road.
 if(Math.abs(height(actor.x,actor.z)-actor.y)>1)return {metric:WALK_DISTANCE_METRIC,status:'unsupported-height',distance:null,cellSize:1,visited:0};
 return yield* search([actor.x,actor.z],[goal.x,goal.z],{starts:[],height,clear},options,work);
}

export function measureWorldWalkDistance(world:any,actor:{x:number;y:number;z:number},goal:{x:number;y:number;z:number},options:WalkDistanceOptions={}){
 const work={visited:0,operations:0},iterator=worldSearch(world,actor,goal,options,work);
 for(;;){const next=iterator.next();if(next.done)return next.value;}
}

// Host-private cursors retain heap, collision caches and completed results.
// Retrying an uncertain read advances the SAME calculation; no game action runs.
const jobs=new Map<string,ReturnType<typeof job>>();
export function beginWorldWalkDistance(id:string,world:any,actor:{x:number;y:number;z:number},goal:{x:number;y:number;z:number},options:WalkDistanceOptions={}){
 if(!id||typeof id!=='string')throw Error('Invalid distance job id');
 if(!jobs.has(id)){const work={visited:0,operations:0};jobs.set(id,job(worldSearch(world,actor,goal,options,work),work));}
 return id;
}
export function advanceWorldWalkDistance(id:string,options?:{maxOperations?:number;maxMilliseconds?:number}){
 const computation=jobs.get(id);if(!computation)throw Error('Unknown distance job');return computation.advance(options);
}
export function disposeWorldWalkDistance(id:string){jobs.delete(id);}
