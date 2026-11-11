/** c06-n02's local, seabed-rooted service entrance. Shared render/collision
 * solids; no route walls or new objective/checkpoint conditions. */
export type DiveEntranceBox={name:string;u:number;y:number;v:number;width:number;height:number;depth:number;material:'concrete'|'metal'|'paint'};
export function diveEntranceBoxes(floor:number,end:number):DiveEntranceBox[]{
 const boxes:DiveEntranceBox[]=[];
 const add=(name:string,u:number,y:number,v:number,width:number,height:number,depth:number,material:DiveEntranceBox['material']='concrete')=>boxes.push({name,u,y:floor+y,v:end+v,width,height,depth,material});
 add('foundation',0,-.35,4,16.4,.7,12);
 for(const side of [-1,1]){
  add('headwall',side*4.9,2.1,.1,6.2,4.2,2.2);
  add('buttress',side*7.35,2.25,.1,1,4.5,3);
  add('passage-wall',side*2.3,2.1,4.5,1,4.2,8);
  add('door-jamb',side*1.73,2,-1.04,.14,4,.18,'metal');
 }
 add('headwall-header',0,4.8,.1,16,1.2,2.2);
 add('coping',0,5.49,.1,16.5,.18,2.6);
 add('passage-roof',0,4.6,4.6,5.6,.8,9);
 add('passage-end',0,2.1,9,5.6,4.2,.8);
 add('door-header',0,4.02,-1.04,3.6,.16,.18,'metal');
 add('threshold',0,.06,-1.06,3.55,.12,.65,'metal');
 // Open gate stored flush against the left facade, not across the aperture.
 add('open-slide-gate',-4.25,2,-1.08,3.5,3.8,.16,'paint');
 return boxes;
}
export function diveEntranceClear(boxes:readonly DiveEntranceBox[],u:number,y:number,v:number){
 // Reserve swimmer torso/head and feet, without changing the depth objective.
 return !boxes.some(b=>Math.abs(u-b.u)<b.width/2+.3&&Math.abs(v-b.v)<b.depth/2+.3&&y+.3>b.y-b.height/2&&y-1.3<b.y+b.height/2);
}
