import {getNavigationRouteIndex} from './vendor/offmap-navigation/index.js';
import type {Point,SourceTask} from './offmap-navigation-core.ts';
import {ESCAPE_CAPTURE_SECONDS} from './native-escape-survival.ts';

export const POLICE_RULES=Object.freeze({
 version:'gta-sz-police-sector-v2',intervalSeconds:10,radius:12,angleDegrees:90,captureSeconds:ESCAPE_CAPTURE_SECONDS,
 pursuitSpeedMultiplier:1.25,
 walkMaxSpeed:3.8,
  frontOffset:2.5,verticalTolerance:2.5,
  // Legacy rear-trail distances. Native mode uses safe multi-direction minimap edges.
  spawnDistance:118,walkSpawnDistance:68,
 initialSpawnDistanceScale:.8,
 retireDistance:260,trailRetention:420,
});
export type PoliceUnit={id:string;position:Point;yaw:number;speed:number;cursor:number;bornAt:number;scheduledAt:number;stuckSeconds:number;kind?:'foot'|'vehicle';speedLimit?:number};
export type PoliceReinforcements={
 mode:'minimap';
 visible:(point:Point,player:Point,yaw:number,speed:number)=>boolean;
 snap?:(point:Point)=>Point|null;
 approach?:(from:Point,to:Point)=>Point[];
 /** Do not spawn an invisible officer while its animated model is still loading. */
 ready?:()=>boolean;
};
type Breadcrumb=Point&{along:number};
type Blocked=(p:Point,radius:number)=>boolean;
const clamp=(n:number,a:number,b:number)=>Math.max(a,Math.min(b,n));
const angle=(a:number)=>Math.atan2(Math.sin(a),Math.cos(a));
const horizontal=(a:Point,b:Point)=>Math.hypot(a.x-b.x,a.z-b.z);
const forward=(yaw:number)=>({x:-Math.sin(yaw),z:-Math.cos(yaw)});

/** These are pursuers chasing the PLAYER, not fleeing targets in player-led chase tasks.
 * Boats and aircraft keep their existing encounters: never put a police car on water / in air. */
export function usesPolicePursuit(task:SourceTask){
 const n=task.navigation;
 return n.category==='escape'&&!n.indoors&&['drive','walk'].includes(n.mode)&&!n.helicopter;
}
export function policeSectorOrigin(unit:Pick<PoliceUnit,'position'|'yaw'|'kind'>):Point{
 const f=forward(unit.yaw),offset=unit.kind==='foot'?.4:POLICE_RULES.frontOffset;return {x:unit.position.x+f.x*offset,y:unit.position.y,z:unit.position.z+f.z*offset};
}
/** Source RH coordinates throughout; shared by capture and minimap drawing. Boundary is inclusive. */
export function insidePoliceSector(unit:Pick<PoliceUnit,'position'|'yaw'|'kind'>,point:Point){
 const o=policeSectorOrigin(unit),dx=point.x-o.x,dz=point.z-o.z,d=Math.hypot(dx,dz),f=forward(unit.yaw);
 return Math.abs(point.y-o.y)<=POLICE_RULES.verticalTolerance+1e-8&&d<=POLICE_RULES.radius+1e-8&&(d<1e-8||(dx*f.x+dz*f.z)/d>=Math.cos(POLICE_RULES.angleDegrees*Math.PI/360)-1e-8);
}
export function policeSectorPolygon(unit:Pick<PoliceUnit,'position'|'yaw'|'kind'>,segments=24):Point[]{
 const o=policeSectorOrigin(unit),half=POLICE_RULES.angleDegrees*Math.PI/360;
 return [o,...Array.from({length:segments+1},(_,i)=>{const f=forward(unit.yaw-half+2*half*i/segments);return {x:o.x+f.x*POLICE_RULES.radius,y:o.y,z:o.z+f.z*POLICE_RULES.radius};})];
}

/** Deterministic, game-time-only reinforcements. Every unit integrates its own pose;
 * it follows the player's actual breadcrumb trail, rather than teleporting behind the player. */
