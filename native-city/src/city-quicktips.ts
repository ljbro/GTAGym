import './city-quicktips.css';

export type CityQuickTipsMode='driving'|'walking'|'observer'|'tank';
export type CityQuickTipsState={mode:CityQuickTipsMode;menuOpen?:boolean;hidden?:boolean;carView?:boolean;flightLoading?:boolean};
type KeyTip={key:string;label:string;secondary?:boolean;action?:'flight'};
const QUICK:Record<CityQuickTipsMode,readonly KeyTip[]>={
 tank:[{key:'WASD',label:"driving"},{key:'Q E',label:"Turret"},{key:"Space",label:"Fire"},{key:'T',label:"Sedan"},{key:'F',label:"Exit vehicle"},{key:'V',label:"Camera",secondary:true}],
 driving:[{key:'WASD',label:"driving"},{key:'T',label:"Tank"},{key:"Space",label:"Handbrake"},{key:'V',label:"Camera",secondary:true},{key:'F',label:"Exit vehicle"},{key:'G',label:"Scenic view",secondary:true},{key:'Y',label:"Rainy weather",secondary:true}],
 walking:[{key:'WASD',label:"walking"},{key:"Space",label:"Jump / Cross / climbing"},{key:"Scroll wheel",label:"Near and far",secondary:true},{key:'V',label:"Perspective",secondary:true},{key:'Shift',label:"Running / Faster Ladder Climbing"},{key:"Mouse movement",label:"Look toward",secondary:true},{key:'F',label:"Enter vehicle"},{key:'E',label:"Interaction",secondary:true}],
 observer:[{key:'WASD',label:"Pan"},{key:'Q E',label:"Raise and lower"},{key:"Drag",label:"Surround",secondary:true},{key:'B',label:"Airplane",action:'flight'},{key:'G / F',label:"Back"},{key:"Scroll wheel",label:"Near and far",secondary:true}],
};
const HELP:Record<CityQuickTipsMode,readonly KeyTip[]>={
 tank:[{key:'W / S',label:"Move forward / Move backward"},{key:'A / D',label:"Steering / Turn in Place"},{key:'Q / E',label:"Rotating Turret"},{key:'PageUp / PageDown',label:"Raise / Lower the Gun Barrel"},{key:"Space / Enter",label:"Fire; Hold Space to fire continuously, Reload 1.8 seconds"},{key:'X',label:"Brake"},{key:'T',label:"Switch back to the sedan"},{key:'F',label:"Exit the vehicle after it stops"},{key:'G',label:"Drone sightseeing"}],
 driving:[{key:'W / S',label:"Throttle / Braking and reversing"},{key:'A / D',label:"Steering; Arrow keys also support driving"},{key:"Space",label:"Handbrake"},{key:'V',label:"Close view / Midground / Distant view / Cockpit Camera"},{key:'C',label:"Hold to look back, Release to resume"},{key:"Mouse movement",label:"Look directly around outside the vehicle; The driving camera smoothly recenters after stopping"},{key:'F',label:"Exit the vehicle after it stops"},{key:'H',label:"Sound horn"},{key:'R',label:"Return to a Nearby Road"},{key:'O',label:"View the vehicle up close"},{key:'T',label:"Switch Tank / Sedan"},{key:'G',label:"Enter drone sightseeing"}],
 walking:[{key:'WASD',label:"Walk forward, backward, left and right"},{key:"Space",label:"Jump; Vault when facing a configured railing or low wall/climbing"},{key:'W / S',label:"Walk toward the ladder to grab on automatically, Climb up / Climb down; Release to stay. Walk toward the rooftop ladder to automatically turn around and climb down"},{key:'V',label:"First person / Third person"},{key:'Shift',label:"Run in walking mode; W + Shift Faster climbing, S + Shift Slide down quickly"},{key:"Mouse / Arrow Keys",label:"Turn to look toward"},{key:"Scroll wheel",label:"Zoom in / Zoom Out the Follow Camera"},{key:'F',label:"Walk to the vehicle door and get in"},{key:'E',label:"Talk at the interaction point / Take a job"},{key:'G',label:"Enter drone sightseeing"}],
 observer:[{key:'WASD',label:"Pan the viewpoint"},{key:'Q / E',label:"Lower / Raise"},{key:"Arrow Keys",label:"Turn Your Head in Place"},{key:'Shift',label:"Hold to move faster"},{key:"Drag",label:"Circle the Target"},{key:"Shift + Drag",label:"Pan View"},{key:"Scroll wheel",label:"Zoom in / Zoom out"},{key:"Long Press Location",label:"Mark / Favorite / Move"},{key:'B',label:"Switch Aircraft",action:'flight'},{key:'G / F',label:"Exit Scenic View, Return to the original position"}],
};
const COMMON:readonly KeyTip[]=[{key:'M / Tab',label:"City map"},{key:'J',label:"City life"},{key:'L',label:"Sunset / Night scenery / Sunny day"},{key:'Y',label:"Rainy weather / After rain"},{key:'K',label:"Hide / Show Cursor"},{key:'Esc',label:"Back / Pause"},{key:'?',label:"Expand / Hide instructions"}];
const LABELS:Record<CityQuickTipsMode,string>={driving:"driving",walking:"walking",observer:"Scenic view",tank:"Tank"};
let serial=0;

/** Mount inside #ui so existing visibility/opacity/display recording switches
 * hide this entire component too. Call update from the existing HUD tick.
 * This module never changes game keys or pause state and has no render loop. */
