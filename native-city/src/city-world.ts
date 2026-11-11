import {CITY_GRAPHICS_PROFILES,cityGraphicsRenderRatio,isCityGraphicsQuality,loadCityGraphicsQuality,saveCityGraphicsQuality,type CityGraphicsQuality} from './city-graphics-quality.ts';
import {createVehicleReflections} from './city-vehicle-reflections.ts';
import {headlightAnchors,type VehicleManifest} from './city-vehicle-manifest.ts';
import {Engine,Scene,Vector3,Color3,Color4,FreeCamera,HemisphericLight,DirectionalLight,ShadowGenerator,TransformNode,MeshBuilder,Mesh,StandardMaterial,PBRMaterial,RawCubeTexture,RawTexture,Texture,Effect,ShaderMaterial,Quaternion,PointLight,ImportMeshAsync,DefaultRenderingPipeline,MirrorTexture,Plane,FresnelParameters,SpotLight,MeshoptCompression,SSAO2RenderingPipeline,Constants,SceneInstrumentation,EngineInstrumentation,RenderingGroup,Frustum,Matrix,type SubMesh,type AbstractMesh} from '@babylonjs/core';
import '@babylonjs/loaders/glTF';
import './city-gltf-streaming.ts';
MeshoptCompression.Configuration={decoder:{url:'/city/meshopt_decoder.js'}};
import {loadLandmarkDetails,loadLandmarkCandidates,isCandidateGroundSlab,type LandmarkDetailManifest,type LandmarkCandidateManifest} from './landmark-details.ts';
import {CityObserver} from './city-observer.ts';
import {CityFlight} from './city-flight.ts';
import {NativeFlightCar} from './native-flight-car.ts';
import type {FlightModel} from './native-flight-catalog.ts';
import type {FlightPoint} from './city-flight-simulation.ts';
import {NATIVE_FLIGHT_RUNWAYS,nativeFlightSurfaceAt,nativeFlightReserved} from './native-flight-route.ts';
import {clearNativeFlightSites} from './native-flight-clearance.ts';
import {observerNearClip} from './city-observer-depth.ts';
import {CLIMB_LANDMARK,NativeClimbSite,nativeClimbReserved} from './native-climb-site.ts';
import {createNativeClimbScene} from './native-climb-scene.ts';
import {CityWalk} from './city-walk.ts';
import {NativeDriveVehicle} from './native-drive-vehicle.ts';
import {waitForVehicleBoarding} from './vehicle-boarding-wait.ts';
import {createVehicleInteraction,stepVehicleInteraction,sampleVehicleInteraction,VEHICLE_APPROACH_SPEED,type VehicleInteraction,type VehiclePoint} from './vehicle-interaction.ts';
import {attachNativeVehicleDoors,type VehicleDoors} from './native-vehicle-doors.ts';
import {drivingSupportHeight,drivingSurfaceStepClear} from './driving-surface.ts';
import {drivingView,nextDrivingView,nativeDrivingStartCamera} from './native-driving-camera.ts';
import {applyCityCameraLook,cockpitLookDirection,handleCityCameraKey,updateDrivingCameraLook} from './city-camera-look.ts';
import {NATIVE_DRIVE_VEHICLES,nativeDriveFootprintClear,type NativeDriveKind} from './native-drive-vehicle-spec.ts';
import {NativeSemiTrailer} from './native-semi-trailer.ts';
import {SEMI,stepTrailer,trailerSweepClear,trailerContains,type SemiPose} from './native-semi-articulation.ts';
import type {NativeFootSite} from './native-foot-site.ts';
import {interiorThirdPersonCamera} from './offmap-camera.ts';
import {CityTank} from './city-tank.ts';
import {stepTank,tankFootprintClear} from './city-tank-simulation.ts';
import {createCityRider,type CityRider} from './city-rider.ts';
import {loadRoadDisplayNames,roadDisplayName} from './city-road-names.ts';
import {CityFacadeStream} from './city-facade-stream.ts';
import {fitCandidateBuildingToFootprint} from './candidate-building-fit.ts';
import {createArchitectureMaterials} from './city-architecture-materials.ts';
import {createFacadeDiversity} from './city-facade-diversity.ts';
import {CityLandscape,applyLandscapeSurfaces} from './city-landscape.ts';
import {CityCanopy} from './city-canopy.ts';
import {CityRooftops} from './city-rooftops.ts';
import {createRoofSurface} from './city-roof-surface.ts';
import {createCityAmbient} from './city-ambient-occlusion.ts';
import {attachCityBuildingSigns} from './city-building-signs.ts';
import {loadLandmarkSignage} from './landmark-signage.ts';
import {createCinematicLook,syncPostChain,applyAntiAliasing} from './city-cinematic.ts';
import {keepSkyInReflections} from './city-sky-reflection.ts';
import {createBambooLook} from './city-bamboo-look.ts';
import {createBambooCafe} from './city-bamboo-cafe.ts';
import {createBayparkLook} from './city-baypark-look.ts';
import {createLocalLighting} from './city-local-lighting.ts';
import {applyCinematicRoad} from './city-road-surface.ts';
import {createRainPuddles} from './city-rain-puddles.ts';
import {createCityRainWeather} from './city-rain-weather.ts';
import {loadCityGroundRelief} from './city-ground-relief.ts';
import {loadCityMountains} from './city-mountains.ts';
import {applyCinematicVehicleFinish} from './city-vehicle-finish.ts';
import {refineHeroVehicleMaterials} from './city-vehicle-materials.ts';
import {CityAudio} from './city-audio.ts';
import {CityAutopilot,type DrivingInput} from './city-autopilot.ts';
import {createCityCockpit,CITY_DRIVER_POSE} from './city-cockpit.ts';
import {createCityTailLights} from './city-tail-lights.ts';
import {createCitySportDetails} from './city-sport-details.ts';
import {CityStreetFurniture} from './city-street-furniture.ts';
import {CityPedestrians} from './pedestrians.ts';
import {CityTraffic} from './traffic.ts';
import {ECONOMY_PERFORMANCE,SPORTS_PERFORMANCE,type CarChoiceLayout,type ChoicePose} from './native-car-choice.ts';
import {streetSweepClear,type StreetBody} from './ambient-collision.ts';
import {targetCameraPosition} from './native-target-camera.ts';
import {CityTrafficSignals} from './city-traffic-signals.ts';
import {CityEbikes} from './city-ebikes.ts';
import {loadCoastalInfrastructure} from './city-coastal-infrastructure.ts';
import {createBayWater} from './city-bay-water.ts';
import {NativeCarWater,NativeCarWaterSurface} from './native-car-water.ts';
import {clearBackdropWaterways} from './city-waterway-clearance.ts';
import beachBoatRoutes from './native-beach-boat-routes.json';
import {createCoastalHorizon} from './city-coastal-horizon.ts';
import {createPublicLighting} from './city-public-lighting.ts';
import {createBambooCorridor} from './city-bamboo-corridor.ts';
import {setLandscapeLightingMode} from './city-landscape-lighting.ts';
import type {RoadGraph} from './navigation.ts';
import type {CityData,Landmark,V2} from './city-types.ts';
import {CityCollision,stepCar,manualSteeringInput,clamp,type CarState} from './driving.ts';
import {interiorVehicleSweepClear} from './native-interior-layout.ts';
import {nativeBarrierBlocked,nativeBarrierVehicleBlocked,type NativeTaskBarrier} from './native-task-barrier.ts';
/** Screen-space contact shading at street level: a tight 2.5 m radius darkens
 * kerbs, door reveals and wheel wells within 130 m. It reads depth and normals
 * from a dedicated half-resolution geometry buffer whose render list is only
 * the meshes within reach; the previous prepass path re-rendered the whole
 * visible city into a full-resolution MRT. Occlusion is estimated and blurred
 * at `aoRatio` and multiplied into the full-size scene colour. Aerial views
 * detach the pass: the facade shader's own sky-visibility ramp grounds the
 * towers there. `listMargin` covers the 100 m of travel between culls. */
// aoRatio is the half-size AO estimate; blurRatio also sizes ssaoCombine's output, so it must
// stay 1 or every later pass samples a half-resolution frame (GTA_SZ#3).
export const STREET_AO={radius:2.5,maxZ:130,strength:.65,base:.1,bufferRatio:.5,aoRatio:.5,blurRatio:1,listMargin:100} as const;
/** Shadow-map self-shadowing offsets per frustum. Babylon's normalBias shrinks casters along their normal in
 * world metres, so it has to follow the shadow texel: the 520 m street box is .25 m/px and .10 m is enough,
 * but the 2100 m aerial box is 1.03 m/px and the same .10 m left every sunlit facade speckled with acne
 * (random texels failing the depth test) while true tower shadows on the lawns were mostly lost. .8 m
 * (~.8 texel) clears the acne; casters thinner than that (lamp posts, trunks) drop out of the aerial map. */
export const SHADOW_BIAS={street:{normal:.10,depth:.0002},aerial:{normal:.8,depth:.0002}} as const;
/** terrain.glb / roads.glb materials that read the baked city occlusion (src/city-ambient-occlusion.ts). */
export const GROUND_AMBIENT_MATERIALS=new Set(['land','park','pavement','concrete','asphalt','roadline']);
/** Hull-front lamp anchors for the 3.48 m wide, 8.3 m long tank (game metres, +Z forward). */
export const TANK_HEADLIGHT_ANCHORS:[number,number,number][]=[[-1.15,1.35,3.4],[1.15,1.35,3.4]];
export class DrivingWorld{
 staticTask:import('./static-shooting-site.ts').StaticSite|null=null;
 graphicsQuality:CityGraphicsQuality=(()=>{let storage:Storage|null=null;try{storage=window.localStorage;}catch{}return loadCityGraphicsQuality(location.search,storage);})();
 get graphicsProfile(){return CITY_GRAPHICS_PROFILES[this.graphicsQuality];}
 setGraphicsQuality(quality:CityGraphicsQuality){
  if(!isCityGraphicsQuality(quality))return false;
  this.graphicsQuality=quality;let storage:Storage|null=null;try{storage=window.localStorage;}catch{}
  const saved=saveCityGraphicsQuality(quality,storage);this.applyGraphicsQuality();return saved;
 }
 private syncGraphicsPostEffects(){
  const profile=this.graphicsProfile,msaa=this.overviewEffects?1:Math.min(profile.msaa,this.engine.getCaps().maxMSAASamples||1);
  const lens=profile.lensEffects&&this.lightMode!=='day';
  applyAntiAliasing(this.pipeline,this.overviewEffects,{msaa,fxaa:msaa===1,grain:lens,chromaticAberration:lens,bloomScale:profile.bloomScale});
  if(this.ao){
   this.ao.samples=profile.aoSamples;
   const enabled=profile.ao&&!this.overviewEffects,attached=this.ao.cameras.includes(this.camera),manager=this.scene.postProcessRenderPipelineManager;
   if(enabled&&!attached)manager.attachCamerasToRenderPipeline('contact-shading',this.camera);
   else if(!enabled&&attached)manager.detachCamerasFromRenderPipeline('contact-shading',this.camera);
  }
  syncPostChain(this.scene,this.pipeline,this.camera);
 }
 private applyGraphicsQuality(){
  const profile=this.graphicsProfile;this.resize();this.engine.resize();
  if(this.shadows.mapSize!==profile.shadowSize)this.shadows.mapSize=profile.shadowSize;this.applyShadowBias();
  const shadowMap=this.shadows.getShadowMap();if(shadowMap){shadowMap.refreshRate=this.overviewEffects?12:1;shadowMap.resetRefreshCounter();}
  for(const mirror of [this.mirror,this.waterMirror]){if(mirror.getSize().width!==profile.mirrorSize)mirror.resize(profile.mirrorSize);mirror.resetRefreshCounter();}
  this.syncGraphicsPostEffects();this.landscape?.setGraphicsQuality(this.graphicsQuality);this.canopy?.setGraphicsQuality(this.graphicsQuality);
  this.vehicleReflections?.setEnabled(profile.vehicleProbe&&this.reflectionsEnabled&&!this.tank?.active);
  if(this.ready){this.vegetation();this.cull();}
 }

