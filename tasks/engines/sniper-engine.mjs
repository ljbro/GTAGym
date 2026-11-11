// Rendering and adjudication share this world-to-viewport transform.
export const WIDTH = 1280, HEIGHT = 720;
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
export function contains([x,y], polygon) {
  let inside = false;
  for (let i=0,j=polygon.length-1;i<polygon.length;j=i++) {
    const [ax,ay]=polygon[j], [bx,by]=polygon[i];
    const cross=(x-ax)*(by-ay)-(y-ay)*(bx-ax);
    if (Math.abs(cross)<1e-7 && x>=Math.min(ax,bx)-1e-7 && x<=Math.max(ax,bx)+1e-7 && y>=Math.min(ay,by)-1e-7 && y<=Math.max(ay,by)+1e-7) return true;
    if ((ay>y)!==(by>y) && x<(bx-ax)*(y-ay)/(by-ay)+ax) inside=!inside;
  }
  return inside;
}
export function project(M,x,y) { if(!M)return [x,y];const z=M[2][0]*x+M[2][1]*y+M[2][2];return [(M[0][0]*x+M[0][1]*y+M[0][2])/z,(M[1][0]*x+M[1][1]*y+M[1][2])/z]; }
export class SniperEnvironment {
  constructor(config, {reviewMode=false}={}) { this.config=structuredClone(config); this.reviewMode=reviewMode&&config.evaluation?.enabled===false; this.reset(); }
  reset(options={}) {
    const requested=options.seed;
    if(requested!==undefined && (!Number.isInteger(requested)||requested<0||requested>0xffffffff)) throw new Error("seed Must be uint32");
    const entropy=new Uint32Array(1);
    if(requested===undefined){if(globalThis.crypto?.getRandomValues)globalThis.crypto.getRandomValues(entropy);else entropy[0]=Math.floor(Math.random()*2**32);}
    this.seed=requested??entropy[0];this.randomState=this.seed;
    const c=this.config;
    this.camera=c.scope_entry?.image?{x:c.scope_entry.width/2,y:c.scope_entry.height/2}:{...c.initial_camera}; this.entryTravel=0; this.scoped=Boolean(c.start_scoped); this.zoom=c.scope.min_zoom;
    this.entered=Boolean(c.start_scoped)||!c.initial_observation;this.done=false; this.result=null; this.targetState='alive'; this.shot=null;
    this.held=new Set(); this.actions=[]; this.started=Date.now(); this.clampCamera();
    return this.observe();
  }
  viewport() {
    const base=this.config.scope_entry?.image?this.config.scope_entry.width*this.config.scope.min_zoom:this.config.view_width;
    const w=base/(this.scoped?this.zoom:1);
    return {x:this.camera.x-w/2,y:this.camera.y-w*HEIGHT/WIDTH/2,w,h:w*HEIGHT/WIDTH};
  }
  clampCamera() {
    const v=this.viewport(), s=this.config.scene, entry=this.config.scope_entry;
    if(entry?.image){
      // Camera coordinates belong to the opening image. Never clamp them into the shot crop.
      const corners=entry.image_from_world?[[0,0],[s.width,0],[0,s.height],[s.width,s.height]].map(p=>project(entry.image_from_world,...p)):[];corners.push([0,0],[entry.width,entry.height]);
      this.camera.x=clamp(this.camera.x,Math.min(entry.width/2,...corners.map(p=>p[0])),Math.max(entry.width/2,...corners.map(p=>p[0])));
      this.camera.y=clamp(this.camera.y,Math.min(entry.height/2,...corners.map(p=>p[1])),Math.max(entry.height/2,...corners.map(p=>p[1])));return;
    }
    this.camera.x=clamp(this.camera.x,v.w/2,s.width-v.w/2);
    this.camera.y=clamp(this.camera.y,v.h/2,s.height-v.h/2);
  }
  toWorld(x,y) { const v=this.viewport();return project(this.config.scope_entry?.world_from_image,v.x+x/WIDTH*v.w,v.y+y/HEIGHT*v.h); }
  toScreen(x,y) { [x,y]=project(this.config.scope_entry?.image_from_world,x,y);const v=this.viewport();return [(x-v.x)/v.w*WIDTH,(y-v.y)/v.h*HEIGHT]; }
  observe() { return {task_id:this.config.id,instruction:this.config.instruction,phase:this.entered?'environment':'initial',scoped:this.scoped,zoom:this.scoped?this.zoom:1,spread:{distribution:this.scoped?'point':'uniform_circumference',radius_px:this.scoped?0:(this.config.hip_fire?.radius_px??90)},done:this.done,reward:this.result?.reward??null,target_state:this.done?this.targetState:'unobserved',viewport:{width:WIDTH,height:HEIGHT}}; }
  step(action) {
    if (!action || typeof action!=='object') throw new Error("Requires action Object");
    const a=structuredClone(action);
    if (a.type==='look') {
      if (!Number.isFinite(a.dx)||!Number.isFinite(a.dy)||Math.abs(a.dx)>10000||Math.abs(a.dy)>10000) throw new Error("Invalid mouse movement");
    } else if (a.type==='button') {
      if (!['LT','UP','DOWN','RT'].includes(a.button)||!['down','up'].includes(a.event)) throw new Error("Invalid raw key input");
      if (a.duration_ms!==undefined && (!Number.isFinite(a.duration_ms)||a.duration_ms<=0||a.duration_ms>2000)) throw new Error("duration_ms Should be at (0, 2000]");
    } else throw new Error("action.type Must be button or look");
    if (this.done) {
      // Physical releases still belong to the recorded shot, but cannot alter its result.
      if (a.type==='button' && a.event==='up' && this.held.has(a.button)) {
        this.actions.push({...a,index:this.actions.length,elapsed_ms:Date.now()-this.started});
        this.held.delete(a.button);
      }
      return this.observe();
    }
    if(this.config.evaluation?.enabled===false&&!this.reviewMode&&a.type==='button'&&a.button==='RT'&&a.event==='down')throw new Error("Target marker awaiting verification, Scoring is not enabled for this sample");
    this.actions.push({...a,index:this.actions.length,elapsed_ms:Date.now()-this.started});
    if (a.type==='look') {
      if(this.entered){const v=this.viewport();this.camera.x+=a.dx*v.w/WIDTH;this.camera.y+=a.dy*v.h/HEIGHT;this.entryTravel+=Math.hypot(a.dx,a.dy);}
    } else {
      const down=a.event==='down', wasHeld=this.held.has(a.button);
      if (down) this.held.add(a.button); else this.held.delete(a.button);
      if (a.button==='LT') {
        const paired=this.config.opening_pair&&!this.config.opening_pair.unavailable;
        if(paired&&down&&!this.scoped){const entry=this.config.scope_entry;this.camera={x:entry.width/2,y:entry.height/2};this.zoom=this.config.scope.min_zoom;this.entryTravel=0;}
        this.scoped=down;if(down)this.entered=true;else if(paired)this.entered=false;
      }
      if (down && ['UP','DOWN'].includes(a.button) && this.scoped) {
        const factor=2**((a.duration_ms??160)/650*(a.button==='UP'?1:-1));
        const previous=this.zoom;this.zoom=clamp(this.zoom*factor,this.config.scope.min_zoom,this.config.scope.max_zoom);this.entryTravel+=Math.abs(Math.log2(this.zoom/previous))*160;
      }
      if (a.button==='RT' && down && !wasHeld) this.fire();
    }
    this.clampCamera();return this.observe();
  }
  random() {
    // Mulberry32: deterministic uint32 seed -> uniform angle samples, including seed 0.
    this.randomState=(this.randomState+0x6D2B79F5)>>>0;
    let t=this.randomState;t=Math.imul(t^(t>>>15),t|1);t^=t+Math.imul(t^(t>>>7),t|61);
    return ((t^(t>>>14))>>>0)/4294967296;
  }
  fire() {
    if(this.config.evaluation?.enabled===false&&!this.reviewMode)throw new Error("Target marker awaiting verification, Scoring is not enabled for this sample");
    let aimPoint=this.toWorld(WIDTH/2,HEIGHT/2);
    const radiusPx=this.scoped?0:(this.config.hip_fire?.radius_px??90);
    const angle=this.scoped?null:this.random()*2*Math.PI;
    const radiusWorld=radiusPx*this.viewport().w/WIDTH;
    // Uniform on the circumference, with fixed radius; not uniform inside a disk.
    let point=this.scoped?[...aimPoint]:this.toWorld(WIDTH/2+radiusPx*Math.cos(angle),HEIGHT/2+radiusPx*Math.sin(angle));
    const initial=!this.entered,unmapped=this.reviewMode&&!initial&&((this.config.scope_entry?.image&&!this.config.scope_entry.world_from_image)||this.config.scope_entry?.unavailable),screenPoint=initial||unmapped?[WIDTH/2+radiusPx*Math.cos(angle),HEIGHT/2+radiusPx*Math.sin(angle)]:null;
    if(initial){
      const view=this.config.initial_observation,M=view.world_from_image;
      const map=([sx,sy])=>{const x=sx/WIDTH*view.width,y=sy/HEIGHT*view.height,z=M[2][0]*x+M[2][1]*y+M[2][2];return[(M[0][0]*x+M[0][1]*y+M[0][2])/z,(M[1][0]*x+M[1][1]*y+M[1][2])/z];};
      point=M?map(screenPoint):null;aimPoint=M?map([WIDTH/2,HEIGHT/2]):null;
    }
    const target=this.config.target;
    if(unmapped){point=null;aimPoint=null;}
    const unavailable=this.reviewMode?(!target.hit_polygons.length?'review_target_unavailable':!point?'review_mapping_unavailable':this.config.evaluation.pending_reasons?.includes('target_outside_reconstructed_scene')?'review_target_outside_scene':null):null;
    const hit=unavailable?null:!(initial&&this.config.initial_observation.target_visible===false)&&!!point&&target.hit_polygons.some(p=>contains(point,p))&&!(target.exclusion_polygons??[]).some(p=>contains(point,p));
    this.shot={point,aim_point:aimPoint,view:initial?'initial':'environment',screen_point:screenPoint,scoped:this.scoped,zoom:this.scoped?this.zoom:1,spread:{distribution:this.scoped?'point':'uniform_circumference',radius_px:radiusPx,radius_world:initial||this.config.scope_entry?.image?null:radiusWorld,radius_camera:initial?null:radiusWorld,angle_rad:angle}};
    this.targetState=hit===null?'unknown':hit?'hit':'alive';this.done=true;
    this.result={hit,reward:this.reviewMode?null:Number(hit),target_id:hit?target.id:null,reason:unavailable??(initial&&this.config.initial_observation.target_visible===false?'target_occluded':initial&&!point?'initial_action_stage_failed':hit?'target_intersection':'miss'),shot:structuredClone(this.shot),...(this.reviewMode?{review_only:true,scored:false,trial_reward:hit===null?null:Number(hit)}:{})};
  }
  trace() { return {schema_version:'sniper_environment_episode_v2',random_seed:this.seed,random_algorithm:'mulberry32',task_id:this.config.id,scene_revision:this.config.revision??this.config.version,started_at:new Date(this.started).toISOString(),initial_camera:this.config.scope_entry?.image?{x:this.config.scope_entry.width/2,y:this.config.scope_entry.height/2}:this.config.initial_camera,camera_space:this.config.scope_entry?.image?'scope_entry_image_pixels':'scene_pixels',scope_entry_pts_s:this.config.scope_entry?.pts_s??null,actions:structuredClone(this.actions),observation:this.observe(),result:structuredClone(this.result)}; }
}
