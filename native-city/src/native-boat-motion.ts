import {NativeWaterMotion,waterRegionContains,diveFloor,type NativeWaterSpec} from './native-water-motion.ts';
import {NativeBeachTerrain,type BeachEnvironment} from './native-beach-terrain.ts';
import {linkPosition,walkTraversalPose,type WalkLink} from './native-walk-traversal.ts';
import {WATERCRAFT,type WatercraftKind} from './native-watercraft-spec.ts';
import {smallBoatBoardingPlan} from './native-boat-boarding.ts';
export type BoatSpec=NativeWaterSpec&{objective:string;craft?:WatercraftKind;startAboard?:boolean;boatSpawn?:number[];shoreSegments?:number[][][];channelHalfWidth?:number};
export const YACHT={halfLength:5.35,halfWidth:1.65,boardingOffset:6.6,platformZ:-4.7,platformHeight:.575};
const clamp=(v:number,a:number,b:number)=>Math.max(a,Math.min(b,v));
export function boatPoint(boat:{x:number;z:number;yaw:number},u:number,v:number){return {x:boat.x+Math.cos(boat.yaw)*u+Math.sin(boat.yaw)*v,z:boat.z-Math.sin(boat.yaw)*u+Math.cos(boat.yaw)*v};}
export class NativeBoatMotion{
 readonly swimmer:NativeWaterMotion;readonly boat:{x:number;z:number;yaw:number;speed:number};
 readonly beach:NativeBeachTerrain|null;
 mode:'swim'|'boarding'|'boat'|'leaving'='swim';time=0;cameraOrbit=0;cameraPitch=.23;boarded=false;
 get fit(){return WATERCRAFT[this.spec.craft??'yacht'];}
 private transition:{link:WalkLink;t:number}|null=null;private spawnBoat:{x:number;z:number;yaw:number;speed:number};
 private helmTransfer:{t:number;entering:boolean}|null=null;
 private boardingSide=-1;
 private approach:{points:{x:number;z:number}[];index:number}|null=null;
 get boardingApproach(){return this.approach!==null;}
 private get assistedBoarding(){return this.spec.objective==='shore-transfer'&&this.spec.craft==='zodiac';}
 private get platformLocal(){return this.assistedBoarding?[this.boardingSide*Math.abs(this.fit.platform[0]),this.fit.platform[1]]:this.fit.platform;}
 constructor(readonly spec:BoatSpec,private sea:(x:number,z:number)=>boolean,env?:Omit<BeachEnvironment,'land'>){
  if(spec.objective==='drive-ashore'&&(!env||!spec.shoreSegments?.length))throw Error("The task of reaching shore lacks actual shoreline slope and collision data");
  this.beach=spec.objective==='drive-ashore'?new NativeBeachTerrain({...spec,shoreSegments:spec.shoreSegments!},{...env!,land:(x,z)=>!sea(x,z)}):null;
  const at=spec.boatSpawn??(spec.startAboard||spec.objective==='board-then-drive'?spec.path.points[0]:spec.path.points.at(-1)!);
  const yaw=Math.atan2(spec.path.forward[0],spec.path.forward[1]);
  const offset=boatPoint({x:0,z:0,yaw},this.fit.boarding[0],this.fit.boarding[1]);
  this.boat={x:at[0]-(spec.startAboard?0:offset.x),z:at[1]-(spec.startAboard?0:offset.z),yaw,speed:0};this.spawnBoat={...this.boat};
  this.swimmer=new NativeWaterMotion({...spec,entrance:false},(x,z,depth)=>sea(x,z)&&!this.hullBlocks(x,z,depth),(x,z)=>this.beach?.at(x,z)??diveFloor(spec,x,z));
  if(spec.startAboard){this.mode='boat';this.boarded=true;}
 }
 navigationClear(x:number,z:number){return waterRegionContains(this.spec,x,z)&&(this.beach?this.beach.clear(x,z):this.sea(x,z));}
 hullBlocks(x:number,z:number,depth=0){const dx=x-this.boat.x,dz=z-this.boat.z,c=Math.cos(this.boat.yaw),s=Math.sin(this.boat.yaw),u=c*dx-s*dz,v=s*dx+c*dz;
  return depth<1.2&&Math.abs(u)<this.fit.halfWidth+.23&&Math.abs(v)<this.fit.length/2+.23;
 }
 get body(){return this.beach?.support(this.boat.x,this.boat.z,this.boat.yaw,this.fit.length,this.fit.halfWidth*2,this.fit.waterline)??{bottomY:this.spec.waterHeight-this.fit.waterline,pitch:0,grounded:false};}
 get platform(){const body=this.body,[u,v]=this.platformLocal,h=this.fit.waterline+this.fit.platformHeight;return {...boatPoint(this.boat,u,v*Math.cos(body.pitch)-h*Math.sin(body.pitch)),y:body.bottomY+h*Math.cos(body.pitch)+v*Math.sin(body.pitch)};}
 /** Separate boarding platform from the helm. Controls stay locked until seated. */
 get deckTransfer(){
  if(!this.helmTransfer)return null;
  const q=this.helmTransfer.entering?this.helmTransfer.t:1-this.helmTransfer.t,fit=this.fit;
  const seat=fit.driver,start=[this.platformLocal[0],fit.waterline+fit.platformHeight,this.platformLocal[1]],feet=[seat[0]-.5,seat[1]-(this.spec.craft==='zodiac'?.26:.46),seat[2]];
  const points=this.spec.craft==='zodiac'?[start,[-.12,feet[1],feet[2]],feet]:[start,[0,1.28,-3.3],[0,1.16,-1.6],[feet[0],feet[1],-1.6],feet];
  const f=Math.min(1,q/.8)*(points.length-1),i=Math.min(points.length-2,Math.floor(f)),t=f-i,a=points[i],b=points[i+1],local=a.map((v,k)=>v+(b[k]-v)*t);
  const blend=clamp((q-.8)/.2,0,1);if(q>=.8)local[0]=seat[0]-.5*(1-blend);
  return {local,seated:q>=.8,blend,yaw:this.boat.yaw+(q>=.8?0:Math.atan2(b[0]-a[0],b[2]-a[2])+(this.helmTransfer.entering?0:Math.PI))};
 }
 get boardingPoint(){return boatPoint(this.boat,this.assistedBoarding?this.boardingSide*Math.abs(this.fit.boarding[0]):this.fit.boarding[0],this.fit.boarding[1]);}
 private get deckPosition(){const d=this.deckTransfer;if(!d)return null;const [u,h,v]=d.local,b=this.body;return {...boatPoint(this.boat,u,v*Math.cos(b.pitch)-h*Math.sin(b.pitch)),y:b.bottomY+h*Math.cos(b.pitch)+v*Math.sin(b.pitch)};}
 get transitionPose(){if(!this.transition)return null;const {link,t}=this.transition;return walkTraversalPose(link,t,linkPosition(link,t),Math.atan2(link.to.x-link.from.x,link.to.z-link.from.z));}
 get x(){return this.deckPosition?.x??this.transitionPose?.physicalPosition.x??(this.mode==='boat'?this.boat.x:this.swimmer.x);}
 get z(){return this.deckPosition?.z??this.transitionPose?.physicalPosition.z??(this.mode==='boat'?this.boat.z:this.swimmer.z);}
 get y(){return this.deckPosition?.y??this.transitionPose?.physicalPosition.y??(this.mode==='boat'?this.platform.y:this.swimmer.y);}
 get yaw(){return this.mode==='swim'?this.swimmer.yaw:this.boat.yaw;}
 get speed(){return this.mode==='boat'?this.boat.speed:this.swimmer.speed;}
 reset(){this.mode=this.spec.startAboard?'boat':'swim';this.boarded=!!this.spec.startAboard;this.transition=null;this.helmTransfer=null;this.approach=null;this.boardingSide=-1;this.time=0;this.cameraOrbit=0;this.cameraPitch=.23;Object.assign(this.boat,this.spawnBoat);this.swimmer.reset();}
 look(dx:number,dy:number){if(this.mode==='swim')this.swimmer.look(dx,dy);else{this.cameraOrbit+=dx*.004;this.cameraPitch=clamp(this.cameraPitch+dy*.003,-.15,.8);}}
 interact():string{
  if(this.transition||this.helmTransfer||this.approach)return "Approaching the side of the vessel, Board the Boat or Enter the Water, Please wait for the action to finish";
  if(this.mode==='swim'){
   if(this.assistedBoarding){
    if(this.swimmer.depth>.5)return "Rise to the surface first, Then press F Board the boat";
    if(Math.abs(this.boat.speed)>.6)return "Wait until the boat stops completely before boarding";
    const dx=this.swimmer.x-this.boat.x,dz=this.swimmer.z-this.boat.z,c=Math.cos(this.boat.yaw),s=Math.sin(this.boat.yaw);
    const plan=smallBoatBoardingPlan(c*dx-s*dz,s*dx+c*dz,this.fit.halfWidth,this.fit.length/2);
    if(!plan)return "Approach the hull of the small boat, Then press F Board the boat";
    const points=plan.points.map(([u,v])=>boatPoint(this.boat,u,v));
    // Reject approaches obstructed by land, platforms or the actual hull.
    let a={x:this.swimmer.x,z:this.swimmer.z};
    for(const b of points){const n=Math.max(1,Math.ceil(Math.hypot(b.x-a.x,b.z-a.z)/.1));for(let i=1;i<=n;i++)if(!this.swimmer.clear(a.x+(b.x-a.x)*i/n,a.z+(b.z-a.z)*i/n,0))return "This side is blocked, Please board from the other side";a=b;}
    this.boardingSide=plan.side;
    const end=points.at(-1)!;
    if(points.length===1&&Math.hypot(this.swimmer.x-end.x,this.swimmer.z-end.z)<=.75)this.beginBoarding();
    else this.approach={points,index:0};
    return "Approaching the side and boarding";
   }
   const p=this.boardingPoint;
   if(Math.hypot(this.swimmer.x-p.x,this.swimmer.z-p.z)>(this.spec.craft==='yacht'||!this.spec.craft?1.9:.75))return this.spec.craft==='jetski'?"Swim to the left side of the jet ski, Then press F":this.spec.craft==='zodiac'?"Swim alongside the left side of the boat, Then press F":"Swim to the stern boarding platform, Then press F";
   if(this.swimmer.depth>.35)return "Rise to the surface first, Then press F Board the boat";
   if(Math.abs(this.boat.speed)>.6)return "Wait until the boat stops completely before boarding";
   this.beginBoarding();return this.spec.craft==='zodiac'?"Climbing over the side to board the boat":"Boarding from the stern platform";
  }
  if(Math.abs(this.boat.speed)>.6)return "Come to a full stop first, Then press F Enter water";
  const p=this.boardingPoint;if(!this.sea(p.x,p.z))return "There is no safe water to enter behind the boat";
  if(this.beach&&(this.body.grounded||this.beach.at(p.x,p.z)>this.spec.waterHeight-1.5))return "Too Shallow Here, Do not enter the water from the stern; Reverse into deep water and come to a stop before pressing F";
  this.mode='leaving';if(this.spec.craft!=='jetski')this.helmTransfer={t:0,entering:false};else this.beginLeaving();return this.spec.craft==='zodiac'?"Entering the water over the side of the small boat":"Entering the water from the stern";
 }
 private beginBoarding(){
  const from={x:this.swimmer.x,y:this.spec.waterHeight-this.swimmer.depth-1.28,z:this.swimmer.z},to=this.platform;
  this.swimmer.speed=0;this.swimmer.verticalSpeed=0;
  this.transition={link:{id:(this.spec.craft??'yacht')+'-board',kind:'climb',from,to,top:this.spec.waterHeight+this.fit.railHeight,duration:2.1},t:0};this.mode='boarding';
 }
 private beginLeaving(){const p=this.boardingPoint;this.transition={link:{id:(this.spec.craft??'yacht')+'-disembark',kind:'climb',from:this.platform,to:{...p,y:this.spec.waterHeight-1.28},top:this.spec.waterHeight+this.fit.railHeight,duration:1.8},t:0};}
 private boatClear(x:number,z:number,yaw:number){
  for(const u of [-this.fit.halfWidth,0,this.fit.halfWidth])for(const v of [-this.fit.length/2,0,this.fit.length/2]){
   const p=boatPoint({x,z,yaw},u,v);
   if(!waterRegionContains(this.spec,p.x,p.z)||(this.beach?!this.beach.clear(p.x,p.z):!this.sea(p.x,p.z)))return false;
  }return true;
 }
 step(keys:ReadonlySet<string>,dt:number){
  dt=clamp(dt,0,.25);if(!dt)return;this.time+=dt;
  if(this.approach){
   const a=this.approach,p=a.points[a.index],w=this.swimmer,dx=p.x-w.x,dz=p.z-w.z,d=Math.hypot(dx,dz),step=Math.min(d,2.4*dt),t=d>0?step/d:1,x=w.x+dx*t,z=w.z+dz*t;
   if(!this.swimmer.clear(x,z,w.depth)){this.approach=null;w.speed=0;return;}
   w.x=x;w.z=z;w.speed=step/dt;w.verticalSpeed=0;
   if(d>.001){const desired=Math.atan2(dx,dz),delta=Math.atan2(Math.sin(desired-w.yaw),Math.cos(desired-w.yaw));w.yaw+=clamp(delta,-3*dt,3*dt);}
   if(d-step<.001&&++a.index===a.points.length){this.approach=null;this.beginBoarding();}return;
  }
  if(this.helmTransfer){const h=this.helmTransfer;h.t=Math.min(1,h.t+dt/2.6);if(h.t===1){this.helmTransfer=null;if(h.entering){this.mode='boat';this.boarded=true;}else this.beginLeaving();}return;}
  if(this.transition){this.transition.t=Math.min(1,this.transition.t+dt/this.transition.link.duration);
   if(this.transition.t===1){if(this.mode==='boarding'){if(this.spec.craft==='jetski'){this.mode='boat';this.boarded=true;}else this.helmTransfer={t:0,entering:true};}else{const p=this.boardingPoint;this.swimmer.x=p.x;this.swimmer.z=p.z;this.swimmer.depth=0;this.swimmer.yaw=this.boat.yaw+Math.PI;this.mode='swim';}this.transition=null;}return;}
  if(this.mode==='swim'){this.swimmer.step(keys,dt);return;}
  let remaining=dt;while(remaining>1e-8){const s=Math.min(.025,remaining);remaining-=s;
   const throttle=(keys.has('KeyW')?1:0)-(keys.has('KeyS')?1:0),steer=(keys.has('KeyD')?1:0)-(keys.has('KeyA')?1:0),brake=keys.has('Space');
   const jetski=this.spec.craft==='jetski';
   const desired=brake?0:throttle*(throttle<0?2:this.beach&&this.body.grounded?2.5:jetski?16:8),rate=brake?(jetski?6:5):throttle?(jetski?3:2):1.2;
   this.boat.speed+=clamp(desired-this.boat.speed,-rate*s,rate*s);
   const yaw=this.boat.yaw+steer*s*.85*Math.min(1,Math.abs(this.boat.speed)/2)*Math.sign(this.boat.speed),x=this.boat.x+Math.sin(yaw)*this.boat.speed*s,z=this.boat.z+Math.cos(yaw)*this.boat.speed*s;
   if(this.boatClear(x,z,yaw)){Object.assign(this.boat,{x,z,yaw});}else this.boat.speed=0;
   this.look(((keys.has('ArrowRight')?1:0)-(keys.has('ArrowLeft')?1:0))*s*250,((keys.has('ArrowDown')?1:0)-(keys.has('ArrowUp')?1:0))*s*150);
  }
 }
 canFinish(){
  const end=this.spec.path.points.at(-1)!,near=Math.hypot(this.x-end[0],this.z-end[1]);
  if(this.spec.objective==='swim-to-boat')return this.mode==='swim'&&this.swimmer.depth<.35&&near<=2.5;
  if(this.spec.objective==='swim-then-board')return this.mode==='boat'&&this.boarded;
  if(this.spec.objective==='drive-ashore')return this.mode==='boat'&&this.boarded&&near<=7&&!!this.beach&&this.body.grounded&&[-1,1].every(a=>[-1,1].every(b=>{const p=boatPoint(this.boat,a*this.fit.halfWidth,b*this.fit.length/2);return this.beach!.env.land(p.x,p.z);}));
  return this.mode==='boat'&&this.boarded&&near<=7;
 }
}
