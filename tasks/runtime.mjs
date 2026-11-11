import {ShootingEnvironment} from './engines/shooting-engine.mjs';
import {TrainingShootingEnvironment} from './engines/training-shooting-engine.mjs';
// Version the changed dependencies too: a fresh entry module does not invalidate
// the browser's cached imports at their unchanged URLs.
import {createSniperEnvironment} from './engines/photo-sniper-engine.mjs?v=clearance-v1';
import {renderClearanceSniper} from './engines/clearance-sniper-engine.mjs';
import {renderGameplaySniper} from './engines/gameplay-sniper-engine.mjs';
import {renderPhotoSniper} from './engines/photo-sniper-renderer.mjs?v=scope-only-look-v2';
import {renderSniper} from './engines/sniper-renderer.mjs?v=scope-only-look-v2';
import {staticAction} from './gui-action.mjs?v=relative-up-v1';
import {staticTurn,COMPOSITE_PROTOCOL} from './gui-turn.mjs?v=relative-up-v1';
import {sniperScroll} from './scroll-action.mjs';

const loadImage=async url=>{const im=new Image();im.src=url;await im.decode();return im;};
export class StaticShootingSite{
 constructor(row,{seed=1234,paused=()=>false,onChange=()=>{}}={}){
  this.row=row;this.seed=seed;this.paused=paused;this.onChange=onChange;this.steps=0;this.limit=20;this.turnActionCounts=[];this.composite=false;this.abort=new AbortController();this.disposed=false;
  this.canvas=document.createElement('canvas');this.canvas.id='static-shooting-canvas';this.canvas.tabIndex=0;
  this.canvas.setAttribute('aria-label',row.kind==='sniper'?"Sniper scene from the original video":"Shooting scene from the original video");
 }
 async load(base=new URL('./tasks/',document.baseURI)){
  const url=new URL(this.row.config,base),response=await fetch(url,{signal:this.abort.signal});
  if(!response.ok)throw Error(`Static scene HTTP ${response.status}`);
  const cfg=this.config=await response.json(),folder=new URL('.',url);
  // All static tasks, including clearance, share the 20-turn limit.
  if(this.row.kind==='shooting'){
   this.env=this.row.initialAim?new TrainingShootingEnvironment(cfg.task,cfg.gold,this.row.initialAim):new ShootingEnvironment(cfg.task,cfg.gold);const stage=cfg.task.stages[0];
   this.canvas.width=1280;this.canvas.height=720;this.texture=await loadImage(new URL(stage.image,folder));
  }else{
   if(cfg.evaluation?.enabled!==true)throw Error('Unscored sniper task is not allowed');
   this.env=createSniperEnvironment(cfg,{scopeOnlyLook:true});this.env.reset({seed:this.seed});this.canvas.width=1280;this.canvas.height=720;
   if(cfg.render_mode==='native-photo-pyramid-v1'){
    this.photoLayers=await Promise.all(cfg.photo_layers.map(async layer=>({...layer,image:await loadImage(new URL(layer.file,folder))})));
    this.texture=this.photoLayers[0].image;
   }else [this.texture,this.initialTexture,this.scopeTexture]=await Promise.all([cfg.scene.image,cfg.initial_observation?.image,cfg.scope_entry?.image].map(p=>p?loadImage(new URL(p,folder)):null));
   if(this.row.unscopedView)this.unscopedTexture=await loadImage(new URL(this.row.unscopedView.image,base));
  }
  if(this.disposed)throw Error('Static scene disposed during loading');
  this.cursor={x:this.canvas.width/2,y:this.canvas.height/2};document.body.append(this.canvas);document.body.classList.add('static-shooting-active');
  this.installInput();this.render();this.canvas.focus();return this;
 }
 render(){
  if(!this.env||!this.texture||this.disposed)return;
  if(this.row.kind==='sniper'&&!this.env.scoped&&this.unscopedTexture){
   const ctx=this.canvas.getContext('2d'),view=this.row.unscopedView;
   ctx.setTransform(1,0,0,1,0,0);ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality='high';
   if(view.crop){
    const {x,y,width,height}=view.crop;
    ctx.drawImage(this.unscopedTexture,x,y,width,height,0,0,1280,720);
   }else{
    ctx.drawImage(this.unscopedTexture,0,0,1280,720);
    if(view.matte){ctx.fillStyle=view.matte.color;ctx.fillRect(0,720-view.matte.bottom,1280,view.matte.bottom);}
   }
   return;
  }
  if(this.row.kind==='sniper'){if(this.config.render_mode==='native-clearance-atlas-v1')renderClearanceSniper(this.canvas,this.env,this.config,this);else if(this.config.render_mode==='native-gameplay-atlas-v1')renderGameplaySniper(this.canvas,this.env,this.config,this);else if(this.photoLayers)renderPhotoSniper(this.canvas,this.env,this.photoLayers);else renderSniper(this.canvas,this.env,this.config,this);return;}
  const ctx=this.canvas.getContext('2d'),s=this.env.observe(),v=s.viewport;
  ctx.fillStyle='#05090d';ctx.fillRect(0,0,this.canvas.width,this.canvas.height);
  const sx=this.canvas.width/s.width,sy=this.canvas.height/s.height;
  ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality='high';
  ctx.drawImage(this.texture,-v.x*sx,-v.y*sy,s.width*sx,s.height*sy);
  ctx.fillStyle='#fff';ctx.beginPath();ctx.arc(s.crosshair[0]*sx,s.crosshair[1]*sy,3,0,Math.PI*2);ctx.fill();
 }
 screenshot(){this.render();return this.canvas.toDataURL('image/png');}
 snapshot(){
  const o=this.env.observe(),done=o.done||this.steps>=this.limit,result=o.result??this.env.result;
  return {id:this.row.id,kind:this.row.kind,sourceId:this.row.sourceId,steps:this.steps,maxSteps:this.limit,done,hit:!!result?.hit,
   reason:o.done?(this.config.render_mode==='native-clearance-atlas-v1'?result.reason:result?.hit?"Hit the Target":"Target missed"):done?'step_limit_without_shot':'',cleared:o.cleared,total:o.total,ammo:o.ammo,camera:o.camera??{...this.env.camera},scoped:o.scoped,zoom:o.zoom,entered:this.env.entered,entryTravel:this.env.entryTravel,
   cursor:{...this.cursor},width:this.canvas.width,height:this.canvas.height,seed:this.seed};
 }
 stepGui(input,{composite=false}={}){
  if(this.disposed||this.snapshot().done||this.paused())throw Error('Static episode not active');
  const stage=this.config.task?.stages[0];
  const mapping={kind:this.row.kind,cursor:this.cursor,width:this.canvas.width,height:this.canvas.height,sourceWidth:stage?.width,sourceHeight:stage?.height};
  // Single-operation callers stay strict; both paths use center-relative aim.
  const converted=composite?staticTurn(input,mapping):staticAction(input,mapping);
  const actions=composite?converted.actions:[converted.action];
  // Validate the entire group first. Fire is last; only render after all operations.
  for(const action of actions)this.env.step(action);
  this.cursor=converted.cursor;this.steps++;this.turnActionCounts.push(actions.length);this.composite||=composite;
  this.render();this.onChange();return this.snapshot();
 }
 trace(){return {...(this.row.kind==='sniper'?this.env.trace():this.env.exportTrace()),...(this.row.unscopedView?{unscoped_observation:structuredClone(this.row.unscopedView)}:{}),max_steps:this.limit,model_steps:this.steps,...(this.composite?{action_protocol:COMPOSITE_PROTOCOL,turn_action_counts:[...this.turnActionCounts]}:{})};}
 installInput(){
  const opts={signal:this.abort.signal},run=a=>{if(this.paused()||this.env.observe().done)return;this.env.step(a);this.render();this.onChange();};
  let last=null,wheelPixels=0;
  this.canvas.addEventListener('pointerenter',()=>{last=null;},opts);
  this.canvas.addEventListener('pointermove',e=>{
   const r=this.canvas.getBoundingClientRect(),scale=Math.min(r.width/this.canvas.width,r.height/this.canvas.height),left=r.left+(r.width-this.canvas.width*scale)/2,top=r.top+(r.height-this.canvas.height*scale)/2;
   const p={x:(e.clientX-left)/scale,y:(e.clientY-top)/scale};
   if(p.x<0||p.y<0||p.x>=this.canvas.width||p.y>=this.canvas.height){last=null;return;}
   const stage=this.config.task?.stages[0],sx=this.row.kind==='shooting'?stage.width/this.canvas.width:1,sy=this.row.kind==='shooting'?stage.height/this.canvas.height:1;
   if(last)run({type:'look',dx:(p.x-last.x)*sx,dy:(p.y-last.y)*sy});last=p;
  },opts);
  // Pointer down/up only represent the first/last mouse button of a chord.
  // Mouse events deliver each edge, including LMB fire while RMB stays held.
  this.canvas.addEventListener('mousedown',e=>{if(e.button!==0&&(e.button!==2||this.row.kind!=='sniper'))return;if(e.button===2)wheelPixels=0;e.preventDefault();this.canvas.focus();run({type:'button',button:e.button===0?'RT':'LT',event:'down'});},opts);
  window.addEventListener('mouseup',e=>{if(e.button===2)wheelPixels=0;if(this.row.kind==='sniper'&&(e.button===0||e.button===2))run({type:'button',button:e.button===0?'RT':'LT',event:'up'});},opts);
  this.canvas.addEventListener('contextmenu',e=>e.preventDefault(),opts);
  this.canvas.addEventListener('wheel',e=>{
   e.preventDefault();e.stopImmediatePropagation();
   if(this.row.kind!=='sniper'||this.paused()||this.env.observe().done||!this.env.scoped){wheelPixels=0;return;}
   const pixels=e.deltaY*(e.deltaMode===1?40:e.deltaMode===2?this.canvas.clientHeight:1);
   if(!Number.isFinite(pixels)||!pixels)return;
   if(Math.sign(pixels)!==Math.sign(wheelPixels))wheelPixels=0;
   wheelPixels+=pixels;
   const steps=Math.min(6,Math.floor(Math.abs(wheelPixels)/100));
   if(!steps)return; // Accumulate fine trackpad deltas instead of over-zooming.
   const direction=wheelPixels<0?'up':'down';wheelPixels%=100;
   run(sniperScroll({direction,steps}));
  },{...opts,passive:false});
  window.addEventListener('keydown',e=>{
   if(this.paused()||e.code==='Escape'||e.code==='KeyN')return;
   e.preventDefault();e.stopImmediatePropagation();
  },{...opts,capture:true});
 }
 dispose(){this.disposed=true;this.abort.abort();this.canvas.remove();document.body.classList.remove('static-shooting-active');}
}
