/** Nearby hull interaction, with an outside swim approach to a safe side.
 * Local +Z is bow. Keep the stern motor and hull out of the approach path. */
export function smallBoatBoardingPlan(u:number,v:number,halfWidth:number,halfLength:number){
 const distance=Math.hypot(Math.max(0,Math.abs(u)-halfWidth),Math.max(0,Math.abs(v)-halfLength));
 if(distance>1.8||Math.abs(u)<halfWidth+.23&&Math.abs(v)<halfLength+.23)return null;
 const side=u>.1?1:-1,lane=side*(halfWidth+.85),entryV=-.975;
 const points:number[][]=[];
 if(Math.abs(v)>halfLength-.1){
  // Do not cut diagonally across the bow/stern corners.
  const end=Math.sign(v)*(halfLength+.8);
  points.push([u,end],[lane,end]);
 }
 points.push([lane,entryV]);
 return {side,points};
}
