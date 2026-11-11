/** Shared, height-aware kinematic contacts for ambient street actors.
 * No global collision bypass: an existing overlap may only become shallower
 * (or slide outward); new contacts still stop the swept movement. */
export type StreetBody={id:object;x:number;z:number;y:number;yaw:number;width:number;length:number;height:number;kind:'car'|'bike'|'person'};
export function streetOverlap(a:StreetBody,b:StreetBody):number{
 if(a.id===b.id||a.y+a.height<=b.y||b.y+b.height<=a.y)return 0;
 const dx=b.x-a.x,dz=b.z-a.z;
 if(Math.hypot(dx,dz)>(Math.hypot(a.width,a.length)+Math.hypot(b.width,b.length))/2)return 0;
 const axes=(p:StreetBody)=>[[Math.cos(p.yaw),-Math.sin(p.yaw)],[Math.sin(p.yaw),Math.cos(p.yaw)]];
 const aa=axes(a),bb=axes(b);let depth=Infinity;
 for(const [x,z] of [...aa,...bb]){
  const radius=(p:StreetBody,v:number[][])=>Math.abs(x*v[0][0]+z*v[0][1])*p.width/2+Math.abs(x*v[1][0]+z*v[1][1])*p.length/2;
  const overlap=radius(a,aa)+radius(b,bb)-Math.abs(dx*x+dz*z);
  if(overlap<=0)return 0;depth=Math.min(depth,overlap);
 }
 return depth;
}
export function streetSweepClear(from:StreetBody,to:StreetBody,others:readonly StreetBody[]):boolean{
 const angle=Math.atan2(Math.sin(to.yaw-from.yaw),Math.cos(to.yaw-from.yaw));
 const travel=Math.hypot(to.x-from.x,to.z-from.z),reach=Math.hypot(from.width,from.length)/2;
 const candidates=others.filter(b=>b.id!==from.id&&Math.hypot(b.x-from.x,b.z-from.z)<travel+reach+Math.hypot(b.width,b.length)/2+.2);
 const steps=Math.max(1,Math.ceil((travel+Math.abs(angle)*reach)/.12));
 for(const b of candidates){
  let previous=streetOverlap(from,b),distance=Math.hypot(from.x-b.x,from.z-b.z);
  for(let i=1;i<=steps;i++){
   const t=i/steps,p={...to,x:from.x+(to.x-from.x)*t,z:from.z+(to.z-from.z)*t,y:from.y+(to.y-from.y)*t,yaw:from.yaw+angle*t};
   const depth=streetOverlap(p,b),d=Math.hypot(p.x-b.x,p.z-b.z);
   if(depth>1e-5&&(previous<=1e-5||depth>previous+1e-5||(depth>=previous-1e-5&&d<distance-1e-5)))return false;
   previous=depth;distance=d;
  }
 }
 return true;
}
/** Only same-direction, same-lane traffic queues. Oncoming/adjacent actors
 * are handled by swept body contacts, not the old 8 m circular stop zone. */
export function streetQueue(a:StreetBody,others:readonly StreetBody[],gap=1.6):boolean{
 return others.some(b=>{
  if(a.id===b.id||b.kind==='person'||Math.abs(a.y-b.y)>1.5||Math.cos(a.yaw-b.yaw)<.7)return false;
  const dx=b.x-a.x,dz=b.z-a.z,forward=dx*Math.sin(a.yaw)+dz*Math.cos(a.yaw),side=dx*Math.cos(a.yaw)-dz*Math.sin(a.yaw);
  return forward>0&&forward<(a.length+b.length)/2+gap&&Math.abs(side)<(a.width+b.width)/2+.15;
 });
}
type ManeuverPoint={x:number;z:number;yaw:number;gear:1|-1};
export function streetRejoinCursor(graph:{nodes:readonly (readonly number[])[];edges:readonly Map<number,number>[]},cursor:{from:number;to:number},p:StreetBody,laneOffset:number,allowed:(a:number,b:number)=>boolean){
 const queue=[{from:cursor.from,to:cursor.to,depth:0}],seen=new Set<string>();
 for(let i=0;i<queue.length&&i<80;i++){
  const edge=queue[i],key=edge.from+':'+edge.to;if(seen.has(key))continue;seen.add(key);
  const a=graph.nodes[edge.from],b=graph.nodes[edge.to],dx=b[0]-a[0],dz=b[1]-a[1],len2=dx*dx+dz*dz,yaw=Math.atan2(dx,dz);
  const x=p.x-Math.cos(yaw)*laneOffset,z=p.z+Math.sin(yaw)*laneOffset,t=((x-a[0])*dx+(z-a[1])*dz)/Math.max(.001,len2);
  if(t>=0&&t<=1&&Math.cos(yaw-p.yaw)>.995&&Math.hypot(x-a[0]-dx*t,z-a[1]-dz*t)<.2)return {from:edge.from,to:edge.to,t};
  if(edge.depth<8)for(const to of graph.edges[edge.to].keys())if(to!==edge.from&&allowed(edge.to,to))queue.push({from:edge.to,to,depth:edge.depth+1});
 }
 return null;
}
export type StreetRecovery={offsetX:number;offsetZ:number;wait:number;side:number;plan?:ManeuverPoint[];index?:number;pause?:number};
/** Arc-length sampled bicycle motion: reverse straight, turn out, pass, turn
 * back. Every displacement is along the wheels' midpoint heading. */
