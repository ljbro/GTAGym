import './city-flight-hud.css';
import type {DrivingWorld} from './city-world.ts';
import {helicopterControls,planeControls,FLIGHT_ENGINE_START_SECONDS} from './city-flight-controls.ts';
import {FLIGHT_RECOVERY_MS} from './city-flight-simulation.ts';

export function createFlightHud(host:HTMLElement,world:DrivingWorld){
 const prompt=document.createElement('div');prompt.id='flight-board-prompt';prompt.hidden=true;prompt.setAttribute('role','status');host.append(prompt);
 const panel=document.createElement('section');panel.id='flight-hud';panel.hidden=true;panel.setAttribute('aria-label',"Flight instruments");
 panel.innerHTML=`<div class="flight-instruments" hidden><div class="flight-title"><small>BAY WINGS / Wanyi</small><strong>Bay Free Flight</strong><span class="flight-phase"></span><span class="flight-mission"></span></div><dl><div><dt>Airspeed</dt><dd data-flight-value="speed">0<small>KM/H</small></dd></div><div><dt>Height above ground</dt><dd data-flight-value="altitude">0<small>M</small></dd></div><div><dt>Heading</dt><dd data-flight-value="heading">000°</dd></div><div><dt>Throttle</dt><dd data-flight-value="throttle">0<small>%</small></dd></div><div><dt>Climb or Descent Rate</dt><dd data-flight-value="vertical">0<small>M/S</small></dd></div><div><dt>Roll</dt><dd data-flight-value="bank">0°</dd></div></dl><div class="flight-throttle"><i></i></div></div>
 <div class="flight-crash" role="status" hidden><small>FLIGHT ENDED</small><strong>Aircraft crashed</strong><span>3 seconds later, return to the drone</span></div>
 <div class="flight-help" hidden><strong></strong><span class="flight-controls-note"></span><span class="flight-equipment-status"></span><span><button type="button" data-flight-exit><kbd>F</kbd> Exit the aircraft after it stops</button> · V Switch View · L Switch Lighting</span></div>`;
 const equipment=panel.querySelector<HTMLElement>('.flight-equipment-status')!;
 const exit=panel.querySelector<HTMLButtonElement>('[data-flight-exit]')!;
 exit.onclick=()=>{exit.blur();world.canvas.focus();world.exitAircraft();};
 host.append(panel);
 const instruments=panel.querySelector<HTMLElement>('.flight-instruments')!,help=panel.querySelector<HTMLElement>('.flight-help')!,crash=panel.querySelector<HTMLElement>('.flight-crash')!,phase=panel.querySelector<HTMLElement>('.flight-phase')!;
 const value=(name:string,text:string)=>{panel.querySelector('[data-flight-value="'+name+'"]')!.innerHTML=text;};
 return {update(menuOpen:boolean){
  const flight=world.flight,active=!!flight?.active,walk=world.walk;
  prompt.hidden=menuOpen||world.paused||!walk?.active||!flight?.parked||Math.hypot(walk.x-flight.sim.pose.x,walk.z-flight.sim.pose.z)>14;
  if(!prompt.hidden)prompt.textContent=flight?.canBoard(walk)?"F · Board aircraft, The engine starts automatically":"Approach the aircraft door · F Board aircraft";
  panel.hidden=menuOpen||!world.observer.active||world.photoTarget?.id==='car';if(panel.hidden)return;
  instruments.hidden=help.hidden=!active;const s=flight?.stats;crash.hidden=s?.phase!=='exploding';
  if(s&&active){
   const helicopter=s.kind==='helicopter';
   panel.querySelector('.flight-title strong')!.textContent=helicopter?(s.model==='cargobob'?"Cargobob Transport helicopter":"Frogger Helicopter"):"Wanyi Fixed-Wing Aircraft";
   panel.querySelector('.flight-help strong')!.textContent=helicopter?helicopterControls:planeControls;
   panel.querySelector('.flight-controls-note')!.textContent="Use arrow keys if no numeric keypad is available: ↓ Look up / ↑ Look down / ← → Roll"+(helicopter?" · Release W/S Return to Baseline Lift, Still moves when tilted":" · Accelerate before takeoff, Lower the landing gear before the approach");
   const gear=s.gearProgress>.01&&s.gearProgress<.99?(s.gearTargetDown?"Lowering":"Retracting"):s.gearDown?"Put down":"Collapsed";
   equipment.textContent=helicopter?"Rotor "+Math.round(s.rotorRpm*100)+"% · Fixed Landing Gear":"Landing gear "+gear+" · Space to launch missiles";
   value('vertical',s.verticalSpeed.toFixed(1)+'<small>M/S</small>');value('bank',Math.round(s.roll*180/Math.PI)+'°');
   value('speed',Math.round(s.speed*3.6)+'<small>KM/H</small>');value('altitude',Math.round(s.altitude)+'<small>M</small>');
   value('heading',String(Math.round((s.yaw*180/Math.PI%360+360)%360)).padStart(3,'0')+'°');value('throttle',Math.round(s.throttle*100)+'<small>%</small>');
   (panel.querySelector('.flight-throttle i') as HTMLElement).style.width=s.throttle*100+'%';
   phase.textContent=s.phase==='exploding'?"Flight interrupted":s.engineState==='starting'?`Engine Starting · ${Math.min(FLIGHT_ENGINE_START_SECONDS,s.engineStartedFor).toFixed(1)} / ${FLIGHT_ENGINE_START_SECONDS} seconds`:!s.engineOn?"Engine off · Unpowered":s.onGround?(helicopter?"Engine ready · W Vertical takeoff":"Engine ready · W Ground roll / A D Steering / S Brake"):helicopter?"W Ascend · S Descend · Use the numpad to control tilt":s.stalled?"Stall · Maintain throttle and adjust pitch":"Flying · Before entering, press G Lower landing gear";
   if(!helicopter&&s.phase==='flying')phase.textContent+=" · Landing gear"+gear;
   panel.querySelector('.flight-mission')!.textContent=world.flightMissionText??'';
   if(!crash.hidden)crash.querySelector('span')!.textContent=Math.max(1,Math.ceil((FLIGHT_RECOVERY_MS-(world.time*1000-s.crashedAt))/1000))+" seconds later, return to the drone";
  }
 },dispose(){panel.remove();prompt.remove();}};
}
