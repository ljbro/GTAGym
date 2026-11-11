import type {V2} from './city-types.ts';
import {MINIMAP_FRAME,minimapProject} from './minimap-viewport.ts';
export type RouteJoin={point:V2;along:number;index:number;tangent:V2;penalty:number};
export type RouteConnection={points:V2[];join:RouteJoin};
export type RouteRejoin=(position:V2,candidates:RouteJoin[],route:readonly V2[])=>RouteConnection|null;
/** Yellow marker shares the exact rotation/perspective used by the map plane.
 * Beyond the perspective horizon, use the unflipped bearing, never mirrored XY. */
export function minimapGoalMarker(player:V2,target:readonly number[],yaw:number,scale:number,tilt:number){
 const p=minimapProject(target[0]-player[0],target[1]-player[1],yaw,scale,tilt);
 const {width,height,playerX,playerY,markerInset:m}=MINIMAP_FRAME;
 if(p.den>0&&p.x>=m&&p.x<=width-m&&p.y>=m&&p.y<=height-m)return {x:p.x,y:p.y,edge:false};
 const length=Math.hypot(p.rx,p.ry);
 if(!Number.isFinite(length)||length<1e-9)return {x:playerX,y:playerY,edge:false};
 const ux=p.rx/length,uy=p.ry/length;
 const tx=ux>0?(width-m-playerX)/ux:ux<0?(m-playerX)/ux:Infinity;
 const ty=uy>0?(height-m-playerY)/uy:uy<0?(m-playerY)/uy:Infinity,t=Math.min(tx,ty);
 return {x:playerX+ux*t,y:playerY+uy*t,edge:true};
}
/** Display-only projection: trim travelled geometry, keep every future bend.
 * No checkpoint gates or monotonic progress lock; reversing can extend the line.
 * Route identity + epoch reset continuity on task switch, restart and teleport. */
export class MinimapNavigation {
 private route:readonly V2[]|null=null;private cumulative:number[]=[];
 private previousAlong:number|null=null;private previousPosition:V2|null=null;
 private tangent:V2=[0,0];private epoch:unknown;
 update(points:readonly V2[],position:V2,epoch:unknown=0,connect?:(a:V2,b:V2)=>V2[]|null,rejoin?:RouteRejoin){
  if(this.route!==points||this.epoch!==epoch){this.route=points;this.epoch=epoch;this.previousAlong=null;this.previousPosition=null;this.cumulative=[0];for(let i=1;i<points.length;i++)this.cumulative.push(this.cumulative[i-1]+Math.hypot(points[i][0]-points[i-1][0],points[i][1]-points[i-1][1]));}
  if(!points.length)return {points:[] as V2[],along:0,lateral:0,connector:[] as V2[]};
  // Predict local motion along the last segment to distinguish overlapping legs.
  const predicted=this.previousAlong===null?null:this.previousAlong+(this.previousPosition?(position[0]-this.previousPosition[0])*this.tangent[0]+(position[1]-this.previousPosition[1])*this.tangent[1]:0);
  let best=Infinity,along=0,lateral=0,index=points.length-1,projection:V2=[...points.at(-1)!],tangent:V2=[0,0];
  for(let i=1;i<points.length;i++){
   const a=points[i-1],b=points[i],dx=b[0]-a[0],dz=b[1]-a[1],size=this.cumulative[i]-this.cumulative[i-1];if(size<1e-8)continue;
   const t=Math.max(0,Math.min(1,((position[0]-a[0])*dx+(position[1]-a[1])*dz)/(size*size)));
   const d=Math.hypot(position[0]-a[0]-dx*t,position[1]-a[1]-dz*t),candidate=this.cumulative[i-1]+size*t;
   // Bounded continuity preference: lateral drift must not erase a future loop,
   // but a clearly nearer later road can be reacquired without hitting old nodes.
   const score=d+(predicted===null?0:Math.min(80,Math.abs(candidate-predicted))*.2);
   if(score<best-1e-8||(Math.abs(score-best)<1e-8&&predicted!==null&&Math.abs(candidate-predicted)<Math.abs(along-predicted))){best=score;along=candidate;lateral=d;index=i;projection=[a[0]+dx*t,a[1]+dz*t];tangent=[dx/size,dz/size];}
  }
  this.previousAlong=along;this.previousPosition=[...position];this.tangent=tangent;
  // If no safe reconnection exists, show the original road route without a
  // misleading line across water/walls. The yellow destination stays visible.
  let connector:V2[]|null;
  if(rejoin){
   const preferred:RouteJoin={point:projection,along,index,tangent,penalty:0},candidates=[preferred];
   // A local window, not a shortcut to the end of a looping task. Sample actual
   // road segments rather than just the one perpendicular nearest projection.
   const lo=Math.max(0,along-36),hi=Math.min(this.cumulative.at(-1)!,along+120);
   for(let i=1;i<points.length;i++){
    const length=this.cumulative[i]-this.cumulative[i-1];if(length<1e-8)continue;
    const start=Math.max(lo,this.cumulative[i-1]),end=Math.min(hi,this.cumulative[i]);if(start>end)continue;
    const a=points[i-1],b=points[i],dir:V2=[(b[0]-a[0])/length,(b[1]-a[1])/length];
    const steps=Math.max(1,Math.ceil((end-start)/12));
    for(let j=0;j<=steps;j++){
     const at=start+(end-start)*j/steps;if(Math.abs(at-along)<1)continue;
     const p:V2=[a[0]+dir[0]*(at-this.cumulative[i-1]),a[1]+dir[1]*(at-this.cumulative[i-1])];
     candidates.push({point:p,along:at,index:i,tangent:dir,penalty:Math.abs(at-along)*.35});
    }
   }
   const result=rejoin(position,candidates,points);
   if(result){
    // If the detour already reaches the road on its way to the chosen join,
    // splice there. Otherwise the suffix can send the car back over that detour.
    const clean=spliceAtFirstRoadContact(result,points,this.cumulative,lo,hi);
    connector=clean.points;({along,index,tangent}=clean.join);projection=clean.join.point;
   }else connector=null;
  }else connector=connect?connect(position,projection):[[...position] as V2,[...projection] as V2];
  const remaining:V2[]=[];
  for(const p of [...(connector??[]),projection,...points.slice(index)])if(!remaining.length||Math.hypot(p[0]-remaining.at(-1)![0],p[1]-remaining.at(-1)![1])>1e-6)remaining.push([...p]);
  return {points:remaining,along,lateral,connector:connector??[]};
 }
}