 flight:CityFlight|null=null;private flightRequest=0;onAircraftInteract:(()=>boolean)|null=null;
 tank:CityTank|null=null;rider:CityRider|null=null;riderLoading=false;walkFirstPerson=false;private riderYaw=0;private riderPending:Promise<boolean>|null=null;private walkingTransition=false;private tankRequest=0;
 coastal:Awaited<ReturnType<typeof loadCoastalInfrastructure>>|null=null;bayWater:ReturnType<typeof createBayWater>|null=null;publicLighting:ReturnType<typeof createPublicLighting>|null=null;private lampAssignments=[-1,-1];
 coastalHorizon:ReturnType<typeof createCoastalHorizon>[]=[];
 propObstacles:{x:number;z:number;heading:number}[]=[];
 buildingSigns:Awaited<ReturnType<typeof attachCityBuildingSigns>>|null=null;
 vehicleMaterials:ReturnType<typeof refineHeroVehicleMaterials>|null=null;audio=new CityAudio();autopilot:CityAutopilot|null=null;cockpit:ReturnType<typeof createCityCockpit>|null=null;tailLights:ReturnType<typeof createCityTailLights>|null=null;streetFurniture:CityStreetFurniture|null=null;bambooCorridor:ReturnType<typeof createBambooCorridor>|null=null;
 drivingInput:DrivingInput={throttle:0,steer:0,handbrake:false};private previousAutoPhase='idle';
 cinematic:Awaited<ReturnType<typeof createCinematicLook>>|null=null;
 bambooLook:ReturnType<typeof createBambooLook>|null=null;
 bambooCafe:Awaited<ReturnType<typeof createBambooCafe>>|null=null;
 bayparkLook:ReturnType<typeof createBayparkLook>|null=null;
 localLighting:ReturnType<typeof createLocalLighting>|null=null;
 roadSurface:ReturnType<typeof applyCinematicRoad>|null=null;
 rainPuddles:ReturnType<typeof createRainPuddles>|null=null;
 rainWeather:ReturnType<typeof createCityRainWeather>|null=null;raining=false;
 groundRelief:Awaited<ReturnType<typeof loadCityGroundRelief>>|null=null;
 mountains:Awaited<ReturnType<typeof loadCityMountains>>|null=null;
 private nextDetailUpdate=0;private detailWasMoving=false;private previousDetailFocus={x:Infinity,z:Infinity};
 private sceneryTop=0;
 vehicleReflections:ReturnType<typeof createVehicleReflections>|null=null;
 vehicleFinish:ReturnType<typeof applyCinematicVehicleFinish>|null=null;
 sportDetails:ReturnType<typeof createCitySportDetails>|null=null;
 instrumentation!:SceneInstrumentation; gpuInstrumentation!:EngineInstrumentation; updateMs=0; renderMs=0; ao:SSAO2RenderingPipeline|null=null; debugSimulation=true; debugFacades=true; facadeStream:CityFacadeStream|null=null; aerial=false; observer=new CityObserver(); overviewEffects=false; renderFrames=0;
 architecture!:ReturnType<typeof createArchitectureMaterials>; facadeDiversity!:ReturnType<typeof createFacadeDiversity>; landscape:CityLandscape|null=null; canopy:CityCanopy|null=null; rooftops:CityRooftops|null=null; roofSurface!:ReturnType<typeof createRoofSurface>; ambient!:ReturnType<typeof createCityAmbient>; signage:Awaited<ReturnType<typeof loadLandmarkSignage>>|null=null; wheelRadius=.4404; lastLandscapeAerial=false;
 engine:Engine;scene:Scene;camera:FreeCamera;car:TransformNode;data!:CityData;collision!:CityCollision;
 state:CarState={x:0,z:0,yaw:0,speed:0,steer:0,distance:0};ready=false;paused=false;night=false;lightMode:'sunset'|'night'|'day'='sunset';walk:CityWalk|null=null;debugEpoch=0;view=0;keys=new Set<string>();
 groundHeight:(x:number,z:number)=>number=()=>0;detailManifest:LandmarkDetailManifest|null=null;candidateManifest:LandmarkCandidateManifest|null=null;carFill:PointLight|null=null;traffic:CityTraffic|null=null;signals:CityTrafficSignals|null=null;ebikes:CityEbikes|null=null;pedestrians:CityPedestrians|null=null;trafficSources:AbstractMesh[]=[];trafficAlternateSources:AbstractMesh[]=[];wheelSpin=0;
 onTick:((dt:number)=>void)|null=null;onMessage:((s:string)=>void)|null=null;
 refreshNavigation:(()=>void)|null=null;
 taskSurface:{heightAt:(x:number,z:number)=>number|null;blocked:(x:number,z:number)=>boolean;contains?:(x:number,z:number)=>boolean;weaponBoxes?:import('./offmap-interior-layout.ts').InteriorBox[]}|null=null;
 taskVehicle:{x:number;y:number;z:number;yaw:number;speed:number;mode?:string;navigationClear?:(x:number,z:number)=>boolean;look?:(dx:number,dy:number)=>void;reset?:()=>void;toggleView?:()=>void;interact?:()=>string|void;step:(keys:ReadonlySet<string>,dt:number)=>void;camera:{eye:Vector3;target:Vector3}}|null=null;
 taskFlightPaused=false;flightMissionText:string|null=null;
 // Distinguish asynchronous boarding from a user/menu pause. The evaluator
 // waits for this transition without advancing simulation or task time.
 nativeFlightLoading=false;nativeFlightTransitionId=0;
 private flightCar:NativeFlightCar|null=null;
 get flightCarRemoved(){return this.flightCar?.removed??false;}
 setFlightCarRemoved(removed:boolean){
  if(this.scene.isDisposed||this.flightCarRemoved===removed)return;
  this.flightCar??=new NativeFlightCar(this.scene,[this.car,this.vehicleLightRig]);
  this.flightCar.setRemoved(removed);
  if(removed){this.state.speed=0;this.state.steer=0;this.cancelAutoDrive('flight-task');}
  else this.car.setEnabled(!this.walk?.active&&!this.taskVehicle&&!this.tank?.active&&!this.nativeDriveModel);
  this.cull();
 }
 climbSite:NativeClimbSite|null=null;
 nativeDrivingThirdPerson=false;
 /** Search missions start without an owned car; reset must remain on foot. */
 roadsideFootSpawn:{x:number;z:number;yaw:number}|null=null;
 routeVehicleMission:string|null=null;
 carChoiceActive=false;
 parkedChoices:{model:NativeDriveVehicle;pose:ChoicePose}[]=[];
 get carPerformance(){return this.carChoiceActive&&this.nativeDriveModel?.kind!=='sports-car'?ECONOMY_PERFORMANCE:SPORTS_PERFORMANCE;}
 clearCarChoices(){for(const v of this.parkedChoices)v.model.dispose();this.parkedChoices=[];this.carChoiceActive=false;}
 async placeCarChoices(layout:CarChoiceLayout){
  this.clearCarChoices();this.carChoiceActive=true;
  const sports=new NativeDriveVehicle(this.scene,'sports-car'),ordinary=new NativeDriveVehicle(this.scene,'traffic-sedan');
  this.parkedChoices=[{model:sports,pose:layout.sports},{model:ordinary,pose:layout.ordinary}];
  try{
   await sports.load();ordinary.loadTraffic(this.traffic!.meshes[1],1);
   for(const v of this.parkedChoices){v.model.sync(v.pose,this.groundHeight,0);v.model.setDriverVisible(false);await v.model.prepareForRendering();}
  }catch(error){this.clearCarChoices();throw error;}
 }
 private parkChoiceVehicle(){
  if(!this.nativeDriveModel)return;
  this.nativeDriveModel.setDriverVisible(false);
  this.parkedChoices.push({model:this.nativeDriveModel,pose:{...this.state,speed:0,steer:0}});
  this.nativeDriveModel=null;
 }
 vehicleInteraction:VehicleInteraction|null=null;
 vehicleBoardingLoading=false;
 private boardingAttempt:AbortController|null=null;
 private trafficBoardingPool=new Map<number,NativeDriveVehicle[]>();
 private trafficBoardingReady:Promise<void>|null=null;
 cancelVehicleBoarding(){this.boardingAttempt?.abort(new Error('Vehicle boarding cancelled by reset'));this.boardingAttempt=null;this.vehicleBoardingLoading=false;this.walkingTransition=false;}
 private recycleTrafficVehicle(model:NativeDriveVehicle){
  if(model.trafficGroup===null||model.root.isDisposed()){model.dispose();return;}
  const pool=this.trafficBoardingPool.get(model.trafficGroup)??[];
  if(pool.length>=2){model.dispose();return;}
  model.setDoor(1,0);for(const mesh of model.meshes)mesh.layerMask=0;
  pool.push(model);this.trafficBoardingPool.set(model.trafficGroup,pool);
 }
 /** Compile standalone (non-instanced) bodies and doors before the task clock
  * starts. Excluded from camera layers, but enabled for complete readiness.
  */
 async prepareTrafficBoarding(){
  if(!this.traffic)return;
  if(!this.trafficBoardingReady)this.trafficBoardingReady=(async()=>{
   for(let group=0;group<this.traffic!.meshes.length;group++)for(let spare=this.trafficBoardingPool.get(group)?.length??0;spare<2;spare++){
    const model=new NativeDriveVehicle(this.scene,'traffic-sedan');
    try{model.loadTraffic(this.traffic!.meshes[group],group);model.sync(this.state,this.groundHeight,0);for(const mesh of model.meshes)mesh.layerMask=0;await model.prepareForRendering();this.recycleTrafficVehicle(model);}
    catch(error){model.dispose();throw error;}
   }
  })().catch(error=>{this.trafficBoardingReady=null;throw error;});
  await this.trafficBoardingReady;
 }
 private heroDoors:VehicleDoors|null=null;
 private parkedHeroVisible=false;
 private updateCarDoor(side:number,openness:number){
  if(this.nativeDriveModel){this.nativeDriveModel.setDoor(side,openness);return;}
  if(!this.heroDoors){this.heroDoors=attachNativeVehicleDoors(this.car,this.carMeshes,{width:2.1,height:1.45,seatZ:.2});this.carMeshes.push(...this.heroDoors.meshes);}
  this.heroDoors.update(side,openness);
 }
 cancelVehicleInteraction(){
  if(!this.vehicleInteraction)return;
  this.updateCarDoor(this.vehicleInteraction.side,0);this.vehicleInteraction=null;this.rider?.setLocomotionPose(null);
 }
 private entryDoor(car:{x:number;z:number;yaw:number},offset=1.9):VehiclePoint|null{
  const w=this.walk!;
  const doors=[offset,-offset].map(side=>({x:car.x+Math.cos(car.yaw)*side,z:car.z-Math.sin(car.yaw)*side})).sort((a,b)=>Math.hypot(a.x-w.x,a.z-w.z)-Math.hypot(b.x-w.x,b.z-w.z));
  for(const door of doors){
   const distance=Math.hypot(door.x-w.x,door.z-w.z);if(distance>2.7)continue;let clear=true;
   for(let i=0,n=Math.max(1,Math.ceil(distance/.12));i<=n;i++){const x=w.x+(door.x-w.x)*i/n,z=w.z+(door.z-w.z)*i/n,y=this.walkingSurfaceHeight(x,z);if(!w.clear(x,z,y)||Math.abs(y-w.y)>.55){clear=false;break;}}
   if(clear)return {...door,y:this.walkingSurfaceHeight(door.x,door.z),yaw:car.yaw};
  }return null;
 }
 private beginVehicleInteraction(kind:'enter'|'exit',door:VehiclePoint){
  const w=this.walk!,car={x:this.state.x,z:this.state.z,y:this.groundHeight(this.state.x,this.state.z),yaw:this.state.yaw};
  this.state.speed=0;this.state.steer=0;this.cancelAutoDrive('vehicle-interaction');
  const fit=this.nativeDriveModel?NATIVE_DRIVE_VEHICLES[this.nativeDriveModel.kind]:{width:2.1,height:1.45,seat:[0,0,.2]};
  this.vehicleInteraction=createVehicleInteraction(kind,car,{x:w.x,y:w.feetY,z:w.z,yaw:this.riderYaw},door,{width:fit.width,height:fit.height,seatZ:fit.seat[2]});
  this.parkedHeroVisible=!this.nativeDriveModel;this.car.setEnabled(!this.nativeDriveModel);this.walkFirstPerson=false;this.view=0;
  this.updateCarDoor(this.vehicleInteraction.side,0);this.keys.clear();this.cull();
 }
 private advanceVehicleInteraction(dt:number){
  const v=this.vehicleInteraction,w=this.walk;if(!v||!w)return;
  const sample=stepVehicleInteraction(v,dt);
  if(dt>0&&v.kind==='enter'&&sample.phase==='approach'&&(!w.clear(sample.pose.x,sample.pose.z,sample.pose.y)||!streetSweepClear(this.walkStreetBody(),{...this.walkStreetBody(),x:sample.pose.x,z:sample.pose.z},this.streetBodies()))){this.cancelVehicleInteraction();return;}
  this.updateCarDoor(v.side,sample.doorOpen);
  if(v.kind==='enter'){w.x=sample.phase==='approach'?sample.pose.x:v.door.x;w.z=sample.phase==='approach'?sample.pose.z:v.door.z;w.y=v.door.y;w.speed=0;w.moving=false;}
  if(!sample.complete)return;
  if(v.kind==='enter'){w.active=false;this.rider?.setEnabled(false);this.parkedHeroVisible=false;this.cameraYaw=this.state.yaw;}
  else{Object.assign(w,{x:v.door.x,z:v.door.z,yaw:this.state.yaw,active:true,speed:0,moving:false});w.resetMotion();this.riderYaw=w.yaw;this.cameraYaw=w.yaw;this.rider?.setEnabled(true);}
  this.cancelVehicleInteraction();this.cull();
 }
 get searchingForVehicle(){return (!!this.routeVehicleMission||this.carChoiceActive)&&!this.nativeDriveModel;}
 look(dx:number,dy:number){applyCityCameraLook(this,dx,dy);}
 toggleDrivingView(){this.view=nextDrivingView(this.view,this.nativeDrivingThirdPerson);this.onMessage?.(["Close Shot","Cockpit Camera","Long Shot","Medium Shot"][this.view]);}
 resetNativeDrivingCamera(){
  this.view=0;this.walkFirstPerson=false;this.cameraPitch=.22;this.cameraYaw=this.state.yaw;this.drag=false;this.viewReturn=0;
  const ground=this.playerWaterEnabled?Math.max(this.carSurfaceHeight(this.state.x,this.state.z),this.coastal?.manifest.waterHeight??-.25):this.groundHeight(this.state.x,this.state.z);
  const shot=nativeDrivingStartCamera(this.state,ground,!!this.nativeSemiTrailer||this.nativeDriveModel?.kind==='box-truck');
  this.camera.position.copyFromFloats(...shot.eye);this.camera.setTarget(Vector3.FromArray(shot.target));this.camera.minZ=.75;this.camera.fov=.8;this.cockpit?.setActive(false);
 }
 taskVegetationReserved(x:number,z:number,radius=0){const site=this.nativeFootSite;return !!site&&'vegetationReserved' in site&&site.vegetationReserved(x,z,radius);}
 samples:number[]=[];sun:DirectionalLight;hemi:HemisphericLight;shadows:ShadowGenerator;pipeline:DefaultRenderingPipeline;mirror:MirrorTexture;waterMirror:MirrorTexture;
 blocks:{mesh:AbstractMesh;x:number;z:number;road:boolean;detail?:boolean}[]=[];landmarks:AbstractMesh[]=[];carMeshes:AbstractMesh[]=[];
 reflectionsEnabled=true;private reflectionEye=new Vector3(1e9,0,0);private reflectionDirection=new Vector3();private reflectionMotionUntil=0;reflectionFrames={road:0,water:0};
 lastCull=new Vector3(1e9,0,1e9);lastVegetation=new Vector3(1e9,0,1e9);roadName="Binhai Boulevard";offroad=false;cameraYaw=0;cameraPitch=.22;drag=false;pointer=[0,0];viewReturn=0;time=0;skyMat!:ShaderMaterial;headlights:SpotLight[]=[];vehicleLightRig!:TransformNode;carHeadlightAnchors:[number,number,number][]=[[-.6,.82,2.25],[.6,.82,2.25]];streetLights:PointLight[]=[];windowLights:PointLight[]=[];lampData:number[][]=[];lightTick=0;lightTargets:{position:Vector3;power:number}[]=[];windowSources:{x:number;z:number}[]=[];photoTarget:Landmark|null=null;photoAngle=.5;photoElevation=.32;photoDistance=250;
 constructor(public canvas:HTMLCanvasElement){
  this.engine=new Engine(canvas,true,{stencil:true,powerPreference:'high-performance'},false);this.resize();
  this.scene=new Scene(this.engine);this.scene.clearColor=new Color4(.39,.54,.63,1);this.scene.fogMode=Scene.FOGMODE_EXP2;this.scene.fogDensity=.000115;this.scene.fogColor=new Color3(.38,.24,.30);
  const ip=this.scene.imageProcessingConfiguration;ip.toneMappingEnabled=true;ip.toneMappingType=1;ip.exposure=1.05;ip.contrast=1.14;
  this.instrumentation=new SceneInstrumentation(this.scene);this.instrumentation.captureActiveMeshesEvaluationTime=true;this.instrumentation.captureRenderTargetsRenderTime=true;this.instrumentation.captureRenderTime=true;this.gpuInstrumentation=new EngineInstrumentation(this.engine);this.gpuInstrumentation.captureGPUFrameTime=true;this.gpuInstrumentation.captureShaderCompilationTime=true;
  this.camera=new FreeCamera('driving-chase',new Vector3(0,4,-8),this.scene);this.camera.minZ=.75;this.camera.maxZ=18000;this.camera.fov=.9;this.camera.inputs.clear();
  this.hemi=new HemisphericLight('sky-bounce',new Vector3(0,1,0),this.scene);this.hemi.diffuse=new Color3(.70,.80,1.0);this.hemi.groundColor=new Color3(.32,.27,.30);this.hemi.intensity=.88;
  this.sun=new DirectionalLight('sunset',new Vector3(.95,-.22,.18),this.scene);this.sun.diffuse=new Color3(1,.41,.18);this.sun.intensity=3.0;this.sun.shadowMinZ=1;this.sun.shadowMaxZ=1200;this.sun.autoUpdateExtends=false;this.sun.orthoLeft=-260;this.sun.orthoRight=260;this.sun.orthoTop=260;this.sun.orthoBottom=-260;
  this.shadows=new ShadowGenerator(2048,this.sun);this.shadows.usePercentageCloserFiltering=true;this.shadows.filteringQuality=ShadowGenerator.QUALITY_LOW;this.shadows.bias=SHADOW_BIAS.street.depth;this.shadows.normalBias=SHADOW_BIAS.street.normal;
  this.pipeline=new DefaultRenderingPipeline('city-optics',true,this.scene,[this.camera]);this.pipeline.samples=1;this.pipeline.fxaaEnabled=true;this.pipeline.bloomEnabled=true;this.pipeline.bloomThreshold=.90;this.pipeline.bloomWeight=.34;this.pipeline.bloomKernel=72;this.pipeline.bloomScale=.5;
  // The scene target must be half-float so HDR survives into bloom and ACES;
  // the default 8-bit pass clipped every highlight when this pipeline owned
  // the scene. MSAA on that target is applied by `syncPostChain`.
  if(SSAO2RenderingPipeline.IsSupported){const gbuffer=this.scene.enableGeometryBufferRenderer(STREET_AO.bufferRatio);if(gbuffer){gbuffer.renderList=[];const ao=this.ao=new SSAO2RenderingPipeline('contact-shading',this.scene,{ssaoRatio:STREET_AO.aoRatio,blurRatio:STREET_AO.blurRatio},[this.camera],gbuffer,this.engine.getCaps().textureHalfFloatRender?Constants.TEXTURETYPE_HALF_FLOAT:Constants.TEXTURETYPE_UNSIGNED_INT);ao.radius=STREET_AO.radius;ao.totalStrength=STREET_AO.strength;ao.base=STREET_AO.base;ao.samples=8;ao.expensiveBlur=false;ao.maxZ=STREET_AO.maxZ;}}
  this.sky();this.environment();this.roofSurface=createRoofSurface(this.scene);this.ambient=createCityAmbient(this.scene);
  // Every architecture material (ordinary blocks, near facades, landmark glass) reads the baked city occlusion; roofs sample at their own height.
  this.architecture=createArchitectureMaterials(this.scene,(id,material)=>{if(id==='city-roof')this.roofSurface.attach(material);this.ambient.attach(material,id==='city-roof'?'roof':'wall');});this.facadeDiversity=createFacadeDiversity(this.scene);
  this.car=new TransformNode('player-electric-GT',this.scene);
  this.mirror=new MirrorTexture('wet-road-reflection',512,this.scene,true);this.mirror.mirrorPlane=new Plane(0,-1,0,.105);this.mirror.refreshRate=2;this.mirror.blurKernel=7;this.mirror.level=.65;
  this.waterMirror=new MirrorTexture('bay-reflection',512,this.scene,true);this.waterMirror.mirrorPlane=new Plane(0,-1,0,-.12);this.waterMirror.refreshRate=3;this.waterMirror.blurKernel=1;this.waterMirror.level=.68;
  // Sky first: its finite radius must never overwrite more distant terrain.
  // Mirrors own separate render queues and need the same ordering.
  const atmosphere=this.scene.getMeshByName('atmosphere');
  const skyFirst=(a:SubMesh,b:SubMesh)=>Number(b.getMesh()===atmosphere)-Number(a.getMesh()===atmosphere)||RenderingGroup.PainterSortCompare(a,b);
  this.scene.setRenderingOrder(0,skyFirst);
  for(const mirror of [this.mirror,this.waterMirror]){
   mirror.setRenderingOrder(0,skyFirst);
   // Infinite-distance meshes follow the real camera. During an RTT center
   // the sky at the reflected eye as well, including at 2200m drone height.
   const inverseView=Matrix.Identity(),savedSkyPosition=new Vector3();
   mirror.onBeforeRenderObservable.add(()=>{
    if(!atmosphere)return;savedSkyPosition.copyFrom(atmosphere.position);
    this.scene.getViewMatrix().invertToRef(inverseView);
    inverseView.getTranslationToRef(atmosphere.position);
    atmosphere.position.subtractInPlace(this.camera.globalPosition);
    atmosphere.computeWorldMatrix(true);
   });
   mirror.onAfterRenderObservable.add(()=>{
    if(!atmosphere)return;atmosphere.position.copyFrom(savedSkyPosition);atmosphere.computeWorldMatrix(true);
   });

   // Explicit RTT lists bypass Babylon's normal frustum culling. This callback
   // runs after MirrorTexture installs its reflected view matrix.
   mirror.getCustomRenderList=(_face,list,length)=>{
    if(!list)return null;const planes=Frustum.GetPlanes(this.scene.getTransformMatrix()),visible:AbstractMesh[]=[];
    for(let i=0;i<length;i++){const m=list[i];if(m===atmosphere||m.isInFrustum(planes))visible.push(m);}
    return visible;
   };
  }
  this.mirror.onAfterRenderObservable.add(()=>{this.reflectionFrames.road=this.renderFrames;});this.waterMirror.onAfterRenderObservable.add(()=>{this.reflectionFrames.water=this.renderFrames;});
  // Attach timing observers after the object renderers exist.
  this.instrumentation.captureRenderTargetsRenderTime=false;
  this.instrumentation.captureRenderTargetsRenderTime=true;
  // Vehicle lights hang off a rig that is never disabled. Disabling the car
  // node while the tank is driven would disable these lights too, and every
  // light enable/disable changes the light layout of each nearby PBR shader:
  // ~90 programs recompile per vehicle switch, a 1-2 s stall with holes
  // where meshes wait for their new effect. The rig follows the active vehicle.
  this.vehicleLightRig=new TransformNode('vehicle-light-rig',this.scene);
  for(const side of [-1,1]){const light=new SpotLight('headlight',new Vector3(side*.6,0.82,2.25),new Vector3(0,-.055,1),Math.PI/3,4,this.scene);light.parent=this.vehicleLightRig;light.diffuse=new Color3(.78,.87,1);light.intensity=250;light.range=65;this.headlights.push(light);}
  window.addEventListener('resize',()=>{this.resize();this.engine.resize();});
  window.addEventListener('keydown',e=>{if(e.target instanceof HTMLElement&&e.target.closest('input,textarea,select,[contenteditable=true]'))return;if(handleCityCameraKey(this,e.code,e.repeat)){e.preventDefault();return;}if(this.flight?.active&&['KeyF','KeyG','KeyV','KeyB'].includes(e.code)){e.preventDefault();if(e.repeat||this.taskFlightPaused)return;if(e.code==='KeyG'){this.flight.sim.controlKey(e.code,true);this.onMessage?.(this.flight.model!=='plane'?"This helicopter uses fixed landing gear":this.flight.sim.onGround?"Once airborne, press G Retract landing gear":this.flight.sim.gearTargetDown?"Lowering landing gear":"Retracting landing gear");}if(e.code==='KeyV')this.flight.cameraView=(this.flight.cameraView+1)%2;if(e.code==='KeyF'&&!this.onAircraftInteract?.())this.exitAircraft();return;}if(e.code==='KeyF'&&!e.repeat&&!this.paused&&this.walk?.active&&(this.onAircraftInteract?.()||this.boardParkedAircraft())){e.preventDefault();return;}if(['KeyW','KeyS','KeyA','KeyD','ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Numpad8','Numpad5','Numpad4','Numpad6','Space','Tab'].includes(e.code))e.preventDefault();this.keys.add(e.code);if(!this.paused&&['KeyW','KeyS','KeyA','KeyD','ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Space'].includes(e.code))this.cancelAutoDrive('manual-takeover');if(e.repeat)return;if(e.code==='KeyB')void this.toggleFlight();if(e.code==='KeyT')void this.toggleTank();if(e.code==='Space'&&this.flight?.active)this.flight.fire();else if((e.code==='Enter'||e.code==='Space')&&this.controlMode==='tank'&&!this.paused)this.tank?.fire();if(e.code==='KeyH')this.audio.cue('horn');if(e.code==='KeyG')this.toggleAerial();if(e.code==='KeyR'&&!this.observer.active)this.resetRoad();if(e.code==='KeyL')this.toggleLight();if(e.code==='KeyY')this.toggleRain();if(e.code==='KeyO'&&(!this.paused||this.observer.active)){if(this.observer.active)this.exitPhoto();else this.enterPhoto({id:'car',name:"Crimson Bay GT",x:this.state.x,z:this.state.z,height:1.45,area:"Vehicle",excludeRadius:0,arrival:[this.state.x,this.state.z],yaw:this.state.yaw,photoDistance:7.7,photoElevation:.18,photoAngle:this.state.yaw+Math.PI+.65,photoTargetHeight:this.groundHeight(this.state.x,this.state.z)+.65});}if(e.code==='KeyF'){if(this.observer.active)this.exitPhoto();else if(!this.paused)void this.toggleWalking();}});
  window.addEventListener('keyup',e=>{this.keys.delete(e.code);this.flight?.sim.controlKey(e.code,false);});window.addEventListener('blur',()=>{this.keys.clear();this.drag=false;});
  let dragPointer:number|null=null,touchCentroid:{x:number;y:number}|null=null;
  const endDrag=()=>{this.drag=false;dragPointer=null;touchCentroid=null;this.viewReturn=2;};
  canvas.style.touchAction='none';
  canvas.addEventListener('contextmenu',e=>e.preventDefault());
  canvas.addEventListener('pointerdown',e=>{if(document.pointerLockElement===canvas||e.pointerType==='touch'||![0,2].includes(e.button))return;this.drag=true;dragPointer=e.pointerId;this.pointer=[e.clientX,e.clientY];canvas.setPointerCapture(e.pointerId);});
  canvas.addEventListener('pointerup',endDrag);canvas.addEventListener('pointercancel',endDrag);canvas.addEventListener('lostpointercapture',endDrag);window.addEventListener('blur',endDrag);
  canvas.addEventListener('pointermove',e=>{if(!this.drag||e.pointerId!==dragPointer||!e.buttons)return;const dx=e.clientX-this.pointer[0],dy=e.clientY-this.pointer[1];if(this.observer.active){if(!this.flight?.active){if(e.shiftKey)this.observer.pan(dx,dy,canvas.clientHeight);else this.observer.rotate(dx,dy);}}else{this.look(dx,dy);}this.pointer=[e.clientX,e.clientY];});
  const touchPosition=(touches:TouchList)=>{let x=0,y=0;for(const touch of Array.from(touches)){x+=touch.clientX;y+=touch.clientY;}return {x:x/touches.length,y:y/touches.length};};
  canvas.addEventListener('touchstart',e=>{if(e.touches.length){touchCentroid=touchPosition(e.touches);e.preventDefault();}},{passive:false});
  canvas.addEventListener('touchmove',e=>{if(!touchCentroid||!e.touches.length)return;e.preventDefault();const next=touchPosition(e.touches),dx=next.x-touchCentroid.x,dy=next.y-touchCentroid.y;if(this.observer.active){if(!this.flight?.active){if(e.shiftKey)this.observer.pan(dx,dy,canvas.clientHeight);else this.observer.rotate(dx,dy);}}else{this.look(dx,dy);}touchCentroid=next;},{passive:false});
  canvas.addEventListener('touchend',e=>{touchCentroid=e.touches.length?touchPosition(e.touches):null;});canvas.addEventListener('touchcancel',endDrag);
  canvas.addEventListener('wheel',e=>{if(this.observer.active){e.preventDefault();if(!this.flight?.active)this.observer.zoom(e.deltaY);}else if(this.walk?.active&&!this.paused){e.preventDefault();this.walk.zoom(e.deltaY);}},{passive:false});
  this.engine.runRenderLoop(()=>{if(document.hidden||!this.ready)return;const raw=this.engine.getDeltaTime(),dt=Math.min(raw/1000,.05);const begin=performance.now();if(this.ready){if(this.debugSimulation)this.update(dt);if(this.samples.length<36000)this.samples.push(raw);}this.updateMs=this.updateMs*.9+(performance.now()-begin)*.1;const render=performance.now();this.scene.render();this.renderFrames++;this.renderMs=this.renderMs*.9+(performance.now()-render)*.1;});
  document.addEventListener('visibilitychange',()=>{this.keys.clear();this.drag=false;this.engine.getDeltaTime();});
  if(new URLSearchParams(location.search).has('profile'))this.profileControls();
 }
 resize(){const ratio=cityGraphicsRenderRatio(this.graphicsQuality,innerWidth,innerHeight,devicePixelRatio||1);this.engine?.setHardwareScalingLevel(1/ratio);}
 private environment(){
  const n=128,faces=[];for(let face=0;face<6;face++){const arr=new Uint8Array(n*n*3);for(let y=0;y<n;y++)for(let x=0;x<n;x++){const u=x/(n-1)*2-1,v=y/(n-1)*2-1;let d:Vector3;switch(face){case 0:d=new Vector3(1,-v,-u);break;case 1:d=new Vector3(-1,-v,u);break;case 2:d=new Vector3(u,1,v);break;case 3:d=new Vector3(u,-1,-v);break;case 4:d=new Vector3(u,-v,1);break;default:d=new Vector3(-u,-v,-1);}d.normalize();const h=clamp(d.y*1.5,0,1),sun=Math.pow(Math.max(0,Vector3.Dot(d,new Vector3(-.95,.16,-.18).normalize())),9);const c=d.y<0?[.34,.31,.35]:[.64-h*.30+sun*.35,.49-h*.13+sun*.13,.56+h*.12-sun*.17];for(let j=0;j<3;j++)arr[(y*n+x)*3+j]=Math.min(255,c[j]*255);}faces.push(arr);}
  const env=new RawCubeTexture(this.scene,faces,n,Engine.TEXTUREFORMAT_RGB,Engine.TEXTURETYPE_UNSIGNED_BYTE,true,false,Texture.TRILINEAR_SAMPLINGMODE);env.gammaSpace=true;this.scene.environmentTexture=env;this.scene.environmentIntensity=.85;
 }

