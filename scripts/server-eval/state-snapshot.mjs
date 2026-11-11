/** Serialized into the server browser: keep self-contained. Diagnostic state
 * only, never supplied to the policy. Coordinates use the physics controller's
 * origin (feet for walking, swimmer reference, aircraft/vehicle origin). */
export function readEnvironmentState(){
 const c=window.__SHENCHENGJI_CITY__,w=c.world,s=c.stats.nativeTask;
 const number=v=>Number.isFinite(v)?v:null;
 const point=p=>({x:number(p?.x),y:number(p?.y),z:number(p?.z)});
 const pick=(o,keys)=>Object.fromEntries(keys.map(k=>[k,o?.[k]??null]));
 const motion=o=>({yaw:number(o?.yaw),speed:number(o?.speed),verticalSpeed:number(o?.verticalSpeed)});
 const walking=o=>({...motion(o),grounded:o.grounded,airborne:o.airborne,traversing:o.traversing,
  coverCrouched:o.coverCrouched,completedLinks:[...(o.completedLinks??[])].sort(),
  ladder:o.ladder?{id:o.ladder.ladder.id,...pick(o.ladder,['phase','progress','fromBottom','sliding'])}:null});
 let actor,mode=w.controlMode,physical={};
 const flight=w.flight,taskVehicle=w.taskVehicle;
 // Crashed aircraft must retain their last pose, not revert to the parked car.
 const inAircraft=flight&&(flight.active||s.flight&&s.flight.stage!=='boarding'&&!w.walk?.active);
 if(w.staticTask){mode='static';actor=null;}
 else if(inAircraft){
  const sim=flight.sim;mode='aircraft';actor=point(sim.pose);
  physical={kind:'aircraft',model:flight.model,...motion({...sim.pose,speed:sim.speed,verticalSpeed:sim.velocity.y}),
   pitch:sim.pose.pitch,roll:sim.pose.roll,velocity:point(sim.velocity),
   ...pick(sim,['phase','onGround','groundRunwayId','throttle','engineState','engineStartedFor','engineRpm','gearTargetDown','gearProgress','takeoffs','landings','crashes'])};
 }else if(taskVehicle){
  // Shore-to-boat tasks wrap two controllers; inspect the active one.
  const v=taskVehicle.active&&typeof taskVehicle.active==='object'?taskVehicle.active:taskVehicle;
  const waterMode=v.mode??(Number.isFinite(v.depth)?'swim':'unknown');
  mode=({swim:'swimming',walk:'walking',boat:'boat',submarine:'submarine',boarding:'boarding',leaving:'leaving'})[waterMode]??'task-vehicle';
  actor=point(taskVehicle);
  if(waterMode==='submarine')physical={kind:'submarine',...motion(v),depth:number(v.depth),enteredPipe:v.enteredPipe,waterHeight:number(v.spec?.waterHeight)};
  else if(waterMode==='walk')physical={kind:'walking',...walking(v.walker)};
  else if(waterMode==='swim'){
   const swim=v.swimmer??v;
   physical={kind:'swimming',...motion(swim),depth:number(swim.depth),waterHeight:number(swim.spec?.waterHeight)};
  }else{
   const body=v.body;
   physical={kind:'boat',...motion(v),mode:waterMode,craft:v.spec?.craft??'yacht',
    boat:{...pick(v.boat,['x','z','yaw','speed']),y:number(body?.bottomY)},
    support:body?pick(body,['bottomY','pitch','grounded']):null,
    boarded:v.boarded??false,waterHeight:number(v.spec?.waterHeight),
    transition:v.transition?{id:v.transition.link.id,t:v.transition.t}:null,
    helmTransfer:v.helmTransfer?pick(v.helmTransfer,['t','entering']):null};
  }
  if(taskVehicle.spec?.objective==='shore-transfer'){
   const boat=taskVehicle.boat?.spec?taskVehicle.boat:v;
   physical.boardingAssist={side:boat.boardingSide??-1,approach:boat.approach?{index:boat.approach.index,points:boat.approach.points.map(p=>({x:p.x,z:p.z}))}:null};
  }
 }else if(w.walk?.active){
  mode='walking';actor=point({x:w.walk.x,y:w.walk.feetY,z:w.walk.z});physical={kind:'walking',...walking(w.walk)};
 }else{
  const p=w.state??w.actor;
  // Physical support, not cosmetic suspension/animation displacement.
  const y=number(p.y)??number(w.carSurfaceHeight?.(p.x,p.z))??number(w.groundHeight?.(p.x,p.z));
  actor=point({...p,y});physical={kind:w.tank?.active?'tank':'car',...motion(p),steer:number(p.steer)};
  if(w.carWaterEnabled)physical.water=pick(w.carWater,['phase','elapsed','depth','baseY','pitch']);
 }
 if(w.vehicleInteraction)physical.vehicleInteraction=pick(w.vehicleInteraction,['kind','elapsed','approachSeconds','side','car','door']);
 if(w.carChoiceActive)physical.carChoice={selected:w.nativeDriveModel?.kind??null,performance:{...w.carPerformance},parked:w.parkedChoices.map(v=>({kind:v.model.kind,pose:{...v.pose}}))};
 if(w.nativeFootSite?.interactionHint)physical.interiorHint=w.nativeFootSite.interactionHint.snapshot;
 if(w.nativeFootSite?.doorSnapshot)physical.interiorDoors=w.nativeFootSite.doorSnapshot;
 const replayState={version:1,physical,task:{checkpoint:s.checkpoint??null,
  flight:s.flight?pick(s.flight,['stage','checkpoint','recoveryIndex','hoveredFor','stoppedFor','approached','airElapsed','outcome']):null,
  escapeExposure:s.escapeExposure??null,escapeUnscanned:s.escapeUnscanned??null,npc:s.npc??null,
  climb:s.climb?pick(s.climb,['stage','settledFor','outcome']):null,
  rescue:s.rescue?pick(s.rescue,['stage','boarded','transfer']):null}};
 return {stateVersion:2,taskId:s.taskId,active:s.active,complete:s.complete,failed:s.failed,elapsed:s.elapsed,maxDuration:s.maxDuration,
  paused:inAircraft?!!w.taskFlightPaused:!!w.paused,worldPaused:!!w.paused,
  worldTime:w.time,animationTime:w.scene._animationTime,
  mousePosition:{...w.__evalMousePosition},viewport:w.staticTask?{width:w.staticTask.canvas.width,height:w.staticTask.canvas.height}:{width:window.innerWidth,height:window.innerHeight},
  staticTask:w.staticTask?.snapshot(),reason:document.querySelector('#native-result-reason')?.textContent??'',actor,mode,replayState,
  ...(w.__evalRealtime?{realtimeClock:{frames:w.__evalRealtime.frames,error:w.__evalRealtime.error,loadingSeconds:w.__evalRealtime.loadingSeconds,
   version:w.__evalRealtime.version,catchingUp:w.__evalRealtime.catchingUp,recoveries:w.__evalRealtime.recoveries,
   wallClockPolicy:w.__evalRealtime.wallClockPolicy,fallbackActivated:w.__evalRealtime.fallbackActivated,
   wallElapsedSeconds:w.__evalRealtime.wallElapsedMs/1000,droppedIdleWallSeconds:w.__evalRealtime.droppedIdleWallSeconds,
   maxPumpGapMs:w.__evalRealtime.maxPumpGapMs,maxAppliedDurationErrorSeconds:w.__evalRealtime.maxAppliedDurationErrorSeconds,
   maxInputDispatchLateSeconds:w.__evalRealtime.maxInputDispatchLateSeconds,
   running:w.__evalRealtime.running,lagSeconds:w.__evalRealtime.remainder,maxLagSeconds:w.__evalRealtime.maxLagSeconds,
   maxReleaseLateSeconds:w.__evalRealtime.maxReleaseLateSeconds,maxContinuousReleaseLateSeconds:w.__evalRealtime.maxContinuousReleaseLateSeconds}}:{})};
}
