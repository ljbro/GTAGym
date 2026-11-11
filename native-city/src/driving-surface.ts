/** Wheels cannot acquire a bridge deck several metres above the chassis just
 * because a 2-D height probe happens to cross its edge. Keep reachable slopes
 * and kerbs; reject disconnected support layers. This is not a teleport/rescue. */
export function drivingSupportHeight(height:(x:number,z:number)=>number,cx:number,cz:number,x:number,z:number){
 const center=height(cx,cz),sample=height(x,z),reach=.35+Math.hypot(x-cx,z-cz)*.6;
 return Number.isFinite(sample)&&Math.abs(sample-center)<=reach?sample:center;
}
export function drivingSurfaceStepClear(height:(x:number,z:number)=>number,a:{x:number;z:number},b:{x:number;z:number}){
 const distance=Math.hypot(b.x-a.x,b.z-a.z),steps=Math.max(1,Math.ceil(distance/.25));let last=height(a.x,a.z);
 for(let i=1;i<=steps;i++){
  const next=height(a.x+(b.x-a.x)*i/steps,a.z+(b.z-a.z)*i/steps);
  if(!Number.isFinite(next)||Math.abs(next-last)>.35+distance/steps*.6)return false;
  last=next;
 }
 return true;
}
