/** Gameplay heading: +Z is forward, +X is yaw PI/2.
 * Road feature vertex order is arbitrary and must not choose the player's
 * travel direction. Use the first non-degenerate leg, not the distant goal.
 */
export function nativeRouteStartYaw(points:readonly (readonly number[])[],fallback=0):number{
 const safeFallback=Number.isFinite(fallback)?fallback:0,first=points[0];
 if(!first||!Number.isFinite(first[0])||!Number.isFinite(first[1]))return safeFallback;
 for(const point of points.slice(1)){
  const dx=point[0]-first[0],dz=point[1]-first[1];
  if(Number.isFinite(dx)&&Number.isFinite(dz)&&Math.hypot(dx,dz)>.01)return Math.atan2(dx,dz);
 }
 return safeFallback;
}
