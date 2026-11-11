import type {V2} from './city-types.ts';

export function distanceToTravel(point:V2,from:V2,to:V2){
 const dx=to[0]-from[0],dz=to[1]-from[1],size=dx*dx+dz*dz;
 const t=size?Math.max(0,Math.min(1,((point[0]-from[0])*dx+(point[1]-from[1])*dz)/size)):0;
 return Math.hypot(point[0]-from[0]-t*dx,point[1]-from[1]-t*dz);
}

/** Ordered, local route tracking. Never snap to a globally nearest later leg. */
export class MinimapRouteProgress {
 private route:readonly V2[]|null=null;
 private cumulative:number[]=[];
 private progress=0;
 private segment=0;
 private previous:V2|null=null;
 get distance(){return this.progress;}
 reset(){this.route=null;this.cumulative=[];this.progress=0;this.segment=0;this.previous=null;}
 update(points:readonly V2[],position:V2,options:{paused?:boolean;corridor?:number;joinRadius?:number;limit?:number;maxStep?:number}={}):V2[]{
  const corridor=options.corridor??24,join=options.joinRadius??10;
  if(this.route!==points){
   this.route=points;this.progress=0;this.segment=0;this.previous=null;
   this.cumulative=[0];for(let i=1;i<points.length;i++)this.cumulative.push(this.cumulative[i-1]+Math.hypot(points[i][0]-points[i-1][0],points[i][1]-points[i-1][1]));
  }
  if(points.length<2)return points.map(p=>[...p]);
  const previous=this.previous;this.previous=[...position];
  const movement=previous?Math.hypot(position[0]-previous[0],position[1]-previous[1]):0;
  const limit=Math.min(this.cumulative.at(-1)!,options.limit??Infinity);
  // First observation, pause/camera motion and teleportation are not travel.
  if(previous&&!options.paused&&movement>1e-6&&movement<=(options.maxStep??60)){
   let budget=Math.min(limit,this.progress+movement*1.6),bridged=false;
   let index=this.segment;
   for(let visited=0;index<points.length-1&&visited<64;visited++,index++){
    const a=points[index],b=points[index+1],length=this.cumulative[index+1]-this.cumulative[index];
    if(length<1e-7)continue;
    const dx=b[0]-a[0],dz=b[1]-a[1];
    const t=Math.max(0,Math.min(1,((position[0]-a[0])*dx+(position[1]-a[1])*dz)/(length*length)));
    const lateral=Math.hypot(position[0]-a[0]-t*dx,position[1]-a[1]-t*dz);
    const forward=(position[0]-previous[0])*dx+(position[1]-previous[1])*dz;
    const projected=this.cumulative[index]+t*length;
    if(lateral<=corridor&&forward>1e-7&&projected>this.progress){this.progress=Math.min(projected,budget);this.segment=index;}
    // A road node is a centreline sample, not a tiny target to hit. Accept a
    // normal wide/cut corner through its swept junction area, but ONLY enter
    // the immediately adjacent leg, moving in its direction. Never search
    // globally for a nearer return leg or self-intersection.
    let next=index+1;
    while(next<points.length-1&&this.cumulative[next+1]-this.cumulative[next]<1e-7)next++;
    if(next>=points.length-1)break;
    const c=points[next+1],nx=c[0]-b[0],nz=c[1]-b[1],nl=Math.hypot(nx,nz);
    const outgoing=((position[0]-b[0])*nx+(position[1]-b[1])*nz)/nl;
    const outgoingMotion=((position[0]-previous[0])*nx+(position[1]-previous[1])*nz)/nl;
    const nextLateral=distanceToTravel(position,b,c);
    // A reversal must actually reach the end of the outgoing pass; otherwise
    // reversing on a parallel/overlapping road would erase that pass early.
    const reversal=(dx*nx+dz*nz)/(length*nl)<-.5;
    const radius=reversal?Math.min(join,8):join;
    const gap=Math.max(0,this.cumulative[next]-this.progress);
    // Road graphs contain lane seams shorter than a car (c01-n06 has a
    // 1.2 m connector between two bends). An offset vehicle can traverse it
    // without that tiny edge ever being its nearest segment. Keep direction,
    // swept-junction, distance-budget and ordered-adjacency checks, but do
    // not require a <= 8 m seam to win a nearest-segment comparison.
    const shortConnector=nl<=Math.min(join,8)&&!reversal;
    if(gap>radius||distanceToTravel(b,previous,position)>radius||
       outgoing<=1e-7||outgoingMotion<=movement*.1||nextLateral>corridor||
       (!shortConnector&&nextLateral>lateral+1e-6))break;
    if(!bridged){budget=Math.min(limit,budget+gap);bridged=true;}
    if(this.cumulative[next]>=budget)break;
    // Skipped centreline metres are solely the local corner gap, not an
    // allowance that can accumulate while stationary or off route.
    this.progress=Math.max(this.progress,this.cumulative[next]);this.segment=next;
    index=next-1;
   }
  }
  return this.remaining(limit);
 }
 remaining(limit=Infinity):V2[]{
  const points=this.route??[];
  if(points.length<2)return points.map(p=>[...p]);
  const shown=Math.min(this.progress,limit);
  let i=0;while(i<points.length-2&&this.cumulative[i+1]<=shown)i++;
  const a=points[i],b=points[i+1],length=this.cumulative[i+1]-this.cumulative[i];
  const t=length<1e-7?0:Math.max(0,Math.min(1,(shown-this.cumulative[i])/length));
  const anchor:V2=[a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t];
  // No invented straight connector from an off-route car to a future leg.
  return [anchor,...points.slice(i+1).map(p=>[...p] as V2)];
 }
}

/** Keep every not-yet-accepted task turn visible, including repeated positions. */
export function uncheckedRouteLimit(points:readonly V2[],turns:readonly V2[],checkpoint:number):number{
 if(checkpoint>=turns.length)return Infinity;
 let cursor=0,distance=0;
 for(let turn=0;turn<=checkpoint;turn++){
  const target=turns[turn];
  while(cursor<points.length&&(points[cursor][0]!==target[0]||points[cursor][1]!==target[1])){
   if(cursor>0)distance+=Math.hypot(points[cursor][0]-points[cursor-1][0],points[cursor][1]-points[cursor-1][1]);
   cursor++;
  }
  if(cursor===points.length)return 0; // Unknown correspondence: keep full route.
  if(cursor>0)distance+=Math.hypot(points[cursor][0]-points[cursor-1][0],points[cursor][1]-points[cursor-1][1]);
  if(turn===checkpoint)return distance;
  cursor++;
 }
 return Infinity;
}
