import {waterLocal,waterWorld,type NativeWaterSpec} from './native-water-motion.ts';

/** Authored extension, NOT a measured GTA V video route. Geometry and collision
 * share this local metre-based layout, usable by other boat/swimmer missions. */
const submarinePoints=[[0,0],[0,10],[12,24],[12,36],[-12,52],[-12,64],[0,84],[0,115]].map(([u,v])=>[-4800+v,-2760-u]);
export const SUBMARINE_TASK={
 id:'c06-n01',title:"Offshore Facilities · Pilot the submarine into the underwater pipe",expectedTurns:[] as string[],
 path:{points:submarinePoints,length:submarinePoints.slice(1).reduce((s,p,i)=>s+Math.hypot(p[0]-submarinePoints[i][0],p[1]-submarinePoints[i][1]),0),forward:[1,0],right:[0,-1]},
 waterHeight:-.25,startDepth:.2,goalDepth:12,shallowFloorDepth:18,deepFloorDepth:18,entrance:false,
};
export type MarineBox={name:string;u:number;y:number;v:number;w:number;h:number;d:number;material:'concrete'|'steel'|'paint'|'glass'};
export const MARINE_PIPE={mouth:92,end:126,goal:115,depth:12,inner:4,outer:4.6};
export class MarineFacilityLayout{
 readonly boxes:MarineBox[]=[];
 readonly utilities:{points:[number,number,number][];radius:number}[]=[];
 readonly rocks:{u:number;y:number;v:number;xRadius:number;yRadius:number;zRadius:number}[]=[];
 constructor(readonly spec:NativeWaterSpec){
  const add=(name:string,u:number,y:number,v:number,w:number,h:number,d:number,material:MarineBox['material']='concrete')=>this.boxes.push({name,u,y,v,w,h,d,material});
  // Alternating full-height service breakwaters. Their openings are wide
  // enough for the entire hull, but a straight surface/deep approach is blocked.
  for(const [v,gap]of [[30,12],[58,-12]]){
   const left=gap-7,right=gap+7,bottom=-19,top=2;
   add('intake-breakwater-left',(-72+left)/2,(bottom+top)/2,v,left+72,top-bottom,2);
   add('intake-breakwater-right',(right+72)/2,(bottom+top)/2,v,72-right,top-bottom,2);
  }
  add('platform-deck',0,3.2,106,52,1.2,52);
  for(const u of [-22,22])for(const v of [83,106,129]){
   const bottom=this.floor(u,v);add('pile-footing',u,bottom+.6,v,5,1.2,5);
   add('support-pile',u,(bottom+3)/2,v,2.3,3-bottom,2.3);
   add('pile-waterline-band',u,-.4,v,2.34,1.2,2.34,'paint');
  }
  // A closed pump house on the deck, with attached window panels.
  add('pump-house',-10,7.5,115,18,7.4,20);
  add('roof',-10,11.4,115,19,.4,21,'steel');
  for(const u of [-16,-10,-4])add('window',u,8.2,104.95,3.4,2.4,.1,'glass');
  add('door',-10,5.4,104.92,2.2,3.2,.12,'steel');
  for(const u of [-25.5,25.5]){add('deck-rail',u,4.9,106,.15,.15,52,'steel');for(let v=80;v<=132;v+=4)add('rail-post',u,4.4,v,.12,1.2,.12,'steel');}
  for(const v of [80.5,131.5]){add('deck-rail',0,4.9,v,51,.15,.15,'steel');for(let u=-24;u<=24;u+=4)add('rail-post',u,4.4,v,.12,1.2,.12,'steel');}
  add('service-mast',15,10,122,.5,12.4,.5,'steel');
  add('mast-crossbar',15,15,122,5,.2,.2,'steel');
  // Pipe saddles are anchored into the same continuous seabed.
  for(const v of [94,103,112,121])add('pipe-saddle',0,-17.7,v,10.5,1.7,1.5);
  add('pipe-end-wall',0,this.pipeY,126.5,9.2,9.2,1);
  for(const u of [-12,12])this.utilities.push({points:[[u,6,120],[u,1,120],[u,-15,120],[u,-17.4,116],[u,-17.4,92]],radius:.3});
  for(let i=0;i<45;i++){const u=(i%2?1:-1)*(33+(i*13%32)),v=-8+i*3.5,h=.7+(i%5)*.3;this.rocks.push({u,y:this.floor(u,v)+h*.65,v,xRadius:1.5+(i%3),yRadius:h,zRadius:1.6});}
 }
 get pipeY(){return this.spec.waterHeight-MARINE_PIPE.depth;}
 world(u:number,v:number){return waterWorld(this.spec,u,v);}
 local(x:number,z:number){return waterLocal(this.spec,x,z);}
 floor(u:number,v:number){return -18.3+.18*Math.sin(u*.11)*Math.cos(v*.07);}
 /** Sphere vs real solids, including annular pipe walls and intake facade.
  * Inflated spheres make contact conservative rather than allowing tunnelling. */
 clear(u:number,y:number,v:number,r:number){
  if(Math.abs(u)>72-r||v< -30+r||v>155-r||y-r<this.floor(u,v))return false;
  for(const b of this.boxes){
   const dx=Math.max(0,Math.abs(u-b.u)-b.w/2),dy=Math.max(0,Math.abs(y-b.y)-b.h/2),dz=Math.max(0,Math.abs(v-b.v)-b.d/2);
   if(dx*dx+dy*dy+dz*dz<r*r)return false;
  }
  for(const b of this.rocks){const dx=Math.max(0,Math.abs(u-b.u)-b.xRadius),dy=Math.max(0,Math.abs(y-b.y)-b.yRadius),dz=Math.max(0,Math.abs(v-b.v)-b.zRadius);if(dx*dx+dy*dy+dz*dz<r*r)return false;}
  for(const pipe of this.utilities)for(let i=1;i<pipe.points.length;i++){
   const a=pipe.points[i-1],b=pipe.points[i],dx=b[0]-a[0],dy=b[1]-a[1],dz=b[2]-a[2];
   const t=Math.max(0,Math.min(1,((u-a[0])*dx+(y-a[1])*dy+(v-a[2])*dz)/(dx*dx+dy*dy+dz*dz)));
   if(Math.hypot(u-a[0]-t*dx,y-a[1]-t*dy,v-a[2]-t*dz)<pipe.radius+r)return false;
  }
  const p=MARINE_PIPE,radial=Math.hypot(u,y-this.pipeY);
  if(v+r>p.mouth&&v-r<p.end&&radial+r>p.inner&&radial-r<p.outer)return false;
  // 30m wide intake headwall with a real circular bore, not a painted circle.
  if(v+r>91.7&&v-r<93&&Math.abs(u)<15+r&&y>-18.3-r&&y< -5+r&&radial+r>p.inner)return false;
  return true;
 }
}
