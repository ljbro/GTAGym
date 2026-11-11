import './city-loading.css';
import {appUrl} from './app-url';

/** Each entry begins after the preceding awaited task has finished. Equal
 * stages describe boot completion, never pretend to measure downloaded bytes. */
export const CITY_LOADING_STAGES=[
 {id:'map',label:"Unfolding the Shenzhen map",group:"City framework"},
 {id:'ridges',label:"Unfolding Shenzhen ridgelines",group:"City framework"},
 {id:'relief',label:"Laying out gentle park slopes",group:"City framework"},
 {id:'bridges',label:"Building bridges over water",group:"City framework"},
 {id:'coast',label:"Laying out the coastline and city roads",group:"Coast and Skyline"},
 {id:'buildings',label:"Loading Nanshan, Futian, Luohu Buildings",group:"Coast and Skyline"},
 {id:'landmarks',label:"Assembling Shenzhen landmarks",group:"Coast and Skyline"},
 {id:'signage',label:"Lighting up city signs",group:"Coast and Skyline"},
 {id:'vehicle',label:"Starting your car",group:"Life on the road"},
 {id:'landscape',label:"Planting banyan trees, Palms and flower borders",group:"Life on the road"},
 {id:'furniture',label:"Placing city benches",group:"Life on the road"},
 {id:'lighting',label:"Adjusting bay lighting and reflections",group:"Light and Reflections"},
 {id:'puddles',label:"The rain has stopped, Adding roadside puddles",group:"Light and Reflections"},
 {id:'navigation',label:"Connecting city navigation",group:"Ready to Depart"},
 {id:'life-sites',label:"Opening up life along the way",group:"Ready to Depart"},
 {id:'interface',label:"Preparing driving interface",group:"Ready to Depart"},
 {id:'experience',label:"Preparing your city life",group:"Ready to Depart"},
] as const;
export type CityLoadingStage=typeof CITY_LOADING_STAGES[number]['id'];
export type CityLoadingOptions={onRetry?:()=>void};
type LoadingState='loading'|'ready'|'error'|'leaving'|'disposed';

const CITY_LOADING_MEDIA=appUrl('/city/loading/bamboo-clay-loop.mp4?v=2');
const CITY_LOADING_POSTER=appUrl('/city/loading/bamboo-clay-poster.jpg?v=2');

/** Mount on body, outside #ui: initUI replaces #ui.innerHTML during boot.
 * All progress changes require update()/finish(); the background film never
 * drives the progress bar or delays boot. finish() holds by default until the caller explicitly reveal()s. */
