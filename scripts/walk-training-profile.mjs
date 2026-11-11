import {walkRandom,effectiveWalkTurns} from '../native-city/src/outdoor-walk-generator.ts';
import {walkLength} from '../native-city/src/generated-walk-tasks.ts';
import {WALK_VEHICLES} from '../native-city/src/native-walk-vehicle-layout.ts';

/** Hamilton allocation. Stable, seeded tie breaking avoids alphabetical bias. */
export function allocateProportionally(groups,total,seed=42){
 if(!Number.isInteger(total)||total<0||!groups.length||groups.some(g=>!Number.isFinite(g.weight)||g.weight<=0))throw Error('Invalid proportional allocation');
 const sum=groups.reduce((n,g)=>n+g.weight,0),random=walkRandom(seed);
 const rows=groups.map(g=>{const exact=total*g.weight/sum;return {...g,count:Math.floor(exact),remainder:exact-Math.floor(exact),tie:random()};});
 const ranked=[...rows].sort((a,b)=>b.remainder-a.remainder||b.weight-a.weight||a.tie-b.tie);
 const remaining=total-rows.reduce((n,g)=>n+g.count,0);
 for(let i=0;i<remaining;i++)ranked[i].count++;
 return rows.map(({remainder,tie,...row})=>row);
}
function shuffle(values,random){for(let i=values.length-1;i>0;i--){const j=Math.floor(random()*(i+1));[values[i],values[j]]=[values[j],values[i]];}return values;}

export function createEmpiricalWalkPlan(inventory,{count=100,seed=42}={}){
 const rows=inventory?.rows;
 if(!Array.isArray(rows)||!rows.length||rows.some(r=>r.error||!r.id||!Number.isFinite(r.length)||!Number.isInteger(r.effectiveTurns)||r.length<20||!Array.isArray(r.points)||r.points.length<2))throw Error('Profile requires a complete measured outdoor-foot inventory');
 if(new Set(rows.map(r=>r.id)).size!==rows.length)throw Error('Duplicate inventory task ID');
 const groups=new Map(),kinds=new Map();let goals=0;
 for(const row of rows){
  const length=Math.round(row.length*100)/100,key=`${length}/${row.effectiveTurns}`;
  if(!groups.has(key))groups.set(key,{key,length,turns:row.effectiveTurns,weight:0,sourceIds:[]});
  const group=groups.get(key);group.weight++;group.sourceIds.push(row.id);
  // Start-only props and climbing tasks are not goal landmark examples.
  const prop=WALK_VEHICLES[row.id]?.find(v=>v.at===1);
  if(prop){goals++;kinds.set(prop.model,(kinds.get(prop.model)??0)+1);}
 }
 const lengthTurns=allocateProportionally([...groups.values()].sort((a,b)=>a.length-b.length||a.turns-b.turns),count,seed);
 const landmarkCount=Math.round(count*goals/rows.length);
 const landmarks=kinds.size?allocateProportionally([...kinds].sort(([a],[b])=>a.localeCompare(b)).map(([kind,weight])=>({kind,weight})),landmarkCount,seed^0x5bd1e995):[];
 const random=walkRandom(seed^0x85ebca6b),pool=shuffle([...Array(count-landmarkCount).fill('none'),...landmarks.flatMap(g=>Array(g.count).fill(g.kind))],random);
 const entries=shuffle(lengthTurns.flatMap(g=>Array.from({length:g.count},()=>({length:g.length,turns:g.turns,sourceIds:g.sourceIds}))),random).map((row,index)=>({...row,index,landmark:pool[index]}));
 return {schema:'gtabench.walk-sampling-plan.v1',seed,count,baselineCount:rows.length,rounding:'largest remainder; higher source weight then seeded tie break',scope:'joint route length (rounded to 0.01 m) and effective >=35 degree bends; optional endpoint GLB types sampled independently; does not copy source mission interactions or assets at the start',lengthTurns,landmarks,landmarkCount,entries};
}

