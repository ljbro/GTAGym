import {characterJobs,CHARACTERS_ENABLED,CHARACTER_CREDIT} from './city-local-characters.ts';
import {PLAYER_CREDIT} from './city-player-character.ts';
import type {DrivingWorld} from './city-world.ts';
import './city-character-hud.css';
export function createCharacterHud(host:HTMLElement,world:DrivingWorld){
 const panel=document.createElement('section');panel.id='character-loading';panel.setAttribute('aria-label',"Character Loading");
 panel.innerHTML="<span role=\"status\" aria-live=\"polite\"></span><progress max=\"1\"></progress><button type=\"button\">Retry Character</button><small></small>";
 panel.querySelector('small')!.textContent=PLAYER_CREDIT;
 const text=panel.querySelector('span')!,bar=panel.querySelector('progress')!,retry=panel.querySelector('button')!;
 retry.onclick=()=>{world.canvas.focus();void world.ensureRider();void world.bambooCafe?.retryCharacters();};
 const credit=document.createElement('small');credit.id='character-credit';credit.textContent=CHARACTER_CREDIT;credit.hidden=true;host.append(panel,credit);
 return {update(menuOpen:boolean){
  const insideCafe=document.body.classList.contains('inside-bamboo-cafe');
  credit.textContent=insideCafe?PLAYER_CREDIT+" · Cafe:"+CHARACTER_CREDIT:PLAYER_CREDIT;
  credit.hidden=menuOpen||(!world.walk?.active&&!insideCafe);
  const jobs=Object.values(characterJobs),errors=jobs.filter(j=>j.phase==='error'),pending=jobs.filter(j=>j.phase==='loading');
  panel.hidden=!CHARACTERS_ENABLED||menuOpen||(!errors.length&&!pending.length);
  if(panel.hidden)return;
  text.textContent=errors.length?errors.map(j=>j.message).join('; '):pending.map(j=>j.message).join(' · ');
  retry.hidden=!errors.length;bar.hidden=!pending.length;bar.value=pending.length?pending.reduce((s,j)=>s+j.progress,0)/pending.length:1;
 },dispose(){retry.onclick=null;panel.remove();credit.remove();}};
}
