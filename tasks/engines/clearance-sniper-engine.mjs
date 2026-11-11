import {SniperEnvironment,contains,WIDTH,HEIGHT} from './sniper-engine.mjs';
const LEVELS=[2,3,4,5,6,8];
export class ClearanceSniperEnvironment extends SniperEnvironment {
 reset(options={}){this.cleared=new Set();this.shots=[];return super.reset(options);}
 viewport(){const w=WIDTH/this.zoom;return {x:this.camera.x-w/2,y:this.camera.y-w*HEIGHT/WIDTH/2,w,h:w*HEIGHT/WIDTH};}
 step(action){
  const zooming=!this.done&&this.scoped&&action?.type==='button'&&action.event==='down'&&['UP','DOWN'].includes(action.button),previous=this.zoom;
  super.step(action);
  if(zooming){const steps=Math.max(1,Math.round((action.duration_ms??160)/160));this.zoom=LEVELS[Math.max(0,Math.min(LEVELS.length-1,LEVELS.indexOf(previous)+(action.button==='UP'?steps:-steps)))];this.clampCamera();}
  return this.observe();
 }
 fire(){
  if(this.done)return;
  const point=this.toWorld(640,360);
  const target=this.scoped?this.config.targets.find(t=>t.polygons.some(p=>contains(point,p))&&!t.exclusions.some(p=>contains(point,p))):null;
  const repeated=!!target&&this.cleared.has(target.id),valid=!!target&&!repeated;
  if(valid)this.cleared.add(target.id);
  this.shot={point,scoped:this.scoped,zoom:this.zoom,target_id:target?.id??null,hit:valid};this.shots.push(structuredClone(this.shot));
  const success=this.cleared.size===this.config.targets.length;
  this.done=!valid||success||this.shots.length>=this.config.targets.length;
  this.targetState=success?'all_cleared':this.done?'failed':'partial';
  this.result={hit:success,reward:Number(success),reason:success?'all_targets_cleared':!this.scoped?'unscoped_shot':repeated?'already_cleared':!target?'miss':this.done?'out_of_ammunition':'target_cleared',cleared:this.cleared.size,total:this.config.targets.length,ammo:this.config.targets.length-this.shots.length};
 }
 observe(){return {...super.observe(),cleared:this.cleared.size,total:this.config.targets.length,ammo:this.config.targets.length-this.shots.length,result:this.result};}
 trace(){return {...super.trace(),shots:structuredClone(this.shots),cleared_targets:[...this.cleared]};}
}
export function renderClearanceSniper(canvas,env,config,{texture}){
 const ctx=canvas.getContext('2d'),v=env.viewport(),z=env.zoom;
 ctx.setTransform(1,0,0,1,0,0);ctx.fillStyle='#030605';ctx.fillRect(0,0,1280,720);
 const sx=texture.width/config.scene.width,sy=texture.height/config.scene.height;
 ctx.drawImage(texture,v.x*sx,v.y*sy,v.w*sx,v.h*sy,0,0,1280,720);
 for(const t of config.targets)if(env.cleared.has(t.id)){
  for(const p of t.polygons){ctx.beginPath();p.forEach(([x,y],i)=>ctx[i?'lineTo':'moveTo']((x-v.x)*z,(y-v.y)*z));ctx.closePath();ctx.fillStyle='rgba(16,28,31,.72)';ctx.fill();}
  const pts=t.polygons.flat(),xs=pts.map(p=>p[0]),ys=pts.map(p=>p[1]),x=((Math.min(...xs)+Math.max(...xs))/2-v.x)*z,y=(Math.min(...ys)-v.y)*z-10;
  ctx.strokeStyle='#bac5be';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(x-4,y-4);ctx.lineTo(x+4,y+4);ctx.moveTo(x+4,y-4);ctx.lineTo(x-4,y+4);ctx.stroke();
 }
 ctx.fillStyle='#030605';ctx.beginPath();ctx.rect(0,0,1280,720);ctx.arc(640,360,337,0,Math.PI*2,true);ctx.fill('evenodd');
 ctx.strokeStyle='#111b17';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(305,360);ctx.lineTo(630,360);ctx.moveTo(650,360);ctx.lineTo(975,360);ctx.moveTo(640,25);ctx.lineTo(640,350);ctx.moveTo(640,370);ctx.lineTo(640,695);ctx.stroke();ctx.fillStyle='#c73229';ctx.fillRect(639,359,2,2);
}