function bypassPlan(start:StreetBody,side:number,back:number,offset:number):ManeuverPoint[]{
 const radius=start.kind==='bike'?2.5:4.5,angle=Math.acos(1-offset/(2*radius));
 const points:ManeuverPoint[]=[],p={x:start.x,z:start.z,yaw:start.yaw};
 const segment=(distance:number,curvature:number,gear:1|-1)=>{
  const count=Math.ceil(distance/.1),ds=distance/count*gear;
  for(let i=0;i<count;i++){const turn=ds*curvature,mid=p.yaw+turn/2;p.x+=Math.sin(mid)*ds;p.z+=Math.cos(mid)*ds;p.yaw+=turn;points.push({...p,gear});}
 };
 segment(back,0,-1);
 segment(radius*angle,side/radius,1);segment(radius*angle,-side/radius,1);
 segment(start.length*2+2,0,1);
 segment(radius*angle,-side/radius,1);segment(radius*angle,side/radius,1);
 return points;
}
export function recoverStreetMotion(before:StreetBody,desired:StreetBody,state:StreetRecovery,dt:number,others:readonly StreetBody[],staticClear:(a:StreetBody,b:StreetBody)=>boolean,held=false,rejoinAllowed:(p:StreetBody)=>boolean=()=>true):{body:StreetBody;advance:boolean;rejoin?:boolean}{
 const clear=(a:StreetBody,b:StreetBody)=>streetSweepClear(a,b,others)&&staticClear(a,b);
 dt=Math.min(.1,Math.max(0,dt));
 if(held||dt===0)return {body:before,advance:false};
 if(!state.plan&&clear(before,desired)){state.wait=0;return {body:desired,advance:true};}
 if(!state.plan){
  state.wait+=dt;if(state.wait<1.2)return {body:before,advance:false};
  // Retry at bounded frequency. The full reverse/turn path must be safe before
  // backing up; rear traffic/walls never get ignored to force an escape.
  state.wait=.7;
  search:for(const back of [3,4.5,6])for(const side of [state.side,-state.side]){
   const plan=bypassPlan(before,side,back,before.kind==='bike'?2.2:3.5);
   if(!rejoinAllowed({...before,...plan.at(-1)!}))continue;
   let p=before,valid=true;
   for(const q of plan){const next={...before,...q};if(!clear(p,next)){valid=false;break;}p=next;}
   if(valid){state.plan=plan;state.index=0;state.pause=0;state.side=side;break search;}
  }
  if(!state.plan)return {body:before,advance:false};
 }
 if((state.pause??0)>0){state.pause=Math.max(0,state.pause!-dt);return {body:before,advance:false};}
 const plan=state.plan;let index=state.index??0,p=before,budget=dt*(plan[index].gear<0?1.4:2.4);
 while(budget>1e-6&&index<plan.length){
  const target=plan[index],distance=Math.hypot(target.x-p.x,target.z-p.z),t=Math.min(1,budget/Math.max(1e-9,distance));
  const next={...p,x:p.x+(target.x-p.x)*t,z:p.z+(target.z-p.z)*t,yaw:p.yaw+Math.atan2(Math.sin(target.yaw-p.yaw),Math.cos(target.yaw-p.yaw))*t};
  if(!clear(p,next))break;p=next;budget-=distance*t;
  if(t<1)break;index++;
  if(index<plan.length&&plan[index].gear!==target.gear){state.pause=.35;break;}
 }
 state.index=index;
 if(index===plan.length){state.plan=undefined;state.index=0;state.wait=0;state.offsetX=state.offsetZ=0;return {body:p,advance:false,rejoin:true};}
 return {body:p,advance:false};
}
