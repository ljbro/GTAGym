import {NativeFlightMission,flightTargetDistance} from './native-flight-route.ts';
import type {NativeFlightConfig} from './native-flight-catalog.ts';

/** Training-only constructor. Reuses the same airborne gates and landing
 * predicates, without editing/recalibrating frozen benchmark flight sources. */
export class TrainingFlightMission extends NativeFlightMission{
 override readonly config:NativeFlightConfig;
 override readonly maxDuration:number;
 override readonly expertSeconds=0;
 constructor(config:NativeFlightConfig,maxDuration:number){
  super(config.id);
  if(config.objective!=='navigate'||!config.route.length||!Number.isFinite(maxDuration)||maxDuration<=0)throw Error('Invalid training flight configuration');
  this.config=structuredClone(config);this.maxDuration=maxDuration;
  this.target={...config.route[0]};this.npcTarget={...config.route[0]};this.distance=flightTargetDistance(config.spawn,this.target);
 }
}
