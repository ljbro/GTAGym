import type {InteriorBox,Triple} from './offmap-interior-layout.ts';
/** OffMapBench grid-task.mjs defaults; magazine/reload are GTA_SZ additions. */
export const OFFMAP_CARBINE={damage:34,headMultiplier:3,interval:.12,range:65,magazine:30,reserve:120,reloadSeconds:1.8} as const;
export type WeaponHit={distance:number;point:Triple;normal:Triple;id:string;zone?:'head'|'body'};
export function rayBox(origin:Triple,direction:Triple,box:InteriorBox,range=65):WeaponHit|null{
 const a=(box.rotationY??0)*Math.PI/180,c=Math.cos(a),s=Math.sin(a),dx=origin[0]-box.position[0],dz=origin[2]-box.position[2];
 const o=[dx*c-dz*s,origin[1]-box.position[1],dx*s+dz*c],d=[direction[0]*c-direction[2]*s,direction[1],direction[0]*s+direction[2]*c];
 let near=0,far=range,axis=-1,sign=1;
 for(let i=0;i<3;i++){
  const h=box.size[i]/2;if(Math.abs(d[i])<1e-9){if(Math.abs(o[i])>h)return null;continue;}
  let t1=(-h-o[i])/d[i],t2=(h-o[i])/d[i];const side=d[i]>0?-1:1;if(t1>t2)[t1,t2]=[t2,t1];
  if(t1>near){near=t1;axis=i;sign=side;}far=Math.min(far,t2);if(near>far)return null;
 }
 if(far<0||near>range)return null;
 const n:Triple=[0,0,0];if(axis>=0)n[axis]=sign;else{n[0]=-direction[0];n[1]=-direction[1];n[2]=-direction[2];}
 return {id:box.id,distance:near,point:origin.map((v,i)=>v+direction[i]*near) as Triple,normal:axis<0?n:[n[0]*c+n[2]*s,n[1],-n[0]*s+n[2]*c]};
}
export function nearestWeaponHit(origin:Triple,direction:Triple,boxes:InteriorBox[],range=65){
 let nearest:WeaponHit|null=null;for(const box of boxes){const hit=rayBox(origin,direction,box,nearest?.distance??range);if(hit&&(!nearest||hit.distance<nearest.distance))nearest=hit;}return nearest;
}
export class OffmapWeaponCore{
 ammo:number=OFFMAP_CARBINE.magazine;reserve:number=OFFMAP_CARBINE.reserve;unlimited=false;reloadRemaining=0;cooldown=0;shots=0;hits=0;headshots=0;
 held=false;aiming=false;paused=true;releaseRequired=false;
 get accuracy(){return this.shots?this.hits/this.shots:0;}
 reset(){this.ammo=OFFMAP_CARBINE.magazine;this.reserve=OFFMAP_CARBINE.reserve;this.reloadRemaining=0;this.cooldown=0;this.shots=0;this.hits=0;this.headshots=0;this.disarm();}
 disarm(){this.held=false;this.aiming=false;this.releaseRequired=true;}
 setPaused(value:boolean){if(value!==this.paused){this.paused=value;this.disarm();}}
 trigger(down:boolean){if(!down){this.held=false;this.releaseRequired=false;}else if(!this.paused&&!this.releaseRequired)this.held=true;}
 tick(dt:number){if(this.paused||!Number.isFinite(dt)||dt<=0)return;dt=Math.min(dt,.1);this.cooldown=Math.max(0,this.cooldown-dt);
  if(this.reloadRemaining>0){this.reloadRemaining=Math.max(0,this.reloadRemaining-dt);if(this.reloadRemaining<1e-8){this.reloadRemaining=0;const n=Math.min(OFFMAP_CARBINE.magazine-this.ammo,this.reserve);this.ammo+=n;this.reserve-=n;}}
 }
 fire(){if(this.paused||!this.held||this.releaseRequired||this.reloadRemaining>0||this.cooldown>1e-8||!this.unlimited&&this.ammo<=0)return false;
  this.cooldown=OFFMAP_CARBINE.interval;if(!this.unlimited)this.ammo--;this.shots++;return true;
 }
 reload(){if(this.paused||this.unlimited||this.reloadRemaining>0||this.ammo===OFFMAP_CARBINE.magazine||this.reserve<=0)return false;this.reloadRemaining=OFFMAP_CARBINE.reloadSeconds;this.disarm();return true;}
 setUnlimited(value:boolean){this.unlimited=value;this.reloadRemaining=0;this.disarm();}
 hit(zone:'head'|'body'){this.hits++;if(zone==='head')this.headshots++;return OFFMAP_CARBINE.damage*(zone==='head'?OFFMAP_CARBINE.headMultiplier:1);}
}
