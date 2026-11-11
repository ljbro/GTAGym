/** Contact-driven procedural car entry/exit. Simulation time only. */
export type VehiclePoint={x:number;y:number;z:number;yaw:number};
type Point={x:number;y:number;z:number};
export type VehicleFit={width:number;height:number;seatZ:number};
export type VehiclePoseFrame={leftFoot:Point;rightFoot:Point;leftHand:Point;rightHand:Point;sink:number;lean:number;footYaw:number};
export type VehicleInteraction={kind:'enter'|'exit';car:VehiclePoint;from:VehiclePoint;door:VehiclePoint;side:number;elapsed:number;approachSeconds:number;fit:VehicleFit};
export const VEHICLE_INTERACTION_SECONDS=2.6;
export const VEHICLE_APPROACH_SPEED=1.6;
const smooth=(v:number)=>{const t=Math.max(0,Math.min(1,v));return t*t*(3-2*t);};
const mix=(a:number,b:number,t:number)=>a+(b-a)*t;
const angle=(a:number,b:number,t:number)=>a+Math.atan2(Math.sin(b-a),Math.cos(b-a))*t;
const blend=(a:Point,b:Point,t:number):Point=>({x:mix(a.x,b.x,t),y:mix(a.y,b.y,t),z:mix(a.z,b.z,t)});
export function createVehicleInteraction(kind:'enter'|'exit',car:VehiclePoint,from:VehiclePoint,door:VehiclePoint,fit:VehicleFit={width:2.1,height:1.45,seatZ:.2}):VehicleInteraction{
 const side=Math.sign((door.x-car.x)*Math.cos(car.yaw)-(door.z-car.z)*Math.sin(car.yaw))||1;
 return {kind,car:{...car},from:{...from},door:{...door},side,fit:{...fit},elapsed:0,approachSeconds:kind==='enter'?Math.hypot(door.x-from.x,door.z-from.z)/VEHICLE_APPROACH_SPEED:0};
}
export function sampleVehicleInteraction(v:VehicleInteraction){
 // Compare the same absolute deadline used by stepVehicleInteraction's clamp.
 // Subtracting an arbitrary approach duration can round 2.6 down by one ULP,
 // leaving a fully played animation permanently unable to hand over control.
 const complete=v.elapsed>=v.approachSeconds+VEHICLE_INTERACTION_SECONDS;
 const t=complete?VEHICLE_INTERACTION_SECONDS:Math.max(0,v.elapsed-v.approachSeconds),enter=v.kind==='enter',approaching=v.elapsed<v.approachSeconds;
 // Reverse the same contact path for exiting; feet are planted before rising.
 const q=enter?t:Math.max(0,VEHICLE_INTERACTION_SECONDS-t);
 const doorOpen=approaching?0:q<.45?smooth(q/.45):1-smooth((q-2.05)/.55);
 const seated=smooth((q-.75)/1.05),duck=smooth((q-.4)/.4),lead=smooth((q-.65)/.85),trail=smooth((q-1.25)/.8);
 const phase=approaching?'approach':t<.45?'opening':t<(enter?2.05:2.15)?'passing':'closing';
 const c=Math.cos(v.car.yaw),s=Math.sin(v.car.yaw),side=v.side,inwardYaw=v.car.yaw-side*Math.PI/2;
 const local=(x:number,y:number,z:number):Point=>({x:v.car.x+c*x+s*z,y:v.car.y+y,z:v.car.z-s*x+c*z});
 const doorX=(v.door.x-v.car.x)*c-(v.door.z-v.car.z)*s,doorZ=(v.door.x-v.car.x)*s+(v.door.z-v.car.z)*c;
 const seatX=side*.48,seatZ=v.fit.seatZ,seatHeight=Math.max(.48,Math.min(.83,v.fit.height-.82));
 const anchor=blend(v.door,local(seatX,0,seatZ),seated);
 const yaw=angle(inwardYaw,v.car.yaw,smooth((q-.8)/.9));
 const pose:VehiclePoint={...anchor,yaw:enter?yaw:angle(yaw,v.car.yaw,smooth((t-2.05)/.55))};
 if(approaching){
  const fraction=v.elapsed/(v.approachSeconds||1),walkingYaw=Math.atan2(v.door.x-v.from.x,v.door.z-v.from.z);
  Object.assign(pose,blend(v.from,v.door,fraction),{yaw:angle(angle(v.from.yaw,walkingYaw,smooth(v.elapsed/.2)),inwardYaw,smooth((fraction-.7)/.3))});
 }
 const foot=(first:boolean)=>{
  const progress=first?lead:trail;
  const out=local(doorX,0,doorZ+(first?.16:-.16)),inside=local(seatX+(first?side*.14:-side*.14),.12,seatZ+.56);
  const point=blend(out,inside,progress);point.y+=.20*Math.sin(Math.PI*progress);return point;
 };
 // The hand follows the opening panel, then releases it to settle inside.
 const handle=local(side*(v.fit.width/2+.78*Math.sin(doorOpen*1.15)),.86,seatZ+.75-.78*Math.cos(doorOpen*1.15));
 const rim=local(side*v.fit.width/2,v.fit.height-.14,seatZ+.2);
 const neutral=(armSide:number)=>({x:pose.x+Math.cos(pose.yaw)*armSide*.25,y:pose.y+.78,z:pose.z-Math.sin(pose.yaw)*armSide*.25});
 const steering=(armSide:number)=>local(seatX+armSide*.18,seatHeight+.42,seatZ+.52);
 const leadingHand=blend(blend(neutral(-side),handle,smooth(q/.3)),steering(-side),smooth((q-1.15)/.65));
 const supportingHand=blend(blend(neutral(side),rim,smooth((q-.45)/.45)),steering(side),smooth((q-1.25)/.65));
 const frame:VehiclePoseFrame={leftFoot:side===1?foot(true):foot(false),rightFoot:side===1?foot(false):foot(true),
  leftHand:side===1?leadingHand:supportingHand,rightHand:side===1?supportingHand:leadingHand,
  sink:.18*duck*(1-seated)+(1.10-seatHeight)*seated,lean:.52*duck*(1-.45*seated),footYaw:pose.yaw};
 return {phase,pose,frame,doorOpen:complete?0:doorOpen,seated,visible:approaching||q<2.08,poseWeight:approaching?0:smooth(q/.25),complete};
}
export function stepVehicleInteraction(v:VehicleInteraction,dt:number){if(Number.isFinite(dt)&&dt>0)v.elapsed=Math.min(v.approachSeconds+VEHICLE_INTERACTION_SECONDS,v.elapsed+Math.min(dt,.1));return sampleVehicleInteraction(v);}
