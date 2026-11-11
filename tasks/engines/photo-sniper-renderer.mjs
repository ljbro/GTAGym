import {PHOTO_CONTENT} from './photo-sniper-engine.mjs';

export function renderPhotoSniper(canvas,env,layers){
  const ctx=canvas.getContext('2d'),v=env.viewport(),z=1280/v.w,c=PHOTO_CONTENT;
  ctx.setTransform(canvas.width/1280,0,0,canvas.height/720,0,0);
  ctx.fillStyle='#030605';ctx.fillRect(0,0,1280,720);
  ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality='high';
  // Always composite all four native FOVs. The highest-detail target patch
  // stays fixed across zoom levels; exclude baked HUD portraits on EVERY layer.
  for(const {image,zoom} of layers){
    const w=1280*z/zoom,h=720*z/zoom;
    const x=640+(640-env.camera.x)*z-w/2,y=360+(360-env.camera.y)*z-h/2;
    ctx.drawImage(image,c.x,c.y,c.width,c.height,x+c.x*w/1280,y+c.y*h/720,c.width*w/1280,c.height*h/720);
  }
  if(env.scoped){
    ctx.save();ctx.fillStyle='#030605';ctx.beginPath();ctx.rect(0,0,1280,720);ctx.arc(640,360,337,0,Math.PI*2,true);ctx.fill('evenodd');
    ctx.strokeStyle='#111a15';ctx.lineWidth=3;ctx.beginPath();ctx.arc(640,360,335,0,Math.PI*2);ctx.stroke();
    ctx.strokeStyle='rgba(9,17,12,.92)';ctx.lineWidth=1;ctx.beginPath();
    ctx.moveTo(307,360);ctx.lineTo(630,360);ctx.moveTo(650,360);ctx.lineTo(973,360);
    ctx.moveTo(640,27);ctx.lineTo(640,350);ctx.moveTo(640,370);ctx.lineTo(640,693);ctx.stroke();
    ctx.strokeStyle='#263429';for(let d=40;d<240;d+=40){ctx.beginPath();ctx.moveTo(640+d,356);ctx.lineTo(640+d,364);ctx.moveTo(640-d,356);ctx.lineTo(640-d,364);ctx.stroke();}
    ctx.fillStyle='#bf3030';ctx.beginPath();ctx.arc(640,360,1.8,0,7);ctx.fill();ctx.restore();
    if(!env.scopeOnlyLook){ctx.fillStyle='#c2d0bd';ctx.font='18px monospace';ctx.fillText(env.zoom.toFixed(1)+'×',1030,655);}
  }else if(!env.scopeOnlyLook){
    ctx.strokeStyle='#e7eddf';ctx.lineWidth=1;ctx.beginPath();ctx.arc(640,360,4,0,7);ctx.stroke();
  }
  if(env.shot){
    const [x,y]=env.toScreen(...env.shot.point);ctx.strokeStyle=env.result.hit?'#a9ffc9':'#ffb1a1';ctx.lineWidth=3;ctx.beginPath();
    for(const [sx,sy] of [[-1,-1],[1,-1],[-1,1],[1,1]]){ctx.moveTo(x+sx*7,y+sy*7);ctx.lineTo(x+sx*17,y+sy*17);}ctx.stroke();
  }
}
