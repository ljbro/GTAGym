export type Triple=[number,number,number];
export type InteriorBox={id:string;position:Triple;size:Triple;rotationY?:number;material?:string;collision?:boolean};
export type InteriorDoor=InteriorBox&{state:string;label?:string;locked?:boolean;style?:string};
export type InteriorSpec={version:1;id:string;title:string;theme:string;origin:Triple;ceiling:number;
 bounds:{min:Triple;max:Triple};walls:InteriorBox[];obstacles:InteriorBox[];doors:InteriorDoor[];
 floors:InteriorBox[];ceilings:InteriorBox[];lights:{position:Triple;color?:string}[];
 signs:{id:string;position:Triple;rotationY?:number;text:string;arrow?:string;size:Triple;guidance?:string}[];
 grid:{grid:string[];cellSize:number}|null;route:Triple[];source:{file:string;sha256:string}};
export function boxContains(box:InteriorBox,x:number,z:number,padding=0){
 const angle=(box.rotationY??0)*Math.PI/180,c=Math.cos(angle),s=Math.sin(angle),dx=x-box.position[0],dz=z-box.position[2];
 return Math.abs(dx*c-dz*s)<box.size[0]/2+padding&&Math.abs(dx*s+dz*c)<box.size[2]/2+padding;
}
/** Authoritative collision for the instance: exterior city footprints must not block a basement. */
export function interiorLayout(spec:InteriorSpec){
 const solids=[...spec.walls,...spec.obstacles,...spec.doors.filter(d=>d.state!=='open')];
 const local=(x:number,z:number)=>[x-spec.origin[0],z-spec.origin[2]];
 const contains=(x:number,z:number)=>{const [a,b]=local(x,z);return a>=spec.bounds.min[0]&&a<=spec.bounds.max[0]&&b>=spec.bounds.min[2]&&b<=spec.bounds.max[2];};
 return {solids,contains,heightAt:(x:number,z:number)=>contains(x,z)?spec.origin[1]:null,
  blocked(x:number,z:number){const [a,b]=local(x,z);return !contains(x,z)||solids.some(s=>boxContains(s,a,b));},
  lockedDoor(x:number,z:number){const [a,b]=local(x,z);return spec.doors.find(d=>d.state!=='open'&&boxContains(d,a,b,1.1));}
 };
}
