import {createNativeTaskPicker,type NativeTaskChoice} from './native-task-picker.ts';
export type NativeTaskResult={outcome:'success'|'failure';taskId:string;title:string;reason:string;elapsed:number;canDisembark?:boolean;canContinue?:boolean};

/** Top-layer modal: only terminal task states show text outside the Esc menu. */
export function createNativeTaskResult(tasks:readonly NativeTaskChoice[],hooks:{restart:(id:string)=>void;switchTask:(id:string)=>void;disembark?:()=>void;resume?:()=>void}){
 const dialog=document.createElement('dialog');dialog.id='native-task-result';
 dialog.setAttribute('aria-labelledby','native-result-title');dialog.setAttribute('aria-describedby','native-result-reason');
 dialog.innerHTML=`<div class="native-result-symbol" aria-hidden="true"></div>
  <h2 id="native-result-title"></h2><p id="native-result-task"></p>
  <p id="native-result-reason"></p><p id="native-result-time"></p>
  <label class="native-task-select">Task type<select id="native-result-category"></select></label>
  <label class="native-task-select">Select the next mission<select id="native-result-picker"></select></label>
  <div class="native-task-actions"><button id="native-result-restart" class="primary" type="button">Restart this mission</button><button id="native-result-switch" type="button">Switch and start</button><button id="native-result-continue" type="button" hidden>Continue Exploring</button><button id="native-result-disembark" type="button" hidden>F · Disembark and Continue Exploring</button></div>
  <p id="native-result-busy" role="status" hidden>Preparing task, Please wait…</p>`;
 document.body.append(dialog);
 const query=<T extends HTMLElement>(selector:string)=>dialog.querySelector<T>(selector)!;
 const picker=query<HTMLSelectElement>('#native-result-picker'),restart=query<HTMLButtonElement>('#native-result-restart'),change=query<HTMLButtonElement>('#native-result-switch');
 const category=query<HTMLSelectElement>('#native-result-category');
 const taskPicker=createNativeTaskPicker(category,picker,tasks);
 let result:NativeTaskResult|null=null,busy=false;
 const resume=query<HTMLButtonElement>('#native-result-continue');resume.onclick=()=>{if(result?.canContinue&&!busy)hooks.resume?.();};
 const disembark=query<HTMLButtonElement>('#native-result-disembark');
 function setBusy(value:boolean){busy=value;restart.disabled=change.disabled=picker.disabled=category.disabled=disembark.disabled=resume.disabled=value;query('#native-result-busy').hidden=!value;dialog.setAttribute('aria-busy',String(value));}
 disembark.onclick=()=>{if(result?.canDisembark&&!busy)hooks.disembark?.();};
 restart.onclick=()=>{if(result&&!busy)hooks.restart(result.taskId);};
 change.onclick=()=>{if(result&&!busy)hooks.switchTask(picker.value);};
 // Keep native browser Tab/select/button behavior, but never forward keyboard
 // input to city driving, jumping, weapon, map or pause listeners underneath.
 const abort=new AbortController();
 for(const name of ['keydown','keyup'] as const)window.addEventListener(name,event=>{
  if(!dialog.open)return;
  event.stopImmediatePropagation();if(event.code==='Escape')event.preventDefault();
  if(name==='keydown'&&event.code==='KeyF'&&!event.repeat&&result?.canDisembark&&!busy){event.preventDefault();hooks.disembark?.();}
 },{capture:true,signal:abort.signal});
 dialog.addEventListener('cancel',event=>event.preventDefault());
 return {
  get open(){return dialog.open;},setBusy,
  show(value:NativeTaskResult){
   result={...value};setBusy(false);dialog.dataset.outcome=value.outcome;
   resume.hidden=!value.canContinue;
   disembark.hidden=!value.canDisembark;
   query('.native-result-symbol').textContent=value.outcome==='success'?'✓':'!';
   query('#native-result-title').textContent=value.outcome==='success'?"Task completed":"Mission failed";
   query('#native-result-task').textContent=`${value.taskId.toUpperCase()} · ${value.title}`;
   query('#native-result-reason').textContent=value.reason;
   query('#native-result-time').textContent=`Time taken ${Math.max(0,value.elapsed).toFixed(1)} seconds`;
   taskPicker.select(value.taskId);if(!dialog.open)dialog.showModal();restart.focus();
  },
  close(){dialog.close();setBusy(false);},
  dispose(){abort.abort();dialog.close();dialog.remove();},
 };
}
