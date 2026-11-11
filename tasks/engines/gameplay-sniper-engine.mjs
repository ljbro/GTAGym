import {SniperEnvironment,WIDTH,HEIGHT} from './sniper-engine.mjs';

// Reviewed preview optics, with the original engine's action validation,
// shot adjudication, seeded hip-fire spread and replay recording.
export class GameplaySniperEnvironment extends SniperEnvironment {
 viewport(){const w=WIDTH/(this.scoped?this.zoom:1);return {x:this.camera.x-w/2,y:this.camera.y-w*HEIGHT/WIDTH/2,w,h:w*HEIGHT/WIDTH};}
 clampCamera(){
  const b=this.config.gameplay.bounds,r=this.scoped?337/this.zoom:0;
  this.camera.x=Math.max(b.x+r,Math.min(b.x+b.w-r,this.camera.x));
  this.camera.y=Math.max(b.y+r,Math.min(b.y+b.h-r,this.camera.y));
 }
 step(action){
  const zooming=!this.done&&this.scoped&&action?.type==='button'&&action.event==='down'&&['UP','DOWN'].includes(action.button);
  const previous=this.zoom,camera={...this.camera};
  super.step(action);
  if(zooming){
   const levels=this.config.gameplay.levels,index=levels.indexOf(previous),steps=Math.max(1,Math.round((action.duration_ms??160)/160));
   this.zoom=levels[Math.max(0,Math.min(levels.length-1,index+(action.button==='UP'?steps:-steps)))];
   this.camera=camera;this.clampCamera();
  }
  return this.observe();
 }
}

export function renderGameplaySniper(canvas,env,config,{texture,initialTexture}){
 const ctx=canvas.getContext('2d'),{x,y,w,h}=config.gameplay.textureRect;
 ctx.fillStyle='#030504';ctx.fillRect(0,0,WIDTH,HEIGHT);ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality='high';
 if(!env.scoped){ctx.drawImage(initialTexture,0,0,WIDTH,HEIGHT);return;}
 const z=env.zoom;ctx.save();ctx.beginPath();ctx.arc(640,360,337,0,Math.PI*2);ctx.clip();
 ctx.drawImage(texture,640+(x-env.camera.x)*z,360+(y-env.camera.y)*z,w*z,h*z);ctx.restore();
 ctx.strokeStyle='#10231e';ctx.lineWidth=1.5;ctx.beginPath();
 ctx.moveTo(303,360);ctx.lineTo(633,360);ctx.moveTo(647,360);ctx.lineTo(977,360);
 ctx.moveTo(640,23);ctx.lineTo(640,353);ctx.moveTo(640,367);ctx.lineTo(640,697);ctx.stroke();
 ctx.fillStyle='#a92c2c';ctx.fillRect(639,359,2,2);
}
