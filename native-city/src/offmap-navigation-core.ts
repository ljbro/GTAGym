import {advanceNavigationProgress,advanceVehicleMotion,resolveVehicleProfile,getNavigationRouteIndex,createHelicopterState,helicopterProfile,advanceHelicopterFlight,advanceHelicopterCargo,operateHelicopterHook,helicopterObservation,validateNavigation} from './vendor/offmap-navigation/index.js';
import {NavigationPolicePursuit,usesPolicePursuit} from './offmap-navigation-police.ts';
import type {NavigationTraversal} from './offmap-navigation-traversal.ts';
export type Point={x:number;y:number;z:number};
export type Triple=[number,number,number];
// Source-specific cargo / encounter variants remain opaque at the pinned JS boundary.
export type SourceTask={task:{id:string;title:string};player:{spawn:{position:Triple;yaw:number}};goal:{position:Triple;tolerance:any};navigation:{path:Triple[];mode:string;category:string;title:string;objective:string;setting:string;indoors:boolean;[key:string]:any};[key:string]:any};
export type CatalogItem={id:string;title:string;category:string;mode:string;vehicle:string;setting:string;points:number;lengthMetres:number;fidelity:string;file:string;sourceSha256:string;pathSha256:string;transform:{origin:Triple;scale:1;kind:string};previewKind?:'route-first-reconstruction-v1'|'calibrated';metricStatus?:string;reviewVersion?:string};
export const asPoint=(p:Triple):Point=>({x:p[0],y:p[1],z:p[2]});
export const clamp=(n:number,a:number,b:number)=>Math.max(a,Math.min(b,n));
export const taskScenerySeed=(id:string)=>Array.from(id).reduce((s,c)=>(s*31+c.charCodeAt(0))>>>0,7);
/** Display geometry only: remove sub-metre registration noise, never modify task/evaluation points. */
export function sceneryPolyline(path:Triple[],epsilon=.35):Triple[]{
 const keep=new Set([0,path.length-1]),stack:[[number,number]]|[number,number][]=[[0,path.length-1]];
 while(stack.length){const [a,b]=stack.pop()!,p=path[a],q=path[b],v=q.map((x,i)=>x-p[i]),den=v.reduce((s,x)=>s+x*x,0);let maximum=epsilon*epsilon,split=-1;
  for(let i=a+1;i<b;i++){const t=den?clamp(path[i].reduce((s,x,k)=>s+(x-p[k])*v[k],0)/den,0,1):0;const d=path[i].reduce((s,x,k)=>s+(x-p[k]-t*v[k])**2,0);if(d>maximum){maximum=d;split=i;}}
  if(split>=0){keep.add(split);stack.push([a,split],[split,b]);}
 }
 return [...keep].sort((a,b)=>a-b).map(i=>path[i]);
}
export function coordinates(task:SourceTask){
 const origin=task.player.spawn.position;
 return {toWorld:(p:Point):Point=>({x:p.x-origin[0],y:p.y,z:origin[2]-p.z}),
  toSource:(p:Point):Point=>({x:p.x+origin[0],y:p.y,z:origin[2]-p.z})};
}
/** Full-resolution route for scoring. Decoration sampling never replaces this path. */
export class NavigationTerrain{
 index;horizontalIndex; minimumY:number; water:boolean; airborne:boolean; halfWidth:number;
 constructor(public task:SourceTask){
  const n=task.navigation;this.index=getNavigationRouteIndex(n.path);this.horizontalIndex=getNavigationRouteIndex(n.path.map(p=>[p[0],0,p[2]]));this.minimumY=Math.min(...n.path.map(p=>p[1]));
  this.water=n.mode==='boat'||n.mode==='swim'||(n.setting==='water'&&!['drive','walk'].includes(n.mode));this.airborne=n.mode==='fly';this.halfWidth=n.mode==='drive'?9:n.mode==='walk'?3.5:18;
 }
 floor(p:Point){
  const n=this.task.navigation,g=this.task.goal.position,c=n.helicopter?.cargo;
  if(this.water)return Math.min(-12,this.minimumY-8);
  if(this.airborne){
   if(n.helicopter?.objective==='land'&&Math.hypot(p.x-g[0],p.z-g[2])<30)return g[1];
   if(c)for(const t of [c.pickup,c.delivery])if(t&&Math.hypot(p.x-t[0],p.z-t[2])<24)return t[1];
   return n.helicopter?Math.max(0,this.minimumY-35):0;
  }
  return this.index.project(p).position.y;
 }
 supported(p:Point){return this.index.project(p).lateral<this.halfWidth;}
}
export class NavigationRun{
 /** Separate presentation manifest; never injected into the immutable source task. */
 migration:any=null;
 /** User-authorized physical climb adaptation; source scoring coordinates remain immutable. */
 traversal:NavigationTraversal|null=null;
 readonly terrain:NavigationTerrain;readonly transform;readonly profile:any;
 readonly police:NavigationPolicePursuit|null;private readonly evaluationTask:SourceTask;
 readonly vehicle:{position:Point;yaw:number;speed:number;steering:number;occupied:boolean;parkedPosition?:Point;parkedYaw?:number;flight?:any};
 progress:any={};elapsed=0;distance=0;collisions=0;paused=false;diagnostic=false;exploring=false;trace:any[]=[];
 cameraYaw:number;cameraPitch=.12;bodyYaw:number;lookIndependent=false;private spaceDown=false;private interactDown=false;jumpHeight=0;private jumpVelocity=0;
 constructor(public task:SourceTask){
  validateNavigation(task);this.terrain=new NavigationTerrain(task);this.transform=coordinates(task);
  const n=task.navigation;this.profile=n.helicopter?helicopterProfile(n):resolveVehicleProfile(n.vehicleModel??n.vehicleType??n.mode,n.physics);
  this.police=usesPolicePursuit(task)?new NavigationPolicePursuit(task,this.profile.maxSpeedMps):null;
  // Keep pinned files and route/destination evaluation intact. Only replace the old single pursuer.
  this.evaluationTask=this.police?{...task,navigation:{...n,category:n.mode==='walk'?'outdoor-foot':'outdoor-road'}}:task;
  this.vehicle={position:asPoint(task.player.spawn.position),yaw:task.player.spawn.yaw,speed:0,steering:0,occupied:!['walk','swim'].includes(n.mode)};
  this.cameraYaw=this.bodyYaw=this.vehicle.yaw;
  if(n.helicopter){this.vehicle.flight=createHelicopterState(this.vehicle,n,this.terrain.floor(this.vehicle.position));this.vehicle.speed=n.helicopter.initial?.speedMps??0;advanceHelicopterCargo(this.vehicle,0,this.profile,n.helicopter.cargo,{x:0,z:0},(p:Point)=>this.terrain.floor(p));}
  this.evaluate();
 }
 get position(){return this.vehicle.position;}
 get physicalPosition():Point{const base=this.traversal?.state.active?this.traversal.state.physicalPosition:this.position;return this.jumpHeight>0?{...base,y:base.y+this.jumpHeight}:base;}
 get state(){return this.progress.navigation;}
 get finished(){return !!(this.state?.completed||this.state?.failed);}
 look(dx:number,dy:number){this.cameraYaw-=dx*.003;this.cameraPitch=clamp(this.cameraPitch+dy*.0025,-1.15,1.15);this.lookIndependent=true;}
 hook(){if(this.task.navigation.helicopter&&!this.paused&&!this.finished)operateHelicopterHook(this.vehicle,this.profile,this.task.navigation.helicopter.cargo);}
 /** Match the original urban action edge: F toggles the nearby task vehicle. */
 private interactVehicle(){
  const n=this.task.navigation,v=this.vehicle;if(n.mode!=='drive'||n.vehicleType==='police-car')return;
  if(v.occupied){if(Math.abs(v.speed)>.2)return;v.parkedPosition={...v.position};v.parkedYaw=v.yaw;v.occupied=false;v.speed=0;this.bodyYaw=v.yaw;return;}
  const parked=v.parkedPosition;if(!parked||Math.hypot(v.position.x-parked.x,v.position.z-parked.z)>4)return;
  v.position={...parked};v.yaw=v.parkedYaw??v.yaw;v.occupied=true;v.speed=0;this.bodyYaw=v.yaw;
 }
 evaluate(){
  const state=advanceNavigationProgress(this.evaluationTask,this.progress,this.position,this.task.navigation.mode,{elapsedMs:this.elapsed*1000,speed:this.vehicle.speed,characterId:this.task.navigation.characterId,flight:helicopterObservation(this.vehicle)});
  if(this.police){
   if(this.task.navigation.completionPolicy==='ordered-route'&&this.police.safeSeconds<3)state.completed=false;
   // Capture takes precedence even when the destination is reached during the same simulation tick.
   if(this.police.checkCapture(this.position)){state.completed=false;state.failed=true;state.failureReason="Caught in the cone-shaped area in front of the police car";}
   state.police={rule:this.police.rules.version,capturedBy:this.police.capturedBy,spawned:this.police.spawned};
  }
  if(this.traversal?.state.active)state.completed=false;
  return state;
 }
 step(keys:ReadonlySet<string>,delta:number,blocked:(p:Point,radius:number)=>boolean=()=>false){
  if(this.paused||(this.finished&&!this.exploring)){this.traversal?.syncKeys(keys);return;}
  const n=this.task.navigation,v=this.vehicle;
  const spacePressed=keys.has('Space')&&!this.spaceDown,interactPressed=keys.has('KeyF')&&!this.interactDown;this.spaceDown=keys.has('Space');this.interactDown=keys.has('KeyF');
  if(interactPressed)this.interactVehicle();
  const axis=(yes:string[],no:string[])=>Number(yes.some(k=>keys.has(k)))-Number(no.some(k=>keys.has(k)));
  let remaining=clamp(delta,0,.1);
  while(remaining>1e-8){
   const dt=Math.min(remaining,1/60);remaining-=dt;const old={...v.position};
   const forward=axis(['KeyW','ArrowUp'],['KeyS','ArrowDown']),right=axis(['KeyD','ArrowRight'],['KeyA','ArrowLeft']),vertical=axis(['KeyR'],['KeyF']);
   if(n.helicopter){this.cameraYaw-=axis(['ArrowRight'],['ArrowLeft'])*dt*1.5;this.cameraPitch=clamp(this.cameraPitch+axis(['ArrowDown'],['ArrowUp'])*dt,-1.15,1.15);}
   const traversal=n.mode==='walk'?this.traversal?.step({keys,dt,sourcePosition:old,bodyYaw:this.bodyYaw,blocked}):null;
   if(traversal&&(traversal.active||traversal.completed)){
    v.position={...traversal.sourcePosition};this.bodyYaw=v.yaw=traversal.bodyYaw;
    v.speed=Math.hypot(v.position.x-old.x,v.position.y-old.y,v.position.z-old.z)/dt;
   }else if(n.mode==='walk'||n.mode==='swim'||(n.mode==='drive'&&!v.occupied)){
    v.yaw=this.cameraYaw;const swim=n.mode==='swim',speed=swim?((keys.has('ShiftLeft')||keys.has('ShiftRight'))?4.5:2.4):((keys.has('ShiftLeft')||keys.has('ShiftRight'))?4.2:1.6),length=Math.max(1,Math.hypot(forward,right));
    const p={x:old.x+(-Math.sin(v.yaw)*forward+Math.cos(v.yaw)*right)*speed*dt/length,y:old.y,z:old.z+(-Math.cos(v.yaw)*forward-Math.sin(v.yaw)*right)*speed*dt/length};
    const ground=this.terrain.floor(p);
    if(!swim&&spacePressed&&this.jumpHeight<.001){this.jumpVelocity=5.2;this.jumpHeight=.001;}
    if(!swim&&(this.jumpHeight>0||this.jumpVelocity>0)){this.jumpVelocity-=14*dt;this.jumpHeight=Math.max(0,this.jumpHeight+this.jumpVelocity*dt);if(this.jumpHeight===0)this.jumpVelocity=0;}
    p.y=swim?clamp(old.y+vertical*3*dt,this.terrain.minimumY-7,0):ground;
    if(!blocked(p,.35)&&(swim||Math.abs(p.y-old.y)<.5))v.position=p;
    v.speed=Math.hypot(v.position.x-old.x,v.position.y-old.y,v.position.z-old.z)/dt;
    if(v.speed>.01)this.bodyYaw=Math.atan2(old.x-v.position.x,old.z-v.position.z);
   }else if(n.helicopter){
    const motion=advanceHelicopterFlight(v,dt,{flight:{collective:vertical,pitch:forward,roll:right,yaw:axis(['KeyE'],['KeyQ'])}},this.profile,{cargo:n.helicopter.cargo,groundAt:(p:Point)=>this.terrain.floor(p),blocked:(p:Point)=>blocked(p,this.profile.bodyRadius)});
    advanceHelicopterCargo(v,dt,this.profile,n.helicopter.cargo,motion.acceleration,(p:Point)=>this.terrain.floor(p));
    if(motion.collision)this.collisions++;
    if(n.id==='c08-n11'){
     const g=this.task.goal.position,near=Math.hypot(v.position.x-g[0],v.position.z-g[2])<=(n.arrivalRadiusMetres??7);
     v.flight.boardingSeconds=near&&v.flight.onGround&&v.speed<.2?v.flight.boardingSeconds+dt:0;v.flight.passengersBoarded=v.flight.boardingSeconds>=3;
    }
   }else{
    advanceVehicleMotion(v,dt,{forward,right,brake:keys.has('Space')},this.profile);
    const p={x:old.x-Math.sin(v.yaw)*v.speed*dt,y:old.y,z:old.z-Math.cos(v.yaw)*v.speed*dt};
    if(n.mode==='drive')p.y=this.terrain.floor(p);
    else if(n.mode==='fly')p.y=Math.max(0,this.terrain.floor(p),old.y+(n.vehicleType==='parachute'?Math.min(0,vertical):vertical)*this.profile.verticalSpeedMps*dt);
    else p.y=n.vehicleType==='submarine'?clamp(old.y+vertical*this.profile.verticalSpeedMps*dt,this.terrain.minimumY-7,0):0;
    if(blocked(p,n.mode==='drive'?1.2:.8)){v.speed=0;this.collisions++;}else v.position=p;
   }
   if(n.mode!=='walk'&&n.mode!=='swim'&&!(n.mode==='drive'&&!v.occupied)&&!this.lookIndependent)this.cameraYaw=v.yaw;
   this.elapsed+=dt;this.distance+=Math.hypot(v.position.x-old.x,v.position.y-old.y,v.position.z-old.z);
   if(!this.exploring){this.police?.step(dt,v.position,n.mode==='walk'?this.bodyYaw:v.yaw,v.speed,blocked,p=>this.terrain.floor(p));this.evaluate();if(traversal?.suppressCompletion)this.state.completed=false;}
   if(this.trace.length===0||this.elapsed-this.trace.at(-1).t>=.2)this.trace.push({t:this.elapsed,p:[v.position.x,v.position.y,v.position.z],yaw:v.yaw,speed:v.speed,...(this.traversal?.state.active?{physicalPosition:{...this.traversal.state.physicalPosition},traversalPhase:this.traversal.state.phase}:{}),...(this.police?{police:this.police.units.map(u=>({id:u.id,p:[u.position.x,u.position.y,u.position.z],yaw:u.yaw,speed:u.speed}))}:{})});
   if(this.finished&&!this.exploring)break;
  }
 }
 export(item:CatalogItem){return {schema:1,taskId:item.id,sourceSha256:item.sourceSha256,pathSha256:item.pathSha256,coordinates:item.transform,routeFidelity:item.fidelity,migration:this.migration,...(this.traversal?{traversal:this.traversal.snapshot(),traversalAdaptation:'User-authorized Space-triggered physical climb; original scoring points retained, body height estimated; completion waits for safe landing. Not original GTA motion capture.'}:{}),rendering:'GTA_SZ Babylon.js / independent adapted scenery',evaluationMode:this.traversal?(this.police?.rules.version??'pinned-offmapbench')+'+gta-sz-physical-traversal-v1':this.police?.rules.version??'pinned-offmapbench',...(this.police?{adaptations:['Original route/destination; custom rear police reinforcements and instant forward-sector capture, not original OffMapBench scoring.'],police:{...this.police.snapshot(),events:this.police.events}}:{}),elapsed:this.elapsed,distance:this.distance,collisions:this.collisions,assisted:!!this.traversal?.snapshot().events.some(event=>event.type==='started'),diagnostic:this.diagnostic,evaluation:this.state,trace:this.trace};}
}
