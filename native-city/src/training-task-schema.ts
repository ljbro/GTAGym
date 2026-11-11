import {parseOutdoorDataset,OUTDOOR_DATASET_SCHEMA,type GeneratedOutdoorTask} from './generated-outdoor-tasks.ts';
import type {ExtraLayout} from './native-extra-layout.ts';
import type {NativeFlightConfig} from './native-flight-catalog.ts';
import {validateArrivalTimeLimit,assertResolvedTimeLimit,type ArrivalTimeLimitSpec,type ArrivalTimeLimit} from './training-time-limit.ts';

export const TRAINING_SCHEMA='gtabench.training.v2';
export const TRAINING_GENERATOR_VERSION='template-ranges-v2-safe-vehicle-turns';
export const TRAINING_ID=/^rl-task-(road|outdoor|aquatic|vertical|aviation|indoor|follow|pursuit|evasion|shooting)-[a-z0-9][a-z0-9-]{0,57}$/;
export const TRAINING_TEMPLATES=['road','outdoor','aquatic','vertical','aviation','indoor','follow','pursuit','evasion','shooting'] as const;
export const TRAINING_CATEGORIES={road:'outdoor-road',outdoor:'outdoor-foot',aquatic:'water',vertical:'stairs',aviation:'air',indoor:'indoor',follow:'follow',pursuit:'chase',evasion:'escape',shooting:'shooting'} as const;
export type TrainingTemplate=typeof TRAINING_TEMPLATES[number];
export type NumericDomain=number|[number,number];
export type PositionDomain={x:NumericDomain;y?:NumericDomain;z:NumericDomain};
export type SamplingSpec={
 template:TrainingTemplate;count?:number;seed?:number;name?:string;split?:'train'|'validation';attempts?:number;
 start?:PositionDomain;destination?:PositionDomain;heading?:NumericDomain;length?:NumericDomain;turns?:NumericDomain;
 transport?:('land'|'water'|'air')[];movement?:('walk'|'drive'|'swim'|'dive'|'boat'|'plane'|'helicopter')[];
 actorSpeed?:NumericDomain;initialDistance?:NumericDomain;pursuerCount?:NumericDomain;
 imageIndices?:number[];aimOffset?:{x:NumericDomain;y:NumericDomain};landmark?:string;
 timeLimit?:ArrivalTimeLimitSpec;minSeparation?:number;
};
export type Position3={x:number;y:number;z:number};
export type ShootingPair={index:number;id:string;sourceId:string;config:string;configSha256:string;imageSha256:string;width:number;height:number;center:[number,number];instruction:{en:string;zh:string};quality:string};
export type ShootingPool={schema:'gtabench.shooting-pool.v1';pairs:ShootingPair[];provenance:Record<string,unknown>};
export type TrainingTask={
 id:string;template:TrainingTemplate;category:string;seed:number;title:string;instruction:{en:string;zh:string};
 resolved:{start:Position3|null;destination:Position3|null;heading:number|null;length:number|null;turns:number|null;transport:'land'|'water'|'air'|null;movement:string;routeRole:'player'|'npc'|'none';actorSpeed?:number;initialDistance?:number;pursuerCount?:number;imageIndex?:number;aimOffset?:[number,number]};
 maxDuration:number;maxRounds:number;timeLimit?:ArrivalTimeLimit;
 outdoor?:GeneratedOutdoorTask;
 interior?:{layout:ExtraLayout;placement:Position3};
 flight?:NativeFlightConfig;
 shooting?:{pair:ShootingPair;initialAim:[number,number]};
 validation:{status:'geometry-verified'|'physics-verified';scope:string};
};
export type TrainingPlan={name?:string;seed?:number;split?:'train'|'validation';requests:SamplingSpec[]};
export type TrainingDataset={schema:typeof TRAINING_SCHEMA;generatorVersion:string;split:'train'|'validation';spec:SamplingSpec|TrainingPlan;provenance:Record<string,unknown>;tasks:TrainingTask[]};