 private sky(){
  Effect.ShadersStore['szSkyVertexShader']='precision highp float;attribute vec3 position;uniform mat4 worldViewProjection;varying vec3 vP;void main(){vP=position;gl_Position=worldViewProjection*vec4(position,1.);}';
  Effect.ShadersStore['szSkyFragmentShader']=`precision highp float;varying vec3 vP;uniform float night;
  float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
  float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x),f.y);}
  float fbm(vec2 p){float f=0.,a=.5;for(int i=0;i<5;i++){f+=noise(p)*a;p=p*2.03+17.;a*=.5;}return f;}
  void main(){vec3 p=normalize(vP);vec3 sd=normalize(vec3(-.95,.16,-.18));float west=pow(max(0.,dot(p,sd)),4.);float h=smoothstep(-.05,.72,p.y);
  vec3 horizon=mix(vec3(.42,.24,.35),vec3(.94,.32,.115),west);vec3 c=mix(horizon,vec3(.047,.12,.25),h);
  float glow=pow(max(0.,dot(p,sd)),22.);c+=vec3(.5,.18,.055)*glow;
  float sun=pow(max(0.,dot(p,sd)),4200.);c+=vec3(5.,2.2,.6)*sun;
  vec2 uv=p.xz/max(.14,p.y+.08)*2.0;uv.x*=.52;float cloud=fbm(uv+fbm(uv*.4)*1.6);float stripe=noise(vec2(uv.x*.8,uv.y*4.))* .13;
  float mask=smoothstep(.40,.66,cloud+stripe)*smoothstep(.01,.12,p.y)*(1.-smoothstep(.55,.99,p.y));
  vec3 cloudDark=mix(vec3(.18,.17,.29),vec3(.38,.16,.20),west);vec3 cloudLit=mix(vec3(.68,.31,.38),vec3(1.25,.34,.10),west);
  float rim=smoothstep(.46,.53,cloud)*(1.-smoothstep(.54,.65,cloud));vec3 cloudColor=mix(cloudDark,cloudLit,rim*.85+.24*west);
  c=mix(c,cloudColor,mask*.85);c=mix(c,c*vec3(.12,.22,.44),night);gl_FragColor=vec4(c,1.);}`;
  this.skyMat=new ShaderMaterial('sky',this.scene,{vertex:'szSky',fragment:'szSky'},{attributes:['position'],uniforms:['worldViewProjection','night']});this.skyMat.backFaceCulling=false;this.skyMat.disableDepthWrite=true;this.skyMat.setFloat('night',0);
  const sky=MeshBuilder.CreateSphere('atmosphere',{diameter:8000,segments:24},this.scene);sky.material=this.skyMat;sky.infiniteDistance=true;sky.isPickable=false;sky.applyFog=false;keepSkyInReflections(sky);
 }
 private async load(name:string){const r=await ImportMeshAsync('/city/'+name+'.glb',this.scene);r.meshes[0].rotationQuaternion=Quaternion.Identity();for(const m of r.meshes){m.isPickable=false;m.receiveShadows=true;if(m.material instanceof PBRMaterial){m.material.environmentIntensity=1.0;m.material.forceIrradianceInFragment=true;m.material.maxSimultaneousLights=8;
   // Ground planes of the base city (lawn, pavement, plaza concrete, asphalt, markings) receive the baked city occlusion; water and lamps do not.
   if((name==='terrain'||name==='roads')&&GROUND_AMBIENT_MATERIALS.has(m.material.name))this.ambient.attach(m.material,'ground');}if(m.getTotalVertices())m.freezeWorldMatrix();}this.architecture.applyMeshes(r.meshes,name);this.facadeDiversity.applyMeshes(r.meshes,name);return r;}
 async init(progress:(s:string)=>void){
  progress("Unfolding the Shenzhen map");const ambientLoading=this.ambient.load();const response=await fetch('/city/city.json');if(!response.ok)throw Error("Map loading failed");this.data=await response.json();await loadRoadDisplayNames(this.data);const detail=await loadLandmarkDetails(this.data);if(detail){this.groundHeight=detail.heightAt;this.detailManifest=detail.manifest;}this.candidateManifest=await loadLandmarkCandidates(this.data);progress("Unfolding Shenzhen ridgelines");this.mountains=await loadCityMountains(this.groundHeight);this.groundHeight=this.mountains.heightAt;progress("Laying out gentle park slopes");this.groundRelief=await loadCityGroundRelief(this.groundHeight,undefined,false);this.groundHeight=this.groundRelief.heightAt;progress("Building bridges over water");this.coastal=await loadCoastalInfrastructure(this.data,this.groundHeight);this.groundHeight=this.coastal.heightAt;this.collision=new CityCollision(this.data);const walkingWorld=this;this.walk=new CityWalk((x,z,y)=>this.walkingBlocked(x,z,y),(x,z)=>this.walkingSurfaceHeight(x,z),{floorAt:(x,z,y)=>this.walkingFloorAt(x,z,y),get ladders(){const site=walkingWorld.nativeFootSite;return [...(walkingWorld.climbSite?[walkingWorld.climbSite.ladder]:[]),...(site&&'manualLadders' in site?site.manualLadders:[])];}});this.windowSources=[];this.state={...this.data.spawn,speed:0,steer:0,distance:0};
  progress("Laying out the coastline and city roads");await this.load('terrain');const roads=await this.load('roads');this.mountains?.drapePaths(roads.meshes);for(const name of ['coastal-bridges','coastal-shoreline','opposite-shore']){const part=await this.load(name);for(const mesh of part.meshes.filter(m=>m.getTotalVertices()>0)){mesh.receiveShadows=name!=='opposite-shore';if(name==='opposite-shore'){clearBackdropWaterways(mesh,beachBoatRoutes.map(r=>({points:r.path.points,waterHeight:r.waterHeight})));mesh.applyFog=true;if(mesh.material instanceof PBRMaterial){mesh.material.albedoColor.set(.10,.15,.14);mesh.material.environmentIntensity=.35;}this.coastalHorizon.push(createCoastalHorizon(this.scene,mesh,this.coastal!.manifest.waterHeight));}if(name==='coastal-shoreline'&&mesh.material)mesh.material.backFaceCulling=false;this.landmarks.push(mesh);}}
  progress("Loading Nanshan, Futian, Luohu Buildings");const buildings=await this.load('buildings');this.facadeStream=new CityFacadeStream(this.scene,()=>this.cull(),(meshes,name)=>this.architecture.applyMeshes(meshes,name));await this.facadeStream.init(this.state.x,this.state.z);
  for(const mesh of [...roads.meshes,...buildings.meshes]){const m=mesh.name.match(/(?:block|roads)_(-?\d+)_(-?\d+)_/);if(m)this.blocks.push({mesh,x:(Number(m[1])+.5)*640,z:(Number(m[2])+.5)*640,road:mesh.name.startsWith('roads')});}
  progress("Assembling Shenzhen landmarks");const lm=await this.load('landmarks');this.landmarks.push(...lm.meshes.filter(m=>m.getTotalVertices()>0));if(this.detailManifest){const prefixes=this.detailManifest.replacedMeshPrefixes;for(const m of [...this.scene.meshes])if(prefixes.some(p=>m.name.startsWith(p)))m.dispose(false,false);this.blocks=this.blocks.filter(b=>!b.mesh.isDisposed());this.landmarks=this.landmarks.filter(m=>!m.isDisposed());const details=await this.load('landmark-detail');for(const mesh of details.meshes.filter(m=>m.getTotalVertices()>0)){const tile=mesh.name.match(/detail_block_(-?\d+)_(-?\d+)_/);if(tile)this.blocks.push({mesh,x:(Number(tile[1])+.5)*640,z:(Number(tile[2])+.5)*640,road:false});else this.landmarks.push(mesh);}}
  // Merged single-object candidates replace the remaining legacy base landmark silhouettes by name prefix; the source-grounded landmark-detail meshes above are never touched here.
  if(this.candidateManifest){progress("Replacing candidate landmark models");const prefixes=this.candidateManifest.replacedMeshPrefixes;for(const m of [...this.scene.meshes])if(prefixes.some(p=>m.name.startsWith(p)))m.dispose(false,false);this.landmarks=this.landmarks.filter(m=>!m.isDisposed());const candidates=await this.load('landmark-candidates');for(const m of candidates.meshes){if(!m.getTotalVertices())continue;const box=m.getBoundingInfo().boundingBox;if(isCandidateGroundSlab(m.name,box.maximumWorld.y-box.minimumWorld.y,this.candidateManifest))m.dispose(false,false);else this.landmarks.push(m);}}
  fitCandidateBuildingToFootprint(this.landmarks);
  clearNativeFlightSites(this.landmarks);this.landmarks=this.landmarks.filter(m=>!m.isDisposed());
  this.signage=await loadLandmarkSignage(this.scene);this.landmarks.push(...this.signage.meshes);
  progress("Opening Yuebai Cafe beside the Spring Bamboo");
  this.bambooCafe=await createBambooCafe(this.scene,this.groundHeight,meshes=>this.landmarks.push(...meshes));
  const cafeGround=this.groundHeight;
  this.groundHeight=(x,z)=>this.bambooCafe!.layout.floorAt(x,z,cafeGround(x,z));
  const cityGround=this.groundHeight;this.groundHeight=(x,z)=>nativeFlightSurfaceAt(x,z)??cityGround(x,z);
  this.data.landmarks.push(this.bambooCafe.layout.landmark);
  this.climbSite=new NativeClimbSite(this.groundHeight(3490,910));
  const climbScene=createNativeClimbScene(this.scene,this.climbSite);this.landmarks.push(...climbScene.meshes);
  this.data.landmarks.push(CLIMB_LANDMARK);this.scene.onDisposeObservable.addOnce(()=>climbScene.dispose());
  progress("Lighting up city signs");this.buildingSigns=await attachCityBuildingSigns(this.scene,buildings.meshes,this.data);
  progress("Starting your car");
  const [ambient,alternate]=await Promise.all([this.load('traffic-sedan-modern'),this.load('traffic-sedan-retro')]);
  this.trafficSources=ambient.meshes.filter(m=>m.getTotalVertices()>0);ambient.meshes[0].setEnabled(false);
  this.trafficAlternateSources=alternate.meshes.filter(m=>m.getTotalVertices()>0);alternate.meshes[0].setEnabled(false);
  const metadata=await fetch('/city/vehicle-manifest.json').then(r=>r.json()) as VehicleManifest;this.wheelRadius=metadata.wheelRadius;this.carHeadlightAnchors=headlightAnchors(metadata.recommendedHeadlightAnchorsGame);this.headlights.forEach((l,i)=>l.position.copyFromFloats(...this.carHeadlightAnchors[i]));const car=await this.load('car');car.meshes[0].parent=this.car;this.carMeshes=car.meshes.filter(m=>m.getTotalVertices()>0);for(const m of car.meshes){m.unfreezeWorldMatrix();const q=m.name.match(/(?:wheel|brake)_([lr][fr])_/);if(q&&m instanceof Mesh){m.setPivotPoint(Vector3.FromArray(metadata.wheelCentresGltf[q[1]]));m.rotationQuaternion=null;}}
  this.vehicleFinish=applyCinematicVehicleFinish(this.scene,this.car,this.carMeshes);this.carMeshes.push(...this.vehicleFinish.meshes);this.cockpit=createCityCockpit(this.scene,this.car,this.carMeshes);this.carMeshes.push(...this.cockpit.meshes);
  progress("Planting banyan trees, Palms and flower borders");this.landscape=new CityLandscape(this.scene,this.groundHeight,(x,z,r)=>nativeFlightReserved(x,z,r)||nativeClimbReserved(x,z,r)||this.taskVegetationReserved(x,z,r)||!!this.bambooCafe?.layout.reserved(x,z,r));await this.landscape.init();progress("Planting banyan trees, Kapok and camphor tree canopy");this.canopy=new CityCanopy(this.scene,this.groundHeight,(x,z,r)=>nativeFlightReserved(x,z,r)||nativeClimbReserved(x,z,r)||this.taskVegetationReserved(x,z,r)||!!this.bambooCafe?.layout.reserved(x,z,r));await this.canopy.init();
  progress("Placing rooftop equipment, Water tank and helipad");await ambientLoading;this.ambient.setMode(this.lightMode);try{const rooftops=new CityRooftops(this.scene);await rooftops.init();this.rooftops=rooftops;rooftops.setMode(this.lightMode);if(rooftops.plan)void this.roofSurface.load(rooftops.plan.lookup);}catch(error){console.warn('Rooftop layer unavailable; base roofs kept',error);}this.landscape.configureRoadside(this.data,{collisionFootprints:this.detailManifest?.collisionFootprints,bridgeCrossings:this.coastal?.manifest.crossings,blocked:(x,z)=>this.collision.blocked(x,z)||this.propBlocked(x,z)||!!this.canopy?.trunkNear(x,z)});progress("Placing city benches");this.streetFurniture=new CityStreetFurniture(this.scene,this.groundHeight);await this.streetFurniture.init();progress("Installing traffic lights at the intersection");this.signals=new CityTrafficSignals(this.scene,this.groundHeight);await this.signals.init();this.signals.setNight(this.night);progress("Parking the electric scooter");this.ebikes=new CityEbikes(this.scene,this.groundHeight);await this.ebikes.init();
  progress("Laying out streets around the Spring Bamboo");this.bambooCorridor=createBambooCorridor(this.scene,this.data,(x,z)=>{
  const terrain=this.groundHeight(x,z),n=this.collision.nearest(x,z);
  if(!n)return terrain+.08;
  const edge=n.d-n.road.width/2;
  return terrain+(edge<=10?.26:.08);
},{reserved:(x,z,r)=>nativeFlightReserved(x,z,r)||nativeClimbReserved(x,z,r)||!!this.bambooCafe?.layout.reserved(x,z,r)});this.bambooCorridor.setMode(this.lightMode);
  this.bambooCorridor.adoptStreetTrees(this.landscape.borrowPrototype('orchid-tree'),this.landscape.borrowPrototype('orchid-tree-lod'));
  this.bambooCorridor.adoptParkedCars(this.trafficSources);
  this.setupReflections();applyLandscapeSurfaces(this.scene);this.mountains?.attachVisuals(this.scene);this.groundRelief?.attachVisuals(this.scene);this.roadSurface=applyCinematicRoad(this.scene,this.mirror);this.setupSigns();this.pedestrians=new CityPedestrians(this.scene,this.groundHeight,(x,z)=>this.collision.blocked(x,z)||this.propBlocked(x,z));await this.pedestrians.init();this.pedestrians.place(this.state.x,this.state.z);this.lampData=await(await fetch('/city/lamps.json')).json();for(let i=0;i<2;i++){const l=new PointLight('street-light-pool-'+i,Vector3.Zero(),this.scene);l.diffuse=new Color3(1,.67,.36);l.range=26;l.intensity=70;this.streetLights.push(l);}for(let i=0;i<2;i++){const l=new PointLight('window-spill-'+i,Vector3.Zero(),this.scene);l.diffuse=new Color3(1,.42,.14);l.range=17;l.intensity=0;l.setEnabled(false);this.windowLights.push(l);}
  const parkPoles=await this.load('park-floodlight');this.publicLighting=createPublicLighting(this.scene,this.lampData,this.coastal!.manifest.parkLights,parkPoles.meshes,this.groundHeight);this.publicLighting.update(this.state.x,this.state.z,true);
  progress("Adjusting bay lighting and reflections");this.cinematic=await createCinematicLook(this);this.vehicleMaterials=refineHeroVehicleMaterials(this.scene,this.carMeshes);
  this.sportDetails=createCitySportDetails(this.scene,this.car);this.sportDetails.setMode(this.lightMode);this.carMeshes.push(...this.sportDetails.meshes);this.scene.onDisposeObservable.addOnce(()=>this.sportDetails?.dispose());
  progress("The rain has stopped, Adding roadside puddles");this.rainPuddles=createRainPuddles(this.scene,this.data,this.groundHeight,this.mirror);await this.rainPuddles.readyPromise;this.rainWeather=createCityRainWeather(this.scene,(x,z,radius,limit)=>this.rainPuddles!.nearby(x,z,radius,limit),this.sun,this.hemi);this.rainWeather.setEnabled(this.raining);this.tailLights=createCityTailLights(this.scene,this.car,this.carMeshes,this.vehicleLightRig);this.scene.onDisposeObservable.addOnce(()=>{this.rainWeather?.dispose();this.rainPuddles?.dispose();this.cockpit?.dispose();this.tailLights?.dispose();this.streetFurniture?.dispose();this.bambooCorridor?.dispose();this.audio.dispose();this.vehicleMaterials?.dispose();});
  // Sample-area surfaces keep the existing city assets, HDR and public light
  // field. Only the nearby authored fixtures receive a bounded extra shadow.
  this.bambooLook=createBambooLook(this.scene);this.bayparkLook=createBayparkLook(this.scene);
  this.localLighting=createLocalLighting({scene:this.scene,lamps:this.lampData,parkLights:this.coastal!.manifest.parkLights,heightAt:this.groundHeight,casters:()=>this.shadows.getShadowMap()?.renderList??[],stableReceivers:this.carMeshes});
  this.bambooLook.setMode(this.lightMode);this.bayparkLook.setMode(this.lightMode);this.localLighting.setMode(this.lightMode);
  this.bambooCafe.setMode(this.lightMode);
  const depthScenery=new Set([...this.blocks.map(b=>b.mesh),...this.landmarks,...this.scene.meshes.filter(m=>/^(terrain_|ground_relief_)/.test(m.name))]);
  this.sceneryTop=Math.max(0,...Array.from(depthScenery,m=>m.getBoundingInfo().boundingBox.maximumWorld.y));
  this.vehicleReflections=createVehicleReflections(this.scene,this.car,this.carMeshes,this.camera,()=>this.mirror.renderList??[]);this.scene.onDisposeObservable.addOnce(()=>this.vehicleReflections?.dispose());
  this.flight=new CityFlight(this.scene,this.data,this.groundHeight,this.landmarks,()=>this.audio.explosion(),NATIVE_FLIGHT_RUNWAYS);this.scene.onDisposeObservable.addOnce(()=>this.flight?.dispose());
  this.tank=new CityTank(this.scene,this.data,this.groundHeight,()=>this.landmarks,()=>this.audio.explosion());this.scene.onDisposeObservable.addOnce(()=>{this.tank?.dispose();this.rider?.dispose();});
  this.ready=true;void this.ensureRider();this.car.position.set(this.state.x,.12,this.state.z);this.car.rotation.y=this.state.yaw;this.cameraYaw=this.state.yaw;
  this.camera.position.set(this.state.x-Math.sin(this.state.yaw)*8,3.7,this.state.z-Math.cos(this.state.yaw)*8);this.camera.setTarget(new Vector3(this.state.x,1.1,this.state.z));this.applyGraphicsQuality();
 }
 startTraffic(graph:RoadGraph){const signalHold=(x:number,z:number,yaw:number)=>this.signals?.holdDistance(x,z,yaw)??null;const directionAllowed=(a:number,b:number)=>{const p=graph.nodes[a],q=graph.nodes[b],n=this.collision.nearest((p[0]+q[0])/2,(p[1]+q[1])/2);return !n?.road.oneway||(q[0]-p[0])*Math.sin(n.yaw)+(q[1]-p[1])*Math.cos(n.yaw)>0;};this.autopilot=new CityAutopilot(graph,this.collision,{signalHold});this.traffic=new CityTraffic(graph,this.trafficSources,this.scene,this.groundHeight,directionAllowed,this.trafficAlternateSources);this.traffic.signalHold=signalHold;this.traffic.place(this.state.x,this.state.z);if(this.ebikes){this.ebikes.attachGraph(graph,directionAllowed);this.ebikes.signalHold=signalHold;this.ebikes.place(this.state.x,this.state.z);}this.configureStreetContacts();this.cull();}
 startAutoDrive(destination:Landmark){if(this.tank?.active){this.onMessage?.("The tank uses manual driving, press T Switch back to the sedan to enable automatic navigation");return;}if(this.walk?.active){this.onMessage?.("Walk back to the car, press F Start driving after entering the vehicle");return;}if(!this.autopilot)return;if(this.observer.active)this.exitPhoto();this.keys.clear();this.paused=false;this.autopilot.start(destination);this.previousAutoPhase='driving';this.audio.cue('engage');this.onMessage?.("Automatic Driving · "+destination.name+" · Arrow Keys / WASD Take over anytime");}
 cancelAutoDrive(reason='manual-takeover'){const status=this.autopilot?.status;if(!status||['idle','cancelled'].includes(status.phase))return;this.autopilot!.cancel(reason);if(reason==='manual-takeover'){this.audio.cue('cancel');this.onMessage?.("Switched to manual driving");}}
 /** Shared street contact set. Task actors keep their mission-specific capture/
  * boarding logic; these bodies cover ambient cars, riders and pedestrians. */
 streetBodies(x=this.actor.x,z=this.actor.z,includePlayer=false):StreetBody[]{
  const bodies=[...(this.traffic?.bodies(x,z)??[]),...(this.ebikes?.bodies(x,z)??[]),...(this.ebikes?.parkedBodies(x,z)??[]),...(this.pedestrians?.bodies(x,z)??[])];
  for(const v of this.parkedChoices){const fit=NATIVE_DRIVE_VEHICLES[v.model.kind];bodies.push({id:v.model,...v.pose,y:this.groundHeight(v.pose.x,v.pose.z),width:fit.width,length:fit.length,height:fit.height,kind:'car'});}
  if(includePlayer&&!this.taskVehicle&&!this.flight?.active){if(!this.flightCarRemoved&&!this.searchingForVehicle)bodies.push(this.playerStreetBody(this.state));if(this.nativeSemiTrailer?.state)bodies.push(this.trailerStreetBody(this.nativeSemiTrailer.state));if(this.walk?.active)bodies.push(this.walkStreetBody());}
  return bodies;
 }
 playerStreetBody(p:{x:number;z:number;yaw:number}):StreetBody{
  const fit=this.tank?.active?{width:3.88,length:7.1,height:3}:this.nativeDriveModel?NATIVE_DRIVE_VEHICLES[this.nativeDriveModel.kind]:{width:2.1,length:4.9,height:1.45};
  return {id:this.state,...p,y:this.groundHeight(p.x,p.z),width:fit.width,length:fit.length,height:fit.height,kind:'car'};
 }
 walkStreetBody():StreetBody{const w=this.walk!;return {id:w,x:w.x,z:w.z,y:w.feetY,yaw:w.yaw,width:.56,length:.56,height:1.76,kind:'person'};}
 trailerStreetBody(p:SemiPose):StreetBody{const offset=(SEMI.front-SEMI.rear)/2,x=p.x+Math.sin(p.yaw)*offset,z=p.z+Math.cos(p.yaw)*offset;return {id:this.nativeSemiTrailer!,x,z,y:this.groundHeight(x,z),yaw:p.yaw,width:SEMI.halfWidth*2,length:SEMI.front+SEMI.rear,height:3.8,kind:'car'};}
 streetStaticClear(a:StreetBody,b:StreetBody):boolean{
  const distance=Math.hypot(b.x-a.x,b.z-a.z),steps=Math.max(1,Math.ceil(distance/.25));
  for(let i=1;i<=steps;i++){
   const t=i/steps,x=a.x+(b.x-a.x)*t,z=a.z+(b.z-a.z)*t,c=Math.cos(b.yaw),s=Math.sin(b.yaw);
   if(Math.abs(this.groundHeight(x,z)-a.y)>.6)return false;
   for(const side of [-1,0,1])for(const end of [-1,0,1])if(this.nativeDrivingBlocked(x+c*side*b.width/2+s*end*b.length/2,z-s*side*b.width/2+c*end*b.length/2))return false;
  }
  return true;
 }
 configureStreetContacts(){
  const obstacles=(x=this.actor.x,z=this.actor.z)=>this.streetBodies(x,z,true),clear=(a:StreetBody,b:StreetBody)=>this.streetStaticClear(a,b);
  if(this.traffic){this.traffic.obstacles=obstacles;this.traffic.staticClear=clear;}
  if(this.ebikes){this.ebikes.obstacles=obstacles;this.ebikes.staticClear=clear;this.ebikes.impactBlocked=(x,z)=>this.nativeDrivingBlocked(x,z);}
  if(this.pedestrians)this.pedestrians.motionClear=(a,b)=>streetSweepClear(a,b,obstacles(a.x,a.z));
 }
 propBlocked(x:number,z:number){return !!this.climbSite?.vehicleBlocked(x,z)|| !!this.nativeFootSite?.blocked(x,z)||(this.walk?.active?nativeBarrierBlocked(this.nativeTaskBarriers,x,z,.35):nativeBarrierVehicleBlocked(this.nativeTaskBarriers,x,z,this.actor.yaw))||!!this.taskSurface?.blocked(x,z)||!!this.bambooCafe?.layout.blocked(x,z)||this.propObstacles.some(p=>{const dx=x-p.x,dz=z-p.z,c=Math.cos(p.heading),s=Math.sin(p.heading),lx=dx*c-dz*s,lz=dx*s+dz*c;return Math.abs(lx)<6.1&&lz> -2.4&&lz<3.3;});}
 get controlMode():'car'|'tank'|'walking'|'observer'|'aircraft'{return this.flight?.active?'aircraft':this.observer.active?'observer':this.walk?.active?'walking':this.tank?.active?'tank':'car';}
 nativeDrivingBlocked(x:number,z:number,allowWater=false){const site=this.nativeFootSite,floor=site&&'drivingFloorAt' in site?site.drivingFloorAt(x,z):null;return floor===null&&this.collision.blocked(x,z,allowWater)||this.propBlocked(x,z);}
 carWater=new NativeCarWater();carWaterEnabled=false;private carWaterSurface:NativeCarWaterSurface|null=null;
 setCarWaterEnabled(enabled:boolean){this.carWaterEnabled=enabled;this.carWater.reset();}
 private get playerWaterEnabled(){return this.carWaterEnabled&&!this.taskVehicle&&!this.flight?.active&&!this.tank?.active;}
 private playerDrivingBlocked=(x:number,z:number)=>this.nativeDrivingBlocked(x,z,this.playerWaterEnabled);
 private waterSurface(){return this.carWaterSurface??=new NativeCarWaterSurface(this.data,this.coastal?.manifest.waterHeight??-.25,(x,z)=>this.groundHeight(x,z),(x,z)=>this.collision.nearest(x,z),(x,z)=>{const site=this.nativeFootSite;return site&&'drivingFloorAt' in site?site.drivingFloorAt(x,z):null;});}
 // Navigation stays on dry support (including bridges); water remains physically
 // enterable, but is never suggested as a shortcut. Reuse indexed water geometry.
 drivingNavigationBlocked(x:number,z:number){return this.nativeDrivingBlocked(x,z,true)||this.waterSurface().at(x,z).wet;}
 private rawCarSurfaceHeight=(x:number,z:number)=>{
  if(!this.playerWaterEnabled)return this.groundHeight(x,z);
  if(this.carWater.sinking)return (this.carWater.baseY??0)-Math.tan(this.carWater.pitch)*((x-this.state.x)*Math.sin(this.state.yaw)+(z-this.state.z)*Math.cos(this.state.yaw));
  return this.waterSurface().at(x,z).floor;
 };
 private carSurfaceHeight=(x:number,z:number)=>drivingSupportHeight(this.rawCarSurfaceHeight,this.state.x,this.state.z,x,z);
 get actor(){return this.taskVehicle?{x:this.taskVehicle.x,z:this.taskVehicle.z,yaw:this.taskVehicle.yaw,speed:this.taskVehicle.speed}:this.walk?.active?{x:this.walk.x,z:this.walk.z,yaw:this.walk.yaw,speed:this.walk.speed}:this.state;}
 // Detail and lighting belong to the subject being viewed. Throttle costly
 // updates while turning the drone, without moving that detail to the eye.
 sceneFocus(){return this.observer.active?this.observer.focus:this.actor;}
 locationRoadName(){const p=this.sceneFocus(),n=this.collision.nearest(p.x,p.z);return n&&n.d<90?roadDisplayName(n.road)+(n.d>n.road.width/2+3?"Nearby":''):"City scenery";}
 parkedVehicleBlocks(x:number,z:number){
  if(this.parkedChoices.some(v=>{const dx=x-v.pose.x,dz=z-v.pose.z,c=Math.cos(v.pose.yaw),s=Math.sin(v.pose.yaw),fit=NATIVE_DRIVE_VEHICLES[v.model.kind];return Math.abs(dx*c-dz*s)<fit.width/2+.2&&Math.abs(dx*s+dz*c)<fit.length/2+.2;}))return true;
  if(this.walk?.active&&this.routeVehicleMission&&this.traffic?.cars.some(car=>{const dx=x-car.x,dz=z-car.z,c=Math.cos(car.yaw),s=Math.sin(car.yaw);return Math.abs(dx*c-dz*s)<1.1&&Math.abs(dx*s+dz*c)<2.5;}))return true;
  if(this.searchingForVehicle)return false;
  if(this.flightCarRemoved)return false;
  // The hero car is disabled while walking, including native task starts. It
  // must not remain a phantom collider around the player's feet; otherwise a
  // route node that starts beside the hidden car rejects every first step.
  // Task-owned variants and roadside-start hero cars stay visible when parked,
  // so their real bodies remain solid.
  if(this.walk?.active){if(this.nativeSemiTrailer?.state&&trailerContains(this.nativeSemiTrailer.state,x,z,.2))return true;if(!this.nativeDriveModel&&!this.parkedHeroVisible)return false;const fit=this.nativeDriveModel?NATIVE_DRIVE_VEHICLES[this.nativeDriveModel.kind]:{width:2.1,length:4.9},dx=x-this.state.x,dz=z-this.state.z,c=Math.cos(this.state.yaw),s=Math.sin(this.state.yaw);return Math.abs(dx*c-dz*s)<fit.width/2+.2&&Math.abs(dx*s+dz*c)<fit.length/2+.2;}
  const dx=x-this.state.x,dz=z-this.state.z,c=Math.cos(this.state.yaw),s=Math.sin(this.state.yaw);
  return Math.abs(dx*c-dz*s)<(this.tank?.active?1.94:1.18)&&Math.abs(dx*s+dz*c)<(this.tank?.active?3.55:2.7);
 }
 nativeDriveModel:NativeDriveVehicle|null=null;
 nativeSemiTrailer:NativeSemiTrailer|null=null;private nativeSemiStart:SemiPose|null=null;
 clearSemiSpawnTraffic(){
  const traffic=this.traffic,trailer=this.nativeSemiTrailer?.state;if(!traffic||!trailer)return;
  // Teleport/restart can leave an existing ambient car inside the long rig.
  // Remove only intersecting traffic at placement, never disable collisions
  // or remove approaching traffic during normal driving.
  traffic.update(0,this.state.x,this.state.z);
  const s=Math.sin(this.state.yaw),c=Math.cos(this.state.yaw);
  traffic.cars=traffic.cars.filter(car=>{const dx=car.x-this.state.x,dz=car.z-this.state.z;return !(Math.abs(dx*c-dz*s)<1.314+2.7&&Math.abs(dx*s+dz*c)<4.065+2.7)&&!trailerContains(trailer,car.x,car.z,2.7);});
  traffic.update(0,this.state.x,this.state.z);
 }
 updateNativeTrailer(before:CarState){
  const model=this.nativeSemiTrailer;if(!model?.state)return;
  const old=model.state,next=stepTrailer({...old},this.state),angle=Math.abs(Math.atan2(Math.sin(this.state.yaw-next.yaw),Math.cos(this.state.yaw-next.yaw)));
  const blocked=this.playerDrivingBlocked;
  if(angle>Math.PI/3||!trailerSweepClear(old,next,blocked)||!streetSweepClear(this.trailerStreetBody(old),this.trailerStreetBody(next),this.streetBodies())){Object.assign(this.state,before,{speed:0});return;}
  model.state=next;
 }
 async setNativeDriveModel(kind:NativeDriveKind){
  this.clearNativeDriveModel();this.cockpit?.setActive(false);const model=new NativeDriveVehicle(this.scene,kind);this.nativeDriveModel=model;
  try{await model.load();if(this.nativeDriveModel!==model)return;model.sync(this.state,this.groundHeight,0);if(kind==='semi-tractor'){const trailer=new NativeSemiTrailer(this.scene);this.nativeSemiTrailer=trailer;this.nativeSemiStart={x:this.state.x,z:this.state.z,yaw:this.state.yaw};await trailer.load();if(this.nativeDriveModel!==model)return;trailer.reset(this.state);trailer.sync(this.state,this.groundHeight,false,model.root);this.clearSemiSpawnTraffic();}this.car.setEnabled(false);this.cull();}
  catch(error){this.clearNativeDriveModel();throw error;}
 }
 clearNativeDriveModel(){this.cancelVehicleInteraction();this.nativeSemiTrailer?.dispose();this.nativeSemiTrailer=null;this.nativeSemiStart=null;if(this.nativeDriveModel)this.recycleTrafficVehicle(this.nativeDriveModel);this.nativeDriveModel=null;this.car.setEnabled(!this.walk?.active&&!this.tank?.active&&!this.taskVehicle);}
 get vehicleMeshes(){return this.flightCarRemoved||this.searchingForVehicle?[]:this.tank?.active?this.tank.meshes:this.nativeDriveModel?[...this.nativeDriveModel.meshes,...(this.nativeSemiTrailer?.meshes??[])]:this.carMeshes;}
 /** A task-only copy of the GTA_SZ hero car. It deliberately uses the same
  * native mesh hierarchy as the player car so follow/chase tasks never fall
  * back to a proxy box. The body paint is cloned and recoloured white while
  * glass, tyres, lights and the rest of the authored finish stay intact. */
 nativeTargetVehicle:{root:TransformNode;meshes:AbstractMesh[]}|null=null;
 nativeTaskContactBody:StreetBody|null=null;
 nativePoliceMeshes:AbstractMesh[]=[];
 nativeTaskBarriers:NativeTaskBarrier[]=[];
 nativeTaskMeshes:AbstractMesh[]=[];
 nativeFootSite:NativeFootSite|import('./native-showroom-site.ts').NativeShowroomSite|import('./native-garage-site.ts').NativeGarageSite|import('./native-pickup-climb-site.ts').NativePickupClimbSite|import('./native-stair-site.ts').NativeStairSite|import('./native-farm-site.ts').NativeFarmSite|import('./native-flood-site.ts').NativeFloodSite|import('./native-hill-site.ts').NativeHillSite|import('./native-rescue-bridge-site.ts').NativeRescueBridgeSite|import('./native-interior-site.ts').NativeInteriorSite|null=null;
 createNativeTargetVehicle(){
  this.disposeNativeTargetVehicle();
  const root=this.car.clone('native-target-white',null,false) as TransformNode|null;
  if(!root)return false;
  root.parent=null;root.setEnabled(true);
  const meshes=root.getChildMeshes(false).filter(m=>m.getTotalVertices()>0);
  for(const mesh of meshes){
   mesh.isPickable=false;mesh.receiveShadows=true;mesh.metadata={...(mesh.metadata??{}),nativeTarget:true,castsShadows:true};
   const material=mesh.material;
   if(material){const clone=material.clone(`native-target-${material.name}`);if(clone)mesh.material=clone;}
   const targetMaterial=mesh.material;
   if(targetMaterial instanceof PBRMaterial&&/carpaint|vehicle[_-]?body|body[_-]?paint/i.test(targetMaterial.name)){
    targetMaterial.albedoColor.copyFromFloats(.92,.95,.98);targetMaterial.metallic=.56;targetMaterial.roughness=.22;targetMaterial.environmentIntensity=.9;targetMaterial.clearCoat.isEnabled=true;targetMaterial.clearCoat.intensity=.7;targetMaterial.clearCoat.roughness=.18;
   }
  }
  this.nativeTargetVehicle={root,meshes};
  this.cull();
  return true;
 }
 updateNativeTargetVehicle(x:number,z:number,yaw:number){
  const target=this.nativeTargetVehicle;if(!target)return;
  target.root.position.set(x,this.groundHeight(x,z)+.115,z);target.root.rotation.set(0,yaw,0);
 }
 disposeNativeTargetVehicle(){
  const target=this.nativeTargetVehicle;if(!target)return;
  target.root.dispose(false,false);this.nativeTargetVehicle=null;this.cull();
 }
 /** Headlights/rear light follow whichever vehicle is driven. Only positions
  * change here; the lights themselves stay enabled so no shader recompiles. */
 syncVehicleLightRig(){
  this.vehicleLightRig.setEnabled(!this.searchingForVehicle&&!this.taskVehicle);
  const tank=this.tank?.active?this.tank:null,root=tank?tank.root:this.car,rig=this.vehicleLightRig;
  rig.position.copyFrom(root.position);rig.rotation.copyFrom(root.rotation);
  const anchors=tank?TANK_HEADLIGHT_ANCHORS:this.carHeadlightAnchors;
  this.headlights.forEach((l,i)=>{const a=anchors[i];if(a&&(l.position.x!==a[0]||l.position.y!==a[1]||l.position.z!==a[2]))l.position.copyFromFloats(a[0],a[1],a[2]);});
 }
 walkingBlocked(x:number,z:number,y:number){
  if(this.taskSurface?.contains)return this.taskSurface.blocked(x,z);
  const interior=this.nativeFootSite;
  if(interior&&'walkFloorAt' in interior&&interior.extra&&interior.vegetationReserved(x,z))return interior.bodyBlocked(x,z,y)||this.parkedVehicleBlocks(x,z);
  // The factory has height-aware solids: walls block a grounded body, while
  // the roof supports feet after a climb. Other city collision stays intact.
  const climb=this.climbSite;
  if(climb&&nativeClimbReserved(x,z))return this.collision.blocked(x,z)||climb.blocked(x,z,y)||this.parkedVehicleBlocks(x,z);
  return (this.nativeFootSite?.floorAt(x,z)==null&&this.collision.blocked(x,z))||this.propBlocked(x,z)||this.parkedVehicleBlocks(x,z);
 }
 walkingSurfaceHeight(x:number,z:number){
  const footHeight=this.nativeFootSite?.floorAt(x,z);if(footHeight!=null)return footHeight;
  const taskHeight=this.taskSurface?.heightAt(x,z);if(taskHeight!==null&&taskHeight!==undefined)return taskHeight;
  const climbGround=this.climbSite?.groundAt(x,z);if(climbGround!=null)return climbGround;
  const height=this.groundHeight(x,z);
  if(Number.isFinite(this.bambooCafe?.layout.floorAt(x,z,NaN)))return height;
  const n=this.collision.nearest(x,z);if(!n)return height;
  // The authored road/pavement meshes sit above the terrain sampler. Place
  // the shoe sole on those surfaces, as the vehicle already does for wheels.
  const edge=n.d-n.road.width/2;
  if(edge<=0)return height+.105;
  const pavement=['trunk','primary','secondary','tertiary'].includes(n.road.kind)?2.4:1.2;
  return height+(edge<pavement?.065:0);
 }
 walkingFloorAt(x:number,z:number,maxY:number){
  const site=this.nativeFootSite;
  if(site&&'walkFloorAt' in site&&site.extra){const h=site.walkFloorAt(x,z,maxY);if(h!==null)return h;}
  return this.climbSite?.floorAt(x,z,maxY,this.walkingSurfaceHeight(x,z))??this.walkingSurfaceHeight(x,z);
 }
 async toggleTank(){
  if(this.taskVehicle){this.onMessage?.("During boat tasks, please use WASD driving, Or switch tasks");return;}
  if(!this.ready||!this.tank||this.tank.loading||(this.paused&&!this.observer.active))return;
  if(this.walk?.active){this.onMessage?.("First walk back to the vehicle and press F Enter vehicle, Then press T Switch Tank");return;}
  this.cancelAutoDrive('vehicle-switch');if(this.observer.active)this.exitPhoto();this.state.speed=0;this.keys.clear();
  const active=!this.tank.active,request=++this.tankRequest;
  if(active){
   const n=this.collision.nearest(this.state.x,this.state.z);if(!tankFootprintClear(this.state.x,this.state.z,this.state.yaw,(x,z)=>this.collision.blocked(x,z)||this.propBlocked(x,z))){
    if(!n||!tankFootprintClear(n.x,n.z,n.yaw,(x,z)=>this.collision.blocked(x,z)||this.propBlocked(x,z))){this.onMessage?.("Too narrow here, Move to a wide road before switching to a tank");return;}
    this.state.x=n.x;this.state.z=n.z;this.state.yaw=n.yaw;
   }
   this.onMessage?.("Preparing tank");try{await this.tank.load();}catch(error){console.error('Tank asset:',error);this.onMessage?.("Tank asset loading failed, The sedan is still drivable; press T Retry");return;}
   if(request!==this.tankRequest||this.scene.isDisposed)return;
   if(!tankFootprintClear(this.state.x,this.state.z,this.state.yaw,(x,z)=>this.collision.blocked(x,z)||this.propBlocked(x,z))){this.onMessage?.("Tank ready, Move to an open stretch of road before pressing T");return;}
   if(this.walk?.active||this.observer.active){this.onMessage?.("Tank ready, Return to the vehicle, then press T Switch");return;}
  }
  this.tank.setActive(active);this.car.setEnabled(!active);this.state.speed=0;this.state.steer=0;this.view=0;this.cameraYaw=this.state.yaw;
  this.tank.setPose(this.state.x,this.groundHeight(this.state.x,this.state.z),this.state.z,this.state.yaw);this.syncVehicleLightRig();
  this.vehicleReflections?.setEnabled(!active&&this.reflectionsEnabled&&this.graphicsProfile.vehicleProbe);this.keys.clear();this.cull();
  this.onMessage?.(active?"Tank · WASD driving · Q/E Turret · Space to fire · T Switch back to the sedan":"Switched back to the sedan · F Exit vehicle / T Tank");
 }
 async ensureRider():Promise<boolean>{
  if(this.rider)return true;if(this.riderPending)return this.riderPending;
  this.riderLoading=true;
  this.riderPending=(async()=>{try{
   const rider=await createCityRider(this.scene);
   if(this.scene.isDisposed){rider.dispose();return false;}
   this.rider=rider;return true;
  }catch(error){console.error('Rider asset:',error);this.onMessage?.("Character loading failed, Still Drivable; press F or\"Retry Character\"Retry");return false;}
  finally{this.riderLoading=false;this.riderPending=null;}})();
  return this.riderPending;
 }
 /** Start a native-city walking task without requiring a car-door transition. */
 async startNativeWalk(start:Landmark):Promise<boolean>{
  this.cancelVehicleInteraction();this.parkedHeroVisible=false;
  if(!this.walk)return false;
  this.walk.x=start.arrival[0];this.walk.z=start.arrival[1];this.walk.yaw=start.yaw;this.walk.pitch=.06;this.walk.distance=0;this.walk.speed=0;this.walk.moving=false;this.walk.active=true;this.walk.links=this.nativeFootSite?.links??[];this.walk.traversalClear=this.nativeFootSite?.traversalClear??null;this.walk.resetMotion();this.walkFirstPerson=false;this.riderYaw=start.yaw;this.car.setEnabled(false);this.cameraYaw=start.yaw;this.keys.clear();this.cull();
  if(this.rider)this.rider.setEnabled(true);
  else void this.ensureRider().then(ready=>{if(ready&&this.walk?.active){this.rider?.setEnabled(true);this.cull();}});
  return true;
 }
 stopNativeWalk(){this.cancelVehicleInteraction();this.parkedHeroVisible=false;if(!this.walk)return;this.walk.active=false;this.walk.resetMotion();this.walk.links=[];this.walk.traversalClear=null;this.rider?.setTraversalPose(null);this.rider?.setLocomotionPose(null);this.walk.moving=false;this.walk.speed=0;this.rider?.setEnabled(false);this.car.setEnabled(true);this.cameraYaw=this.state.yaw;}
 async toggleWalking(){
  if(this.flightCarRemoved)return;
  if(this.carWaterEnabled&&this.carWater.sinking)return;
  if(this.taskVehicle){const message=this.taskVehicle.interact?.();if(message)this.onMessage?.(message);return;}
  if(!this.walk||this.walkingTransition||this.vehicleInteraction)return;
  const attempt=new AbortController();this.boardingAttempt=attempt;
  this.walkingTransition=true;try{
  if(this.walk.active){
   // Only ambient traffic is transferable: mission targets and police are separate actors.
   const traffic=this.traffic;
   const choices=this.parkedChoices.filter(v=>this.walk!.canEnter(v.pose,5,1.9)).sort((a,b)=>Math.hypot(a.pose.x-this.walk!.x,a.pose.z-this.walk!.z)-Math.hypot(b.pose.x-this.walk!.x,b.pose.z-this.walk!.z));
   let choice:typeof choices[number]|undefined=choices[0];
   let candidate=this.routeVehicleMission&&traffic?.cars.filter(c=>Math.hypot(c.x-this.walk!.x,c.z-this.walk!.z)<6&&Math.abs(c.actualSpeed??c.speed)<=8&&this.walk!.canEnter({...c,speed:0},5,1.9)).sort((a,b)=>Math.hypot(a.x-this.walk!.x,a.z-this.walk!.z)-Math.hypot(b.x-this.walk!.x,b.z-this.walk!.z))[0];
   if(this.carChoiceActive){
    const distance=(p:{x:number;z:number})=>Math.hypot(p.x-this.walk!.x,p.z-this.walk!.z);
    const options=[...choices.map(v=>({kind:'parked',distance:distance(v.pose)})),...(candidate?[{kind:'traffic',distance:distance(candidate)}]:[]),...(this.nativeDriveModel&&this.walk.canEnter(this.state)?[{kind:'owned',distance:distance(this.state)}]:[])].sort((a,b)=>a.distance-b.distance);
    // A centre-aisle F must not silently pick the first model in array order.
    if(options.length>1&&options[1].distance-options[0].distance<.35)return;
    if(options[0]?.kind!=='parked')choice=undefined;
    if(options[0]?.kind!=='traffic')candidate=undefined;
   }
   if(choice){
    if(!this.entryDoor(choice.pose))return;
    this.parkChoiceVehicle();this.parkedChoices=this.parkedChoices.filter(v=>v!==choice);
    this.nativeDriveModel=choice.model;Object.assign(this.state,choice.pose,{speed:0,steer:0});
    this.carWater.reset();this.cancelAutoDrive('choose-parked-car');
   }else if(candidate&&traffic){
    if(!this.entryDoor(candidate))return;
    const epoch=this.debugEpoch;
    const prepared=this.trafficBoardingPool.get(candidate.group)?.pop();
    const model=prepared??new NativeDriveVehicle(this.scene,'traffic-sedan');
    // Retain the original visible NPC until the exact replacement is ready.
    // No frame may expose a half-loaded body, and loading is not game time.
    this.vehicleBoardingLoading=true;
    try{
     if(!prepared)model.loadTraffic(traffic.meshes[candidate.group],candidate.group);model.sync({...candidate,speed:0,steer:0},this.groundHeight,0);for(const mesh of model.meshes)mesh.layerMask=0;
     if(!prepared)await waitForVehicleBoarding(model.prepareForRendering(),attempt.signal);
     if(attempt.signal.aborted||this.scene.isDisposed||this.debugEpoch!==epoch||this.paused||!this.walk.active||!this.entryDoor(candidate)){this.recycleTrafficVehicle(model);return;}
    }catch(error){model.dispose();if(!attempt.signal.aborted){this.onMessage?.("Vehicle not ready yet, Controls restored, Please try again");console.error('Traffic boarding preparation failed',error);}return;}
    finally{if(this.boardingAttempt===attempt)this.vehicleBoardingLoading=false;}
    if(!traffic.take(candidate)){this.recycleTrafficVehicle(model);return;}
    for(const mesh of model.meshes)mesh.layerMask=0x0fffffff;
    if(this.carChoiceActive)this.parkChoiceVehicle();
    const old=this.nativeDriveModel;
    if(old?.trafficGroup!=null)traffic.park({x:this.state.x,z:this.state.z,yaw:this.state.yaw,group:old.trafficGroup},this.routeVehicleMission!);
    this.clearNativeDriveModel();this.nativeDriveModel=model;
    Object.assign(this.state,{x:candidate.x,z:candidate.z,yaw:candidate.yaw,speed:0,steer:0});
    this.carWater.reset();this.cancelAutoDrive('take-traffic-car');model.sync(this.state,this.groundHeight,0);traffic.update(0,candidate.x,candidate.z);
   }else if(this.searchingForVehicle||!this.walk.canEnter(this.state,this.tank?.active?7:5,this.tank?.active?3:1.9)){this.onMessage?.("Walk up to a parked or slow-moving vehicle, press F Enter vehicle");return;}
   if(!this.tank?.active&&!this.nativeDriveModel?.kind.startsWith('motorcycle')&&this.nativeDriveModel?.kind!=='atv'){
    const door=this.entryDoor(this.state);if(!door)return;
    if(!this.rider&&!await waitForVehicleBoarding(this.ensureRider(),attempt.signal))return;
    if(attempt.signal.aborted||this.paused||!this.walk.active)return;
    this.beginVehicleInteraction('enter',door);return;
   }
   this.walk.active=false;this.rider?.setEnabled(false);this.car.setEnabled(!this.nativeDriveModel);this.cameraYaw=this.state.yaw;
  }
  else{
   if(Math.abs(this.state.speed)>1){this.onMessage?.("Come to a full stop first, Then press F Exit vehicle");return;}
   if(!this.rider){this.onMessage?.("Preparing walking character");if(!await waitForVehicleBoarding(this.ensureRider(),attempt.signal))return;}
   if(attempt.signal.aborted)return;
   if(this.scene.isDisposed||this.observer.active||this.paused)return;
   if(!this.walk.exitCar(this.state,this.tank?.active?3:1.9)){this.onMessage?.("Leave space beside the vehicle door, Please move to an open area before exiting the vehicle");return;}
   if(!this.tank?.active&&!this.nativeDriveModel?.kind.startsWith('motorcycle')&&this.nativeDriveModel?.kind!=='atv'){
    const door={x:this.walk.x,y:this.walk.feetY,z:this.walk.z,yaw:this.walk.yaw};this.walk.active=false;this.beginVehicleInteraction('exit',door);return;
   }
   this.cancelAutoDrive('exit-car');this.state.speed=0;this.state.steer=0;this.drivingInput={throttle:0,steer:0,handbrake:false};this.riderYaw=this.walk.yaw;this.car.setEnabled(false);
   this.onMessage?.(`${this.rider?.name??"Character"} · WASD walking / Shift Running / Space to jump / Walk toward the ladder to start climbing automatically / Drag to look around / Scroll to Adjust Distance / F Enter vehicle`);
  }
  this.keys.clear();this.cull();this.vegetation();
  }catch(error){if(!attempt.signal.aborted){console.error('Vehicle interaction preparation failed',error);this.onMessage?.("Vehicle entry preparation incomplete, Controls restored, Please try again");}}
  finally{if(this.boardingAttempt===attempt){this.boardingAttempt=null;this.walkingTransition=false;this.vehicleBoardingLoading=false;}}
 }
 enterPhoto(m:Landmark){
  this.flightRequest++;this.flight?.stop();
  this.cancelAutoDrive('observer');
  this.photoTarget=m;this.aerial=true;this.paused=true;this.keys.clear();
  const distance=m.photoDistance??(m.id==='civic'?380:m.height?m.height*1.65:320),elevation=m.photoElevation??.32;
  const focus={x:m.x,y:m.photoTargetHeight??(this.groundHeight(m.x,m.z)+m.height*.38),z:m.z};
  this.observer.begin(focus,distance,m.photoAngle??.65,elevation);this.observer.step(this.keys,0,this.groundHeight,this.data.meta.extent);
  this.cull();this.vegetation();this.onMessage?.("Drone · WASD Pan / Turn your head with arrow keys / Q E Raise and lower / Drag to orbit / Shift Drag to move / G or F Back");
 }
 async startNativeFlight(point:FlightPoint,yaw:number,model:FlightModel='plane'){
  const flight=this.flight;if(!flight||!this.ready)return false;
  const transition=++this.nativeFlightTransitionId;this.nativeFlightLoading=true;
  try{
  this.stopNativeWalk();
  this.enterPhoto({id:'native-flight',name:"City flight mission",x:point.x,z:point.z,height:0,area:"Futian District",excludeRadius:0,arrival:[point.x,point.z],yaw,photoDistance:27,photoAngle:-yaw,photoElevation:.2,photoTargetHeight:point.y});
  const request=++this.flightRequest;this.taskFlightPaused=true;
  await flight.load(model);
  if(request!==this.flightRequest||this.scene.isDisposed||!this.observer.active)return false;
  if(!flight.startGround(point,yaw))return false;
  // Set the actual camera before the first playable frame, with no interpolation
  // from the previous car/drone heading. The NPC shares this flight yaw.
  const p=flight.sim.pose,shot=flight.camera;
  this.observer.focus={x:p.x,y:p.y,z:p.z};this.observer.yaw=yaw;this.cameraYaw=yaw;
  this.camera.position.copyFrom(shot.eye);this.camera.setTarget(shot.target);this.camera.minZ=.5;this.camera.fov=.88;
  this.paused=true;this.aerialEffects(true);this.cull();this.vegetation();
  return true;
  }finally{if(transition===this.nativeFlightTransitionId)this.nativeFlightLoading=false;}
 }
 boardParkedAircraft(){
  const flight=this.flight;if(!flight?.canBoard(this.walk))return false;
  void this.startNativeFlight({...flight.sim.pose},flight.sim.pose.yaw,flight.model).then(started=>{this.taskFlightPaused=false;if(!started)this.onMessage?.("Aircraft preparation failed, Please try again.");}).catch(error=>{this.taskFlightPaused=false;this.onMessage?.("Boarding failed, Please try again.");console.error(error);});return true;
 }
 exitAircraft(){
  const flight=this.flight,walk=this.walk;if(!flight?.active||!walk)return false;
  if(!flight.sim.onGround||flight.sim.speed>1.5){this.onMessage?.("Please land and come to a complete stop first, Then press F Exit aircraft.");return false;}
  const p={...flight.sim.pose};if(!walk.exitCar({...p,speed:flight.sim.speed},flight.doorOffset)){this.onMessage?.("Not enough space beside the cabin door, Please move to an open area.");return false;}
  this.exitPhoto();flight.park(p,p.yaw);this.taskFlightPaused=false;this.walkFirstPerson=false;this.riderYaw=walk.yaw;this.cameraYaw=walk.yaw;this.rider?.setEnabled(true);this.car.setEnabled(false);
  this.camera.position.set(walk.x-Math.sin(walk.yaw)*4,this.groundHeight(walk.x,walk.z)+2.5,walk.z-Math.cos(walk.yaw)*4);this.camera.setTarget(new Vector3(walk.x,this.groundHeight(walk.x,walk.z)+1.5,walk.z));this.cull();this.vegetation();this.onMessage?.("Disembarked · WASD walking · Approach the hatch and press F Board Again");return true;
 }
 async toggleFlight(){
  const flight=this.flight;if(!flight||!this.ready||!this.observer.active||this.photoTarget?.id==='car')return;
  if(flight.active||flight.loading){this.returnFromFlight();return;}
  const request=++this.flightRequest;this.keys.clear();this.drag=false;
  try{await flight.load('plane');if(request!==this.flightRequest||!this.observer.active||this.scene.isDisposed)return;
   if(!flight.start(this.observer.pose(),this.observer.yaw)){this.onMessage?.("Not enough room to take off here, Move the drone and try again");return;}
   this.paused=true;this.cull();this.onMessage?.("Airplane · W/S Throttle · A/D Steering · Numeric Keypad 5/8 Pitch, 4/6 Roll · G Landing gear · F Exit aircraft");
  }catch(error){console.error('Aircraft asset failed to load',error);if(request===this.flightRequest)this.onMessage?.("Aircraft loading failed, Drone mode retained, Can press B Retry");}
 }
 returnFromFlight(reason?:'recovered'|'boundary'){
  const flight=this.flight;if(!flight||(!flight.active&&!flight.loading&&!reason))return;
  this.flightRequest++;const p={...flight.sim.lastSafe};const wasLoaded=flight.loaded;
  flight.stop();this.keys.clear();this.drag=false;
  if(!wasLoaded)return;
  this.enterPhoto({id:'free-camera',name:"Free drone",x:p.x-Math.sin(p.yaw)*25,z:p.z-Math.cos(p.yaw)*25,height:0,area:"City panorama",excludeRadius:0,arrival:[this.state.x,this.state.z],yaw:p.yaw,photoDistance:65,photoElevation:.22,photoAngle:-p.yaw,photoTargetHeight:p.y+18});
  this.onMessage?.(reason==='recovered'?"Returned to drone · B You can fly again":reason==='boundary'?"Reached the city boundary · Return to drone sightseeing":"Switched to drone · B Enter aircraft mode");
 }
 /** SHADOW_BIAS is authored for a 2048 map; the normal offset follows the texel when the quality preset shrinks it. */
 applyShadowBias(){const bias=this.overviewEffects?SHADOW_BIAS.aerial:SHADOW_BIAS.street;this.shadows.normalBias=bias.normal*2048/this.shadows.mapSize;this.shadows.bias=bias.depth;}
 aerialEffects(active:boolean){if(this.overviewEffects===active)return;this.overviewEffects=active;this.sun.orthoLeft=this.sun.orthoBottom=active?-1050:-260;this.sun.orthoRight=this.sun.orthoTop=active?1050:260;this.sun.shadowMaxZ=active?3200:1200;this.applyShadowBias();this.shadows.getShadowMap()!.refreshRate=active?12:1;this.shadows.getShadowMap()!.resetRefreshCounter();this.syncGraphicsPostEffects();this.cull();}
 toggleAerial(){if(this.observer.active){this.exitPhoto();return;}const s=this.actor;this.enterPhoto({id:'free-camera',name:"Free drone",x:s.x,z:s.z,height:0,area:"City panorama",excludeRadius:0,arrival:[s.x,s.z],yaw:s.yaw,photoDistance:420,photoElevation:.42,photoAngle:.65,photoTargetHeight:this.groundHeight(s.x,s.z)+15});}
 exitPhoto(){this.flightRequest++;this.flight?.stop();this.aerialEffects(false);this.observer.active=false;this.aerial=false;this.photoTarget=null;this.paused=false;this.keys.clear();
  // Reselect lamps at the returning actor; nearby aerial slots can otherwise
  // remain latched to different poles within the 100 m assignment hysteresis.
  this.lampAssignments.fill(-1);this.lightTargets=[];this.lightTick=0;for(const light of this.streetLights)light.intensity=0;
  this.camera.position.set(this.state.x-Math.sin(this.state.yaw)*9,this.groundHeight(this.state.x,this.state.z)+3.5,this.state.z-Math.cos(this.state.yaw)*9);this.cull();this.vegetation();this.onMessage?.(this.walk?.active?"Return to walking exploration":"Return to driving");}
 setupReflections(){
  for(const material of this.scene.materials)if(material instanceof PBRMaterial&&/^car_glass(?:\.\d+)?$/.test(material.name)){material.albedoColor=new Color3(.012,.020,.027);material.metallic=0;material.roughness=.17;material.environmentIntensity=.55;material.specularIntensity=.65;material.clearCoat.isEnabled=false;}
  for(const material of this.scene.materials){if(!(material instanceof PBRMaterial))continue;if(material.name==='roadline')material.zOffset=-2;if(!this.carMeshes.some(mesh=>mesh.material===material)&&/^carpaint(?:\.\d+)?$/.test(material.name)){material.albedoColor=new Color3(.028,.074,.093);material.environmentIntensity=.75;material.metallic=.52;material.roughness=.31;material.specularIntensity=.65;}}
  for(const material of this.scene.materials){if(material instanceof PBRMaterial&&material.name==='asphalt'){material.reflectionTexture=this.mirror;material.metallic=.025;material.roughness=1.0;const n=128,orm=new Uint8Array(n*n*3),normal=new Uint8Array(n*n*3);for(let y=0;y<n;y++)for(let x=0;x<n;x++){const k=(y*n+x)*3,r=Math.sin(x*127.1+y*311.7)*43758.54,f=r-Math.floor(r),wet=Math.sin(x*.09)*Math.cos(y*.07);orm[k]=255;orm[k+1]=Math.round(235+wet*16);orm[k+2]=255;normal[k]=128+(f-.5)*22;normal[k+1]=128+(f-.5)*15;normal[k+2]=253;}material.metallicTexture=RawTexture.CreateRGBTexture(orm,n,n,this.scene,true,false);material.useRoughnessFromMetallicTextureGreen=true;material.useRoughnessFromMetallicTextureAlpha=false;material.bumpTexture=RawTexture.CreateRGBTexture(normal,n,n,this.scene,true,false);material.bumpTexture.level=.10;}
   if(material instanceof PBRMaterial&&!this.carMeshes.some(mesh=>mesh.material===material)&&/^carpaint(?:\.\d+)?$/.test(material.name)){material.clearCoat.isEnabled=true;material.clearCoat.intensity=.62;material.clearCoat.roughness=.23;}}
  const waterMeshes=this.scene.meshes.filter(m=>m.name==='terrain_water');if(this.coastal)this.bayWater=createBayWater(this.scene,this.waterMirror,waterMeshes,this.coastal.manifest);for(const light of this.headlights)light.excludedMeshes.push(...waterMeshes);

 }
 setupSigns(){
  // Signs are placed at actual major-road points, never at arbitrary world rows.
  let count=0;for(const road of this.data.roads){if(road.points.length<4||!['primary','trunk'].includes(road.kind)||road.name.includes("auxiliary"))continue;const a=road.points[0],b=road.points[1];if(Math.abs(a[0]-this.data.spawn.x)>650||Math.abs(a[1]-this.data.spawn.z)>700)continue;if(count++>8)break;
   // The artwork belongs only on the traffic-facing side. Rendering the same
   // textured plane from behind mirrors both the Chinese and Latin lettering.
   const sign=MeshBuilder.CreatePlane('direction-sign',{width:8,height:2,sideOrientation:Mesh.FRONTSIDE},this.scene);const mat=new StandardMaterial('wayfinding',this.scene);
   mat.diffuseTexture=new Texture('/city/textures/sign-'+(b[0]<a[0]?'west':'east')+'.jpg',this.scene);mat.diffuseTexture.anisotropicFilteringLevel=8;
   // StandardMaterial adds emissiveTexture to emissiveColor. Keep the green
   // artwork in diffuseTexture so the unlit brightness multiplies its color.
   mat.specularColor=Color3.Black();mat.disableLighting=true;mat.emissiveColor=new Color3(.82,.82,.82);
   sign.material=mat;sign.position.set(a[0],6.8,a[1]);sign.rotation.y=Math.atan2(b[0]-a[0],b[1]-a[1])+Math.PI;sign.isPickable=false;
  }
 }
 cull(){const p=this.sceneFocus();this.lastCull.set(p.x,0,p.z);const shadowDistance=this.overviewEffects?1800:800;this.sun.position.set(p.x-this.sun.direction.x*shadowDistance,this.groundHeight(p.x,p.z)-this.sun.direction.y*shadowDistance,p.z-this.sun.direction.z*shadowDistance);this.facadeStream?.update(p.x,p.z,this.debugFacades,this.overviewEffects?250:0);const traffic=this.traffic?.meshes.flat()??[];const nativeTarget=this.nativeTargetVehicle?.meshes??[];const nativePolice=[...this.nativePoliceMeshes,...this.nativeTaskMeshes,...this.parkedChoices.flatMap(v=>v.model.meshes)];const casters:AbstractMesh[]=[...((this.flight?.active||this.flight?.parked)?this.flight.meshes:[]),...this.vehicleMeshes.filter(m=>m.metadata?.castsShadows!==false),...nativeTarget,...nativePolice,...(this.walk?.active?this.rider?.meshes??[]:[]),...traffic,...(this.pedestrians?.casters??[])];const reflect:AbstractMesh[]=[...((this.flight?.active||this.flight?.parked)?this.flight.meshes:[]),...(this.mountains?.meshes??[]),...this.vehicleMeshes,...nativeTarget,...nativePolice,...(this.walk?.active?this.rider?.meshes??[]:[]),...this.landmarks,...this.coastalHorizon.flatMap(h=>h.mesh?[h.mesh]:[]),...traffic,...(this.buildingSigns?.meshes??[])];const sky=this.scene.getMeshByName('atmosphere');if(sky)reflect.push(sky);
  // Base buildings are already loaded. Aerial views retain their original
  // roofs, UV2 facade styles and glass; normal frustum culling limits draws.
  // Extra far geometry does not enter the existing shadow/reflection radii.
  for(const b of this.blocks){const d=Math.hypot(p.x-b.x,p.z-b.z);b.mesh.setEnabled((!b.detail||this.debugFacades)&&(d<(b.detail?700:b.road?2500:3300)||(this.overviewEffects&&!b.detail&&(!b.road||b.mesh.name.endsWith('_asphalt')))));if(d<(this.overviewEffects?1650:520)&&!b.road)casters.push(b.mesh);if(d<1400&&!b.road)reflect.push(b.mesh);}
  for(const m of this.landmarks){const center=m.getBoundingInfo().boundingBox.centerWorld;if(Vector3.Distance(center,new Vector3(p.x,0,p.z))<(this.overviewEffects?1650:700))casters.push(m);}
  casters.push(...(this.groundRelief?.shadowMeshes(p.x,p.z,this.overviewEffects?1450:650)??[]));casters.push(...(this.landscape?.casters??[]));casters.push(...(this.canopy?.casters??[]));casters.push(...(this.rooftops?.casters??[]));for(const m of this.facadeStream?.shadowMeshes??[])casters.push(m);

  for(const light of this.windowLights){light.intensity=0;light.setEnabled(false);}
  this.shadows.getShadowMap()!.renderList=casters;if(this.aerial)this.shadows.getShadowMap()!.resetRefreshCounter();
  // Contact-shading depth/normal buffer: only meshes whose bounds reach into
  // the AO range (terrain and roads qualify through their large radii). The
  // shadow casters' 520 m radius is deliberately not reused: every mesh here
  // is drawn a second time. Vehicles and pedestrians are thin-instanced with
  // lagging bounds, so they are always in; the sky never is.
  const gbuffer=this.scene.geometryBufferRenderer;
  if(gbuffer){if(this.overviewEffects||!this.graphicsProfile.ao)gbuffer.renderList=[];else{const reach=STREET_AO.maxZ+STREET_AO.listMargin,near=new Set<AbstractMesh>([...this.vehicleMeshes,...nativeTarget,...nativePolice,...(this.walk?.active?this.rider?.meshes??[]:[]),...traffic,...(this.pedestrians?.casters??[])]);for(const m of this.scene.meshes){if(near.has(m)||m===sky||!m.isEnabled()||!m.isVisible||!m.subMeshes?.length)continue;const s=m.getBoundingInfo().boundingSphere;if(Math.hypot(s.centerWorld.x-p.x,s.centerWorld.z-p.z)-s.radiusWorld<reach)near.add(m);}gbuffer.renderList=[...near];}}
  // A detail landmark can contain asphalt: never draw a material into its own texture.
  this.mirror.renderList=reflect.filter(m=>!m.material?.hasTexture(this.mirror));this.waterMirror.renderList=reflect.filter(m=>!m.material?.hasTexture(this.waterMirror));
  this.localLighting?.update(0,this.camera.position,true);
 }
 localLights(dt:number){
  this.lightTick-=dt;const p=this.sceneFocus();
  if(this.lightTick<=0){this.lightTick=.25;
   const sorted=this.lampData.map((l,id)=>({id,d:Math.hypot(l[0]-p.x,l[1]-p.z)})).filter(q=>q.d<120).sort((a,b)=>a.d-b.d);
   for(let i=0;i<this.streetLights.length;i++){
    const old=this.lampAssignments[i],lamp=this.lampData[old],d=lamp?Math.hypot(lamp[0]-p.x,lamp[1]-p.z):Infinity;
    // Keep identity across ranking changes; replace only an expired slot.
    if(d>100&&this.streetLights[i].intensity<1)this.lampAssignments[i]=sorted.find(q=>!this.lampAssignments.includes(q.id))?.id??-1;
   }
   this.lightTargets=this.lampAssignments.map(id=>{const l=this.lampData[id],d=l?Math.hypot(l[0]-p.x,l[1]-p.z):Infinity;return {position:l?new Vector3(l[0]-l[2]*1.5,this.groundHeight(l[0],l[1])+8.2,l[1]-l[3]*1.5):Vector3.Zero(),power:(this.night?360:this.lightMode==='day'?0:75)*clamp((108-d)/30,0,1)};});
  }
  this.streetLights.forEach((l,i)=>{const t=this.lightTargets[i];if(!t)return;const changing=Vector3.DistanceSquared(l.position,t.position)>1;if(changing&&l.intensity<1)l.position.copyFrom(t.position);const target=changing?0:t.power;l.intensity+=(target-l.intensity)*(1-Math.exp(-dt*6));l.range=46;});
 }


