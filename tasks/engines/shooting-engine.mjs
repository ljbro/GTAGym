/** First-person camera over the recorded scene; the reticle stays at viewport center. */
export function contains([x,y],polygon){
 let inside=false;
 for(let i=0;i<polygon.length;i++){
  const [ax,ay]=polygon[i],[bx,by]=polygon[(i+1)%polygon.length];
  const cross=(x-ax)*(by-ay)-(y-ay)*(bx-ax);
  if(Math.abs(cross)<=1e-8&&x>=Math.min(ax,bx)-1e-8&&x<=Math.max(ax,bx)+1e-8&&y>=Math.min(ay,by)-1e-8&&y<=Math.max(ay,by)+1e-8)return true;
  if((ay>y)!==(by>y)&&x<(bx-ax)*(y-ay)/(by-ay)+ax)inside=!inside;
 }
 return inside;
}
const copy=v=>structuredClone(v);
const finite=v=>typeof v==='number'&&Number.isFinite(v);
export class ShootingEnvironment {
 #task;#target;#camera;#actions;#result;#metric;
 constructor(task,gold){
  const o=task.stages[0],box=gold.bbox_xyxy;
  if(!Number.isInteger(o.width)||!Number.isInteger(o.height)||o.width<=0||o.height<=0||!Array.isArray(box)||box.length!==4||!box.every(finite)||box[0]<0||box[1]<0||box[0]>=box[2]||box[1]>=box[3]||box[2]>=o.width||box[3]>=o.height)throw Error('Invalid scene or target');
  if(gold.hit_polygon_xy&&(!Array.isArray(gold.hit_polygon_xy)||gold.hit_polygon_xy.length<3||!gold.hit_polygon_xy.every(p=>Array.isArray(p)&&p.length===2&&p.every(finite))))throw Error('Invalid target polygon');
  if(task.target_part==='head'&&!gold.hit_polygon_xy)throw Error('Head target requires an annotated polygon');
  for(const key of ['hit_polygons_xy','hit_exclusion_polygons_xy']){
   if(gold[key]&&(!Array.isArray(gold[key])||!gold[key].every(poly=>Array.isArray(poly)&&poly.length>=3&&poly.every(p=>Array.isArray(p)&&p.length===2&&p.every(finite)))))throw Error('Invalid target polygons');
  }
  if(task.target_part==='body'&&!gold.hit_polygons_xy?.length)throw Error('Body target requires annotated polygons');
  this.#metric=gold.metric||((gold.hit_polygon_xy||gold.hit_polygons_xy)?'point_in_target_polygon':'point_in_target_bbox');
  this.#task=copy(task);
  this.#target={id:task.id+'_TARGET',description:task.target_description||task.instruction||o.prompt,category:task.target_category||'target',part:task.target_part||'object',bbox_xyxy:copy(box),hit_polygon_xy:gold.hit_polygon_xy?copy(gold.hit_polygon_xy):null,quality:task.quality};
  if(gold.hit_polygons_xy)this.#target.hit_polygons_xy=copy(gold.hit_polygons_xy);
  if(gold.hit_exclusion_polygons_xy)this.#target.hit_exclusion_polygons_xy=copy(gold.hit_exclusion_polygons_xy);
  this.reset();
 }
 reset(){const o=this.#task.stages[0];this.#camera=[o.width/2,o.height/2];this.#actions=[];this.#result=null;return this.observe();}
 viewport(){const o=this.#task.stages[0];return {x:this.#camera[0]-o.width/2,y:this.#camera[1]-o.height/2,width:o.width,height:o.height};}
 toScreen(point){const v=this.viewport();return [point[0]-v.x,point[1]-v.y];}
 toScene(point){const v=this.viewport();return [point[0]+v.x,point[1]+v.y];}
 observe(){
  const t=this.#task,o=t.stages[0];
  return {task_id:t.id,phase:this.#result?'finished':'aiming',image:o.image,width:o.width,height:o.height,instruction:(t.instruction||o.prompt).replace(/Output one pixel coordinate on the target\s*\[x,\s*y\][. .]?/gi,'').trim(),crosshair:[o.width/2,o.height/2],camera:{x:this.#camera[0],y:this.#camera[1]},viewport:this.viewport(),done:!!this.#result,shots_remaining:this.#result?0:1,result:copy(this.#result)};
 }
 step(action){
  if(this.#result)throw Error('Episode finished; reset before another shot');
  if(!action||typeof action!=='object'||Array.isArray(action))throw Error('Expected action object');
  const o=this.#task.stages[0];
  if(action.type==='aim'){
   const p=action.point;
   if(!Array.isArray(p)||p.length!==2||!p.every(finite)||p[0]<0||p[0]>=o.width||p[1]<0||p[1]>=o.height)throw Error('Expected two finite original-image coordinates inside the scene');
   this.#camera=copy(p);
  }else if(action.type==='look'){
   if(!finite(action.dx)||!finite(action.dy)||Math.abs(action.dx)>10000||Math.abs(action.dy)>10000)throw Error('Expected finite dx/dy in [-10000,10000]');
   this.#camera=[Math.max(0,Math.min(o.width-1,this.#camera[0]+action.dx)),Math.max(0,Math.min(o.height-1,this.#camera[1]+action.dy))];
  }else if(action.type==='fire'||(action.type==='button'&&action.button==='RT'&&action.event==='down')){
   const [x,y]=this.#camera,b=this.#target.bbox_xyxy;
   const hit=x>=b[0]&&x<=b[2]&&y>=b[1]&&y<=b[3]&&(!this.#target.hit_polygon_xy||contains(this.#camera,this.#target.hit_polygon_xy))&&(!this.#target.hit_polygons_xy||this.#target.hit_polygons_xy.some(p=>contains(this.#camera,p)))&&!(this.#target.hit_exclusion_polygons_xy||[]).some(p=>contains(this.#camera,p));
   this.#result={hit,reward:hit?1:0,impact_point:copy(this.#camera),screen_point:[o.width/2,o.height/2],hit_object:hit?copy(this.#target):null,target_object:copy(this.#target),metric:this.#metric};
  }else throw Error('Unsupported action; use aim, look, fire or RT down');
  this.#actions.push(copy(action));return this.observe();
 }
 exportTrace(){return {schema_version:'shooting_environment_v2',task_id:this.#task.id,dataset_version:this.#task.dataset_version,actions:copy(this.#actions),done:!!this.#result,result:copy(this.#result)};}
}
