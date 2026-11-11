import {generateOutdoorTask,DEFAULT_OUTDOOR_GENERATOR,type OutdoorGeneratorEnvironment} from './outdoor-task-generator.ts';
import {outdoorNpcRules,type OutdoorVehicle} from './generated-outdoor-tasks.ts';
import {walkRandom,effectiveWalkTurns} from './outdoor-walk-generator.ts';
import {walkLength} from './generated-walk-tasks.ts';
import {trainingRooms,routeLength3} from './training-room-layout.ts';
import {domain,inPosition,validateSamplingSpec,type NumericDomain,type Position3,type SamplingSpec,type ShootingPool,type TrainingTask} from './training-task-schema.ts';
import type {ExtraLayout} from './native-extra-layout.ts';
import type {NativeFlightConfig} from './native-flight-catalog.ts';
import type {WalkGoalLandmarkChoice} from './walk-goal-landmark.ts';
import {sampleArrivalTimeLimit} from './training-time-limit.ts';

export type TrainingGenerationEnvironment={outdoor:OutdoorGeneratorEnvironment;shootingPool:ShootingPool;flights:readonly NativeFlightConfig[];
 placeInterior:(layout:ExtraLayout,spec:SamplingSpec,random:()=>number)=>Position3;
 airClear:(point:Position3)=>boolean;flightLaunch:Position3;
};
export const TEMPLATE_CAPABILITIES={
 road:{category:'outdoor-road',movement:['drive'],parameters:['start','destination','heading','length','turns','timeLimit','minSeparation']},
 outdoor:{category:'outdoor-foot',movement:['walk'],parameters:['start','destination','heading','length','turns','landmark','timeLimit','minSeparation']},
 aquatic:{category:'water',movement:['swim','dive','boat'],parameters:['start','destination','heading','length','turns','timeLimit','minSeparation']},
 vertical:{category:'stairs',movement:['walk'],parameters:['start','destination','heading','length','turns']},
 aviation:{category:'air',movement:['plane','helicopter'],parameters:['start','destination','heading','length','turns']},
 indoor:{category:'indoor',movement:['walk'],parameters:['start','destination','heading','length','turns']},
 follow:{category:'follow',movement:['walk','drive','swim','dive','boat'],parameters:['start','destination','heading','length','turns','transport','actorSpeed','initialDistance']},
 pursuit:{category:'chase',movement:['drive'],parameters:['start','destination','heading','length','turns','actorSpeed','initialDistance']},
 evasion:{category:'escape',movement:['walk','drive','swim','dive','boat'],parameters:['start','heading','transport','actorSpeed','initialDistance','pursuerCount']},
 shooting:{category:'shooting',movement:[],parameters:['imageIndices','aimOffset']},
} as const;
const sample=(r:NumericDomain|undefined,def:NumericDomain,random:()=>number,integer=false)=>{const [a,b]=domain(r,def,'sample',integer);return integer?a+Math.floor(random()*(b-a+1)):a+(b-a)*random();};
const transport=(m:string)=>['swim','dive','boat'].includes(m)?'water':['plane','helicopter'].includes(m)?'air':'land';
function choices(s:SamplingSpec){
 const support:TEMPLATE_CAPABILITIES_VALUE= TEMPLATE_CAPABILITIES[s.template];
 if(s.movement?.some(m=>!(support.movement as readonly string[]).includes(m)))throw Error('Movement is not supported by '+s.template);
 const modes=(s.movement??support.movement).filter(m=>!s.transport||s.transport.includes(transport(m)));
 if(s.template!=='shooting'&&!modes.length)throw Error('No compatible movement/transport choices');
 if(s.transport?.some(t=>!support.movement.some(m=>transport(m)===t)))throw Error('Transport is not supported by '+s.template);
 return modes;
}
type TEMPLATE_CAPABILITIES_VALUE={readonly category:string;readonly movement:readonly string[];readonly parameters:readonly string[]};
export function validateTemplateSpec(s:SamplingSpec){validateSamplingSpec(s);choices(s);}
function matchesRoute(t:TrainingTask,s:SamplingSpec){
 if(s.length!==undefined){const [a,b]=domain(s.length,0,'length');if(t.resolved.length===null||t.resolved.length<a-1e-5||t.resolved.length>b+1e-5)return false;}
 if(s.turns!==undefined){const [a,b]=domain(s.turns,0,'turns',true);if(t.resolved.turns===null||t.resolved.turns<a||t.resolved.turns>b)return false;}
 return (t.resolved.start===null||inPosition(t.resolved.start,s.start))&&(t.resolved.destination===null||inPosition(t.resolved.destination,s.destination));
}
/** Reject graph junction spurs that produce almost reversing consecutive legs.
 * These are distinct graph nodes but visually overlapping road segments, not
 * useful route complexity. A different candidate must still meet all domains. */
