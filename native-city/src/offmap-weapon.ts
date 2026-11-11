import {Color3,MeshBuilder,Ray,StandardMaterial,Vector3,type Camera,type Mesh,type Scene} from '@babylonjs/core';
import {OffmapWeaponCore,OFFMAP_CARBINE,nearestWeaponHit,rayBox,type WeaponHit} from './offmap-weapon-core.ts';
import {buildOffmapWeapon} from './offmap-weapon-model.ts';
import type {InteriorBox,Triple} from './offmap-interior-layout.ts';
import './offmap-weapon.css';
type Hooks={available:()=>boolean;paused:()=>boolean;look:(dx:number,dy:number)=>void;equip?:()=>void;firstPerson?:()=>boolean;
 solids:()=>InteriorBox[]|null;targetPoints:()=>Triple[];message:(text:string)=>void;defaultEquipped?:boolean};
type Target={id:string;position:Triple;health:number;meshes:Mesh[];material:StandardMaterial;boxes:InteriorBox[]};
export function createOffmapWeapon(scene:Scene,camera:Camera,canvas:HTMLCanvasElement,host:HTMLElement,hooks:Hooks){
 const core=new OffmapWeaponCore(),model=buildOffmapWeapon(scene,camera),abort=new AbortController(),signal=abort.signal;
 let equipped=hooks.defaultEquipped??false,active=false,kick=0,flashTime=0,hitTime=0,baseFov=camera.fov,wasAiming=false,training=false,dead=false,lastHit:WeaponHit|null=null;
 let audio:AudioContext|null=null,noise:AudioBuffer|null=null;const targets:Target[]=[],effects:{mesh:Mesh;ttl:number}[]=[],marks:Mesh[]=[];
 const hud=document.createElement('section');hud.id='offmap-weapon-hud';hud.setAttribute('aria-label',"Carbines and Shooting Practice");
 hud.innerHTML="<div class=\"gun-title\">OFFMAP / CARBINE <button data-gun-equip>Draw a Firearm · 1</button></div><strong data-gun-ammo></strong><p data-gun-status></p><div class=\"gun-actions\"><button data-gun-reload>Reload · R</button><button data-gun-targets>Enable practice targets</button><label><input type=\"checkbox\" data-gun-unlimited> Unlimited Ammo</label></div><small>Left Click to Shoot · Right Click to Aim/Drag to steer · 1 Draw or holster weapon</small><p data-gun-score></p>";
 const cross=document.createElement('div');cross.id='offmap-gun-crosshair';cross.innerHTML='<i></i><i></i><i></i><i></i><span>×</span>';host.append(hud,cross);
 const sparkMat=new StandardMaterial('offmap-gun-impact',scene);sparkMat.disableLighting=true;sparkMat.emissiveColor=new Color3(1,.74,.32);
 const markMat=new StandardMaterial('offmap-gun-mark',scene);markMat.disableLighting=true;markMat.emissiveColor=new Color3(.06,.06,.055);
 function sound(kind:'shot'|'reload'|'hit'){
  try{
   audio??=new AudioContext();if(audio.state==='suspended')void audio.resume();
   if(!noise){noise=audio.createBuffer(1,audio.sampleRate*.15,audio.sampleRate);let seed=723;const data=noise.getChannelData(0);for(let i=0;i<data.length;i++){seed=(Math.imul(seed,1664525)+1013904223)>>>0;data[i]=seed/2147483648-1;}}
   const gain=audio.createGain(),at=audio.currentTime;gain.gain.setValueAtTime(kind==='shot'?.09:.035,at);gain.gain.exponentialRampToValueAtTime(.0001,at+.13);gain.connect(audio.destination);
   if(kind==='shot'){const src=audio.createBufferSource(),filter=audio.createBiquadFilter();src.buffer=noise;filter.type='lowpass';filter.frequency.setValueAtTime(3200,at);filter.frequency.exponentialRampToValueAtTime(350,at+.12);src.connect(filter).connect(gain);src.start();src.onended=()=>{src.disconnect();filter.disconnect();gain.disconnect();};}
   else{const osc=audio.createOscillator();osc.frequency.value=kind==='hit'?700:150;osc.type='triangle';osc.connect(gain);osc.start();osc.stop(at+.14);osc.onended=()=>{osc.disconnect();gain.disconnect();};}
  }catch{/* The game remains playable if audio is unavailable. */}
 }
 function clearTargets(){targets.splice(0).forEach(t=>{for(const l of scene.lights)l.includedOnlyMeshes=l.includedOnlyMeshes.filter(m=>!t.meshes.includes(m as Mesh));t.meshes.forEach(m=>m.dispose());t.material.dispose();});training=false;}
 function syncIndoorLights(){
  const meshes=[...model.root.getChildMeshes(),...targets.flatMap(t=>t.meshes)];
  // Indoor pool lights use PBR intensities; the lightweight StandardMaterial
  // viewmodel/targets use the room's hemispheric fill to avoid overexposure.
  for(const l of scene.lights)if(l.name==='interior-ambient'){
   const additions=meshes.filter(m=>!l.includedOnlyMeshes.includes(m));
   // Interior lamps initially share the same allow-list; never mutate it in place.
   if(additions.length)l.includedOnlyMeshes=[...l.includedOnlyMeshes,...additions];
  }
 }
 function toggleTargets(){
  if(training){clearTargets();render();return;}
  const points=hooks.targetPoints().slice(0,3);if(!points.length){hooks.message("Enter a walking scene first");return;}
  points.forEach((p,i)=>{
   const id='practice-'+i,mat=new StandardMaterial('offmap-target-material-'+i,scene);mat.diffuseColor=new Color3(.65,.31,.12);mat.emissiveColor=new Color3(.18,.07,.02);
   const boxes:InteriorBox[]=[{id:id+'-body',position:[p[0],p[1]+1.02,p[2]],size:[.55,.88,.09]},{id:id+'-head',position:[p[0],p[1]+1.66,p[2]],size:[.29,.3,.1]}];
   const meshes=boxes.map(b=>{const m=MeshBuilder.CreateBox('offmap-target-'+b.id,{width:b.size[0],height:b.size[1],depth:b.size[2]},scene);m.position.copyFromFloats(...b.position);m.material=mat;m.isPickable=false;return m;});
   const stand=MeshBuilder.CreateCylinder('offmap-target-stand',{diameter:.035,height:.7},scene);stand.position.set(p[0],p[1]+.35,p[2]);stand.material=mat;stand.isPickable=false;meshes.push(stand);
   targets.push({id,position:p,health:100,meshes,material:mat,boxes});
  });training=true;syncIndoorLights();render();hooks.message("Practice target activated · Does not affect navigation completion conditions");
 }
 function blocker(origin:Triple,direction:Triple,range:number):WeaponHit|null{
  const boxes=hooks.solids();if(boxes)return nearestWeaponHit(origin,direction,boxes,range);
  const ray=new Ray(Vector3.FromArray(origin),Vector3.FromArray(direction),range);
  const hit=scene.pickWithRay(ray,m=>m.isEnabled()&&m.isVisible&&m.visibility>0&&m.getTotalVertices()>0&&!m.name.startsWith('offmap-gun')&&!m.name.startsWith('offmap-target')&&!/atmosphere|sky|objective|marker|player-offmap/.test(m.name));
  if(!hit?.hit||!hit.pickedPoint)return null;
  return {id:hit.pickedMesh?.name??'world',distance:hit.distance,point:hit.pickedPoint.asArray() as Triple,normal:(hit.getNormal(true)??ray.direction.negate()).asArray() as Triple};
 }
 function trace(origin:Triple,direction:Triple){
  let result=blocker(origin,direction,OFFMAP_CARBINE.range);
  for(const t of targets)if(t.health>0)for(const [i,b] of t.boxes.entries()){
   const hit=rayBox(origin,direction,b,result?.distance??OFFMAP_CARBINE.range);if(hit&&(!result||hit.distance<result.distance))result={...hit,id:t.id,zone:i===1?'head':'body'};
  }return result;
 }
 function fire(){
  if(!core.fire())return;
  const ray=camera.getForwardRay(OFFMAP_CARBINE.range),origin=ray.origin.asArray() as Triple,direction=ray.direction.asArray() as Triple;
  let hit=trace(origin,direction);let end=hit?Vector3.FromArray(hit.point):ray.origin.add(ray.direction.scale(OFFMAP_CARBINE.range));
  // A muzzle on the other side of a nearby wall must not bypass that wall.
  model.root.computeWorldMatrix(true);model.flash.computeWorldMatrix(true);const muzzle=model.muzzle();
  const offset=muzzle.subtract(ray.origin),near=offset.length();
  if(near>.001){const blocked=blocker(origin,offset.normalize().asArray() as Triple,near);if(blocked){hit=blocked;end=Vector3.FromArray(blocked.point);}}
  const beam=MeshBuilder.CreateLines('offmap-gun-tracer',{points:[muzzle,end]},scene);beam.color=new Color3(1,.72,.35);beam.isPickable=false;effects.push({mesh:beam,ttl:.055});
  lastHit=hit;kick=.045;flashTime=.045;model.flash.setEnabled(true);sound('shot');
  if(hit){
   const spark=MeshBuilder.CreateSphere('offmap-gun-spark',{diameter:.055,segments:4},scene);spark.position.copyFrom(end);spark.material=sparkMat;spark.isPickable=false;effects.push({mesh:spark,ttl:.085});
   if(hit.zone){const t=targets.find(t=>t.id===hit!.id)!;t.health=Math.max(0,t.health-core.hit(hit.zone));hitTime=.15;sound('hit');t.material.emissiveColor.set(.7,.12,.02);if(t.health===0){t.meshes.forEach(m=>m.setEnabled(false));hooks.message("Practice target knocked down");}}
   else{const mark=MeshBuilder.CreateDisc('offmap-gun-bullet-mark',{radius:.026,tessellation:10,sideOrientation:2},scene);const n=Vector3.FromArray(hit.normal);mark.position.copyFrom(end.add(n.scale(.008)));mark.lookAt(mark.position.subtract(n));mark.material=markMat;mark.isPickable=false;marks.push(mark);if(marks.length>64)marks.shift()!.dispose();}
  }
  hooks.look(0,core.aiming?-1.1:-2.2);render();
 }
 function render(){
  hud.hidden=!hooks.available();cross.hidden=!active;cross.classList.toggle('aiming',core.aiming);cross.classList.toggle('hit',hitTime>0);
  hud.querySelector('[data-gun-equip]')!.textContent=equipped?"Holster weapon · 1":"Draw a Firearm · 1";
  hud.querySelector('[data-gun-ammo]')!.textContent=core.unlimited?"∞ / Unlimited Ammo":`${String(core.ammo).padStart(2,'0')} / ${core.reserve}`;
  hud.querySelector('[data-gun-status]')!.textContent=!equipped?"Firearm holstered":hooks.firstPerson?.()===false?"Third-person view · C Return to first-person shooting":core.paused?"Paused":core.reloadRemaining>0?`Reloading ${core.reloadRemaining.toFixed(1)} seconds`:!core.unlimited&&core.ammo===0?"Magazine Empty · R Reload":"Carbine · "+(core.aiming?"Aim":"Hip fire");
  hud.querySelector('[data-gun-targets]')!.textContent=training?"Disable practice targets":"Enable practice targets";
  hud.querySelector('[data-gun-score]')!.textContent=`Shooting ${core.shots} · Hit ${core.hits} · Head ${core.headshots}${training?" · target "+targets.filter(t=>t.health===0).length+'/'+targets.length:''}`;
  hud.querySelector<HTMLInputElement>('[data-gun-unlimited]')!.checked=core.unlimited;
 }
 function setEquipped(value:boolean){equipped=value;core.disarm();if(equipped)hooks.equip?.();canvas.focus();tick(0);}
 function reload(){if(core.reload())sound('reload');canvas.focus();render();}
 hud.querySelector<HTMLButtonElement>('[data-gun-equip]')!.onclick=()=>setEquipped(!equipped);
 hud.querySelector<HTMLButtonElement>('[data-gun-reload]')!.onclick=reload;
 hud.querySelector<HTMLButtonElement>('[data-gun-targets]')!.onclick=()=>{toggleTargets();canvas.focus();};
 hud.querySelector<HTMLInputElement>('[data-gun-unlimited]')!.onchange=e=>{core.setUnlimited((e.target as HTMLInputElement).checked);canvas.focus();render();};
 const release=()=>{core.disarm();};
 window.addEventListener('keydown',e=>{
  if(!hooks.available()||e.target instanceof HTMLElement&&e.target.closest('input,textarea,select,[contenteditable=true]'))return;
  if(e.code==='Digit1'){e.preventDefault();e.stopImmediatePropagation();if(!e.repeat)setEquipped(!equipped);}
  else if(e.code==='KeyR'&&equipped){e.preventDefault();e.stopImmediatePropagation();if(!e.repeat)reload();}
 },{capture:true,signal});
 canvas.addEventListener('pointerdown',e=>{
  if(!active||hooks.paused()||![0,2].includes(e.button))return;canvas.focus();
  if(e.button===0){e.preventDefault();e.stopImmediatePropagation();core.setPaused(false);core.trigger(false);core.trigger(true);fire();}
  else{core.aiming=true;render();}
 },{capture:true,signal});
 window.addEventListener('pointerup',e=>{if(e.button===0)core.trigger(false);if(e.button===2)core.aiming=false;},{signal});
 canvas.addEventListener('pointermove',e=>{if(active&&!hooks.paused()&&document.pointerLockElement===canvas){hooks.look(e.movementX*(core.aiming?.5:1),e.movementY*(core.aiming?.5:1));e.stopImmediatePropagation();}},{capture:true,signal});
 canvas.addEventListener('contextmenu',e=>{if(active)e.preventDefault();},{signal});
 window.addEventListener('blur',release,{signal});canvas.addEventListener('pointercancel',release,{signal});
 document.addEventListener('visibilitychange',release,{signal});document.addEventListener('pointerlockchange',()=>{if(document.pointerLockElement!==canvas)release();},{signal});
 function tick(dt:number){
  if(dead)return;syncIndoorLights();const next=equipped&&hooks.available()&&(hooks.firstPerson?.()??true);if(next!==active){active=next;core.disarm();}
  core.setPaused(!active||hooks.paused());core.tick(dt);model.root.setEnabled(active);
  if(active&&!core.paused&&core.held)fire();
  if(!core.paused){kick*=Math.exp(-dt*15);flashTime=Math.max(0,flashTime-dt);hitTime=Math.max(0,hitTime-dt);for(const e of effects)e.ttl-=dt;}
  model.flash.setEnabled(active&&flashTime>0&&!core.paused);
  const aiming=active&&core.aiming&&!core.paused;if(aiming&&!wasAiming)baseFov=camera.fov;if(aiming)camera.fov=.62;else if(wasAiming)camera.fov=baseFov;wasAiming=aiming;
  const reloadPose=core.reloadRemaining>0?Math.sin(core.reloadRemaining/OFFMAP_CARBINE.reloadSeconds*Math.PI):0;
  model.root.position.set(aiming?0:.24,aiming?-.133:-.25-reloadPose*.13,.65-kick);model.root.rotation.set(reloadPose*.35-kick*.8,0,reloadPose*-.45);
  model.magazine.position.y=-.13-reloadPose*.14;
  for(let i=effects.length-1;i>=0;i--)if(effects[i].ttl<=0){effects[i].mesh.dispose();effects.splice(i,1);}
  if(hitTime<=0)for(const t of targets)t.material.emissiveColor.set(.18,.07,.02);
  render();
 }
 function reset(){core.reset();clearTargets();effects.splice(0).forEach(e=>e.mesh.dispose());marks.splice(0).forEach(m=>m.dispose());lastHit=null;flashTime=0;hitTime=0;kick=0;tick(0);}
 tick(0);
 return {core,tick,reset,setEquipped,get equipped(){return equipped;},get snapshot(){return {equipped,active,ammo:core.ammo,reserve:core.reserve,unlimited:core.unlimited,reloading:core.reloadRemaining>0,shots:core.shots,hits:core.hits,headshots:core.headshots,accuracy:core.accuracy,lastHit,targets:targets.map(t=>({id:t.id,position:t.position,health:t.health})),effects:effects.length,marks:marks.length};},
  dispose(){dead=true;abort.abort();clearTargets();effects.forEach(e=>e.mesh.dispose());marks.forEach(m=>m.dispose());const meshes=model.root.getChildMeshes();for(const l of scene.lights)l.includedOnlyMeshes=l.includedOnlyMeshes.filter(m=>!meshes.includes(m));model.dispose();sparkMat.dispose();markMat.dispose();hud.remove();cross.remove();if(wasAiming)camera.fov=baseFov;void audio?.close();}
 };
}