export class NavigationPolicePursuit{
 readonly rules=POLICE_RULES;
 units:PoliceUnit[]=[];elapsed=0;nextSpawnAt=0;spawned=0;retired=0;safeSeconds=0;
 capturedBy:string|null=null;capturedAt:number|null=null;exposureSeconds=0;unscannedSeconds=0;
 readonly events:{id:string;scheduledAt:number;spawnedAt:number;position:Point;player:Point;playerYaw:number}[]=[];
 private pending:{at:number;initial?:boolean}[]=[];private initialWaveQueued=false;private retryAt=0;private breadcrumbs:Breadcrumb[]=[];private total=0;private topSpeed:number;
 private route;private onFoot:boolean;private escapeDistance:number;
 private speedMultiplier:number;
 private approachPaths=new Map<string,{points:Point[];next:number;refreshAt:number;direct:boolean}>();
 constructor(task:SourceTask,maxPlayerSpeed:number,private reinforcements?:PoliceReinforcements,private training?:{initialUnits:{position:Point;yaw:number;speed:number}[];reinforcementSpeeds?:readonly number[]}){
  this.route=getNavigationRouteIndex(task.navigation.path);this.onFoot=task.navigation.mode==='walk';
  // Only the current native minimap encounters are rebalanced; archived rear-trail missions retain their tuning.
  this.speedMultiplier=reinforcements?POLICE_RULES.pursuitSpeedMultiplier:1;
  // The walking limit is the final speed, without the vehicle pursuit multiplier.
  this.topSpeed=this.onFoot?(reinforcements?POLICE_RULES.walkMaxSpeed:3.6):Math.max(10,Math.min(28,maxPlayerSpeed*.92))*this.speedMultiplier;
  this.escapeDistance=Math.min(this.onFoot?10:23,this.route.totalDistance*.4);
  if(reinforcements)this.nextSpawnAt=POLICE_RULES.intervalSeconds;
  // The existing road renderer extends the first segment behind the start. Keep its height stable.
  const spawn=task.player.spawn.position;
  const initialTrail=this.onFoot?POLICE_RULES.walkSpawnDistance+24:POLICE_RULES.spawnDistance+24;
  for(let d=-initialTrail;d<=0;d+=4){const p=this.route.pointAt(d).position;this.breadcrumbs.push({...p,y:spawn[1],along:d});}
  this.breadcrumbs[this.breadcrumbs.length-1]={x:spawn[0],y:spawn[1],z:spawn[2],along:0};
  if(training){this.initialWaveQueued=true;for(const unit of training.initialUnits){const id='police-'+(++this.spawned);this.units.push({id,position:{...unit.position},yaw:unit.yaw,speed:0,speedLimit:unit.speed,cursor:0,bornAt:0,scheduledAt:0,stuckSeconds:0,kind:this.onFoot?'foot':'vehicle'});}}
 }
 private sample(along:number):Breadcrumb{
  const path=this.breadcrumbs;if(along<=path[0].along)return {...path[0]};if(along>=this.total)return {...path.at(-1)!};
  let low=1,high=path.length-1;while(low<high){const m=(low+high)>>1;if(path[m].along<along)low=m+1;else high=m;}
  const a=path[low-1],b=path[low],t=(along-a.along)/(b.along-a.along||1);
  return {x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t,z:a.z+(b.z-a.z)*t,along};
 }
 private record(p:Point){
  const last=this.breadcrumbs.at(-1)!,distance=Math.hypot(p.x-last.x,p.y-last.y,p.z-last.z);
  if(distance<.15)return;
  this.total+=distance;this.breadcrumbs.push({...p,along:this.total});
  while(this.breadcrumbs.length>2&&this.breadcrumbs[1].along<this.total-POLICE_RULES.trailRetention)this.breadcrumbs.shift();
 }
 private project(p:Point,cursor:number){
  let best=cursor,nearest=Infinity;
  for(let i=1;i<this.breadcrumbs.length;i++){
   const a=this.breadcrumbs[i-1],b=this.breadcrumbs[i];if(b.along<cursor-6)continue;if(a.along>cursor+24)break;
   const dx=b.x-a.x,dz=b.z-a.z,dy=b.y-a.y,t=clamp(((p.x-a.x)*dx+(p.z-a.z)*dz+(p.y-a.y)*dy)/(dx*dx+dz*dz+dy*dy||1),0,1);
   const distance=(p.x-a.x-t*dx)**2+(p.y-a.y-t*dy)**2+(p.z-a.z-t*dz)**2;
   if(distance<nearest){nearest=distance;best=a.along+(b.along-a.along)*t;}
  }
  return clamp(best,this.breadcrumbs[0].along,this.total);
 }
 /** Explicit minimum for legacy callers, independent of periodic reinforcements. */
 ensureMinimum(count:number){
  if(this.capturedBy||count<1)return;
  const missing=Math.max(0,count-this.units.length-this.pending.length);
  for(let i=0;i<missing;i++)this.pending.push({at:this.elapsed});
  if(missing)this.retryAt=Math.min(this.retryAt,this.elapsed);
 }
 private clear(p:Point,yaw:number,blocked:Blocked){
  if(this.onFoot)return !blocked(p,.35);
  const f=forward(yaw);
  return !blocked(p,1.1)&&!blocked({x:p.x+f.x*1.65,y:p.y,z:p.z+f.z*1.65},1.05)&&!blocked({x:p.x-f.x*1.65,y:p.y,z:p.z-f.z*1.65},1.05);
 }
 private spawn(p:Point,yaw:number,speed:number,blocked:Blocked,floor:(p:Point)=>number,scheduledAt:number,initial=false){
  if(this.reinforcements?.ready&&!this.reinforcements.ready())return false;
  if(this.reinforcements)return this.spawnAround(p,yaw,speed,blocked,floor,scheduledAt,initial);
  const distance=this.onFoot?POLICE_RULES.walkSpawnDistance:POLICE_RULES.spawnDistance,f=forward(yaw);
  const candidates:{p:Point;cursor:number}[]=[];
  for(let back=distance;back<=distance+64;back+=8){const s=this.sample(this.total-back);candidates.push({p:s,cursor:s.along});}
  // Tight turns can put the old trail beside / in front of the vehicle. Search the actual rear too.
  for(let back=distance;back<=distance+32;back+=8){const q={x:p.x-f.x*back,y:p.y,z:p.z-f.z*back};q.y=floor(q);candidates.push({p:q,cursor:this.project(q,this.total-distance)});}
  for(const candidate of candidates){
   const q=candidate.p,dx=q.x-p.x,dz=q.z-p.z;
   if(dx*f.x+dz*f.z> -8||horizontal(q,p)<POLICE_RULES.radius+POLICE_RULES.frontOffset+8)continue;
   if(this.units.some(u=>horizontal(q,u.position)<7))continue;
   const ahead=this.sample(Math.min(this.total,candidate.cursor+6)),heading=horizontal(q,ahead)>.2?Math.atan2(q.x-ahead.x,q.z-ahead.z):yaw;
   if(!this.clear(q,heading,blocked))continue;
   const id='police-'+(++this.spawned),unit:PoliceUnit={id,position:{x:q.x,y:q.y,z:q.z},yaw:heading,speed:Math.min(Math.max(0,speed),this.topSpeed*.8),cursor:candidate.cursor,bornAt:this.elapsed,scheduledAt,stuckSeconds:0};
   if(this.training)unit.speedLimit=this.training.reinforcementSpeeds?.[(this.spawned-this.training.initialUnits.length-1)%this.training.reinforcementSpeeds.length]??this.training.initialUnits[0]?.speed??this.topSpeed;
   unit.kind=this.onFoot?'foot':'vehicle';this.units.push(unit);this.events.push({id,scheduledAt,spawnedAt:this.elapsed,position:{...unit.position},player:{...p},playerYaw:yaw});return true;
  }
  return false; // Retry safely; never force a reinforcement through a wall or on top of another car.
 }
 private visible(unit:PoliceUnit,p:Point,yaw:number,speed:number){
  const visible=this.reinforcements!.visible;
  return visible(unit.position,p,yaw,speed)||policeSectorPolygon(unit,8).some(q=>visible(q,p,yaw,speed));
 }
 private spawnAround(p:Point,yaw:number,speed:number,blocked:Blocked,floor:(p:Point)=>number,scheduledAt:number,initial:boolean){
  const policy=this.reinforcements!,f=forward(yaw),right={x:-f.z,z:f.x};
  const edgeFactors=[.94,.86,.78];
  // Only the opening pair moves inward. Keep the original safe edge candidates
  // as fallback, and never change timed additions or later empty-radar refills.
  const factors=initial?[...edgeFactors.map(n=>n*POLICE_RULES.initialSpawnDistanceScale),...edgeFactors]:edgeFactors;
  const sectors=[0,-Math.PI/2,Math.PI/2,Math.PI]; // front, left, right, rear
  for(let k=0;k<4;k++)for(const offset of [0,.18,-.18,.36,-.36,.55,-.55]){
   const a=sectors[(this.spawned+k)%4]+offset,dx=f.x*Math.cos(a)+right.x*Math.sin(a),dz=f.z*Math.cos(a)+right.z*Math.sin(a);
   let low=0,high=800;
   for(let i=0;i<16;i++){const d=(low+high)/2,q={x:p.x+dx*d,y:p.y,z:p.z+dz*d};if(policy.visible(q,p,yaw,speed))low=d;else high=d;}
   for(const factor of factors){
    let q:Point|null={x:p.x+dx*low*factor,y:p.y,z:p.z+dz*low*factor};q=policy.snap?policy.snap(q):q;if(!q)continue;
    q={...q,y:floor(q)};
    if(!Number.isFinite(q.y)||Math.abs(q.y-p.y)>8||horizontal(q,p)<35||!policy.visible(q,p,yaw,speed))continue;
    if(this.units.some(u=>horizontal(q!,u.position)<9))continue;
    const heading=Math.atan2(q.x-p.x,q.z-p.z);
    if(!this.clear(q,heading,blocked))continue;
    // Verify the immediate approach, including terrain support. Unsafe sites retry.
    const next={x:q.x+(p.x-q.x)/horizontal(q,p)*3,y:q.y,z:q.z+(p.z-q.z)/horizontal(q,p)*3};
    if(!this.clear(next,heading,blocked)||Math.abs(floor(next)-q.y)>.6)continue;
    const id='police-'+(++this.spawned),unit:PoliceUnit={id,position:q,yaw:heading,speed:Math.min(Math.max(0,speed),this.topSpeed*.8),cursor:this.total,bornAt:this.elapsed,scheduledAt,stuckSeconds:0};
    if(this.training)unit.speedLimit=this.training.reinforcementSpeeds?.[(this.spawned-this.training.initialUnits.length-1)%this.training.reinforcementSpeeds.length]??this.training.initialUnits[0]?.speed??this.topSpeed;
    unit.kind=this.onFoot?'foot':'vehicle';this.units.push(unit);this.events.push({id,scheduledAt,spawnedAt:this.elapsed,position:{...q},player:{...p},playerYaw:yaw});return true;
   }
  }
  return false;
 }
 private approachTarget(u:PoliceUnit,p:Point,blocked:Blocked):Point{
  const distance=horizontal(u.position,p);
  if(distance<20||!this.reinforcements?.approach)return p;
  let route=this.approachPaths.get(u.id);
  if(!route||this.elapsed>=route.refreshAt){
   let clear=true;
   for(let d=3;d<distance-5;d+=4){const t=d/distance;if(blocked({x:u.position.x+(p.x-u.position.x)*t,y:u.position.y+(p.y-u.position.y)*t,z:u.position.z+(p.z-u.position.z)*t},this.onFoot?.35:1.1)){clear=false;break;}}
   route={points:clear?[]:this.reinforcements.approach(u.position,p),next:0,refreshAt:this.elapsed+2,direct:clear};this.approachPaths.set(u.id,route);
  }
  if(route.direct)return p;
  while(route.next<route.points.length-1&&horizontal(u.position,route.points[route.next])<6)route.next++;
  return route.points[route.next]??p;
 }
 step(dt:number,p:Point,yaw:number,playerSpeed:number,blocked:Blocked,floor:(p:Point)=>number){
  if(this.capturedBy||!Number.isFinite(dt)||dt<0||dt>.101)return;
  this.elapsed+=dt;this.record(p);
  this.units=this.units.filter(u=>{const keep=horizontal(u.position,p)<=POLICE_RULES.retireDistance||!!this.reinforcements&&this.visible(u,p,yaw,playerSpeed);if(!keep){this.retired++;this.approachPaths.delete(u.id);}return keep;});
  if(this.reinforcements){
   // Independent game-time cadence: an empty-radar refill never resets this clock.
   while(this.elapsed+1e-8>=this.nextSpawnAt){this.pending.push({at:this.nextSpawnAt});this.nextSpawnAt+=POLICE_RULES.intervalSeconds;}
   // One empty-radar event queues one pair, never two more on every frame.
   if(!this.pending.length&&!this.units.some(u=>this.visible(u,p,yaw,playerSpeed))){
    // Bound invisible old pursuers; keep the newest four while the next pair arrives.
    while(this.units.length>4){this.approachPaths.delete(this.units.shift()!.id);this.retired++;}
    const initial=!this.initialWaveQueued&&this.spawned===0;
    this.initialWaveQueued=true;
    this.pending.push({at:this.elapsed,initial},{at:this.elapsed,initial});this.retryAt=this.elapsed;
   }
  }else while(this.elapsed+1e-8>=this.nextSpawnAt){this.pending.push({at:this.nextSpawnAt});this.nextSpawnAt+=POLICE_RULES.intervalSeconds;}
  if(this.elapsed+1e-8>=this.retryAt&&this.pending.length){
   if(this.spawn(p,yaw,playerSpeed,blocked,floor,this.pending[0].at,this.pending[0].initial))this.pending.shift();
   this.retryAt=this.elapsed+(this.pending.length ? .5 : 0);
  }
  const scannedBefore=this.units.some(u=>insidePoliceSector(u,p));
  if(this.checkCapture(p))return;
  for(const u of this.units){
   u.cursor=this.project(u.position,u.cursor);
   const gap=horizontal(p,u.position),target=this.reinforcements?this.approachTarget(u,p,blocked):gap<20?p:this.sample(Math.min(this.total,u.cursor+Math.max(4,u.speed*.6)));
   const desiredYaw=horizontal(target,u.position)>.1?Math.atan2(u.position.x-target.x,u.position.z-target.z):u.yaw;
   const turn=angle(desiredYaw-u.yaw);u.yaw+=clamp(turn,-1.5*dt,1.5*dt);
   // Stop with the player ahead of the bumper, inside the detection sector,
   // instead of driving past them while the capture hold is accumulating.
   const closing=Math.max(0,gap-((this.onFoot?.4:POLICE_RULES.frontOffset)+POLICE_RULES.radius*.5));
   let desired=Math.min(u.speedLimit??this.topSpeed,closing*1.1*this.speedMultiplier,Math.sqrt(14*closing)*.7*this.speedMultiplier)*(Math.abs(turn)>.6?.38:1);
   const leader=this.units.filter(v=>v!==u&&(this.reinforcements?horizontal(v.position,u.position)<8&&Math.abs(angle(Math.atan2(u.position.x-v.position.x,u.position.z-v.position.z)-u.yaw))<.5:v.cursor>u.cursor&&v.cursor-u.cursor<8)).sort((a,b)=>a.cursor-b.cursor)[0];
   if(leader&&horizontal(leader.position,u.position)<7)desired=Math.min(desired,Math.max(0,horizontal(leader.position,u.position)-5));
   u.speed+=clamp(desired-u.speed,-7*dt,(this.onFoot?2:3.8)*this.speedMultiplier*dt);
   const f=forward(u.yaw),next={x:u.position.x+f.x*u.speed*dt,y:u.position.y,z:u.position.z+f.z*u.speed*dt};
   next.y=this.reinforcements?floor(next):this.sample(this.project(next,u.cursor)).y;
   if(this.clear(next,u.yaw,blocked)&&Math.abs(next.y-u.position.y)<.6){u.position=next;u.stuckSeconds=0;}
   else{u.speed=0;u.stuckSeconds+=dt;}
  }
  if(this.checkCapture(p,dt,scannedBefore))return;
  const safe=this.units.every(u=>horizontal(u.position,p)>=this.escapeDistance);this.safeSeconds=safe?this.safeSeconds+dt:0;
 }
 checkCapture(p:Point,dt=0,scannedBefore=false){
  if(!this.capturedBy){
   const hit=this.units.find(u=>insidePoliceSector(u,p));
   this.unscannedSeconds=hit||scannedBefore?0:this.unscannedSeconds+(Number.isFinite(dt)?Math.max(0,dt):0);
   this.exposureSeconds=hit?this.exposureSeconds+(Number.isFinite(dt)?Math.max(0,dt):0):0;
   if(hit&&this.exposureSeconds+1e-8>=POLICE_RULES.captureSeconds){this.capturedBy=hit.id;this.capturedAt=this.elapsed;}
  }
  return this.capturedBy!==null;
 }
 snapshot(){return {rules:this.reinforcements?{...this.rules,reinforcements:'timed-single-and-empty-minimap-pair'}:this.rules,elapsed:this.elapsed,nextSpawnAt:this.nextSpawnAt,pendingSpawns:this.pending.length,spawned:this.spawned,retired:this.retired,capturedBy:this.capturedBy,capturedAt:this.capturedAt,exposureSeconds:this.exposureSeconds,unscannedSeconds:this.unscannedSeconds,safeSeconds:this.safeSeconds,units:this.units.map(u=>({...u,position:{...u.position}}))};}
}
