import {createActionAdapter} from '../server-eval/actions.mjs';

/** Host-selected task subset. Keep baseline full-catalog seeds across variants. */
export function batchVariant(config,fullTasks){
 const maxActionSeconds=config.maxActionSeconds??1;
 const clockMode=config.clockMode??'stepped';
 if(!['stepped','realtime'].includes(clockMode)||clockMode==='realtime'&&(config.harness!=='codex'||maxActionSeconds!==1))throw Error('Realtime ablation requires native Codex with the one-second action cap');
 createActionAdapter({maxSeconds:maxActionSeconds});
 const tasks=config.taskIds??fullTasks;
 if(!Array.isArray(tasks)||!tasks.length||new Set(tasks).size!==tasks.length||tasks.some(t=>!fullTasks.includes(t)))throw Error('Invalid host task subset');
 if(clockMode==='realtime'&&tasks.some(t=>/^c(?:10|11)-n/.test(t)))throw Error('Image-based tasks have no realtime simulation');
 if((config.taskIds!==undefined||maxActionSeconds!==1)&&config.harness!=='codex')throw Error('Task/duration variants require native Codex');
 const taskSeedIndices=Object.fromEntries(tasks.map(id=>[id,fullTasks.indexOf(id)]));
 return {tasks,maxActionSeconds,taskSeedIndices,identity:{
  ...(clockMode==='realtime'?{clockMode,roundBudgetPolicy:'ceil-original-seconds-or-300',keyboardReleasePolicy:'duration-deadline'}:{}),
  ...(config.taskIds!==undefined?{taskIds:tasks,taskSeedIndices}:{}),
  ...(maxActionSeconds!==1?{maxActionSeconds}:{}),
 }};
}
