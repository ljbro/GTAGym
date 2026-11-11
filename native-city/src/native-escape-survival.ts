export const ESCAPE_SURVIVAL_SECONDS=60;
export const ESCAPE_MAX_SECONDS=180;
export const ESCAPE_CAPTURE_SECONDS=3;
/** Capture wins ties; a full clean minute at exactly the deadline still succeeds. */
export function escapeSurvivalOutcome(elapsed:number,captured:boolean,unscannedSeconds:number):'success'|'failure'|null{
 if(captured)return 'failure';
 if(elapsed<=ESCAPE_MAX_SECONDS+1e-8&&unscannedSeconds+1e-8>=ESCAPE_SURVIVAL_SECONDS)return 'success';
 return elapsed+1e-8>=ESCAPE_MAX_SECONDS?'failure':null;
}
export function escapeSurvivalHint(elapsed:number,exposure:number,unscannedSeconds:number){
 const left=Math.max(0,Math.ceil(ESCAPE_MAX_SECONDS-elapsed-1e-8));
 return `Free Escape: 3 Consecutively within minutes 60 seconds without being scanned · Remaining ${left} seconds · Not Scanned ${Math.min(60,Math.max(0,unscannedSeconds)).toFixed(1)} / 60 seconds(Resets when scanned) · Repeatedly Scanned 3 seconds until arrest ${exposure>0?` · Arrest Timer ${exposure.toFixed(1)} / 3 seconds`:''}`;
}
