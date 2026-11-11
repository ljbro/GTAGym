import {RESCUE_RULES,type NativeCompanionRescue,type RescuePlayer} from './native-companion-rescue.ts';
export const RESCUE_INSTRUCTION="Drive under the bar on the left side of the truck(Blue dot on the minimap), Side by Side in the Same Direction, Maintain roughly the same speed for about 1.6 seconds; Brief deviations have 0.35 seconds of tolerance, No Key Press Needed, Bring this one person back to succeed.";
/** Share the actual predicates with scoring so displayed checks cannot drift. */
export function rescueFeedback(rescue:NativeCompanionRescue,player:RescuePlayer){
 const checks=rescue.conditions(player),aligned=Object.values(checks).every(Boolean);
 const labels={driving:"Driving",height:"Very close",position:"Align with the pickup point",heading:"Same direction",speed:"Vehicle speed is close to"};
 const conditions=Object.entries(checks).map(([key,ok])=>`${ok?'✓':'○'} ${labels[key as keyof typeof labels]}`).join('　');
 const progress=rescue.stage==='complete'?100:Math.min(99,Math.floor((Math.min(rescue.hold,RESCUE_RULES.holdSeconds)+rescue.transfer)/(RESCUE_RULES.holdSeconds+RESCUE_RULES.transferSeconds)*100));
 const status=rescue.stage==='complete'?"Companion picked up":rescue.stage==='failed'?"Failed to retrieve the companion in time":!checks.driving?"Please first press F Enter vehicle":!checks.position?"Align the center of the vehicle with the blue dot beneath the left crossbar":!checks.height?"Please return to the bridge deck where the truck is":!checks.heading?"Adjust direction, Travel alongside the truck in the same direction":!checks.speed?"Adjust throttle, Maintain roughly the same speed as the truck":rescue.stage==='side-transfer'?"Companion Boarding, Maintain your position and speed":"Position aligned, Please keep holding";
 return {conditions,status,progress,aligned};
}
export function createNativeRescueHud(host:HTMLElement){
 const element=document.createElement('section');element.id='native-rescue-hud';element.hidden=true;element.setAttribute('aria-label',"Companion Pickup Conditions");
 element.innerHTML="<strong>Pick up your companion</strong><p class=\"rescue-instruction\"></p><p class=\"rescue-conditions\"></p><p class=\"rescue-status\" role=\"status\" aria-live=\"polite\"></p><div class=\"rescue-progress\"><progress max=\"100\" value=\"0\" aria-label=\"Pickup progress\"></progress><span>0%</span></div>";
 element.querySelector('.rescue-instruction')!.textContent=RESCUE_INSTRUCTION;host.append(element);
 const set=(selector:string,text:string)=>{const node=element.querySelector(selector)!;if(node.textContent!==text)node.textContent=text;};
 return {element,hide(){element.hidden=true;},update(rescue:NativeCompanionRescue,player:RescuePlayer,visible:boolean){
  element.hidden=!visible;if(!visible)return;
  const feedback=rescueFeedback(rescue,player);element.dataset.aligned=String(feedback.aligned);
  set('.rescue-conditions',feedback.conditions);set('.rescue-status',feedback.status);set('.rescue-progress span',`${feedback.progress}%`);
  element.querySelector('progress')!.value=feedback.progress;
 },dispose(){element.remove();}};
}
