/** Estimated freestyle/treading cycle; not an original GTA animation. */
export type SwimVector={forward:number;side:number;up:number};
const lerp=(a:number,b:number,t:number)=>a+(b-a)*t;
export function swimCycle(phase:number,moving:number){
 const blend=Math.max(0,Math.min(1,moving)),wave=Math.sin(phase);
 const arm=(offset:number,side:number):SwimVector=>{
  const t=((phase/(Math.PI*2)+offset)%1+1)%1,pull=t<.55,q=pull?t/.55:(t-.55)/.45;
  // A common submerged entry/release height and zero endpoint velocity keep
  // pull -> recovery -> entry continuous (the old cycle jumped 24 cm/arm-length).
  const ease=(1-Math.cos(q*Math.PI))/2,arc=Math.sin(q*Math.PI)**2;
  const forward=pull?lerp(.92,-.88,ease):lerp(-.88,.92,ease),up=-.10+(pull?-.38:.58)*arc;
  const tread=phase+offset*Math.PI*2;
  return {forward:lerp(.12+.15*Math.sin(tread),forward,blend),side:side*lerp(.60+.07*Math.cos(tread),.24,blend),up:lerp(-.38+.05*Math.sin(tread*2),up,blend)};
 };
 // Alternating small circular kicks while treading, flutter kicks when moving.
 const leg=(side:number):SwimVector=>{const tread=phase+(side<0?Math.PI:0);return {forward:lerp(.14+.14*Math.sin(tread),-.93,blend),side:side*lerp(.20+.07*Math.cos(tread),.03,blend),up:lerp(-.68+.10*Math.cos(tread),Math.sin(phase*2+side*Math.PI/2)*.15,blend)};};
 return {leftHand:arm(0,1),rightHand:arm(.5,-1),leftFoot:leg(1),rightFoot:leg(-1),pitch:lerp(.1,Math.PI/2-.12,blend),roll:.09*wave*blend,hipBelowSurface:lerp(.67,.14,blend)};
}
