import calibration from './native-water-expert-times.json' with {type:'json'};

/** Runtime only loads the small timing manifest, not control/pose recordings. */
export function nativeWaterTiming(id:string){
 const record=calibration.tasks.find(task=>task.id===id);
 if(!record||!Number.isInteger(record.expertTicks)||record.expertTicks<=0||
    !Number.isFinite(record.expertSeconds)||record.expertSeconds!==record.expertTicks/calibration.hz||
    record.maxDurationSeconds!==record.expertSeconds*2)
  throw Error("On the water/Underwater task lacks a valid expert trajectory time limit:"+id);
 return record;
}