 vegetation(){
  const focus=this.sceneFocus();this.lastVegetation.set(focus.x,0,focus.z);this.lastLandscapeAerial=this.overviewEffects;
  this.landscape?.update(focus.x,focus.z,this.overviewEffects,true);this.canopy?.update(focus.x,focus.z,this.overviewEffects,true);this.rooftops?.update(focus.x,focus.z,this.overviewEffects,true);
  const plants=new Set([...(this.landscape?.meshes??[]),...(this.canopy?.meshes??[]),...(this.rooftops?.meshes??[])]),shadow=this.shadows.getShadowMap()!;
  shadow.renderList=[...(shadow.renderList??[]).filter(m=>!plants.has(m)),...(this.landscape?.casters??[]),...(this.canopy?.casters??[]),...(this.rooftops?.casters??[])];shadow.resetRefreshCounter();
  this.localLighting?.update(0,this.camera.position,true);
 }
 setLightMode(mode:'sunset'|'night'|'day'){
  this.lightMode=mode;this.night=mode==='night';this.skyMat.setFloat('night',this.night?1:0);
  this.architecture.setMode(mode);this.facadeDiversity.setMode(mode);this.rooftops?.setMode(mode);this.ambient?.setMode(mode);this.signage?.setMode(mode);this.buildingSigns?.setNight(this.night);this.signals?.setNight(this.night);
  this.cinematic?.setMode(mode);this.roadSurface?.setMode(mode);this.rainPuddles?.setMode(mode);this.rainWeather?.setMode(mode);this.bayWater?.setMode(mode);this.publicLighting?.setMode(mode);this.lightTick=0;
  setLandscapeLightingMode(this.scene,mode);this.sportDetails?.setMode(mode);
  for(const light of this.headlights)light.intensity=mode==='day'?20:250;
  for(const m of this.scene.materials){
   if(m instanceof PBRMaterial&&/^lamp(?:\.\d+)?$/.test(m.name))m.emissiveIntensity=mode==='day'?0:1;
   // Dedicated civic materials retain the photographed blue roof/red-yellow
   // towers. Only the underside and eave fixtures receive night illumination.
   if(m instanceof PBRMaterial&&/^civic_(?:eave_light|flood_light)(?:\.\d+)?$/.test(m.name))m.emissiveIntensity=mode==='day'?0:mode==='night'?2.1:.55;
   if(m instanceof PBRMaterial&&/^civic_soffit(?:\.\d+)?$/.test(m.name))m.emissiveIntensity=mode==='day'?0:mode==='night'?.45:.08;
   if(m instanceof StandardMaterial&&m.name==='wayfinding'){const brightness=mode==='day'?.95:mode==='night'?.60:.82;m.emissiveColor.copyFromFloats(brightness,brightness,brightness);}
  }
  this.bambooLook?.setMode(mode);this.bayparkLook?.setMode(mode);this.localLighting?.setMode(mode);
  this.bambooCafe?.setMode(mode);this.bambooCorridor?.setMode(mode);
  this.syncGraphicsPostEffects();this.cull();this.shadows.getShadowMap()?.resetRefreshCounter();this.mirror.resetRefreshCounter();this.waterMirror.resetRefreshCounter();
  this.onMessage?.({sunset:"Bay Sunset · L Switch to Night",night:"Shenzhen Under the Moon · L Switch to Sunny Day",day:"Sunny Day After Rain · Blue Sky and White Clouds · L Switch to Sunset"}[mode]);
 }
 toggleLight(){this.setLightMode(this.lightMode==='sunset'?'night':this.lightMode==='night'?'day':'sunset');}
 toggleRain(){this.raining=!this.raining;this.roadSurface?.setWeather(this.raining);this.rainPuddles?.setWeather(this.raining);this.rainWeather?.setEnabled(this.raining);this.mirror.resetRefreshCounter();this.onMessage?.(this.raining?"Rainy Mode · Road puddles and rain ripples":"The rain has stopped · Leave puddles along the roadside");}
 resetRoad(){if(this.vehicleInteraction)return;if(!this.ready||this.carWaterEnabled&&this.carWater.sinking)return;this.carWater.reset();if(this.roadsideFootSpawn&&this.walk?.active){this.debugEpoch++;Object.assign(this.walk,this.roadsideFootSpawn);this.walk.resetMotion();this.walk.speed=0;this.keys.clear();this.cameraYaw=this.walk.yaw;return;}const site=this.nativeFootSite;if(site&&'resetWalkPose' in site&&site.resetWalkPose&&this.walk){this.debugEpoch++;Object.assign(this.walk,site.resetPose);this.walk.active=true;this.walk.resetMotion();if('resetWalkHeight' in site&&site.resetWalkHeight!==undefined)this.walk.y=site.resetWalkHeight;this.car.setEnabled(false);this.rider?.setEnabled(true);this.keys.clear();this.cameraYaw=this.walk.yaw;return;}if(site&&'resetPose' in site){this.debugEpoch++;this.stopNativeWalk();this.cancelAutoDrive('reset-hill');Object.assign(this.state,site.resetPose);this.keys.clear();this.cameraYaw=this.state.yaw;return;}if(this.nativeSemiTrailer&&this.nativeSemiStart){this.debugEpoch++;this.stopNativeWalk();this.cancelAutoDrive('reset-semi');Object.assign(this.state,this.nativeSemiStart,{speed:0,steer:0,distance:0});this.nativeSemiTrailer.reset(this.state);this.clearSemiSpawnTraffic();this.keys.clear();this.cameraYaw=this.state.yaw;return;}if(this.taskVehicle){this.taskVehicle.reset?.();this.debugEpoch++;this.keys.clear();return;}this.debugEpoch++;if(this.walk?.active)this.walk.active=false;this.cancelAutoDrive('reset-road');const n=this.collision.nearest(this.state.x,this.state.z);if(n){this.state.x=n.x;this.state.z=n.z;this.state.yaw=n.yaw;this.state.speed=0;this.state.steer=0;this.cameraYaw=n.yaw;this.onMessage?.("Returned to "+roadDisplayName(n.road));}else this.travel(this.data.landmarks.find(m=>m.id==='baypark')!);}
 travel(m:Landmark,options:{deferStreaming?:boolean}={}){this.carWater.reset();this.debugEpoch++;this.stopNativeWalk();this.cancelAutoDrive('debug-travel');if(this.observer.active)this.exitPhoto();this.state.x=m.arrival[0];this.state.z=m.arrival[1];this.state.yaw=m.yaw;this.state.speed=0;this.state.steer=0;this.cameraYaw=m.yaw;this.car.setEnabled(true);this.car.position.set(this.state.x,this.groundHeight(this.state.x,this.state.z)+.115,this.state.z);this.camera.position.set(this.state.x-Math.sin(m.yaw)*9,this.groundHeight(this.state.x,this.state.z)+4,this.state.z-Math.cos(m.yaw)*9);if(!options.deferStreaming){this.cull();this.vegetation();this.traffic?.place(this.state.x,this.state.z);this.pedestrians?.place(this.state.x,this.state.z);this.bambooCorridor?.update(this.time,this.state.x,this.state.z,false);}this.onMessage?.("Arrived "+m.name+" Surrounding Roads");}
 update(dt:number,snapCamera=false){
  if(this.vehicleBoardingLoading)dt=0;
  if(this.staticTask){this.keys.clear();this.onTick?.(0);return;}
  this.advanceVehicleInteraction(this.paused?0:dt);
  // Also guard reset/reboarding and camera state inherited from free exploration.
  this.view=drivingView(this.view,this.nativeDrivingThirdPerson);
  // Zero-time sync freezes owned actor animation as well as motion in menus.
  this.taskVehicle?.step(this.keys,this.paused?0:dt);
  this.time+=dt;if(!this.paused)this.tank?.step(dt);
  if(this.flight?.active&&!this.taskFlightPaused){const result=this.flight.step(this.keys,dt,this.time*1000);if(result==='recovered'||result==='boundary')this.returnFromFlight(result);else if(result==='crashed'){this.keys.clear();this.onMessage?.("Aircraft crashed · 3 seconds later, return to the drone");}}
  this.localLights(dt);const oldCarX=this.car.position.x,oldCarZ=this.car.position.z,oldDrivingYaw=this.state.yaw;if(!this.paused&&!this.vehicleInteraction&&this.controlMode==='walking'&&this.walk){const before={x:this.walk.x,z:this.walk.z},body=this.walkStreetBody(),distance=this.walk.distance;this.walk.step(this.keys,dt);if(!streetSweepClear(body,this.walkStreetBody(),this.streetBodies())){this.walk.x=before.x;this.walk.z=before.z;this.walk.distance=distance;this.walk.speed=0;this.walk.moving=false;}const dx=this.walk.x-before.x,dz=this.walk.z-before.z;
   if(this.walk.traversing){const target=this.walk.traversalPose?.bodyYaw??this.walk.yaw,delta=Math.atan2(Math.sin(target-this.riderYaw),Math.cos(target-this.riderYaw));this.riderYaw+=delta*(1-Math.exp(-dt*16));}
   else if(this.walk.moving&&Math.hypot(dx,dz)>1e-6){const target=Math.atan2(dx,dz),delta=Math.atan2(Math.sin(target-this.riderYaw),Math.cos(target-this.riderYaw));this.riderYaw+=delta*(1-Math.exp(-dt*16));}}
  if(this.walk&&this.rider){this.rider.setEnabled(this.walk.active&&(!this.walkFirstPerson||this.observer.active));this.rider.setTraversalPose(this.walk.active?this.walk.traversalPose:null);const w=this.walk,l=w.ladder;if(w.coverCrouched)this.riderYaw=w.yaw;this.rider.setLocomotionPose(w.active&&w.coverCrouched?{kind:'crouch',position:{x:w.x,y:w.y,z:w.z},verticalSpeed:0,climbHeight:0,weight:w.crouchBlend}:w.active&&!w.grounded&&!l?.ladder.link?{kind:l?'ladder':'jump',position:{x:w.x,y:w.y,z:w.z},verticalSpeed:w.verticalSpeed,climbHeight:l?w.y-l.ladder.bottom:0,sliding:l?.sliding??false,weight:l?.phase==='exit'?1-l.progress:l?.phase==='enter'?l.progress:1}:null);this.rider.setPose({x:this.walk.x,y:this.walk.feetY,z:this.walk.z,yaw:this.riderYaw,speed:this.paused?0:this.walk.speed},dt);}
  if(!this.paused&&!this.walk?.active&&!this.taskVehicle&&!this.vehicleInteraction){const n=this.collision.nearest(this.state.x,this.state.z);this.offroad=!n||n.d>n.road.width/2+1;if(n&&n.d<40)this.roadName=roadDisplayName(n.road);
   const throttle=(this.keys.has('KeyW')||this.keys.has('ArrowUp')?1:0)-(this.keys.has('KeyS')||this.keys.has('ArrowDown')?1:0),steer=(this.keys.has('KeyD')||this.keys.has('ArrowRight')?1:0)-(this.keys.has('KeyA')||this.keys.has('ArrowLeft')?1:0);
   const manual={throttle,steer:this.tank?.active?steer:manualSteeringInput(steer,this.state.speed),handbrake:this.keys.has(this.tank?.active?'KeyX':'Space')};const status=this.autopilot?.status;
   this.drivingInput=status&&!['idle','cancelled'].includes(status.phase)?this.autopilot!.update(this.state,this.traffic?.cars??[],dt).input:manual;
   const phase=this.autopilot?.status.phase??'idle';if(phase!==this.previousAutoPhase){if(phase==='arrived'){this.audio.cue('arrival');this.onMessage?.("Automatically docked · "+this.autopilot!.status.destination!.name);}if(phase==='blocked')this.onMessage?.("The way ahead is temporarily blocked, Parked · You can take over manually or choose another route");this.previousAutoPhase=phase;}
   const before={...this.state};
   if(this.playerWaterEnabled&&this.carWater.sinking){
    this.drivingInput={throttle:0,steer:0,handbrake:false};this.state.steer=0;
    this.state.speed*=Math.exp(-3*dt);stepCar(this.state,this.drivingInput,dt,1,this.carPerformance);
    if(this.carWater.phase==='failed')this.state.speed=0;
   }
   else if(this.tank?.active){stepTank(this.state,this.drivingInput,dt);this.tank.aim(this.keys,dt);if(this.keys.has('Space'))this.tank.fire();}
   else {if(this.playerWaterEnabled)this.state.speed*=Math.exp(-this.carWater.drag*dt);stepCar(this.state,this.drivingInput,dt,1,this.carPerformance);}
   // A bridge side or a discontinuous bank is not a driveable ramp. Keep the
   // previous physical position rather than snapping to another height layer.
   // Flooded cars retain the separate irreversible sinking animation.
   if(!this.tank?.active&&!this.carWater.sinking&&!drivingSurfaceStepClear(this.rawCarSurfaceHeight,before,this.state))Object.assign(this.state,before,{speed:0});
   const interior=this.nativeFootSite;
   if(interior&&'vehicleBlocked' in interior&&!this.tank?.active){
    const fit=this.nativeDriveModel?NATIVE_DRIVE_VEHICLES[this.nativeDriveModel.kind]:{width:2.1,length:4.9};
    if(!interiorVehicleSweepClear(before,this.state,fit.width,fit.length,(x,z,yaw,w,l)=>interior.vehicleBlocked(x,z,yaw,w,l)))Object.assign(this.state,before,{speed:0});
   }
   // Substep collision along nose/center prevents tunnelling through facades.
   if(this.nativeDriveModel){
    const distance=Math.hypot(this.state.x-before.x,this.state.z-before.z),steps=Math.max(1,Math.ceil(distance/.35));
    for(let i=1;i<=steps;i++){const t=i/steps,x=before.x+(this.state.x-before.x)*t,z=before.z+(this.state.z-before.z)*t,yaw=before.yaw+(this.state.yaw-before.yaw)*t;
     if(!nativeDriveFootprintClear(x,z,yaw,this.nativeDriveModel.kind,this.playerDrivingBlocked)){Object.assign(this.state,before,{speed:0});break;}
    }
   }
   if(Math.abs(this.state.speed)>.02){const steps=Math.max(1,Math.ceil(Math.abs(this.state.speed)*dt/.7));let hit=false;for(let i=1;i<=steps;i++){const x=before.x+(this.state.x-before.x)*i/steps,z=before.z+(this.state.z-before.z)*i/steps;const f=Math.sign(this.state.speed)*(this.tank?.active?3.4:this.nativeDriveModel?NATIVE_DRIVE_VEHICLES[this.nativeDriveModel.kind].length/2:1.45);if((this.tank?.active&&!tankFootprintClear(x,z,this.state.yaw,(a,b)=>this.collision.blocked(a,b)||this.propBlocked(a,b)))||this.playerDrivingBlocked(x+Math.sin(this.state.yaw)*f,z+Math.cos(this.state.yaw)*f)||this.propBlocked(x,z)){hit=true;break;}}if(hit){this.state.x=before.x;this.state.z=before.z;this.state.distance=before.distance;this.state.speed=this.tank?.active?0:-before.speed*.15;}}
   const streetBefore=this.playerStreetBody(before),streetAfter=this.playerStreetBody(this.state);
   // Pedestrians retain their impact animation; non-person bodies share OBB
   // sweeps for every driven model, including motorcycles and trucks.
   if(!streetSweepClear(streetBefore,streetAfter,this.streetBodies().filter(b=>b.kind==='car')))Object.assign(this.state,before,{speed:0});
   this.updateNativeTrailer(before);
   const impact=this.pedestrians?.collideVehicle({...before,groundY:this.groundHeight(before.x,before.z)},{...this.state,groundY:this.groundHeight(this.state.x,this.state.z)},this.tank?.active?'tank':'sports-car',streetBefore);
   if(impact?.hits){this.state.speed*=Math.pow(.97,Math.min(3,impact.hits));this.audio.impact(impact.peakSpeed);}
   const bikeImpact=this.ebikes?.collideVehicle({...before,groundY:this.groundHeight(before.x,before.z)},{...this.state,groundY:this.groundHeight(this.state.x,this.state.z)},streetBefore);
   if(bikeImpact?.hits){this.state.speed*=Math.pow(.92,Math.min(3,bikeImpact.hits));this.audio.impact(bikeImpact.peakSpeed);}
   // Impact limit/cooldown must not turn the remaining standing people into
   // ghosts. Bodies already knocked down are intentionally passable.
   if(!streetSweepClear(streetBefore,this.playerStreetBody(this.state),this.streetBodies().filter(b=>b.kind!=='car')))Object.assign(this.state,before,{speed:0});
   if(this.playerWaterEnabled){
    const fit=this.nativeDriveModel?NATIVE_DRIVE_VEHICLES[this.nativeDriveModel.kind]:{height:1.45};
    this.carWater.step(this.waterSurface().at(this.state.x,this.state.z),fit.height,dt);
    if(this.carWater.phase==='failed')this.state.speed=0;
   }
  }
  const s=this.state;{const f=this.sceneFocus();this.signals?.update(dt,f.x,f.z,this.overviewEffects);this.ebikes?.update(dt,f.x,f.z,this.overviewEffects,this.paused,this.actor.x,this.actor.z);}if(!this.paused){this.traffic?.update(dt,this.actor.x,this.actor.z);this.pedestrians?.update(dt,this.actor.x,this.actor.z);this.wheelSpin+=s.speed*dt/this.wheelRadius;for(const m of this.carMeshes)if(m.name.startsWith('wheel_')){m.rotation.x=this.wheelSpin;m.rotation.y=m.name.match(/wheel_[lr]f_/)?-s.steer:0;}else if(m.name.startsWith('brake_'))m.rotation.set(0,-s.steer,0);}const ground=this.carSurfaceHeight(s.x,s.z);this.car.position.set(s.x,ground+.115+Math.sin(this.time*7)*Math.min(.008,Math.abs(s.speed)*.0004),s.z);const front=this.carSurfaceHeight(s.x+Math.sin(s.yaw)*1.5,s.z+Math.cos(s.yaw)*1.5),rear=this.carSurfaceHeight(s.x-Math.sin(s.yaw)*1.5,s.z-Math.cos(s.yaw)*1.5);this.car.rotation.set(-Math.atan2(front-rear,3),s.yaw,-s.steer*s.speed*.0025);
  if(this.tank?.active)this.tank.setPose(s.x,ground,s.z,s.yaw);
  if(this.nativeDriveModel){this.nativeDriveModel.root.setEnabled(!this.tank?.active&&!this.taskVehicle);this.nativeDriveModel.setDriverVisible(!this.walk?.active&&this.view!==1);this.nativeDriveModel.sync(s,this.carSurfaceHeight,this.paused?0:dt);this.car.setEnabled(false);}
  if(this.searchingForVehicle)this.car.setEnabled(false);
  else if(this.parkedHeroVisible&&!this.nativeDriveModel)this.car.setEnabled(true);
  if(this.nativeSemiTrailer){this.nativeSemiTrailer.root.setEnabled(!this.tank?.active&&!this.taskVehicle);this.nativeSemiTrailer.sync(s,this.carSurfaceHeight,false,this.nativeDriveModel?.root);}
  this.syncVehicleLightRig();
  if(this.view===1&&!this.walk?.active)this.cameraYaw+=s.yaw-oldDrivingYaw;const lookBehind=this.keys.has('KeyC');updateDrivingCameraLook(this,dt,s.yaw,s.speed,lookBehind);const lookYaw=this.cameraYaw+(lookBehind?Math.PI:0);
  const f=this.nativeSemiTrailer?(this.view===2?-27:-21):this.tank?.active?(this.view===1?-5:this.view===2?-22:-13):this.view===1?0.75:this.view===2?-18:this.view===3?-13: -8.6;const height=this.nativeSemiTrailer?(this.view===2?12:5.8):this.tank?.active?(this.view===1?4:this.view===2?11:5.2):this.view===1?1.35:this.view===2?9:this.view===3?5:1.75+this.cameraPitch*2;
  const cameraGround=this.playerWaterEnabled?Math.max(ground,this.coastal?.manifest.waterHeight??-.25):ground;
  const target=new Vector3(s.x+Math.sin(lookYaw)*5,cameraGround+(this.view===0?(this.nativeDriveModel?.kind==='box-truck'?3.65:2.65):1.15),s.z+Math.cos(lookYaw)*5);
  const desired=new Vector3(s.x+Math.sin(lookYaw)*f,cameraGround+Math.max(height+(this.view===1?0:(this.cameraPitch-.22)*Math.abs(f)*.8),this.nativeDriveModel?.kind==='box-truck'&&this.view!==1?4.2:.6),s.z+Math.cos(lookYaw)*f);this.camera.position.x+=s.x-oldCarX;this.camera.position.z+=s.z-oldCarZ;this.camera.position=Vector3.Lerp(this.camera.position,desired,snapCamera?1:1-Math.exp(-dt*(this.view===1?20:9)));this.camera.setTarget(target);this.camera.fov=.80+Math.abs(s.speed)*.00045;if(this.flight?.active){
   const p=this.flight.sim.pose,shot=this.flight.camera;this.observer.focus={x:p.x,y:p.y,z:p.z};this.observer.yaw=p.yaw;
   this.camera.position.copyFrom(shot.eye);this.camera.setTarget(shot.target);this.camera.minZ=.5;this.camera.fov=.88;this.aerialEffects(p.y-this.groundHeight(p.x,p.z)>(this.overviewEffects?125:165));
  }else if(this.observer.active){
   this.observer.step(this.keys,dt,this.groundHeight,this.data.meta.extent);const p=this.observer.pose(),f=this.observer.focus;
   this.camera.position.set(p.x,p.y,p.z);this.camera.setTarget(new Vector3(f.x,f.y,f.z));this.camera.fov=.85;
   this.camera.minZ=observerNearClip(this.observer.distance,p.y,this.sceneryTop,this.photoTarget?.id==='car');
   this.aerialEffects(p.y-this.groundHeight(p.x,p.z)>(this.overviewEffects?125:165));
  }else if(this.taskVehicle){
   const shot=this.taskVehicle.camera;this.camera.position.copyFrom(shot.eye);this.camera.setTarget(shot.target);this.camera.minZ=.3;this.camera.fov=.88;
  }else if(this.walk?.active){
   const walkYaw=this.walk.yaw+(lookBehind?Math.PI:0),e=this.walk.eye,direction=new Vector3(Math.sin(walkYaw)*Math.cos(this.walk.pitch),-Math.sin(this.walk.pitch),Math.cos(walkYaw)*Math.cos(this.walk.pitch));
   const eye=new Vector3(e.x,e.y,e.z),desired=eye.subtract(direction.scale(this.walk.cameraDistance)).addInPlaceFromFloats(.35,.4,0);
   if(this.walkFirstPerson){this.camera.position.copyFrom(eye);this.camera.setTarget(eye.add(direction));}
   else if(this.taskSurface?.weaponBoxes){const pose=interiorThirdPersonCamera([e.x,e.y,e.z],walkYaw,this.walk.pitch,Math.min(3,this.walk.cameraDistance),this.taskSurface.weaponBoxes);this.camera.position.copyFromFloats(...pose.position);this.camera.setTarget(Vector3.FromArray(pose.target));this.rider?.setEnabled(pose.arm>.65);}
   else{let distance=1;for(let t=.15;t<=1;t+=.07){const p=Vector3.Lerp(eye,desired,t);if((this.collision.blocked(p.x,p.z)&&!(this.nativeFootSite?.floorAt(p.x,p.z)!=null&&p.y>this.nativeFootSite.floorAt(p.x,p.z)!+.2))||(this.climbSite&&nativeClimbReserved(p.x,p.z)?this.climbSite.blocked(p.x,p.z,p.y,.15):this.nativeFootSite&&'cameraBlocked' in this.nativeFootSite&&this.nativeFootSite.extra?this.nativeFootSite.cameraBlocked(p.x,p.z,p.y):this.propBlocked(p.x,p.z))){distance=Math.max(.12,t-.1);break;}}this.camera.position.copyFrom(Vector3.Lerp(eye,desired,distance));this.camera.position.y=Math.max(this.camera.position.y,this.groundHeight(this.camera.position.x,this.camera.position.z)+.3);this.camera.setTarget(eye.add(direction.scale(.7)).addInPlaceFromFloats(0,-.55,0));}this.camera.minZ=.12;this.camera.fov=.88;
  }else if(this.view===1&&this.nativeDriveModel&&!this.tank?.active){
   const fit=NATIVE_DRIVE_VEHICLES[this.nativeDriveModel.kind],matrix=this.nativeDriveModel.root.computeWorldMatrix(true),eye=Vector3.TransformCoordinates(Vector3.FromArray([...fit.seat]),matrix);this.camera.position.copyFrom(eye);const direction=cockpitLookDirection(lookYaw,this.cameraPitch);this.camera.setTarget(eye.add(new Vector3(direction.x,direction.y,direction.z)));this.camera.minZ=.12;this.camera.fov=.88;
  }else if(this.view===1&&this.cockpit&&!this.tank?.active){
   const transform=this.car.computeWorldMatrix(true);this.camera.position.copyFrom(Vector3.TransformCoordinates(Vector3.FromArray(CITY_DRIVER_POSE.position),transform));const direction=cockpitLookDirection(lookYaw,this.cameraPitch);this.camera.setTarget(this.camera.position.add(new Vector3(direction.x,direction.y,direction.z)));this.camera.minZ=CITY_DRIVER_POSE.nearZ;this.camera.fov=CITY_DRIVER_POSE.fov;
  }else this.camera.minZ=.75;
  if(this.vehicleInteraction){
   const v=this.vehicleInteraction,p=sampleVehicleInteraction(v),c=Math.cos(v.car.yaw),s=Math.sin(v.car.yaw);
   this.rider?.setEnabled(p.visible);this.rider?.setTraversalPose(null);
   this.rider?.setLocomotionPose(p.phase==='approach'?null:{kind:'vehicle',position:p.pose,verticalSpeed:0,climbHeight:0,weight:p.poseWeight,seated:p.seated,vehicleFrame:p.frame});
   this.rider?.setPose({...p.pose,speed:p.phase==='approach'&&!this.paused?VEHICLE_APPROACH_SPEED:0},this.paused?0:dt);
   this.camera.position.set(v.car.x+c*v.side*5.5-s*4.5,v.car.y+3,v.car.z-s*v.side*5.5-c*4.5);
   this.camera.setTarget(new Vector3(v.car.x+c*v.side*.6,v.car.y+1,v.car.z-s*v.side*.6));this.camera.minZ=.12;this.camera.fov=.88;
  }
  this.cockpit?.setActive(this.view===1&&!this.observer.active&&!this.walk?.active&&!this.tank?.active&&!this.nativeDriveModel&&!this.vehicleInteraction);this.cockpit?.update(s.speed,s.steer/.48,{night:this.night,distanceMetres:s.distance});
  const braking=this.drivingInput.handbrake||this.drivingInput.throttle*s.speed<-.1;this.tailLights?.update({braking,night:this.night,speed:s.speed,enabled:!this.tank?.active&&!this.taskVehicle});this.audio.update({speed:s.speed,throttle:this.drivingInput.throttle,steer:s.steer,braking,paused:this.paused,cockpit:this.view===1&&!this.observer.active,offroad:this.offroad});

  // Vehicle highlights come from world lighting, never a camera-following fill.
  if(!this.tank?.active)this.vehicleReflections?.update(this.time);
  this.buildingSigns?.update(this.camera.position);
  const focus=this.sceneFocus(),detailMoving=Math.hypot(focus.x-this.previousDetailFocus.x,focus.z-this.previousDetailFocus.z)>.01;
  if(detailMoving)this.facadeStream?.noteFocusMotion();
  const detailSettled=this.detailWasMoving&&!detailMoving;
  this.previousDetailFocus={x:focus.x,z:focus.z};this.detailWasMoving=detailMoving;
  if(!this.overviewEffects||this.time>=this.nextDetailUpdate||detailSettled){
   this.nextDetailUpdate=this.time+.25;
   this.streetFurniture?.update(focus.x,focus.z,this.overviewEffects);this.bambooCorridor?.update(this.time,focus.x,focus.z,this.overviewEffects);this.rainPuddles?.update(focus.x,focus.z,this.camera.position.y-this.groundHeight(this.camera.position.x,this.camera.position.z));
   if(!this.overviewEffects){const d=this.sun.direction;this.sun.position.set(focus.x-d.x*800,this.groundHeight(focus.x,focus.z)-d.y*800,focus.z-d.z*800);}
   if(Math.hypot(focus.x-this.lastCull.x,focus.z-this.lastCull.z)>100||detailSettled)this.cull();
   if(Math.hypot(focus.x-this.lastVegetation.x,focus.z-this.lastVegetation.z)>22||this.lastLandscapeAerial!==this.overviewEffects)this.vegetation();
   this.publicLighting?.update(focus.x,focus.z);
  }
  this.rainWeather?.update(this.time,this.camera.position,focus.x,focus.z,this.camera.position.y-this.groundHeight(this.camera.position.x,this.camera.position.z));
  this.bayWater?.update(this.time);
  this.localLighting?.update(dt,this.camera.position);
  this.bambooCafe?.update(this.camera.position.x,this.camera.position.z,this.walk?.active?this.actor:null);
  const direction=this.camera.getForwardRay().direction,moving=Vector3.DistanceSquared(this.camera.position,this.reflectionEye)>.000001||Vector3.DistanceSquared(direction,this.reflectionDirection)>.0000001;
  if(moving||this.drag)this.reflectionMotionUntil=this.time+.22;
  if(this.reflectionsEnabled){const profile=this.graphicsProfile;for(const [texture,idleRate] of [[this.mirror,profile.roadIdleRate],[this.waterMirror,profile.waterIdleRate]] as const){const rate=this.time<this.reflectionMotionUntil?profile.mirrorMovingRate:idleRate;if(texture.refreshRate!==rate){texture.refreshRate=rate;texture.resetRefreshCounter();}}}
  this.reflectionEye.copyFrom(this.camera.position);this.reflectionDirection.copyFrom(direction);
  this.onTick?.(dt);
  if(this.nativeTaskContactBody&&!this.walk?.active&&!this.taskVehicle&&!this.flight?.active&&!this.observer.active&&this.view!==1){
   const focus={x:this.state.x,y:this.groundHeight(this.state.x,this.state.z)+1.2,z:this.state.z};
   const eye=targetCameraPosition(this.camera.position,focus,this.nativeTaskContactBody);
   if(eye.y!==this.camera.position.y){this.camera.position.copyFromFloats(eye.x,eye.y,eye.z);this.camera.setTarget(new Vector3(focus.x,focus.y,focus.z));}
  }
 }
 carPaintDiagnostics(){const m=this.carMeshes.map(m=>m.material).find(m=>m instanceof PBRMaterial&&/^carpaint(?:\.\d+)?$/.test(m.name)) as PBRMaterial|undefined;return m?{name:m.name,clearCoat:m.clearCoat.isEnabled,albedo:m.albedoColor.asArray(),environmentIntensity:m.environmentIntensity,roughness:m.roughness}:null;}

