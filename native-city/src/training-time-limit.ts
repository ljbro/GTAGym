import type {NumericDomain} from './training-task-schema.ts';

/** An explicit task deadline, independent of the harness wall clock/round cap. */
export type ArrivalTimeLimitSpec=
 |{mode:'fixed';seconds:NumericDomain;showCountdown?:boolean}
 |{mode:'controller';multiplier?:NumericDomain;slackSeconds?:NumericDomain;showCountdown?:boolean};
export type ArrivalTimeLimit={mode:'fixed'|'controller';seconds:number;showCountdown:boolean;multiplier?:number;slackSeconds?:number;controllerSeconds?:number};
function interval(value:NumericDomain,min:number,max:number,name:string):[number,number]{
 const r=typeof value==='number'?[value,value]:value;
 if(!Array.isArray(r)||r.length!==2||!r.every(Number.isFinite)||r[0]<min||r[1]>max||r[0]>r[1])throw Error('Invalid timeLimit '+name);
 return [r[0],r[1]];
}
export function validateArrivalTimeLimit(s:ArrivalTimeLimitSpec){
 if(!s||typeof s!=='object'||!['fixed','controller'].includes(s.mode))throw Error('Invalid timeLimit mode');
 const allowed=s.mode==='fixed'?['mode','seconds','showCountdown']:['mode','multiplier','slackSeconds','showCountdown'];
 if(Object.keys(s).some(k=>!allowed.includes(k))||s.showCountdown!==undefined&&typeof s.showCountdown!=='boolean')throw Error('Invalid timeLimit parameter');
 if(s.mode==='fixed')interval(s.seconds,.01,7200,'seconds');
 else{interval(s.multiplier??1.5,1,5,'multiplier');interval(s.slackSeconds??5,0,300,'slackSeconds');}
}
export function sampleArrivalTimeLimit(s:ArrivalTimeLimitSpec,random:()=>number,provisionalSeconds:number):ArrivalTimeLimit{
 validateArrivalTimeLimit(s);
 const sample=(v:NumericDomain,min:number,max:number,name:string)=>{const [a,b]=interval(v,min,max,name);return a+(b-a)*random();};
 return s.mode==='fixed'?{mode:s.mode,seconds:sample(s.seconds,.01,7200,'seconds'),showCountdown:s.showCountdown??true}:
 {mode:s.mode,seconds:provisionalSeconds,multiplier:sample(s.multiplier??1.5,1,5,'multiplier'),slackSeconds:sample(s.slackSeconds??5,0,300,'slackSeconds'),showCountdown:s.showCountdown??true};
}
/** Fixed deadlines never expand; infeasible candidates must be resampled. */
export function calibrateArrivalTimeLimit(limit:ArrivalTimeLimit,controllerSeconds:number):ArrivalTimeLimit{
 if(!Number.isFinite(controllerSeconds)||controllerSeconds<=0)throw Error('Missing navigation controller timing');
 const seconds=limit.mode==='fixed'?limit.seconds:controllerSeconds*limit.multiplier!+limit.slackSeconds!;
 if(!Number.isFinite(seconds)||seconds<=0||seconds>7200)throw Error('Verified navigation route exceeds template budget capacity');
 if(controllerSeconds>seconds+1e-6)throw Error(`Fixed timeLimit ${seconds.toFixed(2)}s is shorter than the controller trajectory ${controllerSeconds.toFixed(2)}s`);
 return {...limit,seconds,controllerSeconds};
}
export function assertResolvedTimeLimit(limit:ArrivalTimeLimit,maxDuration:number){
 if(!limit||!['fixed','controller'].includes(limit.mode)||typeof limit.showCountdown!=='boolean'||!Number.isFinite(limit.seconds)||Math.abs(limit.seconds-maxDuration)>1e-6||!Number.isFinite(limit.controllerSeconds)||limit.controllerSeconds!<=0)throw Error('Unverified or inconsistent training timeLimit');
 validateArrivalTimeLimit(limit.mode==='fixed'?{mode:limit.mode,seconds:limit.seconds,showCountdown:limit.showCountdown}:{mode:limit.mode,multiplier:limit.multiplier,slackSeconds:limit.slackSeconds,showCountdown:limit.showCountdown});
 if(limit.mode==='fixed'&&(limit.multiplier!==undefined||limit.slackSeconds!==undefined))throw Error('Fixed timeLimit cannot contain a scaling rule');
 const calibrated=calibrateArrivalTimeLimit(limit,limit.controllerSeconds!);
 if(Math.abs(calibrated.seconds-limit.seconds)>1e-6)throw Error('Training timeLimit differs from its controller calibration');
}
