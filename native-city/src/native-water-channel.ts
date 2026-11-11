import {inRing} from './driving.ts';
import type {V2} from './city-types.ts';
export type ChannelSpec={path:{points:number[][]};channelHalfWidth?:number;channel?:{startPadding?:number;endPadding?:number}};
/** Extend behind spawn for physically safe perimeter reinforcements. */
export function waterChannelPath(spec:ChannelSpec):V2[]{
 const points=spec.path.points.map(p=>[p[0],p[1]]as V2),a=points[0],b=points[1],y=points.at(-2)!,z=points.at(-1)!;
 const back=Math.hypot(b[0]-a[0],b[1]-a[1]),front=Math.hypot(z[0]-y[0],z[1]-y[1]);
 // Extended driving routes already consume part of the original end buffers.
 // Do not extend them a second time into native roads or raised terrain.
 const start=spec.channel?.startPadding??142,end=spec.channel?.endPadding??65;
 if(![start,end].every(n=>Number.isFinite(n)&&n>=0)||!back||!front)throw Error('Invalid water-channel padding or endpoint segment');
 return [...(start>0?[[a[0]-(b[0]-a[0])*start/back,a[1]-(b[1]-a[1])*start/back]as V2]:[]),...points,...(end>0?[[z[0]+(z[0]-y[0])*end/front,z[1]+(z[1]-y[1])*end/front]as V2]:[])];
}
const polygons=new WeakMap<readonly V2[],Map<number,V2[]>>();
export function channelContains(points:readonly V2[],halfWidth:number,x:number,z:number,margin=0){
 const width=halfWidth-margin;let cache=polygons.get(points);if(!cache){cache=new Map();polygons.set(points,cache);}
 let ring=cache.get(width);if(!ring){ring=[...channelBank(points,width),...channelBank(points,-width).reverse()];cache.set(width,ring);}
 return inRing(x,z,ring);
}
/** Shared miter joints give adjacent rendered bank segments identical ends. */
export function channelBank(points:readonly V2[],offset:number):V2[]{
 const normals=points.slice(1).map((b,i)=>{const a=points[i],dx=b[0]-a[0],dz=b[1]-a[1],d=Math.hypot(dx,dz);return [dz/d,-dx/d]as V2;});
 return points.map((p,i)=>{const a=normals[Math.max(0,i-1)],b=normals[Math.min(i,normals.length-1)],x=a[0]+b[0],z=a[1]+b[1],d=Math.hypot(x,z)||1,nx=x/d,nz=z/d,scale=offset/Math.max(.35,nx*b[0]+nz*b[1]);return [p[0]+nx*scale,p[1]+nz*scale];});
}
