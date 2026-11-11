import {SniperEnvironment, WIDTH, HEIGHT} from './sniper-engine.mjs';
import {GameplaySniperEnvironment} from './gameplay-sniper-engine.mjs';
import {ClearanceSniperEnvironment} from './clearance-sniper-engine.mjs';

export const PHOTO_LEVELS = [2, 3, 4, 5, 6, 8];
export const PHOTO_CONTENT = {x:0, y:0, width:1100, height:720};

// Only camera/optics change. Single-shot adjudication, deterministic hip-fire
// spread, action recording and target exclusions remain the original engine's.
export class PhotoSniperEnvironment extends SniperEnvironment {
  viewport() {
    const w = WIDTH / (this.scoped ? this.zoom : 1.2);
    return {x:this.camera.x-w/2, y:this.camera.y-w*HEIGHT/WIDTH/2, w, h:w*HEIGHT/WIDTH};
  }
  clampCamera() {
    const v=this.viewport(), c=PHOTO_CONTENT;
    this.camera.x=Math.max(c.x+v.w/2,Math.min(c.x+c.width-v.w/2,this.camera.x));
    this.camera.y=Math.max(c.y+v.h/2,Math.min(c.y+c.height-v.h/2,this.camera.y));
  }
  step(action) {
    const zooming=!this.done&&this.scoped&&action?.type==='button'&&action.event==='down'&&['UP','DOWN'].includes(action.button);
    const previous=this.zoom;
    // Super validates before mutation and records exactly one original action.
    super.step(action);
    if(zooming){
      const index=PHOTO_LEVELS.indexOf(previous), steps=Math.max(1,Math.round((action.duration_ms??160)/160));
      this.zoom=PHOTO_LEVELS[Math.max(0,Math.min(5,index+(action.button==='UP'?steps:-steps)))];
      this.clampCamera();
    }
    return this.observe();
  }
  observe(){const o=super.observe();return {...o,zoom:this.scoped?this.zoom:1.2};}
}

export const SCOPE_ONLY_CONTROLS='scope-only-look-v1';

export function createSniperEnvironment(config, options={}) {
  const env=config.render_mode==='native-clearance-atlas-v1' ? new ClearanceSniperEnvironment(config,options) : config.render_mode==='native-gameplay-atlas-v1' ? new GameplaySniperEnvironment(config,options) : config.render_mode==='native-photo-pyramid-v1'
    ? new PhotoSniperEnvironment(config,options) : new SniperEnvironment(config,options);
  // Opt in for current episodes. Unmarked archived traces retain their original
  // movement semantics and source engine; neither dataset geometry nor scoring changes.
  if(options.scopeOnlyLook){
    env.scopeOnlyLook=true;
    const step=env.step.bind(env),trace=env.trace.bind(env);
    env.step=action=>{
      if(action?.type==='look'&&!env.scoped){
        const camera={...env.camera},travel=env.entryTravel;
        step(action); // Original validation and action recording, even for a no-op.
        env.camera=camera;env.entryTravel=travel;
        return env.observe();
      }
      return step(action);
    };
    env.trace=()=>({...trace(),sniper_controls:SCOPE_ONLY_CONTROLS});
  }
  return env;
}
