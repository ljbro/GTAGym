import {createCharacterHud} from './city-character-hud.ts';
import './style.css';
import './area-reveal.css';
import './city-audio.css';
import './city-experience.css';
import './task-presentation.css';
import {createCityLoading} from './city-loading.ts';
import {createCityQuickTips} from './city-quicktips.ts';
import {createCityGraphicsPanel} from './city-graphics-panel.ts';
import {createFlightHud} from './city-flight-hud.ts';
import {initializeCityMap,type CityMapController} from './city-map.ts';
import {initializeCinematicHud,updateCinematicHud,drawCinematicMinimap} from './city-hud.ts';
import {drawInteriorMinimap} from './interior-minimap.ts';
import {DrivingWorld} from './city-world.ts';
import {createObserverBeacons} from './city-observer-beacons.ts';
import {createObserverDestinationResolver} from './city-observer-destination.ts';
import {createCareerExperience} from './city-career-experience.ts';
import {createOffmapWeapon} from './offmap-weapon.ts';
import {createOffmapMouse,releaseOffmapPointerLock} from './offmap-mouse.ts';
import {createNativeTaskSystem} from './native-task-system.ts';
import {openLinkedTask} from './native-task-links.ts';
import {loadWalkDatasetFromUrl,type GeneratedWalkDataset} from './generated-walk-tasks.ts';
import {loadOutdoorDatasetFromUrl,type GeneratedOutdoorDataset} from './generated-outdoor-tasks.ts';
import {loadTrainingDatasetFromUrl,type TrainingDataset} from './training-task-schema.ts';
import {createNativeFlightLaunch} from './native-flight-task.ts';
import type {Triple} from './offmap-interior-layout.ts';
import {createStoryExperience} from './city-story-experience.ts';
import {CITY_STORY_CONTENT} from './city-story-content.ts';
import {newLife,readLife,settleRide,type Ride,type ActiveRide} from './city-life.ts';
import {RoadGraph} from './navigation.ts';
import {MinimapTargetRoute} from './minimap-target-route.ts';
import {minimapRoutingMode} from './minimap-routing-mode.ts';
import {corridorTargetRoute,corridorSegmentClear} from './minimap-corridor-route.ts';
import {MinimapWalkRoute} from './minimap-walk-route.ts';
import {MinimapRejoin} from './minimap-rejoin.ts';
import type {Landmark,V2} from './city-types.ts';
const ui=document.querySelector<HTMLDivElement>('#ui')!;
const loading=createCityLoading(document.body);
const canvas=document.querySelector<HTMLCanvasElement>('#game')!;
let cityMap:CityMapController|null=null;let world:DrivingWorld,graph:RoadGraph,selected:Landmark|null=null,route:V2[]=[],mapOpen=false,toastTime=0,hudTick=0,visited=new Set<string>(),lastRevealedPlaceId:string|null=null;
let career:Awaited<ReturnType<typeof createCareerExperience>>|null=null;
// Only the native-city task system is active. Legacy ?task=offmap-* URLs must
// not redirect to the archived standalone playground or load its catalog.
const offmapRequested=false;
let nativeTasks:ReturnType<typeof createNativeTaskSystem>|null=null;
let trainingWalkDataset:GeneratedWalkDataset|undefined;
let trainingOutdoorDataset:GeneratedOutdoorDataset|undefined;
let trainingDataset:TrainingDataset|undefined;
let cityWeapon:ReturnType<typeof createOffmapWeapon>|null=null;
let taskMenuOpen=false;
let story:ReturnType<typeof createStoryExperience>|null=null,storyModal=false,storyPreviousPause=false;
let observerBeacons:ReturnType<typeof createObserverBeacons>|null=null;
let quickTips:ReturnType<typeof createCityQuickTips>|null=null;
let graphicsPanel:ReturnType<typeof createCityGraphicsPanel>|null=null;
let flightHud:ReturnType<typeof createFlightHud>|null=null;
let life=newLife(),activeRide:ActiveRide|null=null,rides:Ride[]=[],journalOpen=false;try{life=readLife(JSON.parse(localStorage.getItem('shenchengji-city-life-v1')??'null'));}catch{}
const $=(s:string)=>document.querySelector<HTMLElement>(s)!;
const num=(n:number)=>n.toLocaleString('zh-CN');
function toast(s:string){$('#toast').textContent=s;$('#toast').classList.add('visible');toastTime=4;}
function revealPlace(place:Landmark){
 const element=$('#area-reveal');element.textContent=place.area+' · '+place.name;element.classList.remove('visible');void element.offsetWidth;element.classList.add('visible');
}
const movingTargetNavigation=new MinimapTargetRoute();
const walkingTargetNavigation=new MinimapWalkRoute({height:(x,z)=>world.walkingSurfaceHeight(x,z),clear:(x,z,y)=>world.walk?.clear(x,z,y)??false});
let drivingRejoin:MinimapRejoin|null=null,drivingRejoinRadius=0;
let waterRejoin:MinimapRejoin|null=null,waterNavigationOwner:unknown=null;
function mapDraw(canvas:HTMLCanvasElement,_large=false){
 const o=world.observer,n=nativeTasks?.snapshot(),flight=world.flight?.active?world.flight:null;
 const actor=flight?{...flight.sim.pose,speed:flight.sim.speed}:world.actor,x=flight?actor.x:o.active?o.focus.x:actor.x,z=flight?actor.z:o.active?o.focus.z:actor.z;
 const item=n?.active?nativeTasks?.tasks.find(t=>t.id===n.taskId):undefined;
 const routing=minimapRoutingMode(item,{waterController:!!world.taskVehicle,flightActive:!!flight,walking:!!world.walk?.active,corridor:!!world.nativeFootSite&&'drivingNavigationPath' in world.nativeFootSite});
 canvas.dataset.routingMode=routing;
 const waterVehicle=world.taskVehicle,waterEpoch=`${world.debugEpoch}:${waterVehicle?.mode??''}`;
 if(routing==='water'&&waterVehicle?.navigationClear){
  if(waterNavigationOwner!==waterVehicle){waterNavigationOwner=waterVehicle;waterRejoin=new MinimapRejoin({blocked:(x,z)=>!waterVehicle.navigationClear!(x,z),height:()=>0},.35,.25);}
 }else{waterRejoin=null;waterNavigationOwner=null;}
 const tracking=!!item&&(item.category==='follow'||item.category==='chase');
 let fullRoute=n?.freeEscape?[]:n?.active&&n.path?n.path.points:route;
 if(tracking){
  const walking=routing==='walk';
  const site=world.nativeFootSite;
  if(routing==='corridor'&&site&&'drivingNavigationPath' in site){
   movingTargetNavigation.reset();
   // Moving vehicles do not change the physical GPS network; the rescue
   // truck itself must not erase guidance to its adjacent boarding window.
   fullRoute=n?.target?corridorTargetRoute(site.drivingNavigationPath,[actor.x,actor.z],n.target,(a,b)=>corridorSegmentClear(a,b,(x,z)=>site.floorAt(x,z)!==null&&!site.layout.blocked(x,z))):[];
  }else fullRoute=n?.target?movingTargetNavigation.update([actor.x,actor.z],n.target,`${n.taskId}:${world.debugEpoch}:${routing}:${waterVehicle?.mode??''}`,performance.now(),(a,b)=>routing==='water'?waterRejoin?.connect(a,b,waterEpoch)??[]:routing==='air'?[a,b]:walking?walkingTargetNavigation.plan(a,b):graph.route(a,b),routing==='water'?(a,b)=>waterRejoin?.clear(a,b)??false:walking?(a,b)=>walkingTargetNavigation.clear(a,b):undefined):[];
 }else movingTargetNavigation.reset();
 const goal=n?.freeEscape||tracking?undefined:n?.active&&n.flight?n.target:n?.active&&n.rescue?n.target:n?.active&&n.path?n.path.points.at(-1):selected?.arrival;
 const site=world.nativeFootSite;
 // Only walking room tasks use floor plans. Reclassified parking/garage/tunnel
 // driving uses city radar throughout, including after F disembarkation.
 // Outdoor walking-to-garage switches only on entering the actual garage.
 if(site&&'interiorMinimap' in site&&('navigationPoints' in site?site.spec.mode==='walk':site.floorAt(actor.x,actor.z)!==null)){
  drivingRejoin?.reset();drawInteriorMinimap(canvas,site.interiorMinimap,{x:actor.x,z:actor.z,yaw:actor.yaw,target:goal??undefined});return;
 }
 const landDriving=!tracking&&routing==='road'&&!world.walk?.active&&item?.mode==='drive';
 const radius=Math.max(1.35,(world.nativeDriveModel?.bounds?.width??2.1)/2+.25);
 if(landDriving&&(!drivingRejoin||drivingRejoinRadius!==radius)){
  drivingRejoinRadius=radius;
  drivingRejoin=new MinimapRejoin({blocked:(x,z)=>world.drivingNavigationBlocked(x,z)||!!world.canopy?.trunkNear(x,z,1)||!!world.landscape?.trunkNear(x,z,1),height:(x,z)=>world.groundHeight(x,z),cost:(x,z)=>{const road=world.collision.nearest(x,z);return road&&road.d<road.road.width/2?1:1.8;}},radius);
 }
 if(!landDriving)drivingRejoin?.reset();
 drawCinematicMinimap(canvas,world.data,{x,z,yaw:flight?actor.yaw:o.active?o.yaw:actor.yaw,speed:actor.speed,observer:o.active,walking:world.walk?.active,flightAltitude:flight?.stats.altitude,route:fullRoute,routeIsNavigation:tracking,navigationConnect:routing==='water'?(a,b)=>waterRejoin?.connect(a,b,waterEpoch)??null:undefined,navigationRejoin:landDriving?(a,candidates,points)=>drivingRejoin!.connectRoute(a,candidates,points,world.debugEpoch,actor.yaw):undefined,navigationPosition:[actor.x,actor.z],navigationEpoch:world.debugEpoch,target:goal??undefined,npc:tracking?n?.target??undefined:undefined,arrivalRadius:n?.active?n.completionRadius:0,police:n?.police});
}
function setTaskMenu(open:boolean){
 taskMenuOpen=open;document.body.classList.toggle('task-menu-open',open);
 if(!open){openMap(false);showJournal(false);}
 world.paused=open||!!world.flight?.active;world.taskFlightPaused=open;world.keys.clear();world.drag=false;
 $('#pause').hidden=!open;if(open)releaseOffmapPointerLock();if(!open)canvas.focus();
}
function openMap(open:boolean){
 if(open&&storyModal)return;
 const mapFocus:V2|null=world.observer.active?[world.observer.focus.x,world.observer.focus.z]:null;
 if(open&&journalOpen){journalOpen=false;$('#life-journal').hidden=true;}
 if(open&&world.observer.active&&!world.flight?.active)world.exitPhoto();
 mapOpen=open;world.paused=open||taskMenuOpen||!!world.flight?.active;world.taskFlightPaused=open||taskMenuOpen||!!nativeTasks?.modalOpen;world.keys.clear();$('#pause').hidden=true;if(open&&selected&&!offmapRequested&&!nativeTasks?.snapshot().active&&!world.autopilot?.status.active)route=graph.route([world.state.x,world.state.z],selected.arrival);
 cityMap?.updateState({...world.state,visited,selected:null,route:[],mapFocus});if(open)cityMap?.open();else cityMap?.close();
}
function selectDestination(destination:Landmark,preview:V2[]){if(offmapRequested&&!destination.id.startsWith('offmap:'))return;if(selected?.id!==destination.id||Math.hypot((selected?.arrival[0]??Infinity)-destination.arrival[0],(selected?.arrival[1]??Infinity)-destination.arrival[1])>.1)world.cancelAutoDrive('destination-changed');selected=destination;route=preview;}
function mountCityStory(){
 if(!career||offmapRequested)return;
 story=createStoryExperience(CITY_STORY_CONTENT,{
  places:career.game.places,
  frame:()=>({x:world.actor.x,z:world.actor.z,speed:world.actor.speed,
   inVehicle:!world.walk?.active,paused:world.paused,
   blocked:mapOpen||journalOpen||!!career?.game.active||!!activeRide||world.observer.active||!!world.flight?.active||!!world.tank?.active,
   debugEpoch:world.debugEpoch}),
  navigate:(point,title)=>{
   if(career?.game.active||activeRide)return;
   const near=world.collision.nearest(...point);
   const destination:Landmark={id:'story:bay-last-delivery',name:title,area:"City stories",
    x:point[0],z:point[1],arrival:point,height:0,excludeRadius:0,yaw:near?.yaw??0};
   selectDestination(destination,graph.route([world.actor.x,world.actor.z],point));
  },
  clearRoute:()=>{if(selected?.id==='story:bay-last-delivery'){
   selected=null;route=[];world.cancelAutoDrive('story-objective-complete');
  }},
  toast,
  setModalOpen:(open)=>{
   if(open===storyModal)return;
   if(open){storyPreviousPause=world.paused;world.cancelAutoDrive('story-dialogue');}
   storyModal=open;world.paused=open||storyPreviousPause||mapOpen||journalOpen;
   world.keys.clear();if(!open)canvas.focus();
  },
  credit:(id,amount)=>{
   if(!career)return false;
   if(career.game.save.legacyCompleted.includes(id))return true;
   career.creditLegacy(id,amount);
   return career.game.save.legacyCompleted.includes(id);
  },
 });
 world.scene.onDisposeObservable.addOnce(()=>story?.dispose());
}
function initLife(){
 const onRoad=(x:number,z:number):[number,number]=>{const n=world.collision.nearest(x,z);return n?[n.x,n.z]:[x,z];};const sp=world.data.spawn,along=(d:number)=>onRoad(sp.x+Math.sin(sp.yaw)*d,sp.z+Math.cos(sp.yaw)*d);
 const place=(id:string)=>world.data.landmarks.find(m=>m.id===id)!.arrival;
 rides=[{id:'coast-shift',title:"A stretch of road after work",person:"Lao Chen · City worker",description:"Just took off the reflective vest, He wants to sit by the sea for a while. Give him a lift along the way, Not in a hurry.",pickupLine:"\"Spent all day in the sun today. Enjoy the sea breeze, Only then are you truly off work. \"",arrivalLine:"\"You look, The sunset is still on duty. Thanks, Young Person. \"",reward:128,from:along(155),to:along(900)},
 {id:'office-evening',title:"Ten minutes without replying to the work group chat",person:"A Lin · Young professional",description:"The meeting ran another half hour over. Go to Xiangmihu, Set aside ten minutes for yourself tonight.",pickupLine:"\"Notifications Keep Ringing. Skip for Now, I want to see the sky today. \"",arrivalLine:"\"Turns out today can be more than just the office and my rented room. \"",reward:160,from:place('civic'),to:place('xiangmi')},
 {id:'day-pay',title:"Even one day counts",person:"A Hui · Daily wage worker",description:"Just got paid for a temporary moving job. Take him to an appointment in Houhai, He said today calls for a good meal.",pickupLine:"\"Payment received. My treat this time, Do not rush to pay for me again. \"",arrivalLine:"\"Today was tiring, sure, But the money came in, Someone is still waiting for dinner. Pretty good. \"",reward:220,from:place('tencent'),to:place('talent')}];
 $('#journal-button').onclick=()=>showJournal(!journalOpen);
 window.addEventListener('keydown',e=>{if(storyModal||e.defaultPrevented)return;if(e.code!=='Escape'&&e.target instanceof HTMLElement&&e.target.closest('input,textarea,select,[contenteditable=true]'))return;if(e.repeat)return;if(e.code==='KeyJ')showJournal(!journalOpen);if(e.code==='KeyE')interactRide();});
 renderJournal();
}
function showJournal(open:boolean){if(open&&(storyModal||offmapRequested))return;if(open&&world.aerial&&!world.flight?.active)world.exitPhoto();if(open&&mapOpen)openMap(false);journalOpen=open;$('#life-journal').hidden=!open;world.paused=open||taskMenuOpen||!!world.flight?.active;world.taskFlightPaused=open||taskMenuOpen||!!nativeTasks?.modalOpen;world.keys.clear();if(open)renderJournal();}
function renderJournal(){
 if(career){life.cash=career.game.save.cash;life.completed=career.game.save.legacyCompleted;career.render();return;}
 $('#wallet').textContent='¥ '+num(life.cash);$('#life-savings').textContent="Fund for a room of your own · ¥ "+num(life.cash)+' / 1,800';($('#life-progress') as HTMLProgressElement).value=Math.min(1800,life.cash);
 $('#ride-list').innerHTML=rides.map(r=>`<article><small>${r.person}</small><h3>${r.title}</h3><p>${r.description}</p><button data-ride="${r.id}" ${life.completed.includes(r.id)?'disabled':''}>${life.completed.includes(r.id)?"Completed · This journey is recorded":activeRide?.id===r.id?(activeRide.debugged?"Accept Another Order":"Continue Navigation"):"Take this stretch · ¥ "+r.reward}</button></article>`).join('');
 document.querySelectorAll<HTMLButtonElement>('[data-ride]').forEach(b=>b.onclick=()=>{const r=rides.find(r=>r.id===b.dataset.ride)!;if(activeRide?.id!==r.id||activeRide.debugged)activeRide={id:r.id,phase:'pickup',startOdometer:world.state.distance,debugged:false};showJournal(false);rideNavigation(r);toast("On-route Order · "+r.title);document.querySelector('.intro')?.classList.add('gone');});
}
function rideNavigation(r:Ride){world.cancelAutoDrive('ride-destination-changed');const p=activeRide?.phase==='riding'?r.to:r.from;selected={id:r.id,name:(activeRide?.phase==='riding'?"Delivered · ":"Connect · ")+r.person,x:p[0],z:p[1],height:0,excludeRadius:0,area:"City life",arrival:p,yaw:0};route=graph.route([world.state.x,world.state.z],p);}
function interactRide(){if(world.paused||(world.tank?.active&&!world.walk?.active))return;if(story?.interact())return;if(world.bambooCafe?.interact(world))return;if(career?.interact())return;if(!activeRide){if(career&&Math.hypot(world.actor.x-career.game.places.hub[0],world.actor.z-career.game.places.hub[1])<40)showJournal(true);return;}const r=rides.find(r=>r.id===activeRide!.id)!,p=activeRide.phase==='pickup'?r.from:r.to;const at=Math.hypot(world.state.x-p[0],world.state.z-p[1])<28;if(!at||Math.abs(world.state.speed)>1)return;
 if(activeRide.phase==='pickup'){activeRide.phase='riding';activeRide.startOdometer=world.state.distance;activeRide.debugged=false;toast(r.pickupLine);toastTime=9;rideNavigation(r);return;}
 if(settleRide(life,activeRide,r,world.state.distance,true,world.state.speed)){career?.creditLegacy(r.id,r.reward);try{localStorage.setItem('shenchengji-city-life-v1',JSON.stringify(life));}catch{toast("Browser did not allow progress to be saved");}toast(r.arrivalLine+"  ·  Income +¥ "+r.reward);toastTime=12;activeRide=null;selected=null;route=[];$('#route-hud').hidden=true;renderJournal();}
 else toast(activeRide.debugged?"Debug teleport was used on this trip. Accept the job again in the journal to play it normally.":"Then continue driving for a while, Park on arrival to complete this trip.");
}
function debugJump(){if(activeRide?.phase==='riding')activeRide.debugged=true;}
function initObserverBeacons(){
 const resolve=createObserverDestinationResolver({data:world.data,collision:world.collision,groundHeight:world.groundHeight,propBlocked:(x,z)=>world.propBlocked(x,z),waterHeight:world.coastal?.manifest.waterHeight??-.25});
 // Picking is performed once per completed hold, against visible static city
 // surfaces. Keep the ordinary per-frame scene picking disabled for all of them.
 const surfaces=new Set([...world.blocks.map(b=>b.mesh),...world.landmarks,...world.scene.meshes.filter(m=>/^(terrain_|ground_relief_|bay-horizon-water)/.test(m.name))]);
 observerBeacons=createObserverBeacons({scene:world.scene,camera:world.camera,canvas,host:ui,
  active:()=>world.observer.active&&!world.flight?.active&&!world.flight?.loading&&world.photoTarget?.id!=='car'&&!mapOpen&&!journalOpen,
  pick:(clientX,clientY)=>{
   const rect=canvas.getBoundingClientRect();
   const hit=world.scene.pick(clientX-rect.left,clientY-rect.top,m=>surfaces.has(m)&&m.isEnabled()&&m.isVisible&&m.getTotalVertices()>0,false,world.camera);
   return hit?.hit&&hit.pickedPoint?resolve(hit.pickedPoint):null;
  },
  stopDrag:()=>{world.drag=false;world.keys.clear();},toast,
  focus:point=>{
   const valid=resolve(point,point.name);if(!valid)return;
   world.enterPhoto({id:'saved-view',name:point.name,x:point.x,z:point.z,height:0,area:"Save location",excludeRadius:0,arrival:[point.x,point.z],yaw:0,photoTargetHeight:point.y,photoDistance:Math.max(260,Math.min(900,world.observer.distance)),photoElevation:.58,photoAngle:-world.observer.yaw});
  },
  travel:point=>{
   // Recompute the road arrival: persisted coordinates never bypass current
   // terrain, bridge, prop or vehicle-clearance checks.
   const valid=resolve(point,point.name);if(!valid?.arrival){toast("There is no suitable road here to place the vehicle, You can save the view first");return false;}
   debugJump();world.travel({id:'beacon-travel',name:valid.name,x:valid.x,z:valid.z,height:0,area:"Save location",excludeRadius:0,arrival:valid.arrival,yaw:valid.yaw??0});
   selected=null;route=[];return true;
  }
 });
 world.scene.onDisposeObservable.addOnce(()=>observerBeacons?.dispose());
}
let characterHud:ReturnType<typeof createCharacterHud>|null=null;
function initUI(){
 document.body.classList.add('task-clean-ui');
 ui.innerHTML=`<header><div class="wordmark">ShenChengJi<span>OPEN ROADS</span></div><div class="location"><i></i><span id="district">Nanshan · Houhai</span><small id="clock">18:25</small></div><button id="map-button">City map <kbd>M</kbd></button></header>
 <div class="intro"><span>All the Way to the Sea</span><h1>Tonight, Drive Farther Away. </h1><p>Nanshan → Futian → Luohu, The whole city awaits your departure. </p></div>
 <div id="area-reveal" role="status" aria-live="polite"></div><div id="toast" role="status"></div><div id="route-hud" hidden><small>Heading to</small><strong id="route-title"></strong><span id="route-distance"></span><button id="cancel-autodrive" hidden>Take over driving</button></div>
 <div id="minimap"><canvas id="mini-map"></canvas><span class="north">N</span><div id="road-name">Binhai Boulevard</div></div>
 <div id="speedometer"><div><b id="speed">000</b><span>KM/H</span></div><div class="speed-line"><i id="speed-bar"></i></div><small><span id="gear">P</span><span id="odometer">0.0 KM</span><span>Bay GT</span></small></div>
 <div class="controls"><span><kbd>W S</kbd> Throttle / Brake</span><span><kbd>A D</kbd> Steering</span><span><kbd>Space</kbd> Driving handbrake / Walking Jump, Cross, climbing</span><span><kbd>V</kbd> Camera</span><span><kbd>L</kbd> Sunset / Night scenery / Sunny day</span><span><kbd>F</kbd> Enter or Exit Vehicle</span><span><kbd>C</kbd> Hold to look back</span><span><kbd>O</kbd> View the car</span><span><kbd>G</kbd> Drone</span><span><kbd>K</kbd> Toggle Cursor Visibility</span><span><kbd>R</kbd> Return to the Road</span></div>
 <button id="journal-button">City life <span id="wallet"></span> <kbd>J</kbd></button><div id="ride-prompt" hidden></div><section id="life-journal" hidden><div class="life-heading"><small>After work / City journal</small><h2>Today, Live a little for yourself too. </h2><p id="life-savings"></p><progress id="life-progress" max="1800" value="180"></progress></div><div id="ride-list"></div><p class="life-note">These three people are fictional. Stop for pickup and drop-off, press E Talk. press J Back. </p></section><div id="observer-help" hidden><strong>Drone sightseeing · B Switch Aircraft</strong><span>WASD Pan · Turn your head with arrow keys · QE Raise and lower · Shift Accelerate</span><span>Drag to orbit · Shift + Drag to pan · Scroll to Adjust Distance · G / F Return to driving</span><span>Long Press Location · Light Beam Marker / Favorite / Move</span></div><div id="fps" hidden></div>
 <section id="map-panel" hidden></section>
 <div id="pause" hidden><h2>Take a Break. </h2><button id="resume">Continue driving</button></div>`;
 initializeCinematicHud(world.data);
 graphicsPanel=createCityGraphicsPanel(ui,{getQuality:()=>world.graphicsQuality,onChange:quality=>{const saved=world.setGraphicsQuality(quality);toast("Graphics quality switched to"+({low:"Low",medium:"in",high:"high"}[quality])+(saved?" · Saved":" · Applies to this session"));},onOpenChange:()=>{world.keys.clear();world.drag=false;}});
 world.scene.onDisposeObservable.addOnce(()=>graphicsPanel?.dispose());
 characterHud=createCharacterHud(ui,world);world.scene.onDisposeObservable.addOnce(()=>characterHud?.dispose());
 const walkMouse=createOffmapMouse(canvas,{
  available:()=>world.ready&&(!world.observer.active||!!world.flight?.active)&&!nativeTasks?.modalOpen,
  paused:()=>!!(world.flight?.active?world.taskFlightPaused:world.paused)||taskMenuOpen||mapOpen||journalOpen||storyModal,
  look:(dx,dy)=>world.look(dx,dy),sensitivity:()=>cityWeapon?.core.aiming?.5:1,
  unlock:()=>{world.keys.clear();world.drag=false;if(!mapOpen&&!journalOpen&&!storyModal&&!nativeTasks?.modalOpen){world.paused=true;world.taskFlightPaused=true;$('#pause').hidden=false;}},message:toast
 });
 world.scene.onDisposeObservable.addOnce(()=>walkMouse.dispose());
 cityWeapon=createOffmapWeapon(world.scene,world.camera,canvas,ui,{
  available:()=>!!world.walk?.active&&!world.walk.ladder&&!world.walk.traversing&&!world.observer.active&&!world.flight?.active&&!nativeTasks?.modalOpen,
  firstPerson:()=>world.walkFirstPerson,paused:()=>world.paused||mapOpen||journalOpen||storyModal,
  equip:()=>{world.walkFirstPerson=true;},look:(dx,dy)=>world.walk?.look(dx,dy),
  solids:()=>world.taskSurface?.weaponBoxes??null,message:toast,
  targetPoints:()=>{
   const points:Triple[]=[];
   if(!points.length&&world.walk)for(const d of [5,9,13]){const x=world.walk.x+Math.sin(world.walk.yaw)*d,z=world.walk.z+Math.cos(world.walk.yaw)*d,y=world.walkingSurfaceHeight(x,z);if(Number.isFinite(y)&&world.walk.clear(x,z))points.push([x,y,z]);}
   return points.slice(0,3);
  }
 });
 Object.defineProperty(window,'__OFFMAP_WEAPON__',{get:()=>cityWeapon});
 world.scene.onDisposeObservable.addOnce(()=>cityWeapon?.dispose());
 flightHud=createFlightHud(ui,world);world.scene.onDisposeObservable.addOnce(()=>flightHud?.dispose());
 quickTips=createCityQuickTips(ui,{onOpenChange:()=>world.keys.clear(),onFlight:()=>{canvas.focus();void world.toggleFlight();}});
 world.scene.onDisposeObservable.addOnce(()=>quickTips?.dispose());
 $('#observer-help').insertAdjacentHTML('beforeend',"<span>K Hide / Show Cursor · For easier screen recording</span>");
 window.addEventListener('keydown',e=>{
  if(e.code!=='KeyK'||e.repeat||e.isComposing||e.metaKey||e.ctrlKey||e.altKey)return;
  if(e.target instanceof HTMLElement&&e.target.closest('input,textarea,select,[contenteditable=true]'))return;
  e.preventDefault();
  const hidden=document.body.classList.toggle('recording-cursor-hidden');
  toast(hidden?"Mouse Cursor Hidden · Then press K Show":"Mouse Cursor Shown");
 });
 initObserverBeacons();
 nativeTasks=createNativeTaskSystem(world,graph,{
  trainingWalkDataset,
  trainingOutdoorDataset,
  trainingDataset,
  toast,
  prepareStart:()=>setTaskMenu(false),
  setRoute:(destination,preview)=>{selected=destination;route=preview;world.cancelAutoDrive('native-task-route');},
  clearRoute:()=>{selected=null;route=[];world.cancelAutoDrive('native-task-route-clear');}
 });
 world.onAircraftInteract=()=>nativeTasks?.interact()??false;
 world.scene.onDisposeObservable.addOnce(()=>{world.onAircraftInteract=null;nativeTasks?.dispose();});
 const flightLaunch=createNativeFlightLaunch(world);world.scene.onDisposeObservable.addOnce(()=>flightLaunch.dispose());
 world.audio.mountControls($('#pause'));
 cityMap=initializeCityMap({data:world.data,graph,onSelect:selectDestination,
  onAutoDrive:(destination,preview)=>{if(offmapRequested){toast("Follow the mission route during the mission; City navigation is available during free driving");return;}selectDestination(destination,preview);openMap(false);document.querySelector('.intro')?.classList.add('gone');world.startAutoDrive(destination);},
  onManualRoute:(destination,preview)=>{if(offmapRequested){openMap(false);return;}selectDestination(destination,preview);world.cancelAutoDrive('manual-route');openMap(false);toast("Follow the light green route on the minimap");},
  onPhoto:destination=>{openMap(false);world.enterPhoto(destination);},onClose:()=>openMap(false),
  onVisit:()=>{openMap(false);selected=null;route=[];void world.bambooCafe?.enter(world);},
  onDebugTravel:(destination:Landmark)=>{debugJump();const nearby=world.collision.nearest(...destination.arrival);world.travel(nearby?{...destination,arrival:[nearby.x,nearby.z],yaw:nearby.yaw}:destination);selected=null;route=[];openMap(false);}
 });
 $('#map-button').onclick=()=>openMap(true);$('#resume').onclick=()=>setTaskMenu(false);
 window.addEventListener('keydown',e=>{
  if(e.code==='Escape'){e.preventDefault();e.stopImmediatePropagation();if(!e.repeat){if(nativeTasks?.modalOpen)nativeTasks.close();else if(world.staticTask)nativeTasks?.open();else setTaskMenu(!taskMenuOpen);}return;}
  if(!taskMenuOpen&&['KeyM','KeyJ','Tab'].includes(e.code)){e.preventDefault();e.stopImmediatePropagation();}
 },{capture:true});
 $('#cancel-autodrive').onclick=()=>world.cancelAutoDrive('manual-takeover');
 window.addEventListener('keydown',e=>{if(storyModal||e.defaultPrevented)return;if(e.code!=='Escape'&&e.target instanceof HTMLElement&&e.target.closest('input,textarea,select,[contenteditable=true]'))return;if(e.repeat)return;if(e.code==='KeyG'){mapOpen=false;journalOpen=false;cityMap?.close();$('#life-journal').hidden=true;$('#pause').hidden=true;world.paused=world.aerial;}if(e.code==='KeyM'||e.code==='Tab')openMap(!mapOpen);if(e.code==='Escape'){if(world.aerial){world.toggleAerial();return;}if(journalOpen){showJournal(false);return;}if(world.photoTarget){world.exitPhoto();return;}if(mapOpen)openMap(false);else{world.paused=!world.paused;$('#pause').hidden=!world.paused;}}if(e.code==='KeyP')$('#fps').hidden=!$('#fps').hidden;});
 world.onMessage=toast;world.onTick=dt=>{
  nativeTasks?.tick(dt);
  if(world.staticTask)return;
  observerBeacons?.update(dt);characterHud?.update(mapOpen||journalOpen);flightHud?.update(mapOpen||journalOpen);
  career?.tick(dt);story?.tick(dt);cityWeapon?.tick(dt);walkMouse.sync();
  $('#observer-help').hidden=!world.observer.active||!!world.flight?.active;$('#minimap').classList.toggle('observer-muted',world.observer.active);$('#speedometer').classList.toggle('observer-muted',world.observer.active||!!world.walk?.active);
  hudTick+=dt;toastTime-=dt;if(toastTime<=0)$('#toast').classList.remove('visible');if(hudTick<.12&&dt!==0)return;hudTick=0;
 const s={...world.state,...world.actor};
 const location=world.sceneFocus();
 const nearest=world.data.landmarks.reduce((a,b)=>Math.hypot(a.x-location.x,a.z-location.z)<Math.hypot(b.x-location.x,b.z-location.z)?a:b);
  const nearestDistance=Math.hypot(nearest.x-location.x,nearest.z-location.z);
  if(nearestDistance<520&&nearest.id!==lastRevealedPlaceId){lastRevealedPlaceId=nearest.id;revealPlace(nearest);}
  else if(nearestDistance>650)lastRevealedPlaceId=null;
  graphicsPanel?.update({hidden:mapOpen||journalOpen||!!world.flight?.active||(world.paused&&!world.observer.active)});
  quickTips?.update({hidden:!!world.flight?.active,flightLoading:!!world.flight?.loading,mode:world.observer.active?'observer':world.walk?.active?'walking':world.tank?.active?'tank':'driving',carView:world.photoTarget?.id==='car',menuOpen:mapOpen||journalOpen||(world.paused&&!world.observer.active)});
  updateCinematicHud({flight:!!world.flight?.active,speed:s.speed,distance:s.distance,roadName:world.locationRoadName(),district:nearest.area,night:world.night,lightMode:world.lightMode,walking:!!world.walk?.active,observer:world.observer.active,menuOpen:mapOpen||journalOpen||(world.paused&&!world.observer.active),navigation:!!selected});
  if(activeRide){const r=rides.find(r=>r.id===activeRide!.id)!,p=activeRide.phase==='pickup'?r.from:r.to,d=Math.hypot(s.x-p[0],s.z-p[1]);$('#ride-prompt').hidden=d>35;$('#ride-prompt').textContent=Math.abs(s.speed)>1?"Pull over, and "+r.person.split(' · ')[0]+" Talk":"press E · "+(activeRide.phase==='pickup'?"Connect":"Delivered")+r.person.split(' · ')[0];}else {const prompt=story?.prompt()??world.bambooCafe?.prompt(world)??career?.prompt()??(!career?.game.active&&world.walk?.active&&Math.hypot(world.actor.x-(career?.game.places.hub[0]??1e9),world.actor.z-(career?.game.places.hub[1]??1e9))<40?"press E · Accept jobs at the station / Hot Meal Supplies":null);$('#ride-prompt').hidden=!prompt||mapOpen||journalOpen;$('#ride-prompt').textContent=prompt??'';}
  if(s.distance>30)document.querySelector('.intro')?.classList.add('gone');
  mapDraw($('#mini-map') as HTMLCanvasElement,false);
  const auto=world.autopilot?.status;if(auto?.route.length&&auto.destination?.id===selected?.id&&!['idle','cancelled'].includes(auto.phase))route=auto.route.map(p=>[p[0],p[1]]);
  if(mapOpen)cityMap?.updateState({...s,visited,selected:null,route:[]});
  $('#cancel-autodrive').hidden=!auto?.active;
  if(selected){const d=Math.hypot(selected.arrival[0]-s.x,selected.arrival[1]-s.z);$('#route-hud').hidden=false;$('#route-title').textContent=selected.name;
   const controlled=auto?.destination?.id===selected.id&&!['idle','cancelled'].includes(auto.phase);const labels={idle:"Heading to",driving:"Automatic Driving",yielding:"Vehicle Ahead · Waiting",maneuvering:"Adjust direction at low speed",parking:"Pulling In",arrived:"Arrived and fully stopped",blocked:"Parked · Take over or select another route",cancelled:"Manual driving"};
   $('#route-hud small').textContent=controlled?(auto?.reason==='planning-route'?"Planning road routes":labels[auto!.phase]):"Manual navigation";
   $('#route-distance').textContent=controlled?(auto!.phase==='arrived'?"Roads around the destination":auto!.phase==='blocked'?"WASD / Take over with arrow keys":`${(auto!.remainingDistance/1000).toFixed(1)} km · ${auto!.etaSeconds===null?"Waiting to proceed":"about "+Math.max(1,Math.ceil(auto!.etaSeconds/60))+" Minutes"}`):(d<40?"Reached the vicinity":(d/1000).toFixed(1)+" km · Straight Line Distance");
   if((controlled?auto!.phase==='arrived':d<40&&Math.abs(s.speed)<1)&&!visited.has(selected.id)){visited.add(selected.id);toast("City footprints +1 · "+selected.name);}
  }else $('#route-hud').hidden=true;
  if(!$('#fps').hidden)$('#fps').textContent=Math.round(world.engine.getFps())+' FPS · '+world.engine.getRenderWidth()+' × '+world.engine.getRenderHeight();
 };
 world.refreshNavigation=()=>mapDraw($('#mini-map') as HTMLCanvasElement,false);
 world.refreshNavigation();
}
async function boot(){try{world=new DrivingWorld(canvas);await world.init(s=>loading.update(s));loading.update('navigation');graph=new RoadGraph(world.data.roads,await(await fetch('/city/navigation.json')).json());world.startTraffic(graph);loading.update('life-sites');const communitySites=(await(await fetch('/city/life-sites.json')).json()).sites;for(const site of communitySites)world.data.landmarks.push({id:'life:'+site.id,name:site.name,x:site.x,z:site.z,height:4.34,area:"Community Service Station",excludeRadius:0,detailCollision:true,arrival:site.arrival,yaw:site.yaw,photoDistance:22,photoElevation:.25,photoAngle:-site.heading,photoTargetHeight:world.groundHeight(site.x,site.z)+1.8});loading.update('interface');initUI();initLife();await cityMap?.ready;loading.update('experience');if(!offmapRequested){career=await createCareerExperience(world,graph,{toast,close:()=>showJournal(false),open:()=>showJournal(true),menuOpen:()=>mapOpen||journalOpen||(world.paused&&!world.observer.active),navigate:selectDestination,clearRoute:()=>{selected=null;route=[];world.cancelAutoDrive('career-objective-complete');},legacy:{rides:()=>rides,active:()=>activeRide,cancel:()=>{activeRide=null;selected=null;route=[];world.cancelAutoDrive('legacy-cancelled');},start:r=>{if(activeRide?.id!==r.id||activeRide.debugged)activeRide={id:r.id,phase:'pickup',startOdometer:world.state.distance,debugged:false};showJournal(false);rideNavigation(r);toast("On-route Order · "+r.title);}}});await career.ready;mountCityStory();}document.querySelector('.intro')?.classList.add('gone');Object.defineProperty(window,'__SHENCHENGJI_CITY__',{value:{get ready(){return world.ready;},get world(){return world;},get telemetry(){return {state:{...world.state},autopilot:world.autopilot?.status,render:world.diagnostics()};},get state(){return {...world.state,road:world.roadName,height:world.groundHeight(world.state.x,world.state.z),carY:world.car.position.y};},get performance(){return world.performance();},get stats(){return {story:story?.view,tank:world.tank?.stats,controlMode:world.controlMode,rider:{loaded:!!world.rider,name:world.rider?.name,loading:world.riderLoading,firstPerson:world.walkFirstPerson},flight:world.flight?.stats,nativeTask:nativeTasks?.snapshot(),career:career?.game.view,careerSites:career?.sites,lifeHubs:career?.hubs,walking:world.walk?{active:world.walk.active,x:world.walk.x,y:world.walk.y,z:world.walk.z,yaw:world.walk.yaw,distance:world.walk.distance,grounded:world.walk.grounded,motion:world.walk.motion,verticalSpeed:world.walk.verticalSpeed,landings:world.walk.landings,jumps:world.walk.jumps,completedClimbs:world.walk.completedClimbs,ladder:world.walk.ladder}:null,lightMode:world.lightMode,coastal:world.coastal?.stats,bayWater:world.bayWater?.stats(),publicLighting:world.publicLighting?.stats(),buildingSigns:world.buildingSigns?.stats(),vehicleMaterials:world.vehicleMaterials?.stats,cockpit:world.cockpit?.stats,audio:world.audio.stats,tailLights:world.tailLights?.stats,autopilot:world.autopilot?.status,streetFurniture:world.streetFurniture?.stats,bambooCorridor:world.bambooCorridor?.stats,camera:{view:world.view,minZ:world.camera.minZ,position:world.camera.position.asArray(),fov:world.camera.fov},cinematic:world.cinematic?.stats,roadSurface:world.roadSurface?.stats,rainPuddles:world.rainPuddles?.stats,rainWeather:world.rainWeather?.stats,raining:world.raining,groundRelief:world.groundRelief?.stats,mountains:world.mountains?.stats,vehicleFinish:world.vehicleFinish?.stats,sportDetails:world.sportDetails?.stats,observer:world.observer.status,observerBeacons:observerBeacons?.stats,architecture:world.architecture.stats(),facadeDiversity:world.facadeDiversity.stats(),landscape:world.landscape?.stats,signage:world.signage?.stats(),life:{cash:life.cash,completed:[...life.completed],active:activeRide?{...activeRide}:null,rides:rides.map(r=>({...r}))},lighting:{carPaint:world.carPaintDiagnostics(),environmentReady:!!world.scene.environmentTexture?.sphericalPolynomial,treeInstances:world.landscape?.stats.sourceTreeCount,carMaterial:world.carMeshes[0]?.material?.name,headlightsExcludeWater:world.headlights.every(l=>l.excludedMeshes.some(m=>m.name==='terrain_water'))},counts:world.data.meta.counts,landmarks:world.data.landmarks,graphNodes:graph.nodes.length,pedestrianImpacts:world.pedestrians?.stats,pedestrians:world.pedestrians?.people.map(p=>({x:p.x,z:p.z})),trafficMeshes:world.traffic?.meshes.flat().map(m=>({name:m.name,parent:m.parent?.name,instances:m.thinInstanceCount,enabled:m.isEnabled()})),traffic:world.traffic?.cars.map(c=>({x:c.x,z:c.z})),photo:world.photoTarget?.id};},resetPerformance(){world.samples=[];},tune(overrides:Record<string,unknown>){return world.cinematic?.tune(overrides);},finish(overrides:Record<string,unknown>){return world.cinematic?.finish(overrides);}}});await loading.finish();await loading.reveal();canvas.focus();if(nativeTasks)openLinkedTask(location.search,nativeTasks,toast);}catch(e){console.error(e);loading.error(e);}}
void Promise.all([loadWalkDatasetFromUrl(location.search,document.baseURI),loadOutdoorDatasetFromUrl(location.search,document.baseURI),loadTrainingDatasetFromUrl(location.search,document.baseURI)]).then(([walking,outdoor,unified])=>{trainingWalkDataset=walking;trainingOutdoorDataset=outdoor;trainingDataset=unified;return boot();}).catch(error=>{console.error(error);loading.error(error);});
