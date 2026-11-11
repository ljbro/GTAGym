import type {V2} from './city-types.ts';
export type Direction='left'|'right';
export function bendDegrees(a:V2,b:V2,c:V2){
 const ax=b[0]-a[0],az=b[1]-a[1],bx=c[0]-b[0],bz=c[1]-b[1];
 return Math.atan2(az*bx-ax*bz,ax*bx+az*bz)*180/Math.PI;
}
/** Human drawings use screen Y down; retain the original files unchanged.
 * Ignore only sub-3px duplicate clicks and <15deg drafting drift. Pixel
 * distances are NOT metres and do not determine native road length. */
export function annotationTurns(points:readonly {x:number;y:number}[]){
 const retained:{point:V2;sourceIndex:number}[]=[],ignored:number[]=[];
 points.forEach((p,sourceIndex)=>{const point:V2=[p.x,-p.y],last=retained.at(-1);
  if(last&&Math.hypot(point[0]-last.point[0],point[1]-last.point[1])<3)ignored.push(sourceIndex);
  else retained.push({point,sourceIndex});
 });
 const turns:{direction:Direction;sourceIndex:number;degrees:number}[]=[];
 for(let i=1;i<retained.length-1;i++){
  const degrees=bendDegrees(retained[i-1].point,retained[i].point,retained[i+1].point);
  if(Math.abs(degrees)>=15)turns.push({direction:degrees>0?'right':'left',sourceIndex:retained[i].sourceIndex,degrees});
  else ignored.push(retained[i].sourceIndex);
 }
 return {turns,ignoredSourceIndices:ignored.sort((a,b)=>a-b)};
}
export function nativeBends(points:readonly V2[]){
 const turns:{index:number;direction:Direction;degrees:number;distance:number}[]=[];let distance=0;
 for(let i=1;i<points.length;i++){
  distance+=Math.hypot(points[i][0]-points[i-1][0],points[i][1]-points[i-1][1]);
  if(i<points.length-1){const degrees=bendDegrees(points[i-1],points[i],points[i+1]);
   if(Math.abs(degrees)>=20)turns.push({index:i,direction:degrees>0?'right':'left',degrees,distance});
  }
 }
 return {turns,length:distance};
}
