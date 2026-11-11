import type {V2} from './city-types.ts';
export type WalkVehicleRequest={model:'motorcycle'|'motorcycle-green'|'pickup'|'van'|'sedan'|'convertible';at:number;fallen?:boolean;note:string};
/** Explicit, reviewable title/annotation inference, not a claim of video measurement.
 * at=0 is start, at=1 is destination. Freight wagons are NOT road vans. */
export const WALK_VEHICLES:Record<string,readonly WalkVehicleRequest[]>={
 'c03-n05':[{model:'sedan',at:1,note:"Manual descriptions.end Make it clear that a car is at the endpoint; Following NPC Go to the Car"}],
 'c02-n01':[{model:'sedan',at:1,note:"Go walking from the dealership to the sedan: Vehicle at the Finish, Color Unspecified"}],
 'c02-n03':[{model:'sedan',at:1,note:"Run back to the sedan at the alley entrance: Vehicle at the Finish, Color Unspecified"}],
 'c02-n04':[{model:'motorcycle',at:1,fallen:true,note:"Approach the fallen motorcycle: Overturned vehicle at the finish"}],
 'c07-n01':[{model:'pickup',at:1,note:"Finish Area: Pickup front connects to the low roof, Use Space for two stages of climbing to the rooftop window"}],
 'c02-n09':[{model:'convertible',at:1,note:"Mission Name: Convertible, Manually described red sports car: Red convertible"}],
 'c02-n10':[{model:'motorcycle-green',at:1,note:"Walk toward the green motorcycle by the road: Green motorcycle at the endpoint"}],
 'c02-n11':[{model:'van',at:1,note:"Return to the van at the alley entrance, Manual description of the white vehicle: White Van"}],
 'c02-n12':[{model:'motorcycle-green',at:0,note:"Walk from the motorcycle to the residence entrance: Green motorcycle at the start, Not at the destination"}],
};
export type VehiclePose={x:number;z:number;y:number;yaw:number;pitch?:number;roll?:number;width:number;depth:number};
export function pointOnWalk(points:readonly V2[],fraction:number){
 const lengths=points.slice(1).map((p,i)=>Math.hypot(p[0]-points[i][0],p[1]-points[i][1]));let remaining=lengths.reduce((a,b)=>a+b,0)*fraction;
 for(let i=0;i<lengths.length;i++){const d=lengths[i];if(remaining<=d||i===lengths.length-1){const t=d?Math.min(1,remaining/d):0,a=points[i],b=points[i+1];return {x:a[0]+(b[0]-a[0])*t,z:a[1]+(b[1]-a[1])*t,yaw:Math.atan2(b[0]-a[0],b[1]-a[1])};}remaining-=d;}
 throw Error("The vehicle site has no valid route");
}
export function vehicleLocal(p:VehiclePose,x:number,z:number){const dx=x-p.x,dz=z-p.z,c=Math.cos(p.yaw),s=Math.sin(p.yaw);return [c*dx-s*dz,s*dx+c*dz];}
export function vehicleBlocks(p:VehiclePose,x:number,z:number,margin=.23){const [u,v]=vehicleLocal(p,x,z);return Math.abs(u)<p.width/2+margin&&Math.abs(v)<p.depth/2+margin;}
/** Search an entire footprint, not just its centre. Keep a clear walking corridor. */
export function placeWalkVehicle(points:readonly V2[],at:number,width:number,depth:number,blocked:(x:number,z:number)=>boolean,height:(x:number,z:number)=>number):VehiclePose{
 const anchor=pointOnWalk(points,at),c=Math.cos(anchor.yaw),s=Math.sin(anchor.yaw);
 for(const offset of [width/2+1.25,-width/2-1.25,width/2+2,-width/2-2,width/2+3,-width/2-3,width/2+4.5,-width/2-4.5])for(const forward of [0,1.5,-1.5,3,-3,4.5,-4.5])for(const turn of [0,Math.PI/2]){
  const p:VehiclePose={x:anchor.x+c*offset+s*forward,z:anchor.z-s*offset+c*forward,y:0,yaw:anchor.yaw+turn,width,depth};let valid=true;const samples:{u:number;v:number;h:number}[]=[];
  const pc=Math.cos(p.yaw),ps=Math.sin(p.yaw);
  const nx=Math.ceil((width+.5)/.3),nz=Math.ceil((depth+.5)/.3);
  for(let ix=0;ix<=nx&&valid;ix++)for(let iz=0;iz<=nz;iz++){
   const u=(ix/nx-.5)*(width+.5),v=(iz/nz-.5)*(depth+.5),x=p.x+pc*u+ps*v,z=p.z-ps*u+pc*v,h=height(x,z);
   if(blocked(x,z)||!Number.isFinite(h)){valid=false;break;}samples.push({u,v,h});
  }
  if(!valid)continue;
  // Fit the actual pavement plane. A gentle driveway is valid; a curb, cliff or
  // uneven mound is not. Tilting to the plane avoids floating uphill wheels.
  const mean=samples.reduce((n,p)=>n+p.h,0)/samples.length;
  const du=samples.reduce((n,p)=>n+p.u*(p.h-mean),0)/samples.reduce((n,p)=>n+p.u*p.u,0);
  const dv=samples.reduce((n,p)=>n+p.v*(p.h-mean),0)/samples.reduce((n,p)=>n+p.v*p.v,0);
  if(Math.hypot(du,dv)>.15||samples.some(p=>Math.abs(p.h-mean-du*p.u-dv*p.v)>.065))continue;
  for(let i=1;i<points.length&&valid;i++){
   const a=points[i-1],b=points[i],n=Math.ceil(Math.hypot(b[0]-a[0],b[1]-a[1])/.3);
   for(let j=0;j<=n;j++)if(vehicleBlocks(p,a[0]+(b[0]-a[0])*j/n,b[1]+(b[1]-a[1])*j/n,.75)){valid=false;break;}
  }
  if(valid){p.y=mean+.015;p.pitch=-Math.atan(dv);p.roll=Math.atan(du);return p;}
 }
 throw Error("There is no safe parking spot near the mission vehicle(Building/Road surface/Route conflict)");
}