export function hasVehicleHairpin(points:readonly (readonly [number,number])[]){
 return points.slice(1,-1).some((b,i)=>{
  const a=points[i],c=points[i+2],u=Math.atan2(b[0]-a[0],b[1]-a[1]),v=Math.atan2(c[0]-b[0],c[1]-b[1]);
  return Math.abs(Math.atan2(Math.sin(v-u),Math.cos(v-u)))>150*Math.PI/180;
 });
}

/** Host-only deterministic sampling. This module does not register an agent
 * tool, mutate benchmark definitions, silently clamp requested values, or
 * call a model. A candidate is NOT publishable until the host probes it. */
export function generateTrainingTask(env:TrainingGenerationEnvironment,s:SamplingSpec,index:number):TrainingTask{
 validateTemplateSpec(s);const seed=((s.seed??42)+Math.imul(index+1,2654435761))>>>0||1,random=walkRandom(seed),modes=choices(s);
 const id=`rl-task-${s.template}-${s.name??'sample'}-${String(index+1).padStart(4,'0')}`,failures:Record<string,number>={};
 const base=(movement:string):TrainingTask=>({id,template:s.template,seed,category:TEMPLATE_CAPABILITIES[s.template].category,title:'Generated '+s.template,instruction:{en:'Reach the marked destination.',zh:'Reach the marked destination.'},resolved:{start:null,destination:null,heading:null,length:null,turns:null,transport:transport(movement),movement,routeRole:'player'},maxDuration:180,maxRounds:300,validation:{status:'geometry-verified',scope:'Controller probe pending'}});
 for(let attempt=0;attempt<(s.attempts??40);attempt++){
  try{
   if(s.template==='shooting'){
    const pool=env.shootingPool.pairs.filter(p=>!s.imageIndices||s.imageIndices.includes(p.index));
    if(s.imageIndices?.some(i=>!env.shootingPool.pairs.some(p=>p.index===i)))throw Error('Unknown image index');
    if(!pool.length)throw Error('Empty annotated training shooting pool');
    const p=pool[Math.floor(random()*pool.length)],dx=sample(s.aimOffset?.x,[-160,160],random),dy=sample(s.aimOffset?.y,[-90,90],random),aim:[number,number]=[p.center[0]+dx*p.width/1280,p.center[1]-dy*p.height/720];
    if(aim.some((v,i)=>v<0||v>=[p.width,p.height][i]))throw Error('Initial aim outside image');
    const t=base('stationary');t.instruction=structuredClone(p.instruction);t.title=p.instruction.en.slice(0,160);t.maxDuration=0;t.maxRounds=20;t.resolved={start:null,destination:null,heading:null,length:null,turns:null,transport:null,movement:'stationary',routeRole:'none',imageIndex:p.index,aimOffset:[dx,dy]};t.shooting={pair:structuredClone(p),initialAim:aim};return t;
   }
   const movement=modes[Math.floor(random()*modes.length)],t=base(movement);
   if(s.template==='indoor'||s.template==='vertical'){
    const upstairs=s.template==='vertical',k=sample(s.turns,upstairs?[2,5]:[0,4],random,true),length=sample(s.length,upstairs?[25,60]:[25,70],random);
    // Solve room size against the final 3D route, rather than counting only
    // horizontal travel and ignoring the staircase in the distance budget.
    const mirror=random()<.5?-1:1,[turnMin,turnMax]=domain(s.turns,upstairs?[2,5]:[0,4],'turns',true);
    const candidates=(upstairs?Array.from({length:17},(_,i)=>i):[k]).filter(n=>{
     const a=trainingRooms(id,n,8,upstairs,mirror),b=trainingRooms(id,n,20,upstairs,mirror),turns=effectiveWalkTurns(a.layout.points as [number,number][]).length;
     return turns>=turnMin&&turns<=turnMax&&routeLength3(a.route)<=length+1e-6&&routeLength3(b.route)>=length-1e-6;
    });
    if(!candidates.length)throw Error('No room topology meets the joint fixed length/turn domains');
    const roomTurns=candidates[Math.floor(random()*candidates.length)];let low=8,high=20;
    for(let i=0;i<36;i++){const size=(low+high)/2,r=trainingRooms(id,roomTurns,size,upstairs,mirror);if(routeLength3(r.route)<length)low=size;else high=size;}
    const {layout,route}=trainingRooms(id,roomTurns,(low+high)/2,upstairs,mirror),placement=env.placeInterior(layout,s,random);
    const actual=routeLength3(route),turnCount=effectiveWalkTurns(layout.points as [number,number][]).length;
    if(Math.abs(actual-length)>1e-4)throw Error('Requested room route does not fit the template dimensions');
    t.interior={layout,placement};t.resolved={...t.resolved,start:{x:route[0].x+placement.x,y:route[0].y+placement.y,z:route[0].z+placement.z},destination:{x:route.at(-1)!.x+placement.x,y:route.at(-1)!.y+placement.y,z:route.at(-1)!.z+placement.z},heading:sample(s.heading,[-180,180],random),length:actual,turns:turnCount};
    t.instruction=upstairs?{en:'Find the stairs and walk to the marked destination upstairs.',zh:'Find the stairs and walk to the marked destination upstairs.'}:{en:'Walk through the rooms to the marked destination.',zh:'Walk through the rooms to the marked destination.'};
    t.maxDuration=180;t.title=t.instruction.en;
   }else if(s.template==='aviation'){
    const templates=env.flights.filter(c=>c.vehicle===(movement==='plane'?'plane':'helicopter'));
    if(!templates.length)throw Error('No matching aircraft template');
    const c=structuredClone(templates[Math.floor(random()*templates.length)]),k=sample(s.turns,[0,3],random,true),length=sample(s.length,[600,1600],random),run=length/(k+1),origin=c.route[0]??c.approachOrigin;
    c.objective='navigate';c.route=[];
    let p={x:origin.x,y:origin.y,z:origin.z},yaw=c.yaw;const side=random()<.5?-1:1;c.route.push({...p,sourceIndex:0});
    for(let i=0;i<=k;i++){if(i)yaw+=side*(i%2?1:-1)*Math.PI/2;p={x:p.x+Math.sin(yaw)*run,y:p.y,z:p.z+Math.cos(yaw)*run};c.route.push({...p,sourceIndex:i+1});}
    for(let i=1;i<c.route.length;i++){const a=c.route[i-1],b=c.route[i],steps=Math.ceil(run/10);for(let j=0;j<=steps;j++)if(!env.airClear({x:a.x+(b.x-a.x)*j/steps,y:a.y,z:a.z+(b.z-a.z)*j/steps}))throw Error('Flight route intersects rendered terrain/building or leaves city');}
    const heading=c.yaw*180/Math.PI,[lo,hi]=domain(s.heading,heading,'heading');if(heading<lo||heading>hi)throw Error('Initial heading must admit the fixed runway direction');
    t.flight=c;t.resolved={...t.resolved,start:{...env.flightLaunch},destination:{...c.landingPoint},heading,length,turns:k};t.maxDuration=180+length/(movement==='plane'?35:14)+routeLength3([c.route.at(-1)!,...c.recovery,c.landingPoint])/(movement==='plane'?25:12);
    t.instruction={en:movement==='plane'?'Board the plane, fly through the marked route, and land at the destination.':'Board the helicopter, fly through the marked route, and land at the destination.',zh:movement==='plane'?'Board the plane, fly through the marked route, and land at the destination.':'Board the helicopter, fly through the marked route, and land at the destination.'};t.title=t.instruction.en;
   }else{
    const vehicle=(movement==='dive'?'swim':movement) as OutdoorVehicle,follow=s.template==='follow',intercept=s.template==='pursuit',escape=s.template==='evasion';
    const distance=escape?70:sample(s.length,vehicle==='drive'?[300,1000]:[60,150],random),[minTurns,maxTurns]=domain(s.turns,[0,3],'turns',true);
    const c={...DEFAULT_OUTDOOR_GENERATOR,vehicle,follow,intercept,escape,distance,minTurns:escape?0:minTurns,maxTurns:escape?3:maxTurns,tolerance:s.length!==undefined&&domain(s.length,0,'length')[0]===domain(s.length,0,'length')[1]?0:.08,count:1,seed:(seed+attempt*1009)>>>0||1,prefix:s.name??'sample',attempts:8,maxVisited:30000,landmark:(s.landmark??'none') as WalkGoalLandmarkChoice,startDepth:movement==='dive'?sample(undefined,[2,4],random):0,goalDepth:movement==='dive'?sample(undefined,[4,8],random):0};
    if(vehicle==='swim'){
     if(s.start?.y!==undefined)c.startDepth=env.outdoor.water.height-sample(s.start.y,0,random);
     if(s.destination?.y!==undefined)c.goalDepth=env.outdoor.water.height-sample(s.destination.y,0,random);
     if((follow||escape)&&s.destination?.y===undefined)c.goalDepth=c.startDepth;
     if(follow&&Math.abs(c.goalDepth-c.startDepth)>.01)throw Error('Swimming target template retains a fixed depth');
    }
    const regionStarts=env.outdoor.walk.starts.filter(p=>inPosition({x:p[0],y:env.outdoor.walk.height(...p),z:p[1]},s.start));
    const e={...env.outdoor,walk:{...env.outdoor.walk,starts:regionStarts},roads:{...env.outdoor.roads},water:{...env.outdoor.water}};
    if(s.start&&!follow&&!intercept){
     if(vehicle==='drive')e.roads.startIndices=e.roads.nodes.map((_,i)=>i).filter(i=>{const p=e.roads.nodes[i];return inPosition({x:p[0],y:e.ground(...p),z:p[1]},s.start);});
     if(vehicle==='swim'||vehicle==='boat')e.water.starts=e.water.starts.filter(p=>inPosition({x:p[0],y:e.water.height-c.startDepth,z:p[1]},s.start));
    }
    const o=generateOutdoorTask(e,c,index).task;
    if(vehicle==='drive'&&hasVehicleHairpin(o.points))throw Error('Road route has a near-reversing junction spur');
    const height=(p:[number,number])=>['swim','boat'].includes(vehicle)?env.outdoor.water.height-(vehicle==='swim'?c.startDepth:0):vehicle==='walk'?env.outdoor.walk.height(...p):env.outdoor.ground(...p);
    if(follow||intercept){const rules=outdoorNpcRules(o),speed=sample(s.actorSpeed,rules.speed,random),gap=sample(s.initialDistance,o.playerSpawn.gap,random);
     if(speed>{walk:4.2,swim:2.4,drive:53,boat:8}[vehicle]||gap<{walk:2,swim:2,drive:6,boat:8}[vehicle]||intercept&&gap>200)throw Error('Target speed/separation exceeds this movement template capacity');
     if(follow&&gap>rules.radius)throw Error('Initial following distance exceeds the fixed failure threshold');
     const a=o.points[0],yaw=o.playerSpawn.yaw,point:[number,number]=[a[0]-Math.sin(yaw)*gap,a[1]-Math.cos(yaw)*gap];
     const clear=(x:number,z:number)=>vehicle==='drive'?(e.driveSpawnClear??e.driveClear)(x,z,yaw):vehicle==='walk'?e.walk.clear(x,z):e.water.clear(x,z,vehicle==='boat'?4:1);
     for(let d=0;d<=gap;d+=.5)if(!clear(a[0]-Math.sin(yaw)*d,a[1]-Math.cos(yaw)*d))throw Error('Actor separation has no safe player lead-in');
     o.playerSpawn={point,yaw,gap};o.actors={speed,initialDistance:gap};t.resolved.actorSpeed=speed;t.resolved.initialDistance=gap;
     if(follow)o.instruction={en:`Follow the blue target to its destination, remaining within ${rules.radius} metres.`,zh:`Follow the blue target to its destination, remaining within ${rules.radius} metres.`};
    }
    if(escape){const n=sample(s.pursuerCount,[1,3],random,true),pursuers:{point:[number,number];yaw:number;speed:number}[]=[];
     for(let i=0;i<n;i++){let actor;for(let j=0;j<40;j++){const d=sample(s.initialDistance,[35,65],random),a=random()*Math.PI*2,point:[number,number]=[o.playerSpawn.point[0]+Math.sin(a)*d,o.playerSpawn.point[1]+Math.cos(a)*d],yaw=Math.atan2(o.playerSpawn.point[0]-point[0],o.playerSpawn.point[1]-point[1]);
      if(d<(vehicle==='walk'||vehicle==='swim'?2:8)||pursuers.some(p=>Math.hypot(p.point[0]-point[0],p.point[1]-point[1])<8))continue;
      if(vehicle==='walk'?!e.walk.clear(...point):vehicle==='drive'?!(e.driveSpawnClear??e.driveClear)(...point,yaw):!e.water.clear(...point,4))continue;
      actor={point,yaw,speed:sample(s.actorSpeed,vehicle==='walk'?4.5:vehicle==='swim'?2.4:20,random)};break;}
      if(!actor)throw Error('No collision-free pursuer placement within initial-distance bounds');pursuers.push(actor);
     }o.actors={pursuers,reinforcementSpeeds:Array.from({length:64},()=>sample(s.actorSpeed,vehicle==='walk'?4.5:vehicle==='swim'?2.4:20,random))};t.resolved.pursuerCount=n;
    }
    o.playerSpawn.yaw=sample(s.heading,o.playerSpawn.yaw*180/Math.PI,random)*Math.PI/180;
    if(vehicle==='drive'&&!(e.driveSpawnClear??e.driveClear)(...o.playerSpawn.point,o.playerSpawn.yaw))throw Error('Requested initial heading puts the vehicle inside geometry');
    t.outdoor=o;t.instruction=o.instruction;t.title=o.title;t.maxDuration=escape?180:follow||intercept?distance/(o.actors?.speed??outdoorNpcRules(o).speed)*2+30:o.maxDuration;
    o.maxDuration=t.maxDuration;
    t.resolved={...t.resolved,start:{x:o.playerSpawn.point[0],y:height(o.playerSpawn.point),z:o.playerSpawn.point[1]},destination:escape?null:{x:o.points.at(-1)![0],y:height(o.points.at(-1)!)+(vehicle==='swim'?c.startDepth-c.goalDepth:0),z:o.points.at(-1)![1]},heading:o.playerSpawn.yaw*180/Math.PI,length:escape?null:walkLength(o.points),turns:escape?null:o.turnCount,routeRole:escape?'none':follow||intercept?'npc':'player'};
   }
   if(s.timeLimit){
    t.timeLimit=sampleArrivalTimeLimit(s.timeLimit,random,t.maxDuration);t.maxDuration=t.outdoor!.maxDuration=t.timeLimit.seconds;
    t.instruction={en:t.instruction.en.replace(/\.$/,'')+' before time runs out.',zh:t.instruction.en.replace(/\.$/,'')+' before time runs out.'};
    t.outdoor!.instruction=structuredClone(t.instruction);t.title=t.outdoor!.title=t.instruction.en.slice(0,160);
   }
   if(!matchesRoute(t,s))throw Error('Joint endpoint/length/turn constraints not satisfied');
   return t;
  }catch(error){const message=error instanceof Error?error.message:String(error);failures[message.slice(0,160)]=(failures[message.slice(0,160)]??0)+1;}
 }
 throw Error(`No feasible ${s.template} task within generation budget: ${JSON.stringify(failures)}`);
}
