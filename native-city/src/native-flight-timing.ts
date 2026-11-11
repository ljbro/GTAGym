import calibration from './native-flight-expert-times.json' with {type:'json'};
export const FLIGHT_TIME_MULTIPLIER=1.5;

/** Small runtime manifest only; full reference controls/poses stay offline. */
export function nativeFlightTiming(id:string){
 const record=calibration.tasks.find(task=>task.id===id);
 if(calibration.multiplier!==FLIGHT_TIME_MULTIPLIER||!record||!Number.isFinite(record.expertSeconds)||record.expertSeconds<=0||record.maxDurationSeconds!==record.expertSeconds*FLIGHT_TIME_MULTIPLIER)
  throw Error("Flight task lacks a valid expert trajectory time limit:"+id);
 return record;
}
