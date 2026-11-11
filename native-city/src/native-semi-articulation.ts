/** Pure hitch/axle geometry. No task registration until the full site is ready. */
export const SEMI={hitchBack:3.455,axleDistance:7.4,halfWidth:1.314,front:1.61,rear:9.5,hitchHeight:1.23};
export type SemiPose={x:number;z:number;yaw:number};
export type TrailerState={x:number;z:number;yaw:number;travel:number};
const wrap=(a:number)=>Math.atan2(Math.sin(a),Math.cos(a));
export function semiHitch(p:SemiPose){return {x:p.x-Math.sin(p.yaw)*SEMI.hitchBack,z:p.z-Math.cos(p.yaw)*SEMI.hitchBack};}
export function createTrailerState(p:SemiPose):TrailerState{return {...semiHitch(p),yaw:p.yaw,travel:0};}
export function stepTrailer(state:TrailerState,tractor:SemiPose){
 const hitch=semiHitch(tractor),dx=hitch.x-state.x,dz=hitch.z-state.z,d=Math.hypot(dx,dz);
 if(d<1e-10)return state;
 // Caller must create a fresh state when teleporting/restarting. No automatic
 // re-alignment on a corner or a large frame, which would hide a jackknife.
 const count=Math.max(1,Math.ceil(d/.2)),sx=dx/count,sz=dz/count;
 for(let i=0;i<count;i++){
  const rate=(yaw:number)=>(sx*Math.cos(yaw)-sz*Math.sin(yaw))/SEMI.axleDistance;
  const mid=state.yaw+rate(state.yaw)/2;
  state.yaw=wrap(state.yaw+rate(mid));
  state.travel+=sx*Math.sin(mid)+sz*Math.cos(mid);
 }
 state.x=hitch.x;state.z=hitch.z;return state;
}
export function trailerAxle(p:TrailerState){return {x:p.x-Math.sin(p.yaw)*SEMI.axleDistance,z:p.z-Math.cos(p.yaw)*SEMI.axleDistance};}
export function trailerContains(p:SemiPose,x:number,z:number,margin=0){const dx=x-p.x,dz=z-p.z,c=Math.cos(p.yaw),s=Math.sin(p.yaw),u=dx*c-dz*s,v=dx*s+dz*c;return Math.abs(u)<SEMI.halfWidth+margin&&v> -SEMI.rear-margin&&v<SEMI.front+margin;}
export function trailerFootprintClear(p:SemiPose,blocked:(x:number,z:number)=>boolean){
 const c=Math.cos(p.yaw),s=Math.sin(p.yaw),n=Math.ceil((SEMI.front+SEMI.rear)/.4);
 for(let i=0;i<=n;i++)for(const u of [-SEMI.halfWidth,0,SEMI.halfWidth]){const v=-SEMI.rear+(SEMI.front+SEMI.rear)*i/n;if(blocked(p.x+c*u+s*v,p.z-s*u+c*v))return false;}
 return true;
}
export function trailerSweepClear(a:SemiPose,b:SemiPose,blocked:(x:number,z:number)=>boolean){
 const turn=wrap(b.yaw-a.yaw),n=Math.max(1,Math.ceil((Math.hypot(b.x-a.x,b.z-a.z)+Math.abs(turn)*SEMI.rear)/.2));
 for(let i=0;i<=n;i++)if(!trailerFootprintClear({x:a.x+(b.x-a.x)*i/n,z:a.z+(b.z-a.z)*i/n,yaw:a.yaw+turn*i/n},blocked))return false;
 return true;
}