 profileControls(){const panel=document.createElement('div');panel.id='render-profile';panel.style.cssText='position:fixed;z-index:100;right:12px;top:140px;background:#102029ee;padding:12px;color:white;font:13px sans-serif;pointer-events:auto';for(const [name,change] of Object.entries({facades:(v:boolean)=>{this.debugFacades=v;this.cull();},shadows:(v:boolean)=>{this.scene.shadowsEnabled=v;},reflections:(v:boolean)=>{this.reflectionsEnabled=v;this.vehicleReflections?.setEnabled(v&&this.graphicsProfile.vehicleProbe&&!this.tank?.active);this.mirror.refreshRate=v?1:0;this.waterMirror.refreshRate=v?1:0;},ssao:(v:boolean)=>{if(v)this.scene.postProcessRenderPipelineManager.attachCamerasToRenderPipeline('contact-shading',this.camera);else this.scene.postProcessRenderPipelineManager.detachCamerasFromRenderPipeline('contact-shading',this.camera);},simulation:(v:boolean)=>{this.debugSimulation=v;}})){const label=document.createElement('label'),input=document.createElement('input');input.type='checkbox';input.checked=true;input.dataset.profile=name;input.onchange=()=>change(input.checked);label.append(input,name);label.style.display='block';panel.append(label);}document.body.append(panel);}
 diagnostics(){const i=this.instrumentation;return {graphics:{quality:this.graphicsQuality,renderWidth:this.engine.getRenderWidth(),renderHeight:this.engine.getRenderHeight(),shadowSize:this.shadows.mapSize,mirrorSize:this.mirror.getSize().width,msaa:this.pipeline.samples,preset:this.graphicsProfile},shaders:{compiles:this.gpuInstrumentation.shaderCompilationTimeCounter.count,compileMs:+this.gpuInstrumentation.shaderCompilationTimeCounter.total.toFixed(1),lights:this.scene.lights.length,materials:this.scene.materials.length,parallelCompile:!!this.engine.getCaps().parallelShaderCompile},vehicleReflections:this.vehicleReflections?.stats(),pedestrianImpacts:this.pedestrians?.stats,sampleAreas:{bamboo:this.bambooLook?.stats(),baypark:this.bayparkLook?.stats(),lighting:this.localLighting?.stats()},bambooCorridor:this.bambooCorridor?.stats,depthPrecision:{near:this.camera.minZ,far:this.camera.maxZ,sceneryTop:this.sceneryTop},contactShading:{attached:!!this.ao&&this.ao.cameras.includes(this.camera),gbufferMeshes:this.scene.geometryBufferRenderer?.renderList?.length??null,...STREET_AO},reflectionFrames:{...this.reflectionFrames,current:this.renderFrames,roadRate:this.mirror.refreshRate,waterRate:this.waterMirror.refreshRate},updateMs:this.updateMs,renderSubmitMs:this.renderMs,gpuMs:this.gpuInstrumentation.gpuFrameTimeCounter.lastSecAverage/1e6,activeEvaluationMs:i.activeMeshesEvaluationTimeCounter.lastSecAverage,renderTargetsMs:i.renderTargetsRenderTimeCounter.lastSecAverage,drawCalls:i.drawCallsCounter.current,instantFps:this.engine.getFps(),renderFrames:this.renderFrames,hidden:document.hidden,facades:this.facadeStream?.stats,rooftops:this.rooftops?.stats??null,roofSurface:this.roofSurface?.stats(),ambient:this.ambient?.stats(),facadeDiversity:this.facadeDiversity?.stats(),coastalHorizon:this.coastalHorizon.map(h=>h.stats),distantCity:{strategy:"original-building-meshes",proxyMeshes:0,extraTextures:0,extraShadowDraws:0,extraReflectionDraws:0},detailFocus:{...this.sceneFocus()},aerial:this.aerial,observer:this.observer.status,loadedMeshes:this.scene.meshes.length,enabledMeshes:this.scene.meshes.filter(m=>m.isEnabled()).length};}
 performance(){const a=this.samples.slice(120),b=[...a].sort((x,y)=>x-y);const pct=(p:number)=>b[Math.floor((b.length-1)*p)]??0;const mean=a.reduce((s,v)=>s+v,0)/Math.max(1,a.length);return {...this.diagnostics(),cafe:this.bambooCafe?.stats,samples:a.length,meanFps:a.length?1000/mean:0,p50:pct(.5),p95:pct(.95),p99:pct(.99),over50ms:a.filter(v=>v>50).length,resolution:[this.engine.getRenderWidth(),this.engine.getRenderHeight()],meshes:this.scene.getActiveMeshes().length,triangles:this.scene.getActiveIndices()/3};}
}