export function pointSegmentDistance(p,a,b){const dx=b[0]-a[0],dz=b[1]-a[1],n=dx*dx+dz*dz,t=n?Math.max(0,Math.min(1,((p[0]-a[0])*dx+(p[1]-a[1])*dz)/n)):0;return Math.hypot(p[0]-a[0]-t*dx,p[1]-a[1]-t*dz);}
export function distanceToRoutes(point,routes){let distance=Infinity;for(const points of routes)for(let i=1;i<points.length;i++)distance=Math.min(distance,pointSegmentDistance(point,points[i-1],points[i]));return distance;}
const cross=(a,b,c)=>(b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);
export function segmentDistance(a,b,c,d){
 if(Math.max(Math.min(a[0],b[0]),Math.min(c[0],d[0]))<=Math.min(Math.max(a[0],b[0]),Math.max(c[0],d[0]))&&Math.max(Math.min(a[1],b[1]),Math.min(c[1],d[1]))<=Math.min(Math.max(a[1],b[1]),Math.max(c[1],d[1]))&&cross(a,b,c)*cross(a,b,d)<=0&&cross(c,d,a)*cross(c,d,b)<=0)return 0;
 return Math.min(pointSegmentDistance(a,c,d),pointSegmentDistance(b,c,d),pointSegmentDistance(c,a,b),pointSegmentDistance(d,a,b));
}
export function routeDistance(a,b){let distance=Infinity;for(let i=1;i<a.length;i++)for(let j=1;j<b.length;j++)distance=Math.min(distance,segmentDistance(a[i-1],a[i],b[j-1],b[j]));return distance;}

/** Prefer real obstacle-rich neighbourhoods for high-bend requests, without
 * inventing barriers or moving buildings. Clearance remains the game oracle. */
export function walkingStartDensities(nodes,buildings){
 const grid=new Map();
 for(const b of buildings){const ring=b.rings?.[0];if(!ring?.length)continue;const p=[ring.reduce((n,q)=>n+q[0],0)/ring.length,ring.reduce((n,q)=>n+q[1],0)/ring.length],key=`${Math.floor(p[0]/100)},${Math.floor(p[1]/100)}`;if(!grid.has(key))grid.set(key,[]);grid.get(key).push(p);}
 return nodes.map(p=>{let density=0;for(let dx=-1;dx<=1;dx++)for(let dz=-1;dz<=1;dz++)for(const q of grid.get(`${Math.floor(p[0]/100)+dx},${Math.floor(p[1]/100)+dz}`)??[])if(Math.hypot(p[0]-q[0],p[1]-q[1])<100)density++;return {point:p,density};});
}

export function auditTrainingBatch(tasks,plan,config,baseline){
 if(tasks.length!==plan.count)throw Error(`Incomplete training batch: ${tasks.length}/${plan.count}`);
 const ids=new Set(),starts=[],goals=[],turnCounts={},landmarks={},lengthGroups={};let minimumEvalDistance=Infinity,minimumStartDistance=Infinity,minimumGoalDistance=Infinity;
 for(const entry of plan.entries){
  const id=`rl-walk-${config.prefix}-${String(entry.index+1).padStart(4,'0')}`,task=tasks.find(t=>t.id===id);
  if(!task||ids.has(id)||task.validation?.status!=='walk-verified'||task.turnCount!==entry.turns||effectiveWalkTurns(task.points).length!==entry.turns||Math.abs(task.length-walkLength(task.points))>1e-7||Math.abs(task.length-entry.length)>entry.length*config.tolerance+1e-7||(task.goalLandmark?.kind??'none')!==entry.landmark)throw Error(`Training batch quota/validation mismatch: ${id}`);
  ids.add(id);turnCounts[task.turnCount]=(turnCounts[task.turnCount]??0)+1;landmarks[entry.landmark]=(landmarks[entry.landmark]??0)+1;lengthGroups[entry.length]=(lengthGroups[entry.length]??0)+1;
  for(const row of baseline.rows)minimumEvalDistance=Math.min(minimumEvalDistance,routeDistance(task.points,row.points));
  const start=task.points[0],goal=task.points.at(-1);
  for(const p of starts)minimumStartDistance=Math.min(minimumStartDistance,Math.hypot(p[0]-start[0],p[1]-start[1]));
  for(const p of goals)minimumGoalDistance=Math.min(minimumGoalDistance,Math.hypot(p[0]-goal[0],p[1]-goal[1]));
  starts.push(start);goals.push(goal);
 }
 if(minimumEvalDistance<config.evalClearance-1e-6||minimumStartDistance<config.minSeparation-1e-6||minimumGoalDistance<config.minSeparation-1e-6)throw Error('Training spatial separation audit failed');
 const lengths=tasks.map(t=>t.length);
 return {count:tasks.length,turnCounts,landmarks,lengthGroups,length:{min:Math.min(...lengths),max:Math.max(...lengths),mean:lengths.reduce((a,b)=>a+b,0)/lengths.length},minimumEvalDistance,minimumStartDistance,minimumGoalDistance,spatialScope:'polyline corridor buffer from current outdoor-foot baseline only; same GTA_SZ city, not a scene-disjoint or all-category train/test split'};
}
