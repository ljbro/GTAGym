/** Match OffMapBench src/browser/gta-radar.js:gtaRadarViewport.
 * Speed is metres/second, altitude is metres above ground. Never fit the route
 * or police into view: shortening a route must not magnify the surroundings.
 */
export type MinimapViewportState = {
 speed?:number;
 walking?:boolean;
 indoors?:boolean;
 flightAltitude?:number;
};
// Reference video: approximately 180x120 at 1280x720, player 80% down.
// One uniform scale for both axes; never squash the old circular texture.
export const MINIMAP_FRAME={width:320,height:320*2/3,playerX:160,playerY:320*2/3*.8,markerInset:9} as const;
export function minimapProject(dx:number,dz:number,yaw:number,scale:number,tilt:number){
 const x=dx*scale,y=-dz*scale,c=Math.cos(yaw),s=Math.sin(yaw);
 const rx=x*c+y*s,ry=-x*s+y*c,den=1-ry*Math.sin(tilt)/480;
 return {x:MINIMAP_FRAME.playerX+rx/den,y:MINIMAP_FRAME.playerY+ry*Math.cos(tilt)/den,den,rx,ry:ry*Math.cos(tilt)};
}
export function minimapVisibleWidth(state:MinimapViewportState):number{
 const speed=Number.isFinite(state.speed)?state.speed!:0;
 if(state.indoors)return 46;
 if(state.flightAltitude!==undefined){
  const altitude=Number.isFinite(state.flightAltitude)?state.flightAltitude:0;
  return 600+Math.max(0,Math.min(1400,altitude*1.6));
 }
 if(state.walking)return 175+Math.max(0,Math.min(30,speed*4));
 return 250+Math.min(300,Math.abs(speed)*7);
}
/** Same perspective and off-centre player anchor as city-hud.ts. */
export function minimapPointVisible(dx:number,dz:number,yaw:number,width:number,tilt:number,margin=0){
 const p=minimapProject(dx,dz,yaw,MINIMAP_FRAME.width/width,tilt);
 return p.den>0&&p.x>=1-margin&&p.x<=MINIMAP_FRAME.width-1+margin&&p.y>=1-margin&&p.y<=MINIMAP_FRAME.height-1+margin;
}