export function createCityLoading(host:HTMLElement=document.body,options:CityLoadingOptions={}){
 const element=document.createElement('section');element.className='city-loader';element.id='city-loading';
 element.setAttribute('role','dialog');element.setAttribute('aria-modal','true');
 element.setAttribute('aria-label',"ShenChengJi is loading");element.setAttribute('aria-busy','true');element.tabIndex=-1;
 element.innerHTML=`<img class="city-loader-poster" src="${CITY_LOADING_POSTER}" alt="" fetchpriority="low" decoding="async"><video class="city-loader-film" muted loop playsinline preload="none" aria-hidden="true" tabindex="-1" disablepictureinpicture></video><div class="city-loader-vignette" aria-hidden="true"></div>
  <div class="city-loader-topline"><span>SHENZHEN / OPEN ROADS</span><span>A City · Countless ways to live</span></div>
  <div class="city-loader-title"><span class="city-loader-edition">City exploration</span><h1>ShenChengJi</h1><div class="city-loader-title-rule" aria-hidden="true"></div><p>Take the time after work, <br>Give back to this city. </p><span class="city-loader-districts">Nanshan<span></span>Futian<span></span>Luohu</span></div>
  <div class="city-loader-bottom"><div class="city-loader-progress-block"><div class="city-loader-progress-heading"><div><span class="city-loader-group">City framework</span><p class="city-loader-status" role="status" aria-live="polite">Starting city</p></div><div class="city-loader-percent"><b>0</b><span>%</span></div></div>
   <div class="city-loader-progress" role="progressbar" aria-label="City loading stage progress" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0"><i></i></div>
   <div class="city-loader-progress-meta"><span class="city-loader-count">Stage 01 / 17</span><span class="city-loader-progress-basis">Advance based on completed stages</span></div>
   <div class="city-loader-failure" hidden><p></p><button type="button">Reload <span aria-hidden="true">↗</span></button></div>
  </div></div>`;
 const query=<T extends HTMLElement>(selector:string)=>element.querySelector<T>(selector)!;
 const status=query('.city-loader-status'),group=query('.city-loader-group'),percent=query('.city-loader-percent b'),bar=query('.city-loader-progress'),fill=query('.city-loader-progress i'),count=query('.city-loader-count'),basis=query('.city-loader-progress-basis'),failure=query('.city-loader-failure'),failureText=query('.city-loader-failure p'),retry=query<HTMLButtonElement>('.city-loader-failure button');
 let state:LoadingState='loading',stageIndex=0,stageFraction=0,completion=0,removeTimer:number|undefined,revealPromise:Promise<void>|null=null,resolveReveal:(()=>void)|null=null;
 // A small prerecorded film avoids rendering a second city during boot.
 // Keep the poster beneath it so decoding/autoplay failures never leave a blank cover.
 const film=query<HTMLVideoElement>('.city-loader-film');
 film.muted=true;film.defaultMuted=true;film.playsInline=true;
 const reducedMotion=matchMedia('(prefers-reduced-motion: reduce)');
 const connection=(navigator as Navigator & {connection?:EventTarget & {saveData?:boolean}}).connection;
 let mediaFailed=false;
 function releaseFilm(){
  film.pause();delete element.dataset.film;
  if(film.hasAttribute('src')){film.removeAttribute('src');film.load();}
 }
 function syncFilm(){
  if(state==='disposed'||state==='error'||mediaFailed||reducedMotion.matches||connection?.saveData){releaseFilm();return;}
  if(document.hidden){film.pause();return;}
  if(!film.hasAttribute('src'))film.src=CITY_LOADING_MEDIA;
  void film.play().catch(()=>{if(film.paused)delete element.dataset.film;});
 }
 function filmPlaying(){
  if(state==='disposed'||state==='error'||reducedMotion.matches||connection?.saveData){releaseFilm();return;}
  if(document.hidden){film.pause();return;}
  element.dataset.film='playing';
 }
 function filmFailed(){mediaFailed=true;releaseFilm();}
 film.addEventListener('playing',filmPlaying);film.addEventListener('error',filmFailed);
 document.addEventListener('visibilitychange',syncFilm);reducedMotion.addEventListener('change',syncFilm);
 connection?.addEventListener('change',syncFilm);
 const retryAction=()=>options.onRetry?options.onRetry():location.reload();retry.addEventListener('click',retryAction);
 function blockGameInput(event:KeyboardEvent){
  if(state==='disposed')return;
  // Preserve browser shortcuts (reload, find, etc.) without sending their
  // letter keys to the game's global listener while the cover is mounted.
  if(event.metaKey||event.ctrlKey||event.altKey){event.stopImmediatePropagation();return;}
  if(event.code==='Tab'){event.preventDefault();event.stopImmediatePropagation();(state==='error'?retry:element).focus({preventScroll:true});return;}
  const retryActivation=event.target===retry&&(event.code==='Enter'||event.code==='Space');
  if(retryActivation){event.stopImmediatePropagation();return;}
  if(/^(Key[A-Z]|Arrow(?:Up|Down|Left|Right)|Space|Enter|Slash|Escape|ShiftLeft|ShiftRight)$/.test(event.code)){
   event.preventDefault();event.stopImmediatePropagation();
  }
 }
 window.addEventListener('keydown',blockGameInput,true);window.addEventListener('keyup',blockGameInput,true);
 host.append(element);element.focus({preventScroll:true});syncFilm();
 function paint(){
  const integer=Math.floor(completion*100);percent.textContent=String(integer);fill.style.transform=`scaleX(${completion})`;
  bar.setAttribute('aria-valuenow',String(integer));bar.setAttribute('aria-valuetext',state==='ready'?"All stages completed":`${integer}%, Stage ${stageIndex+1} / ${CITY_LOADING_STAGES.length}, ${status.textContent}`);
  count.textContent=`Stage ${String(stageIndex+1).padStart(2,'0')} / ${CITY_LOADING_STAGES.length}`;
 }
 function update(stage:CityLoadingStage|string,progress?:number){
  if(state!=='loading')return;
  const index=CITY_LOADING_STAGES.findIndex(entry=>entry.id===stage||entry.label===stage);
  // An unrecognised message is useful status text, not evidence of completion.
  if(index<0){status.textContent=stage;return;}
  if(index<stageIndex)return;
  const fraction=typeof progress==='number'&&Number.isFinite(progress)?Math.max(0,Math.min(1,progress)):0;
  stageFraction=index===stageIndex?Math.max(stageFraction,fraction):fraction;stageIndex=index;
  completion=Math.max(completion,(stageIndex+stageFraction)/CITY_LOADING_STAGES.length);
  status.textContent=CITY_LOADING_STAGES[index].label;group.textContent=CITY_LOADING_STAGES[index].group;
  basis.textContent=stageFraction>0&&stageFraction<1?"Current stage includes asset progress":"Advance based on completed stages";paint();
 }
 function finish({hold=true}:{hold?:boolean}={}){
  if(state==='disposed'||state==='error'||state==='leaving')return Promise.resolve();
  state='ready';stageIndex=CITY_LOADING_STAGES.length-1;stageFraction=1;completion=1;
  element.dataset.state='ready';element.setAttribute('aria-busy','false');status.textContent="City ready";group.textContent="Ready to Depart";basis.textContent="Next Leg, Your Choice";paint();
  return hold?Promise.resolve():reveal();
 }
 function reveal():Promise<void>{
  if(state==='disposed')return Promise.resolve();if(revealPromise)return revealPromise;
  if(state!=='ready')return Promise.reject(new Error('Call loading.finish() after boot succeeds before reveal().'));
  state='leaving';element.classList.add('is-leaving');element.setAttribute('aria-hidden','true');
  revealPromise=new Promise<void>(resolve=>{resolveReveal=resolve;});
  // This timer only removes the completed fade. It never advances progress.
  removeTimer=window.setTimeout(dispose,matchMedia('(prefers-reduced-motion: reduce)').matches?0:760);
  return revealPromise;
 }
 function error(reason:unknown){
  if(state==='disposed'||state==='leaving')return;
  state='error';releaseFilm();element.dataset.state='error';element.setAttribute('aria-busy','false');
  group.textContent="Loading interrupted";status.textContent="City is not currently loaded";basis.textContent="Current progress saved";
  failureText.textContent=reason instanceof Error?reason.message:typeof reason==='string'?reason:"Reload and try again.";failure.hidden=false;
  failure.setAttribute('role','alert');retry.focus({preventScroll:true});
 }
 function dispose(){
  if(state==='disposed')return;state='disposed';if(removeTimer!==undefined)window.clearTimeout(removeTimer);
  window.removeEventListener('keydown',blockGameInput,true);window.removeEventListener('keyup',blockGameInput,true);
  document.removeEventListener('visibilitychange',syncFilm);reducedMotion.removeEventListener('change',syncFilm);
  connection?.removeEventListener('change',syncFilm);film.removeEventListener('playing',filmPlaying);film.removeEventListener('error',filmFailed);releaseFilm();
  retry.removeEventListener('click',retryAction);element.remove();resolveReveal?.();resolveReveal=null;
 }
 return {element,update,finish,reveal,error,dispose,stats:()=>({state,stage:CITY_LOADING_STAGES[stageIndex].id,stageIndex,stages:CITY_LOADING_STAGES.length,stageFraction,progress:completion,basis:'completed stages plus explicitly reported current-stage fraction'})};
}
