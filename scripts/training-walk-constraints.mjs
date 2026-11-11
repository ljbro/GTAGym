import {routeDistance} from './walk-training-profile.mjs';

export function validateWalkConstraints(c){
 if(!c||Object.keys(c).some(k=>!['minSeparation','evalClearance','referenceRoutes','reservedRoutes'].includes(k)))throw Error('Invalid walk constraints');
 for(const k of ['minSeparation','evalClearance'])if(!Number.isFinite(c[k])||c[k]<0)throw Error('Invalid '+k);
 for(const k of ['referenceRoutes','reservedRoutes'])if(!Array.isArray(c[k])||c[k].some(p=>!Array.isArray(p)||p.length<2||p.some(v=>!Array.isArray(v)||v.length!==2||v.some(n=>!Number.isFinite(n)))))throw Error('Invalid '+k);
 return c;
}
export function checkWalkConstraints(task,previous,c){
 if(!['outdoor','follow'].includes(task.template)||task.outdoor?.vehicle!=='walk')throw Error('Walk constraints only support on-foot arrival/following tasks');
 // Include the follower's separate lead-in in the clearance and spawn audit.
 const route=t=>t.template==='follow'?[t.outdoor.playerSpawn.point,...t.outdoor.points]:t.outdoor.points;
 const p=route(task);
 for(const q of [...c.reservedRoutes,...previous.map(route)]){
  for(const end of [0,-1])if(Math.hypot(p.at(end)[0]-q.at(end)[0],p.at(end)[1]-q.at(end)[1])<c.minSeparation)throw Error('Walking start/goal is too close to another training task');
 }
 for(const q of c.referenceRoutes)if(routeDistance(p,q)<c.evalClearance)throw Error('Walking route is too close to the evaluation inventory');
}
