import {DynamicInstances} from './dynamic-instances.ts';
import {ambientSpawnAllowed,AMBIENT_SPAWN_RULES} from './ambient-spawn-policy.ts';
import {Mesh,Matrix,Vector3,Quaternion,PBRMaterial,Color3,type AbstractMesh,type Scene} from '@babylonjs/core';
import type {RoadGraph} from './navigation.ts';
import {recoverStreetMotion,streetQueue,streetRejoinCursor,type StreetBody,type StreetRecovery} from './ambient-collision.ts';
import {trafficWheel,trafficWheelMatrix,trafficWheelTravel} from './traffic-appearance.ts';
import {prepareTrafficDoorTemplates} from './traffic-door-templates.ts';
export type TrafficCar={from:number;to:number;t:number;speed:number;x:number;z:number;yaw:number;group:number;actualSpeed?:number;parked?:boolean;mission?:string;wheelTravel?:number};
export class CityTraffic{
 private instances=new DynamicInstances();
 private recovery=new WeakMap<object,StreetRecovery>();
 obstacles:(x?:number,z?:number)=>StreetBody[]=()=>this.bodies();
 staticClear:(a:StreetBody,b:StreetBody)=>boolean=()=>true;
 body(c:typeof this.cars[number]):StreetBody{return {id:c,x:c.x,z:c.z,y:this.heightAt(c.x,c.z),yaw:c.yaw,width:2.1,length:4.9,height:1.65,kind:'car'};}
 bodies(x?:number,z?:number){return this.cars.filter(c=>x===undefined||z===undefined||Math.hypot(c.x-x,c.z-z)<40).map(c=>this.body(c));}
 cars:TrafficCar[]=[];meshes:Mesh[][]=[];seed=77;
 park(p:{x:number;z:number;yaw:number;group:number},mission?:string){
  const from=this.graph.nearest([p.x,p.z]),to=[...this.graph.edges[from].keys()][0]??from;
  const car:TrafficCar={...p,from,to,t:0,speed:0,actualSpeed:0,parked:true,mission};this.cars.push(car);return car;
 }
 removeMission(mission:string){this.cars=this.cars.filter(c=>c.mission!==mission);}
 take(car:TrafficCar){const i=this.cars.indexOf(car);if(i<0)return false;this.cars.splice(i,1);this.recovery.delete(car);return true;}
 /** Distance to a red stop line ahead of (x,z,yaw), or null; cars hold within 6 m of it. */
 signalHold:(x:number,z:number,yaw:number)=>number|null=()=>null;
 random(){this.seed=(Math.imul(this.seed,1664525)+1013904223)>>>0;return this.seed/4294967296;}
 constructor(public graph:RoadGraph,source:AbstractMesh[],public scene:Scene,public heightAt:(x:number,z:number)=>number=()=>0,public directionAllowed:(a:number,b:number)=>boolean=()=>true,alternateSource:AbstractMesh[]=source){
  const colors=[new Color3(.64,.69,.73),new Color3(.24,.035,.022),new Color3(.028,.25,.18)];
  for(let i=0;i<3;i++){const group:Mesh[]=[];for(const src of i===2?alternateSource:source){if(!(src instanceof Mesh))continue;const m=src.clone('traffic-'+i+'-'+src.name,null,true)!;m.parent=null;m.unfreezeWorldMatrix();m.makeGeometryUnique();m.bakeTransformIntoVertices(Matrix.Scaling(1,1,-1));m.position.setAll(0);m.scaling.setAll(1);m.rotationQuaternion=Quaternion.Identity();m.alwaysSelectAsActiveMesh=true;m.receiveShadows=true;m.isPickable=false;if(src.material instanceof PBRMaterial&&src.material.name==='carpaint'){const mat=src.material.clone('traffic-paint-'+i)!;mat.albedoColor=colors[i];mat.clearCoat.isEnabled=true;mat.clearCoat.intensity=.7;mat.clearCoat.roughness=.18;m.material=mat;}m.setEnabled(false);group.push(m);}this.meshes.push(prepareTrafficDoorTemplates(group,scene));}
 }
 place(x:number,z:number){
  // Streaming must not replace visible cars or discard their collision recovery.
  this.cars=this.cars.filter(c=>c.mission||Math.hypot(c.x-x,c.z-z)<AMBIENT_SPAWN_RULES.vehicleRetention);
  const candidates:number[]=[];for(let i=0;i<this.graph.nodes.length;i++){const p=this.graph.nodes[i],d=Math.hypot(p[0]-x,p[1]-z);if(d>=AMBIENT_SPAWN_RULES.vehicleDistance&&d<600&&this.graph.edges[i].size>1)candidates.push(i);}
  candidates.sort((a,b)=>Math.hypot(this.graph.nodes[a][0]-x,this.graph.nodes[a][1]-z)-Math.hypot(this.graph.nodes[b][0]-x,this.graph.nodes[b][1]-z));
  for(let i=0;i<120&&this.cars.length<40&&candidates.length;i++){
   const from=candidates[Math.floor(this.random()*Math.min(candidates.length,i<10?45:candidates.length))],next=[...this.graph.edges[from].keys()].filter(to=>this.directionAllowed(from,to));if(!next.length)continue;
   const to=next[Math.floor(this.random()*next.length)],a=this.graph.nodes[from],b=this.graph.nodes[to],yaw=Math.atan2(b[0]-a[0],b[1]-a[1]);
   const px=a[0]+Math.cos(yaw)*1.15,pz=a[1]-Math.sin(yaw)*1.15;
   if(!ambientSpawnAllowed(px,pz,x,z,'vehicle')||this.cars.some(c=>Math.hypot(c.x-px,c.z-pz)<12))continue;
   const car={from,to,t:0,speed:7+this.random()*6,x:px,z:pz,yaw,group:i%3};
   if(!this.staticClear(this.body(car),this.body(car)))continue;
   this.cars.push(car);
  }this.origin=[x,z];this.update(0,x,z);
 }
 origin=[0,0];
 snap(index:number,x:number,z:number,yaw:number){
  const car=this.cars[index];if(!car)return;
  car.x=x;car.z=z;car.yaw=yaw;
  this.renderCars();
 }
 private renderCars(px?:number,pz?:number){
  for(let group=0;group<this.meshes.length;group++){
   const cars=this.cars.filter(c=>c.group===group&&(px===undefined||pz===undefined||Math.hypot(c.x-px,c.z-pz)<=950));
   const roots=cars.map(c=>Matrix.Compose(Vector3.One(),Quaternion.RotationAxis(Vector3.Up(),c.yaw),new Vector3(c.x,this.heightAt(c.x,c.z)+.105,c.z)));
   const body=roots.flatMap(m=>Array.from(m.asArray()));
   for(const mesh of this.meshes[group]){const wheel=trafficWheel(mesh);this.instances.update(mesh,wheel?roots.flatMap((m,i)=>Array.from(trafficWheelMatrix(wheel,cars[i].wheelTravel??0).multiply(m).asArray())):body);}
  }
 }
 update(dt:number,px:number,pz:number){dt=Math.min(.1,Math.max(0,dt));if(Math.hypot(px-this.origin[0],pz-this.origin[1])>450){this.place(px,pz);return;}for(const c of this.cars){if(c.parked){c.actualSpeed=0;continue;}const before=this.body(c),cursor={from:c.from,to:c.to,t:c.t},others=this.obstacles(c.x,c.z);let recovery=this.recovery.get(c);const initialized=!!recovery;recovery??={offsetX:0,offsetZ:0,wait:0,side:1};this.recovery.set(c,recovery);let a=this.graph.nodes[c.from],b=this.graph.nodes[c.to],len=Math.hypot(a[0]-b[0],a[1]-b[1]);const hold=this.signalHold(c.x,c.z,c.yaw);const blocked=(hold!==null&&hold<6)||streetQueue(before,others);c.t+=dt*(blocked?0:c.speed)/Math.max(.1,len);let limit=0;
   while(c.t>=1&&limit++<12){c.t=(c.t-1)*len;const old=c.from;c.from=c.to;a=this.graph.nodes[c.from];const options=[...this.graph.edges[c.from].keys()].filter(i=>i!==old&&this.directionAllowed(c.from,i));const dx=a[0]-this.graph.nodes[old][0],dz=a[1]-this.graph.nodes[old][1];let best=-Infinity,next=old;for(const i of options){const p=this.graph.nodes[i],l=Math.hypot(p[0]-a[0],p[1]-a[1]);const score=(dx*(p[0]-a[0])+dz*(p[1]-a[1]))/(Math.max(.1,len*l))+this.random()*.7;if(score>best){best=score;next=i;}}c.to=next;b=this.graph.nodes[next];len=Math.hypot(a[0]-b[0],a[1]-b[1]);c.t/=Math.max(.1,len);}
   const yaw=Math.atan2(b[0]-a[0],b[1]-a[1]);c.x=a[0]+(b[0]-a[0])*c.t+Math.cos(yaw)*1.15;c.z=a[1]+(b[1]-a[1])*c.t-Math.sin(yaw)*1.15;c.yaw=yaw;
   if(initialized){const rejoin=(p:StreetBody)=>streetRejoinCursor(this.graph,cursor,p,1.15,this.directionAllowed);const move=recoverStreetMotion(before,this.body(c),recovery,dt,others,this.staticClear,recovery.plan?(hold!==null&&hold<6):blocked,p=>!!rejoin(p));if(!move.advance)Object.assign(c,cursor);if(move.rejoin)Object.assign(c,rejoin(move.body));c.x=move.body.x;c.z=move.body.z;c.yaw=move.body.yaw;}
   if(dt>0)c.actualSpeed=Math.hypot(c.x-before.x,c.z-before.z)/dt;if(initialized)c.wheelTravel=(c.wheelTravel??0)+trafficWheelTravel(before,c,dt);}
  this.renderCars(px,pz);
 }
}
