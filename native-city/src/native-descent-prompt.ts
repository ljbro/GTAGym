import type {CityWalk,WalkLadder} from './city-walk.ts';
export function descentPrompt(walk:CityWalk|null,ladders:readonly WalkLadder[]){
 if(!walk?.active||walk.airborne)return '';
 const ladder=ladders.find(l=>walk.ladder?.ladder.id===l.id);
 if(ladder)return walk.ladder!.phase==='enter'?"Automatically latching on, Then press S Climbing down":walk.ladder!.phase==='exit'?"Stepping onto the roof":"S Climbing down · W Climbing up · Shift Accelerate/Slide down · Release the direction keys and stay still";
 if(walk.traversing)return '';
 const near=walk.nearbyLadder();
 if(near&&ladders.some(l=>l.id===near.ladder.id))return near.atTop?"Approach the ladder to grab on automatically, Then press S Climbing down":"Face the ladder and approach to grab on automatically · W Climbing up / S Climbing down";
 if(ladders.some(l=>walk.grounded&&Math.abs(walk.feetY-l.top)<.2))return "Walk along the rooftop toward the ladder opening to grab on automatically, Then press S Go downstairs";
 return '';
}
