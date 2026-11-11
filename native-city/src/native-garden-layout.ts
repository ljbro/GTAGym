import type {CityData,V2} from './city-types.ts';
import {inRing} from './driving.ts';
import {garageWorld,garageLocal} from './native-garage-layout.ts';
export const GARDEN_ROUTE:V2[]=[[-12,4],[-12,36],[12,36],[12,4],[10,4],[10,2]];
export const GARDEN_SOLIDS=[
 {x:0,z:13,w:18,d:25,h:1.7},
 {x:0,z:39,w:30,d:.6,h:1.7},
 {x:-15,z:20,w:.6,d:38,h:1.7},
 {x:15,z:20,w:.6,d:38,h:1.7},
];
export type GardenLayout={origin:V2;yaw:number;points:V2[];length:number;building:CityData['buildings'][number]};
export {garageWorld as gardenWorld,garageLocal as gardenLocal};
type Checks={blocked:(x:number,z:number)=>boolean;heightAt:(x:number,z:number)=>number;roadAt:(x:number,z:number)=>{d:number;road:{width:number}}|null};
/** Gameplay adaptation around a real native facade, not a new video calibration. */
export function findGardenLayout(data:CityData,checks:Checks):GardenLayout{
 for(const building of data.buildings){
  if(building.height<3||building.height>20||building.style!=='residential')continue;
  const ring=building.rings[0];
  for(let i=1;i<ring.length;i++){
   const a=ring[i-1],b=ring[i],length=Math.hypot(b[0]-a[0],b[1]-a[1]);if(length<28||length>90)continue;
   const origin:V2=[(a[0]+b[0])/2,(a[1]+b[1])/2];let yaw=Math.atan2(-(b[1]-a[1]),b[0]-a[0]);
   if(inRing(...garageWorld({origin,yaw},0,2),ring))yaw+=Math.PI;
   const layout:GardenLayout={origin,yaw,points:[],length:92,building};
   let ok=true,low=Infinity,high=-Infinity;
   // Whole courtyard and all route lanes must be dry, clear and almost flat.
   for(let u=-15.5;u<=15.5&&ok;u+=1)for(let v=1.5;v<=39.5;v+=1){
    const [x,z]=garageWorld(layout,u,v),h=checks.heightAt(x,z),r=checks.roadAt(x,z);
    if(checks.blocked(x,z)||!Number.isFinite(h)||r&&r.d<r.road.width/2+1){ok=false;break;}
    low=Math.min(low,h);high=Math.max(high,h);if(high-low>.12){ok=false;break;}
   }
   if(!ok)continue;
   layout.points=GARDEN_ROUTE.map(p=>garageWorld(layout,...p));
   return layout;
  }
 }
 throw Error("c02-n05 No traversable garden clearing was found beside a native residence");
}
