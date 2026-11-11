// Extracted from gtabench-static/web/sniper_environment/app.mjs.
// Current scope-only controls hide unscoped overlays; archived rendering remains available.
import {WIDTH,HEIGHT,project} from './sniper-engine.mjs';
export function renderSniper(canvas,env,config,{texture,initialTexture,scopeTexture}) {
const ctx=canvas.getContext('2d');let showAnswer=false,dirty=false,shotAt=-Infinity;
function polygonPath(p,begin=true) { if(begin)ctx.beginPath();p.forEach(([x,y],i)=>{const initial=!env.entered&&config.initial_observation;const q=initial?project(initial.image_from_world,x,y).map((v,j)=>v*(j?HEIGHT/initial.height:WIDTH/initial.width)):env.toScreen(x,y);i?ctx.lineTo(...q):ctx.moveTo(...q);});ctx.closePath(); }
// Draw the existing scene through its calibrated world -> opening-image transform.
// Triangles also handle the original example's projective registration.
function drawRegisteredScene(alpha=1) {
  if(!config.scope_entry?.world_from_image)return;
  const w=config.scene.width,h=config.scene.height,ts=config.scene.texture_scale??1;
  const triangle=(src)=>{
    const dst=src.map(p=>env.toScreen(...p));const [[x0,y0],[x1,y1],[x2,y2]]=src;
    const [[u0,v0],[u1,v1],[u2,v2]]=dst;const det=(x1-x0)*(y2-y0)-(x2-x0)*(y1-y0);if(Math.abs(det)<1e-8)return;
    const a=((u1-u0)*(y2-y0)-(u2-u0)*(y1-y0))/det,b=((v1-v0)*(y2-y0)-(v2-v0)*(y1-y0))/det;
    const c=((u2-u0)*(x1-x0)-(u1-u0)*(x2-x0))/det,d=((v2-v0)*(x1-x0)-(v1-v0)*(x2-x0))/det;
    ctx.save();ctx.globalAlpha=alpha;ctx.beginPath();dst.forEach((p,i)=>i?ctx.lineTo(...p):ctx.moveTo(...p));ctx.closePath();ctx.clip();ctx.transform(a,b,c,d,u0-a*x0-c*y0,v0-b*x0-d*y0);ctx.drawImage(texture,0,0,w*ts,h*ts,0,0,w,h);ctx.restore();
  };
  for(let y=0;y<8;y++)for(let x=0;x<12;x++){const a=[x*w/12,y*h/8],b=[(x+1)*w/12,y*h/8],c=[(x+1)*w/12,(y+1)*h/8],d=[x*w/12,(y+1)*h/8];triangle([a,b,c]);triangle([a,c,d]);}
}
function draw() {
  if (!env||!texture) return;
  const v=env.viewport(), ts=config.scene.texture_scale??1;
  ctx.setTransform(canvas.width/WIDTH,0,0,canvas.height/HEIGHT,0,0);ctx.clearRect(0,0,WIDTH,HEIGHT);
  ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality="high";
  if(!env.entered&&config.initial_observation?.unavailable){ctx.fillStyle='#101a16';ctx.fillRect(0,0,WIDTH,HEIGHT);ctx.fillStyle='#b2c3ba';ctx.font='24px system-ui';ctx.textAlign='center';ctx.fillText("Original recording lacks footage before aiming down sights · Section to be added",640,360);ctx.textAlign='start';return;}
  const initial=!env.entered&&initialTexture;
  if(initial)ctx.drawImage(initialTexture,0,0,initialTexture.naturalWidth,initialTexture.naturalHeight,0,0,WIDTH,HEIGHT);
  else if(scopeTexture){
    ctx.fillStyle='#030605';ctx.fillRect(0,0,WIDTH,HEIGHT);
    ctx.drawImage(scopeTexture,(0-v.x)/v.w*WIDTH,(0-v.y)/v.h*HEIGHT,scopeTexture.naturalWidth/v.w*WIDTH,scopeTexture.naturalHeight/v.h*HEIGHT);
    // The camera never changes when texture coverage is expanded. A gradual reveal avoids a one-pixel-look image swap.
    drawRegisteredScene(Math.min(1,env.entryTravel/80));
    if(env.scoped&&env.entryTravel===0&&!env.done)return; // exact post-LT source observation, including its native scope
  }
  else if(config.scope_entry?.unavailable){ctx.fillStyle='#101a16';ctx.fillRect(0,0,WIDTH,HEIGHT);ctx.fillStyle='#b2c3ba';ctx.font='24px system-ui';ctx.fillText("No reliable footage after aiming down sights · Pending verification",380,360);return;}
  else ctx.drawImage(texture,v.x*ts,v.y*ts,v.w*ts,v.h*ts,0,0,WIDTH,HEIGHT);
  if(initial&&!env.done)return;
  const mapped=initial?config.initial_observation.target_visible!==false&&config.initial_observation.image_from_world:!config.scope_entry?.image||config.scope_entry.image_from_world;
  if (mapped&&env.targetState==='hit') {
    // The visible actor receives the hit event and changes appearance in world space.
    ctx.beginPath();for (const p of [...config.target.hit_polygons,...(config.target.exclusion_polygons??[])])polygonPath(p,false);ctx.fillStyle='#83f5b66b';ctx.fill('evenodd');ctx.strokeStyle='#bbffdb';ctx.lineWidth=1.5;ctx.stroke();
  }
  if (mapped&&showAnswer&&env.done) {
    ctx.beginPath();for(const p of [...config.target.hit_polygons,...(config.target.exclusion_polygons??[])])polygonPath(p,false);ctx.fillStyle='#70efac40';ctx.fill('evenodd');ctx.strokeStyle='#96ffbf';ctx.lineWidth=2;ctx.stroke();
  }
  if (env.scoped&&!(scopeTexture&&env.entryTravel===0)) {
    ctx.save();ctx.beginPath();ctx.rect(0,0,WIDTH,HEIGHT);ctx.arc(WIDTH/2,HEIGHT/2,HEIGHT*(scopeTexture?.76:.46),0,Math.PI*2,true);ctx.fillStyle='#020509fa';ctx.fill();
    ctx.beginPath();ctx.arc(WIDTH/2,HEIGHT/2,HEIGHT*(scopeTexture?.76:.46),0,Math.PI*2);ctx.strokeStyle='#41504e';ctx.lineWidth=4;ctx.stroke();
    ctx.strokeStyle='#112019dc';ctx.lineWidth=1.5;
    ctx.beginPath();ctx.moveTo(640,34);ctx.lineTo(640,346);ctx.moveTo(640,374);ctx.lineTo(640,686);ctx.moveTo(309,360);ctx.lineTo(626,360);ctx.moveTo(654,360);ctx.lineTo(971,360);ctx.stroke();
    for(let i=1;i<=5;i++) { const d=i*48;ctx.beginPath();ctx.moveTo(633,360+d);ctx.lineTo(647,360+d);ctx.moveTo(640+d,353);ctx.lineTo(640+d,367);ctx.moveTo(640-d,353);ctx.lineTo(640-d,367);ctx.stroke(); }
    ctx.restore();
  }
  if(!env.scopeOnlyLook&&!env.scoped && !env.done){ctx.save();ctx.beginPath();ctx.arc(640,360,config.hip_fire?.radius_px??90,0,Math.PI*2);ctx.strokeStyle='#f6e3b89c';ctx.lineWidth=1.5;ctx.setLineDash([6,6]);ctx.stroke();ctx.restore();}
  // Center aim point exists in both modes; LT is an action, never a hidden scoring gate.
  if(env.scoped||!env.scopeOnlyLook){ctx.beginPath();ctx.arc(640,360,2.3,0,Math.PI*2);ctx.fillStyle='#f1f8f1';ctx.fill();ctx.strokeStyle='#15251c';ctx.lineWidth=1;ctx.stroke();}
  if(env.shot) {
    const [x,y]=env.shot.screen_point??env.toScreen(...env.shot.point);ctx.strokeStyle=env.result.hit?'#a9ffc9':'#ffb1a1';ctx.lineWidth=3;
    ctx.beginPath();for(const [sx,sy]of [[-1,-1],[1,-1],[-1,1],[1,1]]){ctx.moveTo(x+sx*7,y+sy*7);ctx.lineTo(x+sx*17,y+sy*17);}ctx.stroke();
    const age=performance.now()-shotAt;
    if(age<180){ctx.fillStyle=`rgba(255,244,208,${.22*(1-age/180)})`;ctx.fillRect(0,0,WIDTH,HEIGHT);dirty=true;}
  }
}

draw();
}
