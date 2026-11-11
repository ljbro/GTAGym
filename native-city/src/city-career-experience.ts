import './city-career.css';
import {CareerGame,CAREER_SAVE_KEY,readCareerSave,type CareerAction,type CareerFrame,type CareerRole,type CareerUpgradeId,type CareerPoint} from './city-career.ts';
import {createObjectiveMarker} from './city-objective-marker.ts';
import type {DrivingWorld} from './city-world.ts';
import type {Landmark,V2} from './city-types.ts';
import type {Ride,ActiveRide} from './city-life.ts';
import type {RoadGraph} from './navigation.ts';

type Site={id:string;name:string;x:number;z:number;heading:number;arrival:CareerPoint;yaw:number};
type Hooks={toast:(message:string)=>void;close:()=>void;open:()=>void;menuOpen:()=>boolean;navigate:(destination:Landmark,route:V2[])=>void;clearRoute:()=>void;legacy:{rides:()=>Ride[];active:()=>ActiveRide|null;start:(ride:Ride)=>void;cancel:()=>void}};
const esc=(s:string)=>s.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
const yuan=(n:number)=>'¥ '+Math.floor(n).toLocaleString('zh-CN');
const minutes=(seconds:number)=>`${Math.floor(seconds/60)}:${String(Math.ceil(seconds%60)).padStart(2,'0')}`;
const mechanism={delivery:"On-Time Delivery",comfort:"Smooth Pickup and Drop-off",service:"Multi-stop inspection"};
export async function createCareerExperience(world:DrivingWorld,graph:RoadGraph,hooks:Hooks){
 const sites:Site[]=(await(await fetch('/city/life-sites.json')).json()).sites;
 const hub=sites.find(s=>s.id==='hub')!,office=sites.find(s=>s.id==='office')!,workshop=sites.find(s=>s.id==='workshop')!;
 const spawn=world.data.spawn;
 const bayRoad=world.collision.nearest(spawn.x+Math.sin(spawn.yaw)*950,spawn.z+Math.cos(spawn.yaw)*950);
 const bay:CareerPoint=bayRoad?[bayRoad.x,bayRoad.z]:world.data.landmarks.find(m=>m.id==='bamboo')!.arrival;
 let raw:unknown=null,legacy:unknown=null;try{raw=JSON.parse(localStorage.getItem(CAREER_SAVE_KEY)??'null');legacy=JSON.parse(localStorage.getItem('shenchengji-city-life-v1')??'null');}catch{}
 const game=new CareerGame({hub:hub.arrival,bay,office:office.arrival,park:workshop.arrival,workshop:office.arrival},readCareerSave(raw,legacy));
 const panel=document.querySelector<HTMLElement>('#life-journal')!,host=document.querySelector<HTMLElement>('#ui')!;
 panel.classList.add('career-panel');
 const hud=document.createElement('section');hud.id='career-objective';hud.hidden=true;hud.innerHTML="<div class=career-status></div><button data-hud-auto>Go Automatically</button><button data-hud-journal>City journal <kbd>J</kbd></button><button data-dismiss>Collapse</button>";host.append(hud);const hudBody=hud.querySelector<HTMLElement>('.career-status')!;
 const walkHelp=document.createElement('div');walkHelp.id='walk-help';walkHelp.hidden=true;host.append(walkHelp);
 const invitation=document.createElement('button');invitation.id='career-invitation';invitation.innerHTML="<small>After the Rain Stops</small><strong>The city is so big, Make the most of today first. </strong><span>Go somewhere new · Meet someone · Save up for your own room <kbd>J</kbd></span>";invitation.onclick=hooks.open;host.append(invitation);
 const marker=createObjectiveMarker(world.scene,host,(x,z)=>world.groundHeight(x,z));
 let tab:'jobs'|'growth'|'people'|'stories'='jobs',objectiveKey='',hudTime=0,lastMode=world.lightMode;
 let receipt:{message:string;amount:number}|null=null,dismissed=false;
 hud.querySelector<HTMLButtonElement>('[data-hud-auto]')!.onclick=()=>navigate(true);
 hud.querySelector<HTMLButtonElement>('[data-hud-journal]')!.onclick=()=>{if(game.choice)tab='people';hooks.open();};
 hud.querySelector<HTMLButtonElement>('[data-dismiss]')!.onclick=()=>{receipt=null;dismissed=true;hud.hidden=true;};
 function frame(dt=0):CareerFrame{const a=world.actor;return {dt,position:[a.x,a.z],speed:a.speed,odometer:world.state.distance,debugEpoch:world.debugEpoch,yaw:a.yaw,paused:world.paused,inVehicle:!world.walk?.active};}
 function persist(){try{localStorage.setItem(CAREER_SAVE_KEY,JSON.stringify(game.save));}catch{hooks.toast("Progress is retained while the game is running, Browser did not allow save data to be written");}}
 function destination():Landmark|null{const a=game.active;if(!a)return null;const p=a.objective.position,n=world.collision.nearest(...p);return {id:'career:'+a.jobId+':'+a.objectiveIndex,name:a.objective.label,area:"City life",x:p[0],z:p[1],arrival:p,height:0,excludeRadius:0,yaw:n?.yaw??0};}
 function navigate(auto=false){const d=destination();if(!d)return;hooks.navigate(d,graph.route([world.state.x,world.state.z],d.arrival));if(auto)world.startAutoDrive(d);}
 function syncObjective(){const a=game.active,key=a?a.jobId+':'+a.objectiveIndex:'';if(key===objectiveKey)return;objectiveKey=key;marker.set(a?{position:a.objective.position,label:a.objective.label}:null);if(a)navigate();else hooks.clearRoute();}
 function action(result:CareerAction,close=false){
  if(!result.ok){hooks.toast(result.message);return false;}
  persist();dismissed=false;const paid=result.events.find(e=>e.type==='completed');if(paid){receipt={message:paid.message,amount:paid.amount??0};world.audio.cue('arrival');}
  syncObjective();render();if(close)hooks.close();hooks.toast(result.message);return true;
 }
 function render(){
  const v=game.view;document.querySelector('#wallet')!.textContent=yuan(v.cash);
  const active=v.active;
  panel.innerHTML=`<div class="career-heading"><div><small>SHENZHEN / AFTER THE RAIN</small><h2>Make today count. </h2><p>Work, View the sea, Leave some time for yourself too. </p></div><button data-close aria-label="Close life journal">Return to City <kbd>J</kbd></button></div>
   <div class="career-account"><div><small>Available balance</small><strong>${yuan(v.cash)}</strong></div><div><small>Cumulative Daily Settlement</small><strong>${yuan(v.totalEarned)}</strong></div><div><small>Complete the contract</small><strong>${String(v.completedCount).padStart(2,'0')} <i>Single</i></strong></div><div><small>Fund for a room of your own</small><strong>${v.roomFund?"Housing funds set aside":yuan(v.cash)+' / 1,800'}</strong><progress max="1800" value="${v.roomFund?1800:Math.min(1800,v.cash)}"></progress></div></div>
   <nav class="career-tabs">${[['jobs',"Find something to do"],['growth',"Save money and upgrade"],['people',"People and Messages"],['stories',"Stories Along the Route"]].map(([id,label])=>`<button data-tab="${id}" aria-selected="${tab===id}">${label}${id==='people'&&v.pendingChoice?' <i class="unread"></i>':''}</button>`).join('')}</nav>
   <div class="career-content">${tab==='jobs'?`
    <div class="career-roles">${v.roles.map(r=>`<button data-role="${r.id}" class="${r.selected?'selected':''}" ${active?'disabled':''}><small>Lv. ${r.level}</small><strong>${r.label}</strong><span>${r.subtitle}</span></button>`).join('')}</div>
    <div class="career-level"><span>Current Identity Lv. ${v.level} · ${v.xp} / ${v.nextLevelXp} XP</span><progress value="${v.xp%200}" max="200"></progress><small>For each completed 2 Single, Unlock advanced contracts</small></div>
    ${active?`<article class="career-active"><small>In Progress · No. ${active.objectiveIndex+1} / ${active.objectiveCount} station</small><h3>${esc(active.title)}</h3><p>${esc(active.objective.label)}</p>${active.invalid?"<p class=\"warning\">A debug jump was used on this trip, Restart the mission after finishing to receive normal results. </p>":''}<div><button data-continue>Continue this trip</button><button data-auto>Go Automatically</button><button data-cancel class="quiet">End Contract</button></div></article>`:''}
    <div class="career-jobs">${v.jobs.map(j=>`<article><div class="job-top"><span>${mechanism[j.mechanic]}</span><small>${j.completed?"Completed "+j.completed+" times":"You can accept orders repeatedly"}</small></div><h3>${esc(j.title)}</h3><p>${esc(j.description)}</p><div class="job-pay"><strong>${yuan(j.basePay)}</strong><span>Base pay + Quality and regular customer bonuses</span></div><button data-job="${j.id}" ${!j.unlocked||active||v.pendingChoice||hooks.legacy.active()?'disabled':''}>${!j.unlocked?'Lv. '+j.requiredLevel+" Unlock":v.pendingChoice?"First reply to the message you just received":active?"Finish the current contract before accepting another":hooks.legacy.active()?"First finish the previous on-the-way order in Stories Along the Way":"Take this job"}</button></article>`).join('')}</div>
    <p class="career-note">After accepting the job, go to the marker in the scene, Stop and press E Hand over. Inspection requires working in place; F You can exit the vehicle and continue walking. Debug jumps do not settle the current contract. </p>`:tab==='growth'?`
    <div class="career-section-title"><h3>Money earned, Make next time easier. </h3><p>Upgrading changes the actual mission rules; Do not raise prices, Do not reset progress. </p></div><div class="career-upgrades">${v.upgrades.map(u=>`<article><small>${u.owned?"Already Owned":"One Purchase · Remains in Effect"}</small><h3>${u.title}</h3><p>${u.description}</p><button data-buy="${u.id}" ${u.owned||!u.affordable||active?'disabled':''}>${u.owned?"Purchased":active?"Upgrade after completing this order":u.affordable?"Purchase · "+yuan(u.cost):"Still need "+yuan(u.cost-v.cash)}</button></article>`).join('')}</div><div class="career-supply"><div><h3>Hot Meals and Water · ¥ 18</h3><p>Resupply at the bay service station. Reduced comfort loss when ordering 15%, Completion bonus ¥ 18. </p></div><button data-supply ${v.supplied||active?'disabled':''}>${v.supplied?"Prepared, Takes effect on the next order":"Resupply at the waystation"}</button><button data-hub class="quiet">Take me to the waystation</button></div>`:tab==='people'?`
    <div class="career-people">${[["A Hui",'ahui',"Do not make a joke of life on daily wages"],["A Lin",'alin',"Get familiar gradually, You decide the boundaries and the relationship"],["Lao Chen",'laochen',"The city lights up, Someone must be there before clocking out"]].map(([name,id,sub])=>`<article><span class="person-seal">${name.slice(-1)}</span><div><h3>${name}</h3><p>${sub}</p><small>Familiarity ${v.relations[id as keyof typeof v.relations]} / 20 · Affects Acquaintance Bonus</small></div></article>`).join('')}</div>${v.pendingChoice?`<article class="career-conversation"><small>From ${v.pendingChoice.person} new message from</small><h3>${v.pendingChoice.title}</h3><blockquote>${v.pendingChoice.line}</blockquote>${v.pendingChoice.options.map(o=>`<button data-choice="${o.id}" ${!o.affordable?'disabled':''}><strong>${o.label}</strong><span>${o.consequence}</span></button>`).join('')}</article>`:"<div class=\"career-empty\"><h3>The story unfolds between trips. </h3><p>Complete the first order for each role, After the third order, Will receive different messages. You can build a meaningful relationship without spending money. </p></div>"}`:`
    ${hooks.legacy.active()?"<article class=\"career-active\"><h3>A story along the way is in progress</h3><p>Continue completing, Or finish here and freely switch career contracts. </p><button data-cancel-legacy>Finish this on-the-way order</button></article>":''}<div class="career-section-title"><h3>Three old stories along the way, Still in. </h3><p>The first meeting of these fictional characters is a standalone story, Earnings go into the shared current-life wallet. </p></div><div class="career-jobs">${hooks.legacy.rides().map(r=>`<article><small>${r.person}</small><h3>${r.title}</h3><p>${r.description}</p><button data-legacy="${r.id}" ${game.save.legacyCompleted.includes(r.id)||active?'disabled':''}>${game.save.legacyCompleted.includes(r.id)?"This journey, Already noted":hooks.legacy.active()?.id===r.id?"Continue this trip":"Accept an order along the way · "+yuan(r.reward)}</button></article>`).join('')}</div>`}</div>
   <footer class="career-footer"><span>Saves are stored in this browser · Active contracts must be accepted again after a refresh</span><span>L Lighting · F Enter or Exit Vehicle · M Map · J Journal</span></footer>`;
  const on=(selector:string,handler:(b:HTMLButtonElement)=>void)=>panel.querySelectorAll<HTMLButtonElement>(selector).forEach(b=>b.onclick=()=>handler(b));
  on('[data-close]',()=>hooks.close());on('[data-tab]',b=>{tab=b.dataset.tab as typeof tab;render();});
  on('[data-role]',b=>action(game.selectRole(b.dataset.role as CareerRole)));
  on('[data-job]',b=>{receipt=null;action(game.accept(b.dataset.job!,frame()),true);});
  on('[data-buy]',b=>action(game.purchase(b.dataset.buy as CareerUpgradeId)));
  on('[data-choice]',b=>action(game.choose(b.dataset.choice!)));
  on('[data-cancel]',()=>action(game.cancel()));on('[data-continue]',()=>{navigate();hooks.close();});on('[data-auto]',()=>{hooks.close();navigate(true);});
  on('[data-supply]',()=>action(game.replenish({...frame(),paused:false})));
  on('[data-hub]',()=>{const d:Landmark={id:'life-hub',name:hub.name,x:hub.x,z:hub.z,height:0,area:"City life",excludeRadius:0,arrival:hub.arrival,yaw:hub.yaw};hooks.navigate(d,graph.route([world.state.x,world.state.z],hub.arrival));hooks.close();hooks.toast("Park the vehicle, press F Get out and explore the community service hub");});
  on('[data-cancel-legacy]',()=>{hooks.legacy.cancel();render();hooks.toast("On-the-way trip has ended, Pay and completed stories remain unchanged");});
  on('[data-legacy]',b=>{const r=hooks.legacy.rides().find(r=>r.id===b.dataset.legacy);if(r)hooks.legacy.start(r);});
 }
 function tick(dt:number){
  const events=game.tick(frame(dt));if(events.length){hooks.toast(events.at(-1)!.message);persist();}syncObjective();
  marker.update(world.camera,world.actor.x,world.actor.z,world.observer.active||hooks.menuOpen());
  walkHelp.hidden=!world.walk?.active||hooks.menuOpen()||world.observer.active;
  if(!walkHelp.hidden){const d=Math.round(Math.hypot(world.actor.x-world.state.x,world.actor.z-world.state.z));walkHelp.textContent=`Walking Exploration · WASD Move · Drag / Use arrow keys to look around · Shift Fast Walking · F Enter vehicle ${d>5?" · Vehicle "+d+' m':''}`;}
  hudTime+=dt;if(hudTime<.15)return;hudTime=0;
  const a=game.active,v=game.view;
  invitation.hidden=!!a||v.completedCount>0||!!hooks.legacy.active()||hooks.menuOpen()||world.observer.active||world.state.distance>300;
  hud.hidden=hooks.menuOpen()||world.observer.active||dismissed||(!a&&!receipt&&!v.pendingChoice);
  hud.querySelector<HTMLButtonElement>('[data-hud-auto]')!.hidden=!a||!!world.walk?.active;hud.querySelector<HTMLButtonElement>('[data-dismiss]')!.hidden=!!a;
  if(a){hudBody.innerHTML=`<small>${mechanism[a.mechanic]} · No. ${a.objectiveIndex+1}/${a.objectiveCount} station</small><strong>${esc(a.title)}</strong><span>${esc(a.objective.label)}</span><div class="objective-metrics"><b>${a.mechanic==='delivery'?minutes(a.remainingSeconds):a.mechanic==='comfort'?"Comfort "+a.quality:"Work "+Math.round(a.holdProgress*100)+'%'}<i>${a.mechanic==='delivery'?"Time Remaining":a.mechanic==='comfort'?'/ 100':"Come to a Complete Stop"}</i></b><b>Quality ${a.quality}<i>${a.invalid?"Debug sheet · Do Not Settle":yuan(a.basePay)+" + Prize money"}</i></b></div>${a.mechanic==='service'&&a.objective.kind==='service'?`<progress max="1" value="${a.holdProgress}"></progress>`:''}`;
  }else if(receipt||v.pendingChoice){hudBody.innerHTML=`<small>${receipt?"Daily Pay Received":"Message Received"}</small><strong>${receipt?'+'+yuan(receipt.amount):v.pendingChoice!.title}</strong><span>${receipt?esc(receipt.message):"Someone wants to chat with you about this trip."}</span>`;}
  else hudBody.textContent='';
  if(lastMode!==world.lightMode){lastMode=world.lightMode;for(const h of hubs)h.setMode(lastMode);}
 }
 function interact(){if(!game.active)return false;action(game.interact(frame()));return true;}
 // Landmark meshes take part in the existing shadow/reflection lists. No second city scene.
 const hubs:Awaited<ReturnType<typeof import('./city-life-hub.ts')['createCityLifeHub']>>[]=[];
 async function loadHubs(){try{const {createCityLifeHub}=await import('./city-life-hub.ts');for(const s of sites){const h=await createCityLifeHub(world.scene,{x:s.x,z:s.z,heading:s.heading,height:world.groundHeight(s.x,s.z)});h.setMode(world.lightMode);hubs.push(h);world.propObstacles.push(s);world.landmarks.push(...h.meshes);world.cull();}}catch(e){console.error("Service station model failed to load",e);hooks.toast("Service station model not loaded yet, Contracts and saves remain available");}}
 const ready=loadHubs();persist();render();
 return {ready,game,render,tick,interact,prompt:()=>game.prompt(frame()),get sites(){return sites;},get hubs(){return hubs.map(h=>({name:h.root.name,position:h.root.position.asArray()}));},creditLegacy(id:string,amount:number){action(game.creditLegacy(id,amount));},dispose(){marker.dispose();hubs.forEach(h=>h.dispose());hud.remove();walkHelp.remove();invitation.remove();}};
}