export function createCityQuickTips(host:HTMLElement,options:{onOpenChange?:(open:boolean)=>void;onFlight?:()=>void}={}){
 const element=document.createElement('section');element.className='city-quicktips';element.setAttribute('aria-label',"Current mode shortcuts");
 element.innerHTML=`<div class="city-quicktips-line"><span class="city-quicktips-mode"></span><ul></ul><button class="city-quicktips-toggle" type="button" aria-expanded="false"><kbd>?</kbd><span>Controls</span></button></div><div class="city-quicktips-help" hidden><div class="city-quicktips-help-heading"><div><small>OPEN ROADS / CONTROLS</small><h2></h2></div><button type="button" class="city-quicktips-close" aria-label="Hide instructions">Collapse <span aria-hidden="true">×</span></button></div><div class="city-quicktips-help-grid"></div><div class="city-quicktips-common"></div><p class="city-quicktips-footnote">press ? or Esc Collapse</p></div>`;
 const query=<T extends HTMLElement>(selector:string)=>element.querySelector<T>(selector)!;
 const modeLabel=query('.city-quicktips-mode'),list=query('ul'),toggle=query<HTMLButtonElement>('.city-quicktips-toggle'),panel=query('.city-quicktips-help'),title=query('h2'),help=query('.city-quicktips-help-grid'),common=query('.city-quicktips-common'),close=query<HTMLButtonElement>('.city-quicktips-close');
 panel.id=`city-quicktips-help-${++serial}`;toggle.setAttribute('aria-controls',panel.id);
 let state:CityQuickTipsState={mode:'driving'},open=false,disposed=false,lastMode='',lastHidden=false;
 const tips=(entries:readonly KeyTip[],tag='div')=>entries.filter(entry=>!state.carView||entry.action!=='flight').map(entry=>`<${tag}${entry.secondary?' data-secondary="true"':''}>${entry.action&&tag==='li'?'<button type="button" class="city-quicktips-action" data-flight-mode="plane">':''}<kbd>${entry.key}</kbd><span>${entry.label}</span>${entry.action&&tag==='li'?'</button>':''}</${tag}>`).join('');
 common.innerHTML=tips(COMMON);host.append(element);host.classList.add('has-city-quicktips');
 function setOpen(value:boolean,returnFocus=false){
  if(disposed||value&&(state.menuOpen||state.hidden))return;
  if(open===value)return;open=value;panel.hidden=!value;toggle.setAttribute('aria-expanded',String(value));element.classList.toggle('is-expanded',value);options.onOpenChange?.(value);
  if(!value&&returnFocus)toggle.focus({preventScroll:true});
 }
 function update(next:CityQuickTipsState){
  if(disposed)return;state={...next};const hidden=!!(state.menuOpen||state.hidden);
  if(lastHidden!==hidden){element.hidden=hidden;lastHidden=hidden;}if(hidden)setOpen(false);
  const flightButton=list.querySelector<HTMLButtonElement>('[data-flight-mode="plane"]');if(flightButton)flightButton.disabled=!!next.flightLoading;
  const modeKey=next.mode+':'+!!next.carView;if(modeKey===lastMode)return;lastMode=modeKey;
  modeLabel.textContent=next.carView?"View the car":LABELS[next.mode];title.textContent=next.carView?"Stop, Check Out Your Car.":{driving:"Along this city, Drive slowly.",walking:"Approach the street corner, Take Another Look.",observer:"Change angle, Explore Shenzhen.",tank:"Armored Cruise, Free Test Drive."}[next.mode];
  list.innerHTML=tips(QUICK[next.mode],'li');help.innerHTML=tips(HELP[next.mode]);element.dataset.mode=next.mode;
  const button=list.querySelector<HTMLButtonElement>('[data-flight-mode="plane"]');if(button){button.disabled=!!next.flightLoading;button.onclick=()=>{if(state.menuOpen||state.hidden||state.flightLoading||state.carView)return;setOpen(false);button.blur();options.onFlight?.();};}
 }
 const toggleHelp=()=>setOpen(!open),closeHelp=()=>setOpen(false,true);
 function onKeyDown(event:KeyboardEvent){
  if(disposed||state.hidden||state.menuOpen||event.repeat||event.isComposing||event.ctrlKey||event.metaKey||event.altKey)return;
  if(event.target instanceof HTMLElement&&event.target.closest('input,textarea,select,[contenteditable=true]'))return;
  const shortcut=event.key==='?'||(event.code==='Slash'&&event.shiftKey);
  if(!shortcut&&!(open&&event.code==='Escape'))return;
  // Inherit external recording visibility, including #ui {visibility:hidden}.
  const styles=getComputedStyle(element),hostStyles=getComputedStyle(host);
  if(styles.visibility==='hidden'||styles.display==='none'||hostStyles.display==='none'||hostStyles.opacity==='0')return;
  event.preventDefault();event.stopImmediatePropagation();setOpen(shortcut?!open:false);
 }
 toggle.addEventListener('click',toggleHelp);close.addEventListener('click',closeHelp);window.addEventListener('keydown',onKeyDown,true);
 update(state);
 function dispose(){if(disposed)return;setOpen(false);disposed=true;window.removeEventListener('keydown',onKeyDown,true);toggle.removeEventListener('click',toggleHelp);close.removeEventListener('click',closeHelp);element.remove();if(!host.querySelector('.city-quicktips'))host.classList.remove('has-city-quicktips');}
 return {element,update,setExpanded:(value:boolean)=>setOpen(value),dispose,stats:()=>({mode:state.mode,open,hidden:!!(state.hidden||state.menuOpen),disposed})};
}
