import type {V2} from './city-types.ts';
import {drivingSurfaceStepClear} from './driving-surface.ts';
import type {RouteJoin,RouteConnection} from './minimap-navigation.ts';

type Terrain={blocked:(x:number,z:number)=>boolean;height:(x:number,z:number)=>number;cost?:(x:number,z:number)=>number};
/** Bounded local A*: only reconnect to the original route, never replace its
 * remaining bends. Every edge and smoothed shortcut is checked, including car
 * width and slope. Failure means no connector, never an invented straight line.
 * Static obstacles only: a passing NPC must not make the route flicker. */
export class MinimapRejoin {
 private cached:{a:V2;b:V2;epoch:unknown;path:V2[]|null}|null=null;
 private routeCache:{a:V2;epoch:unknown;route:readonly V2[];preferred:number;result:RouteConnection|null}|null=null;
 private searching=false;private heights=new Map<string,number>();private obstacles=new Map<string,boolean>();
 constructor(private terrain:Terrain,private radius=1.35,private sampleSpacing=.75){}
 reset(){this.cached=null;this.routeCache=null;}
 clear(a:V2,b:V2,egress=false){
  const height=(x:number,z:number)=>{
   if(!this.searching)return this.terrain.height(x,z);const key=x.toFixed(4)+','+z.toFixed(4);let h=this.heights.get(key);
   if(h===undefined){h=this.terrain.height(x,z);this.heights.set(key,h);}return h;
  };
  // Same substep/kerb threshold as physical movement, not a looser visual slope.
  if(!drivingSurfaceStepClear(height,{x:a[0],z:a[1]},{x:b[0],z:b[1]}))return false;
  const blocked=(x:number,z:number)=>{
   if(!this.searching)return this.terrain.blocked(x,z);const key=x.toFixed(4)+','+z.toFixed(4);let b=this.obstacles.get(key);
   if(b===undefined){b=this.terrain.blocked(x,z);this.obstacles.set(key,b);}return b;
  };
  const offsets=[[0,0],[this.radius,0],[-this.radius,0],[0,this.radius],[0,-this.radius]];
  // Only an already-overlapping safety margin may shrink away from an obstacle.
  // The centre must always be clear; never enter a new blocked probe, pass through
  // a wall, or carry this exception beyond the first few metres of a connector.
  let mask=egress?offsets.map(([dx,dz])=>blocked(a[0]+dx,a[1]+dz)):offsets.map(()=>false);
  if(mask[0])return false;
  const d=Math.hypot(b[0]-a[0],b[1]-a[1]),steps=Math.max(1,Math.ceil(d/this.sampleSpacing));
  for(let i=0;i<=steps;i++){
   const x=a[0]+(b[0]-a[0])*i/steps,z=a[1]+(b[1]-a[1])*i/steps;
   const next=offsets.map(([dx,dz])=>blocked(x+dx,z+dz));
   if(next.some((hit,j)=>hit&&(!mask[j]||d*i/steps>6)))return false;
   mask=next;
  }
  return !mask.some(Boolean);
 }
 /** One multi-goal search, not one expensive A* per proposed attachment point. */
 connectRoute(a:V2,candidates:RouteJoin[],route:readonly V2[],epoch:unknown=0,yaw=0):RouteConnection|null{
  const preferred=candidates[0];if(!preferred)return null;
  // On the road keep the exact projection and all future bends.
  if(distance(a,preferred.point)<4&&this.clear(a,preferred.point))return {points:[[...a],[...preferred.point]],join:preferred};
  const cache=this.routeCache;
  if(cache&&cache.route===route&&cache.epoch===epoch&&distance(a,cache.a)<96&&Math.abs(cache.preferred-preferred.along)<48){
   if(cache.result&&cache.result.join.along>=preferred.along-2){
    const path=cache.result.points;
    // Consume connector vertices as the car moves. Reusing a stale first vertex
    // would draw a backwards hook every time the car passed that vertex.
    for(let i=path.length-1;i>=1;i--)if(this.clear(a,path[i],true))return {points:[[...a],...path.slice(i)],join:cache.result.join};
   }else if(!cache.result&&distance(a,cache.a)<.75)return null;
  }
  this.searching=true;let result:RouteConnection|null;
  try{result=this.searchMany(a,candidates,yaw);}finally{this.searching=false;this.heights.clear();this.obstacles.clear();}
  this.routeCache={a:[...a],epoch,route,preferred:preferred.along,result};return result;
 }
 connect(a:V2,b:V2,epoch:unknown=0):V2[]|null{
  if(this.clear(a,b))return [[...a],[...b]];
  const c=this.cached;
  if(c&&c.epoch===epoch&&Math.hypot(a[0]-c.a[0],a[1]-c.a[1])<3&&Math.hypot(b[0]-c.b[0],b[1]-c.b[1])<3){
   if(!c.path)return null;
   const middle=c.path.slice(1,-1);
   if(middle.length&&this.clear(a,middle[0])&&this.clear(middle.at(-1)!,b))return [[...a],...middle,[...b]];
  }
  this.searching=true;let path:V2[]|null;
  try{path=this.searchMany(a,[{point:b,along:0,index:0,tangent:[0,0],penalty:0}],0)?.points??null;}finally{this.searching=false;this.heights.clear();this.obstacles.clear();}
  this.cached={a:[...a],b:[...b],epoch,path};return path;
 }
 private searchMany(a:V2,candidates:RouteJoin[],yaw:number):RouteConnection|null{
  const goals=candidates.filter(c=>distance(a,c.point)<=640&&this.clear(c.point,c.point));
  if(!goals.length||this.terrain.blocked(...a))return null;
  const heading:V2=[Math.sin(yaw),Math.cos(yaw)];
  const turnPenalty=(from:V2,to:V2,tangent:V2,weight:number)=>{
   const d=distance(from,to);return d<.01?0:weight*Math.max(0,-((to[0]-from[0])*tangent[0]+(to[1]-from[1])*tangent[1])/d);
  };
  const startCost=(p:V2)=>distance(a,p)+turnPenalty(a,p,heading,5);
  const endCost=(p:V2,c:RouteJoin)=>distance(p,c.point)+c.penalty+turnPenalty(p,c.point,c.tangent,24);
  let bestCost=Infinity,best:RouteConnection|null=null;
  for(const c of goals)if(this.clear(a,c.point,true)){
   const cost=startCost(c.point)+c.penalty+turnPenalty(a,c.point,c.tangent,24);
   if(cost<bestCost){bestCost=cost;best={points:[[...a],[...c.point]],join:c};}
  }
  // A clear, non-reversing local join is preferable to introducing grid bends.
  if(best&&bestCost<=Math.min(...goals.map(c=>distance(a,c.point)+c.penalty))+8)return best;
  const step=3,margin=90,minX=Math.floor((Math.min(a[0],...goals.map(c=>c.point[0]))-margin)/step)*step,minZ=Math.floor((Math.min(a[1],...goals.map(c=>c.point[1]))-margin)/step)*step;
  const width=Math.ceil((Math.max(a[0],...goals.map(c=>c.point[0]))+margin-minX)/step)+1,depth=Math.ceil((Math.max(a[1],...goals.map(c=>c.point[1]))+margin-minZ)/step)+1;
  const key=(x:number,z:number)=>z*width+x,point=(k:number):V2=>[minX+k%width*step,minZ+Math.floor(k/width)*step];
  const scores=new Map<number,number>(),parents=new Map<number,number>(),closed=new Set<number>();
  const heuristic=(p:V2)=>Math.min(...goals.map(c=>distance(p,c.point)+c.penalty));
  const heap:{k:number;g:number;f:number}[]=[];
  const push=(v:typeof heap[number])=>{heap.push(v);let i=heap.length-1;while(i){const p=(i-1)>>1;if(heap[p].f<=v.f)break;heap[i]=heap[p];i=p;}heap[i]=v;};
  const pop=()=>{const first=heap[0],v=heap.pop()!;if(heap.length){let i=0;while(i*2+1<heap.length){let j=i*2+1;if(j+1<heap.length&&heap[j+1].f<heap[j].f)j++;if(heap[j].f>=v.f)break;heap[i]=heap[j];i=j;}heap[i]=v;}return first;};
  const ax=Math.round((a[0]-minX)/step),az=Math.round((a[1]-minZ)/step);
  for(let dx=-2;dx<=2;dx++)for(let dz=-2;dz<=2;dz++){
   const k=key(ax+dx,az+dz),p=point(k);if(!this.clear(a,p,true))continue;
   const g=startCost(p);scores.set(k,g);parents.set(k,-1);push({k,g,f:g+heuristic(p)});
  }
  const edgeCache=new Map<string,boolean>();
  while(heap.length&&closed.size<14000){
   const {k,g,f}=pop();if(f>=bestCost)break;if(closed.has(k))continue;closed.add(k);const p=point(k);
   for(const c of goals)if(distance(p,c.point)<=step*2&&g+endCost(p,c)<bestCost&&this.clear(p,c.point)){
    const raw:V2[]=[[...c.point]];let n=k;while(n!==-1){raw.push(point(n));n=parents.get(n)!;}raw.push([...a]);raw.reverse();
    const smooth:V2[]=[raw[0]];for(let i=0;i<raw.length-1;){let j=raw.length-1;while(j>i+1&&!this.clear(raw[i],raw[j],i===0))j--;smooth.push(raw[j]);i=j;}
    best={points:smooth,join:c};bestCost=g+endCost(p,c);
   }
   const x=k%width,z=Math.floor(k/width);
   for(let dx=-1;dx<=1;dx++)for(let dz=-1;dz<=1;dz++){
    if(!dx&&!dz||x+dx<0||x+dx>=width||z+dz<0||z+dz>=depth)continue;
    const nk=key(x+dx,z+dz);if(closed.has(nk))continue;const q=point(nk),ek=k<nk?k+':'+nk:nk+':'+k;
    let clear=edgeCache.get(ek);if(clear===undefined){clear=this.clear(p,q);edgeCache.set(ek,clear);}if(!clear)continue;
    const ng=g+Math.hypot(dx,dz)*step*Math.max(1,this.terrain.cost?.(...q)??1);
    if(ng>=(scores.get(nk)??Infinity))continue;scores.set(nk,ng);parents.set(nk,k);push({k:nk,g:ng,f:ng+heuristic(q)});
   }
  }
  return best;
 }
}
const distance=(a:V2,b:V2)=>Math.hypot(a[0]-b[0],a[1]-b[1]);
