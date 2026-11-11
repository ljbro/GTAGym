import type {V2} from './city-types.ts';
import {MINIMAP_FRAME,minimapProject,minimapVisibleWidth} from './minimap-viewport.ts';
import {minimapGoalMarker} from './minimap-navigation.ts';

/** World-coordinate footprints from the active site's geometry, never city tiles. */
export type InteriorMinimapPlan={floors:V2[][];walls:V2[][];obstacles:V2[][];stairs:V2[][];doors:V2[][]};
export function mapBox(x:number,z:number,w:number,d:number,yaw=0):V2[]{
 const c=Math.cos(yaw),s=Math.sin(yaw);
 return [[-w/2,-d/2],[w/2,-d/2],[w/2,d/2],[-w/2,d/2]].map(([u,v])=>[x+c*u+s*v,z-s*u+c*v]);
}
export function mapRect(b:{minX:number;maxX:number;minZ:number;maxZ:number}){
 return mapBox((b.minX+b.maxX)/2,(b.minZ+b.maxZ)/2,b.maxX-b.minX,b.maxZ-b.minZ);
}
export function moveInteriorPlan(plan:InteriorMinimapPlan,x:number,z:number,yaw=0):InteriorMinimapPlan{
 const c=Math.cos(yaw),s=Math.sin(yaw),move=(rings:V2[][])=>rings.map(r=>r.map(([u,v]):V2=>[x+c*u+s*v,z-s*u+c*v]));
 return {floors:move(plan.floors),walls:move(plan.walls),obstacles:move(plan.obstacles),stairs:move(plan.stairs),doors:move(plan.doors)};
}
/** OffMapBench-style top-down room radar: 46m viewport and target-only guidance.
 * Keep the shared rectangle, colors and edge-marker rules; no extra WebGL scene. */
export function drawInteriorMinimap(canvas:HTMLCanvasElement,plan:InteriorMinimapPlan,state:{x:number;z:number;yaw:number;target?:readonly number[]}){
 if(canvas.width!==480||canvas.height!==320){canvas.width=480;canvas.height=320;}
 const ctx=canvas.getContext('2d')!,f=MINIMAP_FRAME,width=minimapVisibleWidth({indoors:true}),scale=f.width/width;
 ctx.setTransform(1.5,0,0,1.5,0,0);ctx.clearRect(0,0,f.width,f.height);
 ctx.fillStyle='#1b3037';ctx.fillRect(0,0,f.width,f.height);
 const polygon=(ring:V2[],color:string,outline?:string)=>{
  ctx.beginPath();ring.forEach(([x,z],i)=>{const p=minimapProject(x-state.x,z-state.z,state.yaw,scale,0);if(i)ctx.lineTo(p.x,p.y);else ctx.moveTo(p.x,p.y);});ctx.closePath();ctx.fillStyle=color;ctx.fill();
  if(outline){ctx.strokeStyle=outline;ctx.lineWidth=1;ctx.stroke();}
 };
 for(const r of plan.floors)polygon(r,'#b0b7aa');
 for(const r of plan.stairs)polygon(r,'#8c978d','#52615a');
 for(const r of plan.obstacles)polygon(r,'#697970','#374b44');
 for(const r of plan.walls)polygon(r,'#101e1b','#101e1b');
 for(const r of plan.doors)polygon(r,'#765b40','#392c20');
 const dot=(x:number,y:number,color:string,border:string)=>{ctx.beginPath();ctx.arc(x,y,6,0,Math.PI*2);ctx.strokeStyle=border;ctx.lineWidth=2;ctx.stroke();ctx.fillStyle=color;ctx.fill();};
 if(state.target){const m=minimapGoalMarker([state.x,state.z],state.target,state.yaw,scale,0);canvas.dataset.goalMarker=JSON.stringify(m);dot(m.x,m.y,'#ffda54','#493a10');}else delete canvas.dataset.goalMarker;
 dot(f.playerX,f.playerY,'#69ed99','#163a32');
 // Clear outdoor diagnostics as the same canvas is reused across task types.
 for(const key of ['npcMarker','routeStart','routeAlong','routeScale','routeConnector','target','remainingMetres'])delete canvas.dataset[key];
 Object.assign(canvas.dataset,{mapMode:'interior',guidance:'target-only',visibleWidth:String(width),routeVisible:'false',routePoints:'0',activeRouteMetres:'0',futureRoutePoints:'0',perspectiveTilt:'0',floorPolygons:String(plan.floors.length),wallPolygons:String(plan.walls.length),doorPolygons:String(plan.doors.length)});
 canvas.setAttribute('aria-label',"Indoor floor plan minimap: Room, Wall structure, Obstacle, Stairs, Green player and yellow target");
}
