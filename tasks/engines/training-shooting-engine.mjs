import {ShootingEnvironment} from './shooting-engine.mjs';

/** Initialization adapter only. The imported original engine remains byte-
 * identical, and still owns camera integration, annotations and hit scoring.
 * The initial aim is task configuration, not a model action or a used turn. */
export class TrainingShootingEnvironment extends ShootingEnvironment{
 constructor(task,gold,initialAim){super(task,gold);this.initialAim=structuredClone(initialAim);this.reset();}
 reset(){super.reset();return this.initialAim?super.step({type:'aim',point:this.initialAim}):this.observe();}
 exportTrace(){const trace=super.exportTrace();return {...trace,initial_camera:structuredClone(this.initialAim),actions:trace.actions.slice(1)};}
}
