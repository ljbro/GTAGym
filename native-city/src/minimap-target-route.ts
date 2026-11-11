import type {V2} from './city-types.ts';
import {MinimapNavigation} from './minimap-navigation.ts';

/** Display-only GPS to a moving target. Never consumes the NPC's future path. */
export class MinimapTargetRoute {
 private key:unknown;private plannedAt=-Infinity;private route:V2[]=[];
 private start:V2=[Infinity,Infinity];private goal:V2=[Infinity,Infinity];
 private tracker=new MinimapNavigation();
 reset(){this.key=undefined;this.plannedAt=-Infinity;this.route=[];}
 update(player:V2,target:V2,key:unknown,now:number,plan:(a:V2,b:V2)=>V2[],clear?:(a:V2,b:V2)=>boolean){
  const moved=Math.hypot(player[0]-this.start[0],player[1]-this.start[1])+Math.hypot(target[0]-this.goal[0],target[1]-this.goal[1]);
  if(this.key!==key||now-this.plannedAt>=500&&moved>.5||Math.hypot(player[0]-this.start[0],player[1]-this.start[1])>80){
   this.key=key;this.plannedAt=now;this.start=[...player];this.goal=[...target];
   this.route=plan(player,target).map(p=>[...p]);
  }
  if(!this.route.length)return [];
  const points=this.tracker.update(this.route,player,key).points;
  // Anchor both ends to this frame's actual actors between bounded GPS updates.
  if(points.length===1)points.push([...target]);else points[points.length-1]=[...target];
  // Re-anchoring a moving target around a corner must not draw through a wall.
  if(clear&&points.some((p,i)=>i>0&&!clear(points[i-1],p)))return [];
  return points;
 }
}