/** Trim only the new connector, never erase deliberate loops in the task. */
function spliceAtFirstRoadContact(connection:RouteConnection,route:readonly V2[],cumulative:number[],lo:number,hi:number):RouteConnection{
 const path=connection.points,cross=(a:V2,b:V2)=>a[0]*b[1]-a[1]*b[0];
 for(let k=1;k<path.length;k++){
  const a=path[k-1],b=path[k],v:V2=[b[0]-a[0],b[1]-a[1]];let first:{t:number;join:RouteJoin}|null=null;
  for(let i=1;i<route.length;i++){
   const c=route[i-1],d=route[i],u:V2=[d[0]-c[0],d[1]-c[1]],length=cumulative[i]-cumulative[i-1];
   if(length<1e-8||cumulative[i]<lo||cumulative[i-1]>hi)continue;
   const offset:V2=[c[0]-a[0],c[1]-a[1]],den=cross(v,u);let t:number,s:number;
   if(Math.abs(den)<1e-8){
    if(Math.abs(cross(offset,v))>1e-6||Math.hypot(...v)<1e-8)continue;
    const vv=v[0]*v[0]+v[1]*v[1],t0=(offset[0]*v[0]+offset[1]*v[1])/vv,t1=t0+(u[0]*v[0]+u[1]*v[1])/vv;
    t=Math.max(0,Math.min(t0,t1));if(t>Math.min(1,Math.max(t0,t1))+1e-8)continue;
    s=((a[0]+t*v[0]-c[0])*u[0]+(a[1]+t*v[1]-c[1])*u[1])/(length*length);
   }else{t=cross(offset,u)/den;s=cross(offset,v)/den;}
   if(t< -1e-8||t>1+1e-8||s< -1e-8||s>1+1e-8)continue;
   const at=cumulative[i-1]+Math.max(0,Math.min(1,s))*length;
   if(at<lo-1e-6||at>hi+1e-6||at>connection.join.along+1e-6)continue;
   // Equal-position repeated legs must not jump over a deliberate future loop.
   if(first&&(t>first.t+1e-8||Math.abs(t-first.t)<1e-8&&at>=first.join.along))continue;
   first={t,join:{point:[a[0]+t*v[0],a[1]+t*v[1]],along:at,index:i,tangent:[u[0]/length,u[1]/length],penalty:0}};
  }
  if(first)return {points:[...path.slice(0,k),first.join.point],join:first.join};
 }
 return connection;
}
