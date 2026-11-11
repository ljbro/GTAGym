import {CityWalk} from './city-walk.ts';import {NativeWaterMotion,waterLocal,waterWorld,waterRegionContains,type NativeWaterSpec} from './native-water-motion.ts';
const clamp=(x:number,a:number,b:number)=>Math.max(a,Math.min(b,x));
export type ShoreEnvironment={land:(x:number,z:number)=>boolean;heightAt:(x:number,z:number)=>number;blocked:(x:number,z:number)=>boolean};
/** Sample the actual city shoreline, not a single imaginary straight boundary. */
export class ShoreFloor{
 private profile:{v:number;y:number}[]=[];
 constructor(readonly spec:NativeWaterSpec,private env:ShoreEnvironment){
  for(let u=-20;u<=20;u++){
   let low=45,high=spec.path.length;if(env.land(...waterWorld(spec,u,low))||!env.land(...waterWorld(spec,u,high)))throw Error("The bank slope does not match the native coastline");
   for(let j=0;j<20;j++){const mid=(low+high)/2;if(env.land(...waterWorld(spec,u,mid)))high=mid;else low=mid;}
   const [x,z]=waterWorld(spec,u,high+.5),y=env.heightAt(x,z)+.035;if(!Number.isFinite(y)||y<spec.waterHeight)throw Error("Invalid shoreline ground height");this.profile.push({v:high,y});
  }
 }
 at=(x:number,z:number)=>{
  const [u,v]=waterLocal(this.spec,x,z),i=clamp(u+20,0,40),a=this.profile[Math.floor(i)],b=this.profile[Math.min(40,Math.floor(i)+1)],t=i-Math.floor(i),edge=a.v+(b.v-a.v)*t,top=a.y+(b.y-a.y)*t;
  if(v>=edge)return this.env.heightAt(x,z)+.035;
  const q=clamp((v-edge+35)/35,0,1),smooth=q*q*(3-2*q);return this.spec.waterHeight-3+(top-this.spec.waterHeight+3)*smooth;
 };
}
export class NativeShoreMotion{
 readonly floor:ShoreFloor;readonly swimmer:NativeWaterMotion;readonly walker:CityWalk;mode:'swim'|'walk'='swim';
 constructor(readonly spec:NativeWaterSpec,private env:ShoreEnvironment,private startOnLand=false){
  this.floor=new ShoreFloor(spec,env);
  this.swimmer=new NativeWaterMotion(spec,(x,z)=>this.allowed(x,z)&&this.floor.at(x,z)<spec.waterHeight-1.25,this.floor.at);
  this.walker=new CityWalk((x,z)=>!this.allowed(x,z),this.floor.at);
  this.resetSpawn();
 }
 navigationClear(x:number,z:number){return this.allowed(x,z);}
 private allowed(x:number,z:number){const [u,v]=waterLocal(this.spec,x,z);return (this.spec.freeRoamRegion?waterRegionContains(this.spec,x,z):Math.abs(u)<15&&v>=-12&&v<=this.spec.path.length+12)&&!this.env.blocked(x,z);}
 get x(){return this.mode==='swim'?this.swimmer.x:this.walker.x;}
 get z(){return this.mode==='swim'?this.swimmer.z:this.walker.z;}
 get y(){return this.mode==='swim'?this.swimmer.y:this.walker.feetY;}
 get yaw(){return this.mode==='swim'?this.swimmer.yaw:this.walker.yaw;}
 get pitch(){return this.mode==='swim'?this.swimmer.pitch:this.walker.pitch;}
 get speed(){return this.mode==='swim'?this.swimmer.speed:this.walker.speed;}
 get depth(){return this.mode==='swim'?this.swimmer.depth:Math.max(0,this.spec.waterHeight-this.walker.feetY);}
 look(dx:number,dy:number){(this.mode==='swim'?this.swimmer:this.walker).look(dx,dy);}
 private resetSpawn(){this.mode=this.startOnLand?'walk':'swim';this.swimmer.reset();const w=this.walker;w.active=this.startOnLand;
  [w.x,w.z]=this.startOnLand?this.spec.path.points.at(-1)!:[this.swimmer.x,this.swimmer.z];
  w.yaw=this.swimmer.yaw+(this.startOnLand?Math.PI:0);w.pitch=.2;w.resetMotion();
 }
 reset(){this.resetSpawn();}
 step(keys:ReadonlySet<string>,dt:number){
  let left=clamp(dt,0,.25);while(left>1e-8){const s=Math.min(.025,left);left-=s;
   if(this.mode==='swim'){
    this.swimmer.step(keys,s);
    if(this.swimmer.depth<.08&&this.floor.at(this.x,this.z)>=this.spec.waterHeight-1.45){const w=this.walker;w.x=this.x;w.z=this.z;w.yaw=this.yaw;w.pitch=this.pitch;w.active=true;w.resetMotion();this.mode='walk';}
   }else{
    const walkingKeys=new Set(keys);
    // Deep wading is not land sprinting: keep the existing walk cycle/speed
    // until feet are almost out of the water.
    if(this.spec.waterHeight-this.floor.at(this.x,this.z)>.2){walkingKeys.delete('ShiftLeft');walkingKeys.delete('ShiftRight');}
    this.walker.step(walkingKeys,s);
    if(!this.walker.airborne&&this.floor.at(this.x,this.z)<this.spec.waterHeight-1.65){const w=this.swimmer;w.x=this.x;w.z=this.z;w.yaw=this.yaw;w.pitch=this.pitch;w.depth=0;this.mode='swim';this.walker.active=false;}
   }
  }
 }
 canFinish(){const end=this.spec.path.points.at(-1)!;return this.mode==='walk'&&!this.walker.airborne&&!this.walker.traversing&&this.env.land(this.x,this.z)&&this.walker.feetY>this.spec.waterHeight+.05&&Math.hypot(this.x-end[0],this.z-end[1])<2.5;}
}
