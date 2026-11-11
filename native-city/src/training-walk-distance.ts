/** Trusted reward-side navigation; never part of a model observation.
 * Goal-anchored 8-neighbour A*: no task polyline, checkpoint or turn constraints.
 * Grid distance is an approximation, not a continuous/traversal-aware optimum.
 */
import type {V2} from './city-types.ts';
import {clearWalkSegment,type WalkGeneratorEnvironment} from './outdoor-walk-generator.ts';

export const WALK_DISTANCE_METRIC='goal-grid-walk-v1';
type Entry={x:number;z:number;g:number;f:number};
class Heap{
 a:Entry[]=[];
 push(e:Entry){let i=this.a.length;this.a.push(e);while(i){const p=(i-1)>>1;if(this.a[p].f<=e.f)break;this.a[i]=this.a[p];i=p;}this.a[i]=e;}
 pop(){const first=this.a[0],last=this.a.pop()!;if(this.a.length){let i=0;while(2*i+1<this.a.length){let c=2*i+1;if(c+1<this.a.length&&this.a[c+1].f<this.a[c].f)c++;if(this.a[c].f>=last.f)break;this.a[i]=this.a[c];i=c;}this.a[i]=last;}return first;}
}
export function walkGoalDistance(start:V2,goal:V2,env:WalkGeneratorEnvironment,{cellSize=1,maxVisited=100000}: {cellSize?:number;maxVisited?:number}={}){
 if([...start,...goal,cellSize,maxVisited].some(v=>!Number.isFinite(v))||cellSize<=0||maxVisited<1)throw Error('Invalid distance request');
 const base={metric:WALK_DISTANCE_METRIC,cellSize};
 if(!env.clear(...goal))return {...base,status:'invalid-goal',distance:null,visited:0};
 if(!env.clear(...start))return {...base,status:'unreachable',distance:null,visited:0};
 // Straight clear path is optimal in this horizontal walking metric.
 const gap=Math.hypot(goal[0]-start[0],goal[1]-start[1]);
 if(clearWalkSegment(start,goal,env))return {...base,status:'ok',distance:gap,visited:0};
 const key=(x:number,z:number)=>`${x},${z}`,point=(x:number,z:number):V2=>[goal[0]+x*cellSize,goal[1]+z*cellSize];
 const costs=new Map<string,number>([['0,0',0]]),heap=new Heap();heap.push({x:0,z:0,g:0,f:gap});
 let visited=0,best=Infinity;
 const directions=[[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]];
 while(heap.a.length){
  const e=heap.pop();if(e.g!==costs.get(key(e.x,e.z)))continue;
  if(e.f>=best)return {...base,status:'ok',distance:best,visited};
  if(visited++>=maxVisited)return {...base,status:'budget-exhausted',distance:null,visited};
  const p=point(e.x,e.z),remaining=Math.hypot(p[0]-start[0],p[1]-start[1]);
  if(remaining<=cellSize*2&&clearWalkSegment(p,start,env))best=Math.min(best,e.g+remaining);
  for(const [dx,dz] of directions){
   const x=e.x+dx,z=e.z+dz,q=point(x,z),g=e.g+Math.hypot(dx,dz)*cellSize,k=key(x,z);
   if(g>=(costs.get(k)??Infinity))continue;
   if(dx&&dz&&(!env.clear(...point(e.x+dx,e.z))||!env.clear(...point(e.x,e.z+dz))))continue;
   if(!clearWalkSegment(p,q,env))continue;
   const f=g+Math.hypot(q[0]-start[0],q[1]-start[1]);if(f>=best)continue;
   costs.set(k,g);heap.push({x,z,g,f});
  }
  }
 return {...base,status:Number.isFinite(best)?'ok':'unreachable',distance:Number.isFinite(best)?best:null,visited};
}

/** Called inside the trusted browser, with fresh caches for each state. */
export function measureWorldWalkDistance(world:any,actor:{x:number;y:number;z:number},goal:{x:number;y:number;z:number}){
 if(!world.walk||!actor||!goal||[actor.x,actor.y,actor.z,goal.x,goal.y,goal.z].some(v=>!Number.isFinite(v)))throw Error('Missing walking geometry or position');
 const heights=new Map<string,number>(),clearance=new Map<string,boolean>(),key=(x:number,z:number)=>`${x},${z}`;
 const height=(x:number,z:number)=>{const k=key(x,z);if(!heights.has(k))heights.set(k,world.walkingSurfaceHeight(x,z));return heights.get(k)!;};
 const clear=(x:number,z:number)=>{const k=key(x,z);if(!clearance.has(k))clearance.set(k,Number.isFinite(height(x,z))&&world.walk.clear(x,z,height(x,z)));return clearance.get(k)!;};
 if(Math.abs(height(goal.x,goal.z)-goal.y)>1)return {metric:WALK_DISTANCE_METRIC,status:'invalid-goal',distance:null,cellSize:1,visited:0};
 // Do not project a fallen/swimming actor through a bridge onto an upper road.
 if(Math.abs(height(actor.x,actor.z)-actor.y)>1)return {metric:WALK_DISTANCE_METRIC,status:'unsupported-height',distance:null,cellSize:1,visited:0};
 return walkGoalDistance([actor.x,actor.z],[goal.x,goal.z],{starts:[],height,clear});
}
