import {createPedestrianBody,detectPedestrianImpact,stepPedestrianBody,type ImpactCarPose,type PedestrianBody,type PedestrianImpact} from './pedestrian-impact.ts';
import type {StreetBody} from './ambient-collision.ts';
export type EbikeImpact={x:number;z:number;yaw:number;roll:number;vx:number;vz:number;age:number;side:number;rider:PedestrianBody|null};
/** Probe the centre and both wheel ends so clipping a wheel also counts. */
export function detectEbikeImpact(before:ImpactCarPose,after:ImpactCarPose,target:StreetBody,vehicle:{width:number;length:number;height:number}):PedestrianImpact|null{
 let first:PedestrianImpact|null=null;
 for(const along of [-.65,0,.65]){
  const hit=detectPedestrianImpact(before,after,{x:target.x+Math.sin(target.yaw)*along,z:target.z+Math.cos(target.yaw)*along,y:target.y+.1},vehicle);
  if(hit&&(!first||hit.fraction<first.fraction))first=hit;
 }
 return first;
}
export function createEbikeImpact(target:StreetBody,hit:PedestrianImpact,hasRider:boolean):EbikeImpact{
 const rider=hasRider?createPedestrianBody({x:target.x,y:target.y+.45,z:target.z},{...hit,velocity:{...hit.velocity,y:Math.max(1.4,hit.velocity.y)}}):null;
 if(rider){rider.ry=target.yaw;rider.wx+=2.4;}
 return {x:target.x,z:target.z,yaw:target.yaw,roll:0,vx:hit.velocity.x*.7,vz:hit.velocity.z*.7,age:0,side:hit.normal.x*Math.cos(target.yaw)-hit.normal.z*Math.sin(target.yaw)>=0?1:-1,rider};
}
export function stepEbikeImpact(body:EbikeImpact,dt:number,heightAt:(x:number,z:number)=>number,blocked:(x:number,z:number)=>boolean){
 if(!Number.isFinite(dt)||dt<=0)return;
 const frame=Math.min(dt,.1),steps=Math.ceil(frame*120),h=frame/steps;
 for(let i=0;i<steps;i++){
  body.age+=h;body.roll=body.side*1.38*Math.min(1,body.age/.55);
  const x=body.x+body.vx*h,z=body.z+body.vz*h;
  const clear=[[-.65,0],[.65,0],[0,-.85],[0,.85],[0,0]].every(([dx,dz])=>!blocked(x+dx,z+dz));
  if(clear&&Math.abs(heightAt(x,z)-heightAt(body.x,body.z))<.45){body.x=x;body.z=z;}else{body.vx*= -.1;body.vz*= -.1;}
  const damping=Math.exp(-3*h);body.vx*=damping;body.vz*=damping;
 }
 if(body.rider)stepPedestrianBody(body.rider,frame,heightAt,blocked);
}
