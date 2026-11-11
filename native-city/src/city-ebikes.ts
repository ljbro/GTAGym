import {ImportMeshAsync,Matrix,Mesh,PBRMaterial,Quaternion,Vector3,type Scene} from '@babylonjs/core';
import {ambientSpawnAllowed,AMBIENT_SPAWN_RULES} from './ambient-spawn-policy.ts';
import type {RoadGraph} from './navigation.ts';
import {recoverStreetMotion,streetQueue,streetRejoinCursor,type StreetBody,type StreetRecovery} from './ambient-collision.ts';
import {createEbikeImpact,detectEbikeImpact,stepEbikeImpact,type EbikeImpact} from './ebike-impact.ts';
import type {ImpactCarPose} from './pedestrian-impact.ts';
/** Shenzhen e-mopeds and e-bicycles (public/city/ebikes): kerbside parking rows as thin instances,
 * plus a small pool of riders moving along the road graph near the player. Body paint, rider
 * clothing and helmets are tinted per instance from the manifest palettes. */
export type ParkedBike=[number,number,number,number,number,number]; // x, z, yaw, type, palette, lean
export type EbikeType='scooter'|'bicycle'|'delivery';
type Rider={from:number;to:number;t:number;speed:number;x:number;z:number;yaw:number;type:number;paint:number;cloth:number;helmet:number};
const BASE='/city/ebikes/';
const TYPES:EbikeType[]=['scooter','bicycle','delivery'];
export const ebikeCell=(x:number,z:number)=>Math.floor(x/80)+','+Math.floor(z/80);
/** Kerb offset for riders: right of the centreline, inside a 6 m carriageway. */
export const RIDER_KERB_OFFSET=2.15;
export class CityEbikes{
 private impacts=new Map<object,EbikeImpact>();
 impactBlocked:(x:number,z:number)=>boolean=()=>false;
 collideVehicle(before:ImpactCarPose,after:ImpactCarPose,vehicle:{width:number;length:number;height:number}){
  let hits=0,peakSpeed=0;
  for(const target of [...this.bodies(),...this.parkedBodies(before.x,before.z,40)]){
   if(this.impacts.has(target.id))continue;
   const hit=detectEbikeImpact(before,after,target,vehicle);if(!hit)continue;
   this.impacts.set(target.id,createEbikeImpact(target,hit,this.riders.some(r=>r===target.id)));hits++;peakSpeed=Math.max(peakSpeed,hit.speed);
  }
  return {hits,peakSpeed};
 }
 private recovery=new WeakMap<object,StreetRecovery>();
 obstacles:(x?:number,z?:number)=>StreetBody[]=()=>this.bodies();
 staticClear:(a:StreetBody,b:StreetBody)=>boolean=()=>true;
 body(r:Rider):StreetBody{return {id:r,x:r.x,z:r.z,y:this.heightAt(r.x,r.z),yaw:r.yaw,width:.7,length:1.9,height:1.8,kind:'bike'};}
 bodies(x?:number,z?:number){return this.riders.filter(r=>!this.impacts.has(r)&&(x===undefined||z===undefined||Math.hypot(r.x-x,r.z-z)<40)).map(r=>this.body(r));}
 parkedBodies(x:number,z:number,radius=30):StreetBody[]{
  const out:StreetBody[]=[],cx=Math.floor(x/80),cz=Math.floor(z/80),n=Math.ceil(radius/80);
  for(let i=-n;i<=n;i++)for(let j=-n;j<=n;j++)for(const b of this.cells.get((cx+i)+','+(cz+j))??[])if(!this.impacts.has(b)&&Math.hypot(b[0]-x,b[1]-z)<radius)out.push({id:b,x:b[0],z:b[1],y:this.heightAt(b[0],b[1]),yaw:b[2],width:.65,length:1.9,height:1.2,kind:'bike'});
  return out;
 }
 parked:ParkedBike[]=[];riders:Rider[]=[];palette:number[][]=[];riderPalette:number[][]=[];helmetPalette:number[][]=[];
 private cells=new Map<string,ParkedBike[]>();private proto=new Map<string,Mesh[]>();private tint=new Map<Mesh,'paint'|'cloth'|'helmet'|null>();
 private impactBounds=new Map<string,Vector3[]>();
 private lastX=Infinity;private lastZ=Infinity;private lastAerial=false;private visibleParked:ParkedBike[]=[];private origin=[1e9,1e9];
 private seed=4242;private triangles:Record<string,number>={};
 visibleCount=0;drawCalls=0;
 /** Distance to a red stop line ahead of (x,z,yaw), or null; riders hold within 5 m of it. */
 signalHold:(x:number,z:number,yaw:number)=>number|null=()=>null;
 private graph:RoadGraph|null=null;private directionAllowed:(a:number,b:number)=>boolean=()=>true;
 constructor(private scene:Scene,private heightAt:(x:number,z:number)=>number,private riderCount=18){}
 /** Riders need the road graph, which the world builds after the assets load. */
 attachGraph(graph:RoadGraph,directionAllowed:(a:number,b:number)=>boolean){this.graph=graph;this.directionAllowed=directionAllowed;}
 private random(){this.seed=(Math.imul(this.seed,1664525)+1013904223)>>>0;return this.seed/4294967296;}
 async init(){
  const [manifest,data]=await Promise.all([fetch(BASE+'manifest.json').then(r=>{if(!r.ok)throw Error('E-bike manifest unavailable');return r.json();}),fetch(BASE+'parked.json').then(r=>{if(!r.ok)throw Error('E-bike parking unavailable');return r.json();})]);
  this.palette=manifest.palette;this.riderPalette=manifest.riderPalette;this.helmetPalette=manifest.helmetPalette;this.triangles=manifest.triangles;this.parked=data.bikes;
  for(const bike of this.parked){const key=ebikeCell(bike[0],bike[1]);let cell=this.cells.get(key);if(!cell){cell=[];this.cells.set(key,cell);}cell.push(bike);}
  const asset=await ImportMeshAsync(BASE+manifest.file,this.scene);
  for(const mesh of asset.meshes){
   if(!(mesh instanceof Mesh)||!mesh.getTotalVertices())continue;
   mesh.parent=null;mesh.makeGeometryUnique();mesh.bakeTransformIntoVertices(Matrix.Scaling(1,1,-1));mesh.position.setAll(0);mesh.scaling.setAll(1);mesh.rotationQuaternion=Quaternion.Identity();
   mesh.isPickable=false;mesh.receiveShadows=true;mesh.alwaysSelectAsActiveMesh=true;mesh.setEnabled(false);
   const role=mesh.name.split('_')[0].replace(/^ebike-/,'');
   const bounds=this.impactBounds.get(role)??[];bounds.push(...mesh.getBoundingInfo().boundingBox.vectors.map(v=>v.clone()));this.impactBounds.set(role,bounds);
   if(mesh.material instanceof PBRMaterial){mesh.material.maxSimultaneousLights=3;mesh.material.enableSpecularAntiAliasing=true;mesh.material.environmentIntensity=.75;
    if(mesh.material.name.startsWith('ebike_paint'))mesh.material.roughness=.3;}
   const material=mesh.material?.name??'';
   this.tint.set(mesh,material.startsWith('ebike_paint')?'paint':material.startsWith('rider_cloth')?'cloth':material.startsWith('rider_helmet')?'helmet':null);
   let list=this.proto.get(role);if(!list){list=[];this.proto.set(role,list);}list.push(mesh);
  }
  asset.meshes[0]?.dispose(false,false);
 }
 get meshes(){return [...this.proto.values()].flat();}
 get casters(){return this.meshes;}
 /** Keep nearby riders; supplement only outside the player's protected area. */
 place(x:number,z:number){
  this.riders=this.riders.filter(r=>{const hit=this.impacts.get(r);return Math.hypot((hit?.x??r.x)-x,(hit?.z??r.z)-z)<AMBIENT_SPAWN_RULES.vehicleRetention;});
  for(const [key,hit] of this.impacts)if(Math.hypot(hit.x-x,hit.z-z)>=AMBIENT_SPAWN_RULES.vehicleRetention)this.impacts.delete(key);
  this.origin=[x,z];const graph=this.graph;if(!graph)return;
  const candidates:number[]=[];for(let i=0;i<graph.nodes.length;i++){const p=graph.nodes[i],d=Math.hypot(p[0]-x,p[1]-z);if(d>30&&d<500&&graph.edges[i].size>1)candidates.push(i);}
  candidates.sort((a,b)=>Math.hypot(graph.nodes[a][0]-x,graph.nodes[a][1]-z)-Math.hypot(graph.nodes[b][0]-x,graph.nodes[b][1]-z));
  for(let i=0;i<this.riderCount*6&&this.riders.length<this.riderCount&&candidates.length;i++){
   const from=candidates[Math.floor(this.random()*Math.min(candidates.length,i<8?40:candidates.length))],next=[...graph.edges[from].keys()].filter(to=>this.directionAllowed(from,to));if(!next.length)continue;
   const to=next[Math.floor(this.random()*next.length)],type=this.random()<.5?0:this.random()<.7?1:2;
   const paint=type===2?[9,10][Math.floor(this.random()*2)]:Math.floor(this.random()*9);
   const t=this.random(),a=graph.nodes[from],b=graph.nodes[to],yaw=Math.atan2(b[0]-a[0],b[1]-a[1]);
   const px=a[0]+(b[0]-a[0])*t+Math.cos(yaw)*RIDER_KERB_OFFSET,pz=a[1]+(b[1]-a[1])*t-Math.sin(yaw)*RIDER_KERB_OFFSET;
   if(!ambientSpawnAllowed(px,pz,x,z,'vehicle')||this.riders.some(r=>Math.hypot(r.x-px,r.z-pz)<6))continue;
   const rider={from,to,t,speed:5.5+this.random()*3.5,x:px,z:pz,yaw,type,paint,cloth:type===2?(paint===9?5:6):Math.floor(this.random()*5),helmet:type===2?(paint===9?2:3):Math.floor(this.random()*this.helmetPalette.length)};
   if(!this.staticClear(this.body(rider),this.body(rider)))continue;
   this.riders.push(rider);
  }
 }
 private step(dt:number){
  dt=Math.min(.1,Math.max(0,dt));
  const graph=this.graph;if(!graph)return;
  for(const r of this.riders){
   if(this.impacts.has(r))continue;
   const before=this.body(r),cursor={from:r.from,to:r.to,t:r.t},others=this.obstacles(r.x,r.z);let recovery=this.recovery.get(r);const initialized=!!recovery;recovery??={offsetX:0,offsetZ:0,wait:0,side:1};this.recovery.set(r,recovery);
   let a=graph.nodes[r.from],b=graph.nodes[r.to],len=Math.hypot(a[0]-b[0],a[1]-b[1]);
   const hold=this.signalHold(r.x,r.z,r.yaw),queued=streetQueue(before,others,.8);
   r.t+=dt*((hold!==null&&hold<5)||queued?0:r.speed)/Math.max(.1,len);let limit=0;
   while(r.t>=1&&limit++<12){
    r.t=(r.t-1)*len;const old=r.from;r.from=r.to;a=graph.nodes[r.from];
    const options=[...graph.edges[r.from].keys()].filter(i=>i!==old&&this.directionAllowed(r.from,i));const dx=a[0]-graph.nodes[old][0],dz=a[1]-graph.nodes[old][1];
    let best=-Infinity,next=old;for(const i of options){const p=graph.nodes[i],l=Math.hypot(p[0]-a[0],p[1]-a[1]);const score=(dx*(p[0]-a[0])+dz*(p[1]-a[1]))/Math.max(.1,len*l)+this.random()*.9;if(score>best){best=score;next=i;}}
    r.to=next;b=graph.nodes[next];len=Math.hypot(a[0]-b[0],a[1]-b[1]);r.t/=Math.max(.1,len);
   }
   const yaw=Math.atan2(b[0]-a[0],b[1]-a[1]);r.x=a[0]+(b[0]-a[0])*r.t+Math.cos(yaw)*RIDER_KERB_OFFSET;r.z=a[1]+(b[1]-a[1])*r.t-Math.sin(yaw)*RIDER_KERB_OFFSET;r.yaw=yaw;
   if(initialized){const rejoin=(p:StreetBody)=>streetRejoinCursor(graph,cursor,p,RIDER_KERB_OFFSET,this.directionAllowed);const move=recoverStreetMotion(before,this.body(r),recovery,dt,others,this.staticClear,(hold!==null&&hold<5)||(!recovery.plan&&queued),p=>!!rejoin(p));if(!move.advance)Object.assign(r,cursor);if(move.rejoin)Object.assign(r,rejoin(move.body));r.x=move.body.x;r.z=move.body.z;r.yaw=move.body.yaw;}
  }
 }
 update(dt:number,x:number,z:number,aerial=false,paused=false,playerX=x,playerZ=z){
  if(this.graph&&Math.hypot(playerX-this.origin[0],playerZ-this.origin[1])>450)this.place(playerX,playerZ);
  if(!paused){this.step(dt);for(const [source,hit] of this.impacts){stepEbikeImpact(hit,dt,this.heightAt,this.impactBlocked);if(!Array.isArray(source))Object.assign(source,{x:hit.x,z:hit.z,yaw:hit.yaw});}}
  if(aerial!==this.lastAerial||Math.hypot(x-this.lastX,z-this.lastZ)>20){
   this.lastX=x;this.lastZ=z;this.lastAerial=aerial;const radius=aerial?260:220,cap=aerial?500:700;
   const cx=Math.floor(x/80),cz=Math.floor(z/80),near:ParkedBike[]=[];
   for(let i=-3;i<=3;i++)for(let j=-3;j<=3;j++)for(const bike of this.cells.get((cx+i)+','+(cz+j))??[])if(Math.hypot(bike[0]-x,bike[1]-z)<radius)near.push(bike);
   this.visibleParked=near.length>cap?near.sort((a,b)=>Math.hypot(a[0]-x,a[1]-z)-Math.hypot(b[0]-x,b[1]-z)).slice(0,cap):near;
  }
  const scratch=new Matrix();const buffers=TYPES.map(()=>({matrices:[] as number[],paint:[] as number[]}));const rider={matrices:[] as number[],cloth:[] as number[],helmet:[] as number[]};
  for(const bike of this.visibleParked){
   const [bx,bz,yaw,type,colour,lean]=bike;
   const hit=this.impacts.get(bike);
   if(hit)scratch.copyFrom(this.impactMatrix(TYPES[type],hit.x,hit.z,hit.yaw,0,hit.roll,this.heightAt(hit.x,hit.z)+.55,.55));else Matrix.ComposeToRef(Vector3.One(),Quaternion.RotationYawPitchRoll(yaw,0,lean),new Vector3(bx,this.heightAt(bx,bz)+.01,bz),scratch);
   buffers[type].matrices.push(...scratch.asArray());buffers[type].paint.push(...this.palette[colour],1);
  }
  for(const r of this.riders){
   if(Math.hypot(r.x-x,r.z-z)>420)continue;
   const hit=this.impacts.get(r);
   if(hit)scratch.copyFrom(this.impactMatrix(TYPES[r.type],hit.x,hit.z,hit.yaw,0,hit.roll,this.heightAt(hit.x,hit.z)+.55,.55));else Matrix.ComposeToRef(Vector3.One(),Quaternion.RotationAxis(Vector3.Up(),r.yaw),new Vector3(r.x,this.heightAt(r.x,r.z)+.01,r.z),scratch);const array=scratch.asArray();
   buffers[r.type].matrices.push(...array);buffers[r.type].paint.push(...this.palette[r.paint],1);
   const fallen=hit?.rider;
   rider.matrices.push(...(fallen?this.impactMatrix('rider',fallen.x,fallen.z,fallen.ry,fallen.rx,fallen.rz,fallen.y,.9).asArray():array));rider.cloth.push(...this.riderPalette[r.cloth],1);rider.helmet.push(...this.helmetPalette[r.helmet],1);
  }
  this.visibleCount=0;this.drawCalls=0;
  TYPES.forEach((type,i)=>{this.apply(type,buffers[i].matrices,{paint:buffers[i].paint});this.visibleCount+=buffers[i].matrices.length/16;});
  this.apply('rider',rider.matrices,{cloth:rider.cloth,helmet:rider.helmet});
 }
 private impactMatrix(role:string,x:number,z:number,yaw:number,pitch:number,roll:number,y:number,pivot:number){
  const matrix=Matrix.Translation(0,-pivot,0).multiply(Matrix.Compose(Vector3.One(),Quaternion.RotationYawPitchRoll(yaw,pitch,roll),new Vector3(x,y,z)));
  let low=Infinity;
  // Keep the original mesh bounds: thinInstanceRefreshBoundingInfo replaces
  // each mesh's live box with the aggregate of all visible instances.
  for(const corner of this.impactBounds.get(role)??[])low=Math.min(low,Vector3.TransformCoordinates(corner,matrix).y);
  if(Number.isFinite(low))matrix.setTranslationFromFloats(matrix.m[12],matrix.m[13]+Math.max(0,this.heightAt(x,z)+.015-low),matrix.m[14]);
  return matrix;
 }
 private apply(role:string,matrices:number[],colours:Partial<Record<'paint'|'cloth'|'helmet',number[]>>){
  const count=matrices.length/16;
  for(const mesh of this.proto.get(role)??[]){
   if(!count){mesh.setEnabled(false);continue;}
   mesh.setEnabled(true);mesh.thinInstanceSetBuffer('matrix',new Float32Array(matrices),16,true);
   const tint=this.tint.get(mesh);const colour=tint?colours[tint]:undefined;if(colour)mesh.thinInstanceSetBuffer('color',new Float32Array(colour),4,true);
   mesh.thinInstanceRefreshBoundingInfo();this.drawCalls++;
  }
 }
 get stats(){return {parked:this.parked.length,visible:this.visibleCount,riders:this.riders.length,fallen:this.impacts.size,fallenRiders:[...this.impacts.values()].filter(b=>b.rider).length,drawCalls:this.drawCalls,triangles:Math.round(this.visibleCount*((this.triangles['ebike-scooter']??1000)))};}
 dispose(){for(const mesh of this.meshes)mesh.dispose(false,true);this.proto.clear();this.impacts.clear();this.impactBounds.clear();}
}
