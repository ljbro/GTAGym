import type {CityData,V2} from './city-types.ts';
import {closest,inRing,clamp} from './driving.ts';

export type CarWaterSample={wet:boolean;depth:number;floor:number;waterY:number};
/** Estimated bathymetry, not GTA V measurements. Ocean and mapped inland water
 * share a continuous 1:4 bank; roads above water and explicit task floors win.
 * Index only the first 40m of shoreline: farther water is capped at 8m deep. */
export class NativeCarWaterSurface {
 private banks=new Map<string,{a:V2;b:V2}[]>();
 private land;private water;
 constructor(data:CityData,readonly waterY:number,private ground:(x:number,z:number)=>number,
  private road:(x:number,z:number)=>{d:number;road:{width:number}}|null,
  private taskFloor:(x:number,z:number)=>number|null=()=>null){
  const polys=(ps:V2[][][])=>ps.map(rings=>({rings,minX:Math.min(...rings[0].map(p=>p[0])),maxX:Math.max(...rings[0].map(p=>p[0])),minZ:Math.min(...rings[0].map(p=>p[1])),maxZ:Math.max(...rings[0].map(p=>p[1]))}));
  this.land=polys(data.land);this.water=polys(data.water.map(p=>p.rings));
  for(const p of [...this.land,...this.water])for(const ring of p.rings)for(let i=0;i<ring.length;i++){
   const a=ring[i],b=ring[(i+1)%ring.length],seg={a,b};
   for(let x=Math.floor((Math.min(a[0],b[0])-40)/64);x<=Math.floor((Math.max(a[0],b[0])+40)/64);x++)
    for(let z=Math.floor((Math.min(a[1],b[1])-40)/64);z<=Math.floor((Math.max(a[1],b[1])+40)/64);z++){
     const k=x+','+z,list=this.banks.get(k)??[];list.push(seg);this.banks.set(k,list);
    }
  }
 }
 at=(x:number,z:number):CarWaterSample=>{
  const floor=this.taskFloor(x,z)??this.ground(x,z),dry={wet:false,depth:0,floor,waterY:this.waterY};
  if(this.taskFloor(x,z)!=null)return dry;
  const road=this.road(x,z);
  if(road&&road.d<=road.road.width/2&&floor>this.waterY+.08)return dry;
  const inside=(p:typeof this.land[number])=>x>=p.minX&&x<=p.maxX&&z>=p.minZ&&z<=p.maxZ&&inRing(x,z,p.rings[0])&&!p.rings.slice(1).some(r=>inRing(x,z,r));
  if(this.land.some(inside)&&!this.water.some(inside))return dry;
  let distance=Infinity,bank:V2=[x,z];
  for(const s of this.banks.get(Math.floor(x/64)+','+Math.floor(z/64))??[]){const q=closest(x,z,s.a,s.b);if(q.d<distance){distance=q.d;bank=[q.x,q.z];}}
  const bottom=Math.max(this.waterY-8,Math.min(this.waterY+.3,this.ground(...bank))-.25*distance);
  return {wet:true,depth:Math.max(0,this.waterY-bottom),floor:bottom,waterY:this.waterY};
 };
}

export const CAR_SINK_SECONDS=3;
/** Irreversible once deep water is reached. No wall-clock timers or auto rescue. */
export class NativeCarWater {
 phase:'dry'|'shallow'|'sinking'|'failed'='dry';elapsed=0;depth=0;baseY:number|null=null;pitch=0;
 private startY=0;private targetY=0;
 get sinking(){return this.phase==='sinking'||this.phase==='failed';}
 reset(){this.phase='dry';this.elapsed=0;this.depth=0;this.baseY=null;this.pitch=0;}
 step(sample:CarWaterSample,height:number,dt:number){
  if(!Number.isFinite(dt)||dt<=0)return;
  if(!this.sinking){
   this.depth=sample.depth;
   if(sample.wet&&sample.depth>=clamp(height*.55,.65,1.15)){
    this.startY=this.baseY??sample.waterY-.25;
    // Even on a relatively shallow bottom the flooded engine is unusable.
    this.targetY=Math.max(sample.floor,sample.waterY-height-.45);
    this.phase='sinking';
   }else{this.phase=sample.wet&&sample.depth>0?'shallow':'dry';this.baseY=sample.floor;return;}
  }
  this.elapsed=Math.min(CAR_SINK_SECONDS,this.elapsed+dt);
  const t=this.elapsed/CAR_SINK_SECONDS,e=t*t*(3-2*t);
  this.baseY=this.startY+(this.targetY-this.startY)*e;this.pitch=.12*Math.sin(Math.PI*t);
  if(this.elapsed>=CAR_SINK_SECONDS-1e-9)this.phase='failed';
 }
 get drag(){return this.phase==='shallow'?this.depth*2.5:0;}
}