export function domain(value:NumericDomain|undefined,fallback:NumericDomain,name:string,integer=false):[number,number]{
 const v=value??fallback,r=typeof v==='number'?[v,v]:v;
 if(!Array.isArray(r)||r.length!==2||!r.every(Number.isFinite)||r[0]>r[1]||integer&&!r.every(Number.isInteger))throw Error('Invalid domain: '+name);
 return [r[0],r[1]];
}
export function inPosition(p:Position3,region?:PositionDomain){return !region||(['x','y','z'] as const).every(k=>region[k]===undefined||(()=>{const [a,b]=domain(region[k],0,k);return p[k]>=a-1e-6&&p[k]<=b+1e-6;})());}
export function validateSamplingSpec(s:SamplingSpec){
 if(!s||!TRAINING_TEMPLATES.includes(s.template))throw Error('Unknown template (sniping is evaluation-only)');
 const allowed=['template','count','seed','name','split','attempts','start','destination','heading','length','turns','transport','movement','actorSpeed','initialDistance','pursuerCount','imageIndices','aimOffset','landmark','timeLimit','minSeparation'];
 if(Object.keys(s).some(k=>!allowed.includes(k)))throw Error('Unknown sampling parameter');
 for(const [k,def,min,max] of [['count',1,1,10000],['seed',42,1,0xffffffff],['attempts',40,1,200]] as const){const n=s[k]??def;if(!Number.isInteger(n)||n<min||n>max)throw Error('Invalid '+k);}
 if(!/^[a-z0-9][a-z0-9-]{0,27}$/.test(s.name??'sample')||s.split!==undefined&&!['train','validation'].includes(s.split))throw Error('Invalid dataset name or split');
 for(const [k,max,integer] of [['length',15000,false],['turns',20,true],['actorSpeed',80,false],['initialDistance',2000,false],['pursuerCount',8,true]] as const){if(s[k]===undefined)continue;const r=domain(s[k],0,k,integer);if(r[0]<(k==='turns'?0:k==='pursuerCount'?1:.01)||r[1]>max)throw Error('Out of range: '+k);}
 if(domain(s.heading,[-180,180],'heading').some(v=>Math.abs(v)>360))throw Error('Heading must use degrees within [-360,360]');
 for(const k of ['start','destination'] as const)if(s[k]!==undefined){const p=s[k]!;if(!p||typeof p!=='object'||p.x===undefined||p.z===undefined||Object.keys(p).some(k=>!['x','y','z'].includes(k)))throw Error('Invalid '+k+' region');for(const axis of ['x','y','z'] as const)if(p[axis]!==undefined&&domain(p[axis],0,axis).some(v=>Math.abs(v)>20000))throw Error('Position outside city domain');}
 if(s.transport!==undefined&&(!Array.isArray(s.transport)||!s.transport.length||s.transport.some(m=>!['land','water','air'].includes(m))||new Set(s.transport).size!==s.transport.length))throw Error('Invalid transport candidate set');
 if(s.movement!==undefined&&(!Array.isArray(s.movement)||!s.movement.length||s.movement.some(m=>!['walk','drive','swim','dive','boat','plane','helicopter'].includes(m))||new Set(s.movement).size!==s.movement.length))throw Error('Invalid movement candidate set');
 const relation=['follow','pursuit','evasion'].includes(s.template);
 if(!relation&&(s.actorSpeed!==undefined||s.initialDistance!==undefined)||s.template!=='evasion'&&s.pursuerCount!==undefined)throw Error('Actor parameters require a corresponding relation template');
 if(s.template==='evasion'&&(s.destination!==undefined||s.length!==undefined||s.turns!==undefined))throw Error('Evasion has no destination, route length or turns');
 if(s.template==='shooting'){
  for(const k of ['start','destination','heading','length','turns','transport','movement','landmark'] as const)if(s[k]!==undefined)throw Error('Shooting is stationary; parameter does not apply: '+k);
  if(s.imageIndices!==undefined&&(!Array.isArray(s.imageIndices)||!s.imageIndices.length||s.imageIndices.some(i=>!Number.isInteger(i)||i<1)||new Set(s.imageIndices).size!==s.imageIndices.length))throw Error('Invalid 1-based image candidate set');
  if(s.aimOffset){if(Object.keys(s.aimOffset).some(k=>!['x','y'].includes(k)))throw Error('Invalid aim offset');domain(s.aimOffset.x,0,'aimOffset.x');domain(s.aimOffset.y,0,'aimOffset.y');}
 }else if(s.imageIndices!==undefined||s.aimOffset!==undefined)throw Error('Image/aim parameters are shooting-only');
 if(s.landmark!==undefined&&s.template!=='outdoor')throw Error('Goal landmarks require on-foot navigation');
 if(s.timeLimit!==undefined){if(!['road','outdoor','aquatic'].includes(s.template))throw Error('timeLimit requires a road/outdoor/aquatic arrival template');validateArrivalTimeLimit(s.timeLimit);}
 if(s.minSeparation!==undefined&&(!['road','outdoor','aquatic','follow','pursuit'].includes(s.template)||!Number.isFinite(s.minSeparation)||s.minSeparation<0||s.minSeparation>2000))throw Error('Invalid minSeparation');
}
export function parseTrainingDataset(value:unknown):TrainingDataset{
 const d=value as TrainingDataset;
 if(!d||d.schema!==TRAINING_SCHEMA||typeof d.generatorVersion!=='string'||!d.provenance||!['train','validation'].includes(d.split)||!Array.isArray(d.tasks)||!d.tasks.length||d.tasks.length>10000)throw Error('Invalid training dataset');
 if(!d.spec||typeof d.spec!=='object')throw Error('Missing sampling specification');
 if('requests' in d.spec){if(!Array.isArray(d.spec.requests)||!d.spec.requests.length)throw Error('Empty training plan');d.spec.requests.forEach(validateSamplingSpec);}else validateSamplingSpec(d.spec);const ids=new Set<string>();
 for(const t of d.tasks){
  if(!t||!TRAINING_ID.test(t.id)||ids.has(t.id)||!t.id.startsWith(`rl-task-${t.template}-`)||!TRAINING_TEMPLATES.includes(t.template))throw Error('Invalid training task identity');ids.add(t.id);
  if(t.category!==TRAINING_CATEGORIES[t.template]||!Number.isInteger(t.seed)||t.seed<1||t.seed>0xffffffff||!t.instruction||['en','zh'].some(k=>typeof t.instruction[k as 'en'|'zh']!=='string'||!t.instruction[k as 'en'|'zh'].trim()||t.instruction[k as 'en'|'zh'].length>2000)||typeof t.title!=='string'||t.title.length>200||!t.resolved)throw Error('Invalid training metadata');
  if(!Number.isFinite(t.maxDuration)||t.maxDuration<0||t.maxDuration>7200||!Number.isInteger(t.maxRounds)||t.maxRounds<1||t.maxRounds>100000||t.validation?.status!=='physics-verified'||!t.validation.scope)throw Error('Training task must pass controller validation');
  const modes=[t.outdoor,t.interior,t.flight,t.shooting].filter(Boolean);if(modes.length!==1)throw Error('Training task must have exactly one executable payload');
  for(const p of [t.resolved?.start,t.resolved?.destination])if(p&&(['x','y','z'] as const).some(k=>!Number.isFinite(p[k])||Math.abs(p[k])>20000))throw Error('Invalid resolved position');
  if(t.outdoor){parseOutdoorDataset({schema:OUTDOOR_DATASET_SCHEMA,split:d.split,generatorVersion:d.generatorVersion,config:{},provenance:{},tasks:[t.outdoor]});if(t.category!==t.outdoor.category)throw Error('Outdoor category mismatch');}
  if(t.timeLimit){if(!t.outdoor||t.outdoor.objective!=='arrival'||Math.abs(t.outdoor.maxDuration-t.maxDuration)>1e-6)throw Error('timeLimit requires consistent arrival budgets');assertResolvedTimeLimit(t.timeLimit,t.maxDuration);}
  if(t.interior){const l=t.interior.layout;if(!['indoor','vertical'].includes(t.template)||l.id!==t.id||!Array.isArray(l.points)||l.points.length<2||l.points.length>1000||l.points.some(p=>!Array.isArray(p)||p.length!==2||p.some(v=>!Number.isFinite(v)||Math.abs(v)>10000))||l.solids.length>1000||l.doors.length>100||!Number.isFinite(l.goalY)||[...l.floors,...l.solids,...l.ceilings,...l.steps??[],...l.doors].some(b=>[b.x,b.z,b.y??0,b.w,b.d,b.h,b.yaw??0].some(v=>!Number.isFinite(v)||Math.abs(v)>10000)||b.w<=0||b.d<=0||b.h<=0))throw Error('Invalid generated room geometry');}
  if(t.flight){const c=t.flight;if(t.template!=='aviation'||c.objective!=='navigate'||!['plane','helicopter'].includes(c.vehicle)||!['plane','frogger','cargobob'].includes(c.model)||!c.route.length||[...c.route,...c.recovery,c.spawn,c.landingPoint].some(p=>!p||(['x','y','z'] as const).some(k=>!Number.isFinite(p[k])||Math.abs(p[k])>20000)))throw Error('Invalid generated flight');}
  if(t.shooting){const {pair:p,initialAim:a}=t.shooting;if(t.template!=='shooting'||!/^\.\.\/training-tasks\/shooting-sources\/[a-f0-9]{64}\/task\.json$/.test(p.config)||!p.instruction||!Array.isArray(a)||a.length!==2||a.some((v,i)=>!Number.isFinite(v)||v<0||v>=[p.width,p.height][i])||t.maxRounds!==20)throw Error('Invalid generated shooting pair');}
 }
 return structuredClone(d);
}
export function trainingDatasetPath(file:string){
 if(!/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,95}\.json$/.test(file))throw Error('trainingDataset must be a basename');
 return file==='tasks.json'?'training-tasks/outdoor-walk/tasks.json':`training-tasks/generated/${file}`;
}
export async function loadTrainingDatasetFromUrl(search:string,base:string,fetcher:typeof fetch=fetch){
 const query=new URLSearchParams(search),file=query.get('trainingDataset');if(file===null)return undefined;
 if(query.has('walkDataset')||query.has('outdoorDataset')||query.getAll('trainingDataset').length!==1)throw Error('Choose one training dataset');
 if(!/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,95}\.json$/.test(file))throw Error('trainingDataset must be a basename');
 const response=await fetcher(new URL(trainingDatasetPath(file),base),{cache:'no-store'});if(!response.ok)throw Error('Training dataset HTTP '+response.status);
 return parseTrainingDataset(await response.json());
}
