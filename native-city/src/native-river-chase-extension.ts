import type {V2} from './city-types.ts';
import {nativeBends} from './native-annotation-route.ts';

/** Extend the existing canal into the open southeast waterfront. A wide bend
 * avoids native roads/terrain north of the old goal; the first 520m stay intact. */
export function riverChaseTail(source:readonly V2[],totalLength=1000){
 const baseline=nativeBends(source),points=source.map(p=>[...p] as V2);
 const a=points.at(-1)!,b=points.at(-2)!,yaw=Math.atan2(a[0]-b[0],a[1]-b[1]);
 const radius=50,endYaw=1.9,steps=32,arcStart=points.length-1;
 for(let i=1;i<=steps;i++){
  const h=yaw+(endYaw-yaw)*i/steps;
  points.push([a[0]+radius*(Math.cos(yaw)-Math.cos(h)),a[1]+radius*(Math.sin(h)-Math.sin(yaw))]);
 }
 const length=nativeBends(points).length,remaining=totalLength-length,last=points.at(-1)!;
 if(remaining<=25)throw Error('River chase extension needs room after the bend');
 points.push([last[0]+Math.sin(endYaw)*remaining,last[1]+Math.cos(endYaw)*remaining]);
 // Treat the continuous arc as one semantic turn, not 32 separate corners.
 const index=arcStart+steps/2,turnDistance=nativeBends(points.slice(0,index+1)).length;
 return {points,length:totalLength,turns:[...baseline.turns,{index,direction:'right' as const,degrees:(endYaw-yaw)*180/Math.PI,distance:turnDistance}]};
}
