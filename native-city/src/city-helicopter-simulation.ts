import {FlightSimulation,FLIGHT_RECOVERY_MS,flightBasis,flightPoint,type FlightPoint,type FlightSweep} from './city-flight-simulation.ts';
import {FLIGHT_GEAR_CLEARANCE,runwayContains} from './city-flight-ground.ts';
import {flightControls} from './city-flight-controls.ts';
const clamp=(n:number,a:number,b:number)=>Math.max(a,Math.min(b,n));

/** GTA-style collective and cyclic with rotor inertia, gravity and swept collision.
 * A running engine supplies neutral collective in the air. This is not position
 * hold: a tilted aircraft drifts; an engine-off aircraft loses lift and falls. */
export class HelicopterSimulation extends FlightSimulation{
 override kind='helicopter' as const;
 constructor(readonly model:'frogger'|'cargobob'='frogger'){super();}
 override start(point:FlightPoint,yaw:number){super.start(point,yaw);this.rotorRpm=0;this.stalled=false;}
 override step(keys:ReadonlySet<string>,dt:number,now:number,sweep:FlightSweep,extent:readonly number[]):'crashed'|'recovered'|'boundary'|null{
  if(this.phase==='idle')return null;
  if(this.phase==='exploding'){if(now-this.crashedAt>=FLIGHT_RECOVERY_MS){this.phase='idle';return 'recovered';}return null;}
  const {pitch,roll,yaw,throttle:rise,brake:descend}=flightControls(keys);
  if(rise&&!descend)this.startEngine();
  let left=clamp(dt,0,.1);
  while(left>1e-7){
   const h=Math.min(left,1/120);left-=h;const before={...this.pose},p=this.pose,v=this.velocity;
   this.stepSystems(h);
   const command=this.engineState!=='running'?0:descend?(this.onGround?0:.44):rise?1:this.onGround?0:9.81/18;
   this.throttle+=(command-this.throttle)*(1-Math.exp(-h*5));if(this.throttle<.0001)this.throttle=0;
   const spinning=this.engineState!=='off';
   this.rotorRpm+=(Number(spinning)-this.rotorRpm)*(1-Math.exp(-h*(spinning?1.2:.5)));
   const authority=this.rotorRpm**2*(this.model==='cargobob'?.8:1);
   p.pitch=clamp(p.pitch+pitch*.55*authority*h,-.55,.55);p.roll=clamp(p.roll+roll*.6*authority*h,-.55,.55);p.yaw+=yaw*.7*authority*h;
   const up=flightBasis(p).up,lift=18*this.throttle*this.rotorRpm**2,horizontal=Math.hypot(v.x,v.z);
   v.x+=(up.x*lift-v.x*(.15+horizontal*.004))*h;
   v.z+=(up.z*lift-v.z*(.15+horizontal*.004))*h;
   v.y+=(up.y*lift-9.81-v.y*.4)*h;
   if(this.onGround){
    if(v.y>0){this.onGround=false;this.groundRunwayId=null;this.takeoffs++;}
    else{v.y=0;v.x*=Math.exp(-h*8);v.z*=Math.exp(-h*8);p.pitch*=Math.exp(-h*3);p.roll*=Math.exp(-h*3);}
   }
   for(const axis of ['x','y','z'] as const)p[axis]+=v[axis]*h;
   if(this.onGround&&!this.runways.some(r=>r.id===this.groundRunwayId&&runwayContains(r,p,8)))return this.crash({point:{...p},kind:'terrain',reason:"The helicopter slides out of the safe area, Take off again from the helipad."},now);
   if(!this.onGround){
    const runway=this.runways.find(r=>runwayContains(r,p,8)&&before.y>=r.y+FLIGHT_GEAR_CLEARANCE-.05&&p.y<=r.y+FLIGHT_GEAR_CLEARANCE&&v.y<=0);
    if(runway){
     const speed=Math.hypot(v.x,v.z);this.touchdown={runwayId:runway.id,sinkSpeed:-v.y,speed,roll:p.roll,pitch:p.pitch};
     if(-v.y>3||speed>7||Math.abs(p.roll)>.2||Math.abs(p.pitch)>.2)return this.crash({point:{...p},kind:'terrain',id:runway.id,reason:"Helicopter hard landing: Keep the aircraft steady, Horizontal speed below 25 km/h, Descent rate below 3 m/s."},now);
     p.y=runway.y+FLIGHT_GEAR_CLEARANCE;v.y=0;this.onGround=true;this.groundRunwayId=runway.id;this.landings++;
    }
   }
   this.speed=Math.hypot(v.x,v.y,v.z);this.stalled=false;
   if(p.x<extent[0]+15||p.x>extent[2]-15||p.z<extent[1]+15||p.z>extent[3]-15||p.y>2100){this.phase='idle';this.pose=before;return 'boundary';}
   const cargo=this.model==='cargobob',radius=cargo?6.6:5.3,rotorY=cargo?2.2:.4;
   for(const [r,f,u] of [[0,cargo?8:3,0],[0,cargo?-11:-6,0],[-1,0,-1.7],[1,0,-1.7],[-radius,0,rotorY],[radius,0,rotorY],[0,radius,rotorY],[0,-radius,rotorY]]){
    const hit=sweep(flightPoint(before,r,f,u),flightPoint(p,r,f,u));if(hit)return this.crash(hit,now);
   }
   const rotorHit=sweep(flightPoint(p,-radius,0,rotorY),flightPoint(p,radius,0,rotorY));if(rotorHit)return this.crash(rotorHit,now);
   this.lastSafe={...p};
  }
  return null;
 }
}
