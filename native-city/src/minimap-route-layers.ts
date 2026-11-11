import type {V2} from './city-types.ts';
/** All supplied remaining geometry in one purple style, without staged horizons. */
export function minimapRouteLayers(points:readonly V2[],_horizon=Infinity,_overlapTolerance=0){
 const active=points.filter(p=>Number.isFinite(p[0])&&Number.isFinite(p[1])).map(p=>[...p] as V2);
 const distance=active.slice(1).reduce((sum,p,i)=>sum+Math.hypot(p[0]-active[i][0],p[1]-active[i][1]),0);
 return {active,future:[] as V2[],distance};
}
export function drawMinimapRoute(ctx:CanvasRenderingContext2D,points:readonly V2[],options:{x:number;z:number;scale:number;speed:number;walking?:boolean}){
 const layers=minimapRouteLayers(points),{x,z,scale}=options;
 ctx.save();ctx.lineJoin='round';ctx.lineCap='round';ctx.setLineDash([]);
 if(layers.active.length>1){
  ctx.beginPath();layers.active.forEach((p,i)=>{const px=(p[0]-x)*scale,py=-(p[1]-z)*scale;i?ctx.lineTo(px,py):ctx.moveTo(px,py);});
  ctx.strokeStyle='#38214f';ctx.lineWidth=8;ctx.stroke();
  ctx.strokeStyle='#bd79ff';ctx.lineWidth=4.5;ctx.stroke();
 }
 ctx.restore();return layers;
}
