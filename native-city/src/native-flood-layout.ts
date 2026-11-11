import {waterChannelPath,channelContains,channelBank} from './native-water-channel.ts';
import {inRing} from './driving.ts';
export type FloodBridge={point:number[];yaw:number;height?:number;kind?:string};
export type FloodSpec={id:string;path:{points:number[][];length:number};channel:{floor:number;halfWidth:number;bridge:FloodBridge;additionalBridges?:FloodBridge[];leftWater?:boolean;companions?:boolean;startPadding?:number;endPadding?:number;vegetationClearance?:number}};
export function floodLayout(spec:FloodSpec){
 const points=waterChannelPath(spec),{floor,halfWidth,bridge}=spec.channel;
 const local=(x:number,z:number,br=bridge)=>{const dx=x-br.point[0],dz=z-br.point[1],c=Math.cos(br.yaw),s=Math.sin(br.yaw);return {u:dx*c-dz*s,v:dx*s+dz*c};};
 const waterRing=[...channelBank(points,-halfWidth),...channelBank(points,-5).reverse()];
 const water=(x:number,z:number)=>!!spec.channel.leftWater&&inRing(x,z,waterRing);
 const blocked=(x:number,z:number)=>{
  if(channelContains(points,halfWidth+13,x,z)&&!channelContains(points,halfWidth-.15,x,z))return true;
  if(water(x,z))return true;
  return [bridge,...(spec.channel.additionalBridges??[])].some(br=>{const p=local(x,z,br);return Math.abs(p.v)<6.3&&Math.abs(p.u)>27.7&&Math.abs(p.u)<90.3;});
 };
 const vegetationReserved=(x:number,z:number,radius=0)=>{
  if(spec.channel.vegetationClearance===undefined)return false;
  const r=Math.max(0,radius),width=halfWidth+13+spec.channel.vegetationClearance;
  // Test distance to the whole channel, including its padded ends. Include
  // crown radius so trees outside the banks cannot hang into the driving view.
  for(let i=1;i<points.length;i++){
   const a=points[i-1],b=points[i],dx=b[0]-a[0],dz=b[1]-a[1],t=Math.max(0,Math.min(1,((x-a[0])*dx+(z-a[1])*dz)/(dx*dx+dz*dz)));
   if(Math.hypot(x-a[0]-t*dx,z-a[1]-t*dz)<=width+r)return true;
  }
  return [bridge,...(spec.channel.additionalBridges??[])].some(br=>{const p=local(x,z,br);return Math.abs(p.u)<=90+r&&Math.abs(p.v)<=8+r;});
 };
 return {points,floor,halfWidth,local,blocked,water,vegetationReserved,
  floorAt:(x:number,z:number)=>channelContains(points,halfWidth,x,z)?floor:null,
  bank:(offset:number)=>channelBank(points,offset),
  pointAt:(distance:number,side=0)=>{let remaining=Math.max(0,Math.min(spec.path.length,distance));const ps=spec.path.points;for(let i=1;i<ps.length;i++){const a=ps[i-1],b=ps[i],d=Math.hypot(b[0]-a[0],b[1]-a[1]);if(remaining<=d||i===ps.length-1){const dx=(b[0]-a[0])/d,dz=(b[1]-a[1])/d;return {x:a[0]+dx*remaining+dz*side,z:a[1]+dz*remaining-dx*side,yaw:Math.atan2(dx,dz)};}remaining-=d;}throw Error('Empty flood route');},
 };
}
