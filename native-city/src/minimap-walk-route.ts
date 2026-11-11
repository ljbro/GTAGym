import type {V2} from './city-types.ts';

type Terrain={height:(x:number,z:number)=>number;clear:(x:number,z:number,y:number)=>boolean};
/** Local pedestrian GPS to the target's CURRENT position. Does not use the
 * target's future route or snap pedestrians onto the motor-vehicle road graph.
 * Body clearance is supplied by CityWalk; abrupt drops/rises are not walkable.
 */
export class MinimapWalkRoute {
 constructor(private terrain:Terrain){}
 clear(a:V2,b:V2){
  const steps=Math.max(1,Math.ceil(Math.hypot(b[0]-a[0],b[1]-a[1])/.25));
  let previous=this.terrain.height(...a);
  for(let i=0;i<=steps;i++){
   const x=a[0]+(b[0]-a[0])*i/steps,z=a[1]+(b[1]-a[1])*i/steps,y=this.terrain.height(x,z);
   if(!Number.isFinite(y)||Math.abs(y-previous)>.35||!this.terrain.clear(x,z,y))return false;
   previous=y;
  }
  return true;
 }
 plan(a:V2,b:V2):V2[]{
  if(this.clear(a,b))return [[...a],[...b]];
  if(!this.clear(a,a)||!this.clear(b,b)||Math.hypot(b[0]-a[0],b[1]-a[1])>64)return [];
  // Following fails at 20 m separation. A bounded local search also covers
  // corners/park furniture without a city-wide search inside the render loop.
  const margin=12,minX=Math.floor(Math.min(a[0],b[0])-margin),minZ=Math.floor(Math.min(a[1],b[1])-margin);
  const width=Math.ceil(Math.max(a[0],b[0])+margin-minX)+1,depth=Math.ceil(Math.max(a[1],b[1])+margin-minZ)+1;
  const point=(k:number):V2=>[minX+k%width,minZ+Math.floor(k/width)];
  const costs=new Map<number,number>(),parents=new Map<number,number>(),closed=new Set<number>();
  const heap:{k:number;g:number;f:number}[]=[];
  const push=(e:typeof heap[number])=>{let i=heap.length;heap.push(e);while(i){const p=(i-1)>>1;if(heap[p].f<=e.f)break;heap[i]=heap[p];i=p;}heap[i]=e;};
  const pop=()=>{const first=heap[0],last=heap.pop()!;if(heap.length){let i=0;while(i*2+1<heap.length){let c=i*2+1;if(c+1<heap.length&&heap[c+1].f<heap[c].f)c++;if(heap[c].f>=last.f)break;heap[i]=heap[c];i=c;}heap[i]=last;}return first;};
  const distance=(p:V2,q:V2)=>Math.hypot(p[0]-q[0],p[1]-q[1]);
  const ax=Math.round(a[0]-minX),az=Math.round(a[1]-minZ);
  for(let dx=-1;dx<=1;dx++)for(let dz=-1;dz<=1;dz++){
   const k=(az+dz)*width+ax+dx,p=point(k);if(!this.clear(a,p))continue;
   const g=distance(a,p);costs.set(k,g);parents.set(k,-1);push({k,g,f:g+distance(p,b)});
  }
  const started=performance.now(),edges=new Map<string,boolean>();
  while(heap.length&&closed.size<2048&&performance.now()-started<12){
   const {k,g}=pop();if(closed.has(k)||g!==costs.get(k))continue;closed.add(k);const p=point(k);
   if(distance(p,b)<=1.5&&this.clear(p,b)){
    const raw:V2[]=[[...b]];for(let n=k;n!==-1;n=parents.get(n)!)raw.push(point(n));raw.push([...a]);raw.reverse();
    const smooth:V2[]=[raw[0]];
    for(let i=0;i<raw.length-1;){let j=raw.length-1;while(j>i+1&&!this.clear(raw[i],raw[j]))j--;smooth.push(raw[j]);i=j;}
    return smooth;
   }
   const x=k%width,z=Math.floor(k/width);
   for(let dx=-1;dx<=1;dx++)for(let dz=-1;dz<=1;dz++){
    if(!dx&&!dz||x+dx<0||x+dx>=width||z+dz<0||z+dz>=depth)continue;
    const next=(z+dz)*width+x+dx,ng=g+Math.hypot(dx,dz);if(closed.has(next)||ng>=(costs.get(next)??Infinity))continue;
    const edge=k<next?`${k}:${next}`:`${next}:${k}`,q=point(next);
    let clear=edges.get(edge);if(clear===undefined){clear=this.clear(p,q);edges.set(edge,clear);}if(!clear)continue;
    costs.set(next,ng);parents.set(next,k);push({k:next,g:ng,f:ng+distance(q,b)});
   }
  }
  // The blue target stays visible; never invent a line through a wall on failure.
  return [];
 }
}
