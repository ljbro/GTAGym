/** Task semantics take precedence over transient boarding / walking state. */
export function minimapRoutingMode(task:{mode:string;category:string;trainingOutdoor?:{vehicle:string}}|undefined,state:{waterController:boolean;flightActive:boolean;walking:boolean;corridor:boolean}){
 if(state.waterController||task?.mode==='swim'||task?.category==='water'||['boat','swim'].includes(task?.trainingOutdoor?.vehicle??''))return 'water';
 if(state.flightActive||task?.mode==='flight')return 'air';
 if(state.corridor&&task?.mode==='drive')return 'corridor';
 if(task?.mode==='walk'||!task&&state.walking)return 'walk';
 return 'road';
}
