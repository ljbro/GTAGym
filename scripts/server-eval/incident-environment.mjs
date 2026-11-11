import fs from 'node:fs/promises';
import path from 'node:path';
import {ServerEnvironment} from './environment.mjs';
import {inspectMinimapSpill} from './render-health.mjs';

/** Opt-in forensic browser. Never expose the unrestricted CDP port publicly. */
export class IncidentEnvironment extends ServerEnvironment {
 constructor(options){
  super(options);
  this.diagnosticBrowserArgs=['--enable-automation','--remote-debugging-address=127.0.0.1','--remote-debugging-port=0'];
 }
 async open(){
  const boot=await super.open();
  const session=await this.browser.newBrowserCDPSession();
  try{
   const {arguments:args}=await session.send('Browser.getBrowserCommandLine');
   const profile=args.find(a=>a.startsWith('--user-data-dir='))?.slice('--user-data-dir='.length);
   if(!profile)throw Error('Diagnostic Chrome profile unavailable');
   const [port,endpoint]=(await fs.readFile(path.join(profile,'DevToolsActivePort'),'utf8')).trim().split('\n');
   if(!/^\d+$/.test(port)||!endpoint.startsWith('/devtools/browser/'))throw Error('Invalid diagnostic CDP endpoint');
   this.debugConnection={http:`http://127.0.0.1:${port}`,webSocket:`ws://127.0.0.1:${port}${endpoint}`,profile};
  }finally{await session.detach();}
  return boot;
 }
 async inspectRenderHealth(image){
  if(this.isStatic)return {healthy:true,skipped:'static-original'};
  const probe=await this.evaluate(()=>{
   const map=document.querySelector('#minimap'),game=document.querySelector('#game');
   const visible=e=>{if(!e)return false;const r=e.getBoundingClientRect(),s=getComputedStyle(e);return r.width>0&&r.height>0&&s.display!=='none'&&s.visibility!=='hidden'&&s.opacity!=='0';};
   if(!visible(map)||!visible(game))return null;
   // Legitimate modal/backdrop effects cannot be compared against raw WebGL.
   const w=window.__SHENCHENGJI_CITY__.world;
   if(w.paused||[...document.querySelectorAll('dialog[open], [aria-modal="true"], #native-task-panel, #map-panel')].some(visible))return {skip:'modal-or-paused'};
   const m=map.getBoundingClientRect(),g=game.getBoundingClientRect();
   const left=Math.max(0,Math.floor(m.x-32)),top=Math.max(0,Math.floor(m.y-m.height*.8));
   const region={left,top,width:Math.min(innerWidth,Math.ceil(m.right+16))-left,height:Math.min(innerHeight,Math.ceil(m.bottom+24))-top};
   const canvas=document.createElement('canvas');canvas.width=region.width;canvas.height=region.height;
   const ctx=canvas.getContext('2d',{willReadFrequently:true});
   w.engine._deltaTime=0;w.scene.render();
   ctx.drawImage(game,(left-g.x)*game.width/g.width,(top-g.y)*game.height/g.height,region.width*game.width/g.width,region.height*game.height/g.height,0,0,region.width,region.height);
   return {region,map:m.toJSON(),reference:canvas.toDataURL('image/png')};
  });
  if(!probe||probe.skip)return {healthy:true,skipped:probe?.skip??'no-visible-minimap'};
  this.lastRenderProbe={...probe,reference:Buffer.from(probe.reference.split(',')[1],'base64')};
  return inspectMinimapSpill(image,{...this.lastRenderProbe,allColors:true});
 }
 async preserveIncident({directory,image,fault}){
  // Set before any filesystem operation. Even a disk error must not close Chrome.
  this.incidentHeld=true;
  this.incident={directory,taskId:this.taskId,runnerPid:process.pid,createdAt:new Date().toISOString(),debug:this.debugConnection,fault,gpu:this.gpu,renderer:this.selectedRenderer,build:this.build,seed:this.seed,
   heldKeys:[...this.heldKeys],heldButtons:[...this.heldButtons],frames:this.frames,
   note:'Simulation already stopped between actions. No input release, reload, recovery or second screenshot. Inspector readbacks may affect GPU timing; original.jpg is first evidence.'};
  await fs.mkdir(directory,{recursive:true});
  const save=()=>fs.writeFile(path.join(directory,'incident.json'),JSON.stringify(this.incident,null,2));
  await save();
  await fs.writeFile(path.join(directory,'original.jpg'),image);
  if(this.lastRenderProbe)await fs.writeFile(path.join(directory,'webgl-region.png'),this.lastRenderProbe.reference);
  // Use raw Playwright with a bounded, non-destructive timeout: normal evaluate()
  // deliberately closes hung browsers, which is forbidden for a held incident.
  let timer;
  try{
   const snapshot=await Promise.race([this.page.evaluate(()=>{
    const c=document.querySelector('#mini-map'),m=document.querySelector('#minimap'),w=window.__SHENCHENGJI_CITY__.world;
    const style=m?getComputedStyle(m):null;
    return {minimap:c?.toDataURL('image/png'),map:m?.getBoundingClientRect().toJSON(),style:style?{overflow:style.overflow,transform:style.transform,clipPath:style.clipPath,borderRadius:style.borderRadius}:null,paused:w.paused,url:location.href};
   }),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('Incident snapshot timed out; browser left alive')),5000);})]);
   if(snapshot.minimap)await fs.writeFile(path.join(directory,'minimap.png'),Buffer.from(snapshot.minimap.split(',')[1],'base64'));
   delete snapshot.minimap;this.incident.snapshot=snapshot;
  }catch(error){this.incident.snapshotError=error.message;}
  finally{clearTimeout(timer);}
  this.incident.pageErrors=[...this.errors];this.incident.failedResources=[...this.failedResources];
  await save();return this.incident;
 }
}

/** Keep the runner/Playwright transport alive until explicitly stopped or Chrome closes. */
export async function waitForIncident(env,signal){
 if(signal.aborted){if(env.browser?.isConnected())await env.close();return;}
 if(!env.browser?.isConnected())return;
 await new Promise(resolve=>{
  const timer=setInterval(()=>{},30000);
  const done=()=>{clearInterval(timer);signal.removeEventListener('abort',done);env.browser.off('disconnected',done);resolve();};
  signal.addEventListener('abort',done,{once:true});env.browser.once('disconnected',done);
  if(signal.aborted||!env.browser.isConnected())done();
 });
 if(env.browser.isConnected())await env.close();
}
