import type {Landmark} from './city-types.ts';
import type {CityWalk,WalkLadder} from './city-walk.ts';
import {WALK_BODY_HEIGHT} from './city-walk.ts';

// Permanent city geometry for the factory ladder and rooftop.
export const CLIMB_SITE={x:3490,z:910,width:30,depth:28,roofHeight:4.2} as const;
export const CLIMB_SOURCE={taskId:'gta-nav-c07-n04',metricStatus:'city-adaptation-not-measured'} as const;
export type ClimbSolid={name:string;x:number;z:number;y:number;width:number;depth:number;height:number;material:'wall'|'metal'|'crate'|'roof'};
export const CLIMB_START:Landmark={id:'native:climb-start',name:"Huaqiangbei · Factory Ladder Climbing Task",area:"Futian · Zhenxing Road",x:3490,z:902,arrival:[3490,902],yaw:0,height:4.2,excludeRadius:0,detailCollision:true};
export const CLIMB_LANDMARK:Landmark={...CLIMB_START,arrival:[3490.37,879.29]};
export function nativeClimbReserved(x:number,z:number,r=0){return Math.abs(x-CLIMB_SITE.x)<=CLIMB_SITE.width/2+r&&Math.abs(z-CLIMB_SITE.z)<=CLIMB_SITE.depth/2+r;}

/** Shared physical solids for drawing, walking, vehicles and task evaluation. */
export class NativeClimbSite{
 readonly groundY:number;readonly ladder:WalkLadder;readonly solids:ClimbSolid[];readonly goal:{x:number;y:number;z:number};
 constructor(terrainY:number){
  this.groundY=terrainY+.12;const y=this.groundY;
  // Stand .40 m behind the rungs, with .32 m clearance to the rear cage bar.
  this.ladder={id:'c07-n04-factory-ladder',x:3490,z:909.40,bottom:y,top:y+CLIMB_SITE.roofHeight,yaw:0,exit:{x:3490,z:911.1}};
  this.goal={x:3490,y:this.ladder.top,z:912.6};
  this.solids=[
   {name:'factory',x:3490,z:914.5,y,width:10,depth:9,height:CLIMB_SITE.roofHeight,material:'wall'},
   {name:'adjacent-workshop',x:3479,z:914,y,width:8,depth:12,height:5.1,material:'wall'},
   {name:'jump-crate',x:3494,z:903,y,width:2,depth:1.5,height:.72,material:'crate'},
   {name:'roof-vent',x:3493,z:916,y:this.ladder.top,width:1.6,depth:1.6,height:1.05,material:'metal'},
   // Low parapets keep the top landing open while allowing deliberate jumps.
   {name:'roof-parapet-west',x:3485.12,z:914.5,y:this.ladder.top,width:.24,depth:9,height:.65,material:'roof'},
   {name:'roof-parapet-east',x:3494.88,z:914.5,y:this.ladder.top,width:.24,depth:9,height:.65,material:'roof'},
   {name:'roof-parapet-back',x:3490,z:918.88,y:this.ladder.top,width:10,depth:.24,height:.65,material:'roof'},
  ];
 }
 groundAt(x:number,z:number){return nativeClimbReserved(x,z)?this.groundY:null;}
 private contains(s:ClimbSolid,x:number,z:number,r=0){return Math.abs(x-s.x)<s.width/2+r&&Math.abs(z-s.z)<s.depth/2+r;}
 floorAt(x:number,z:number,maxY:number,base:number){let y=this.groundAt(x,z)??base;for(const solid of this.solids){const top=solid.y+solid.height;if(top<=maxY+.001&&top>y&&this.contains(solid,x,z))y=top;}return y;}
 blocked(x:number,z:number,feet:number,height=WALK_BODY_HEIGHT){return this.solids.some(s=>this.contains(s,x,z)&&feet<s.y+s.height-.015&&feet+height>s.y+.015);}
 vehicleBlocked(x:number,z:number){return this.solids.some(s=>this.contains(s,x,z,.4));}
}

export class NativeClimbMission{
 readonly maxDuration=20;
 // settledFor is kept at zero for older diagnostic/checkpoint readers only.
 stage:'approach'|'climbing'|'rooftop'|'complete'='approach';elapsed=0;settledFor=0;outcome:'success'|'failure'|null=null;reason='';
 constructor(readonly site:NativeClimbSite,_walker:CityWalk){}
 get instruction(){return this.stage==='approach'?"Face the vertical ladder by the wall, press W Automatically grab on when nearby":this.stage==='climbing'?"W Climb up / S Climb down · Shift Accelerate / Slide down · Automatically step onto the roof at the top":this.stage==='rooftop'?"Reach the rooftop target location to finish":"Reached the target location on the factory roof";}
 step(walker:CityWalk|null,dt:number,paused=false){
  if(this.outcome||paused)return this.outcome;
  const h=Math.max(0,Math.min(.05,dt));this.elapsed+=h;
  if(!walker?.active){this.outcome='failure';this.reason="Exited walking mode, Please restart from the factory floor.";return this.outcome;}
  if(walker.ladder?.ladder.id===this.site.ladder.id)this.stage='climbing';
  const goal=this.site.goal,atRoofHeight=Math.abs(walker.y-goal.y)<=.35;
  if(atRoofHeight&&!walker.ladder)this.stage='rooftop';
  else if(!walker.ladder)this.stage='approach';
  // Position-only arrival at the former yellow ring, including while moving.
  // Keep height gating: passing underneath this rooftop must not complete it.
  const arrived=atRoofHeight&&Math.hypot(walker.x-goal.x,walker.z-goal.z)<=1.1;
  if(arrived){this.stage='complete';this.outcome='success';this.reason="Reached the target location on the factory roof.";}
  // Evaluate arrival first so meeting the goal on the deadline still succeeds.
  if(!this.outcome&&this.elapsed>=this.maxDuration-1e-9){this.elapsed=this.maxDuration;this.outcome='failure';this.reason="Maximum runtime exceeded(20 seconds), Ladder climbing task failed.";}
  return this.outcome;
 }
}
