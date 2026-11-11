import type {TraversalState} from './offmap-navigation-traversal.ts';
export type WalkPoint={x:number;y:number;z:number};
export type LadderGeometry={plane:WalkPoint;outward:{x:number;z:number};bodyOffset:number;rungSpacing:number;firstRungY:number;lastRungY?:number;railTopY?:number;landingY?:number};
export type WalkLink={id:string;kind:'vault'|'climb'|'ladder';from:WalkPoint;to:WalkPoint;top:number;duration:number;ladder?:LadderGeometry;triggerRadius?:number;mantleGrip?:WalkPoint;vaultGrip?:WalkPoint};
const lerp=(a:number,b:number,t:number)=>a+(b-a)*t;
const smooth=(t:number)=>{t=Math.max(0,Math.min(1,t));return t*t*(3-2*t);};
const between=(a:WalkPoint,b:WalkPoint,t:number):WalkPoint=>({x:lerp(a.x,b.x,t),y:lerp(a.y,b.y,t),z:lerp(a.z,b.z,t)});
/** Forward and reverse share the exact same ladder axis, never the trigger position. */
function ladderPosition(link:WalkLink,t:number):WalkPoint{
 const ladder=link.ladder!,descending=link.to.y<link.from.y;
 const low=descending?link.to:link.from,high=descending?link.from:link.to;
 const base={x:ladder.plane.x+ladder.outward.x*ladder.bodyOffset,y:low.y,z:ladder.plane.z+ladder.outward.z*ladder.bodyOffset};
 const top={...base,y:high.y+.12},q=descending?1-t:t;
 if(q<.12)return between(low,base,smooth(q/.12));
 if(q<.78)return between(base,top,(q-.12)/.66);
 if(q<.94)return between(top,{...high,y:top.y},smooth((q-.78)/.16));
 return between({...high,y:top.y},high,smooth((q-.94)/.06));
}
/** Alternating contacts land on physical rungs. Each limb holds its rung through
 * the stance phase, then smoothly reaches the next one; phase follows height. */
export function ladderContacts(ladder:LadderGeometry,feetY:number,sliding=false){
 const {plane,outward:n,rungSpacing:s,firstRungY:base}=ladder,left={x:n.z,z:-n.x},cycle=(feetY-plane.y)/(2*s);
 const contact=(side:number,hand:boolean)=>{
  const phase=cycle+(side<0?.5:0)+(hand?.5:0),step=Math.floor(phase),fraction=phase-step;
  const reach=smooth((fraction-.55)/.45),swing=Math.sin(Math.PI*reach);
  const raw=sliding?feetY+(hand?1.47:.12):Math.max(base,base+(step*2+(side<0?-1:0)+(hand?4:0))*s+2*s*reach);
  // The roof exit has side handrails, NOT chest-height rungs across the exit.
  const mount=ladder.lastRungY===undefined?0:smooth((raw-ladder.lastRungY)/s);
  const y=Math.min(hand?ladder.railTopY??Infinity:ladder.landingY??Infinity,raw);
  const lateral=hand?(sliding?.43:lerp(.26,.43,mount)):.18,outset=hand?.02:lerp(.12+(sliding?0:swing*.10),-.15,mount);
  return {x:plane.x+left.x*side*lateral+n.x*outset,y,z:plane.z+left.z*side*lateral+n.z*outset};
 };
 return {leftHand:contact(1,true),rightHand:contact(-1,true),leftFoot:contact(1,false),rightFoot:contact(-1,false)};
}
export function linkPosition(link:WalkLink,t:number):WalkPoint{
 t=Math.max(0,Math.min(1,t));if(link.kind==='ladder'&&link.ladder)return ladderPosition(link,t);
 const {from:a,to:b}=link,top=Math.max(link.top,a.y,b.y)+.12;
 if(link.kind==='vault'&&link.vaultGrip){
  // Travel throughout the vault rather than climbing vertically, pausing on
  // top, then stepping down. Full capsule clears the rail before crossing it.
  const p=between(a,b,smooth(t));
  p.y=t<.28?lerp(a.y,top,smooth(t/.28)):t>.72?lerp(top,b.y,smooth((t-.72)/.28)):top;
  return p;
 }
 if(link.mantleGrip){
  // Reach before lifting; smooth all junction velocities. Retain the validated
  // collision-safe lift/cross/settle corridor, including reverse descent.
  const descending=b.y<a.y,low=descending?b:a,high=descending?a:b,q=descending?1-t:t;
  if(q<.14)return {...low};
  if(q<.46)return {...low,y:lerp(low.y,top,smooth((q-.14)/.32))};
  if(q<.80)return {...between(low,high,smooth((q-.46)/.34)),y:top};
  return {...high,y:lerp(top,high.y,smooth((q-.80)/.20))};
 }
 // Rise outside the obstacle, cross above its top, then land. Descending a
 // ladder does the inverse, so the character never cuts through the wall.
 const descending=b.y<a.y-.5;
 const liftEnd=descending?.1:(link.kind==='ladder'?.75:.3),crossEnd=descending?.25:(link.kind==='ladder'?.9:.7);
 if(t<liftEnd)return {x:a.x,y:lerp(a.y,top,t/liftEnd),z:a.z};
 if(t<crossEnd){const p=(t-liftEnd)/(crossEnd-liftEnd);return {x:lerp(a.x,b.x,p),y:top,z:lerp(a.z,b.z,p)};}
 return {x:b.x,y:lerp(top,b.y,(t-crossEnd)/(1-crossEnd)),z:b.z};
}
export function walkTraversalPose(link:WalkLink|null,t:number,p:WalkPoint,yaw:number,jumping=false,sliding=false):TraversalState|null{
 if(!link&&!jumping)return null;
 const phase=t<.3?'rise':t<.7?'cross':'lower',phaseProgress=phase==='rise'?t/.3:phase==='cross'?(t-.3)/.4:(t-.7)/.3;
 const ladder=link?.ladder,q=link&&link.to.y<link.from.y?1-t:t;
 const grip=link?.mantleGrip;
 // Lower backwards while still facing the ledge, rather than turning away
 // from it and asking both arms to reach behind the torso.
 const facingSign=link&&link.to.y<link.from.y?-1:1;
 const vault=link?.vaultGrip;
 const facing=vault&&link?Math.atan2(link.to.x-link.from.x,link.to.z-link.from.z)+.50*Math.sin(Math.PI*t)**2:grip&&link?Math.atan2((link.to.x-link.from.x)*facingSign,(link.to.z-link.from.z)*facingSign):yaw;
 return {descriptorId:link?`${link.kind}:${link.id}`:'jump',active:true,phase,motionPhase:phase,progress:t,phaseProgress,
  sourcePosition:p,physicalPosition:p,bodyOffsetY:0,bodyYaw:ladder?Math.atan2(-ladder.outward.x,-ladder.outward.z):facing,completed:false,suppressCompletion:true,blocked:false,blockReason:null,sourceDistanceMetres:null,estimatedTopY:link?.top??null,estimatedObstacleSourcePosition:null,
  mantleContact:grip?{point:{...grip},progress:q,weight:smooth(q/.14)*(1-smooth((q-.38)/.20)),ascending:!!link&&link.to.y>link.from.y}:undefined,
  vaultContact:vault?{point:{...vault},progress:t,weight:smooth(t/.16)*(1-smooth((t-.36)/.24))}:undefined,
  ladderContacts:ladder?{...ladderContacts(ladder,p.y,sliding),weight:smooth(q/.12)*(1-smooth((q-.78)/.12))}:undefined};
}
