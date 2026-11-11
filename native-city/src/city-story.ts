/** Deterministic first-playable story core. No DOM, storage, wallet, or online NPC calls. */
import type {
  CityStoryContent,StoryChoice,StoryFrame,StoryHooks,StoryLine,StoryPlace,StoryPoint,StorySpeaker,StoryStep,
} from './city-story-contract.ts';

export const STORY_SAVE_VERSION=1;
export const STORY_SAVE_KEY='shenchengji-city-story-v1';
export const STORY_ARRIVE_RADIUS=28;
export const STORY_STOP_SPEED=1;
export const STORY_TELEPORT_DISTANCE=45;
export const STORY_LEAVE_RADIUS=36;

export type StoryPhase='idle'|'travel'|'dialogue'|'choice'|'payout'|'done';
export type StoryPayout='none'|'pending'|'paid';
export type StoryActionResult={ok:boolean;message:string};
export type StoryStorage={getItem(key:string):string|null;setItem(key:string,value:string):void};
export type StorySave={
  version:1;id:'bay-last-delivery';stepId:string|null;phase:StoryPhase;lineIndex:number;
  path:string[];choices:Record<string,string>;debugFlagged:boolean;mustLeave:boolean;payout:StoryPayout;
};
export type StoryView={
  id:'bay-last-delivery';title:string;synopsis:string;phase:StoryPhase;active:boolean;completed:boolean;
  step:null|{
    id:string;place:StoryPlace;title:string;objective:string;action:StoryStep['action'];point:StoryPoint;
    lineIndex:number;lineCount:number;line:StoryLine|null;choices:StoryChoice[];terminal:boolean;
  };
  path:string[];choices:Record<string,string>;debugFlagged:boolean;mustLeave:boolean;payout:StoryPayout;
  destination:null|{point:StoryPoint;title:string};
};
export type StoryRuntime={
  game:StoryGame;
  tick():void;
  interact():boolean;
  prompt():string|null;
  start():StoryActionResult;
  cancel():StoryActionResult;
  skip():StoryActionResult;
  choose(choiceId:string):StoryActionResult;
  retryStep():StoryActionResult;
  tryPayout():boolean;
  setPanelOpen(open:boolean):void;
  dispose():void;
  readonly active:boolean;
  readonly view:StoryView;
};

const PLACES:readonly StoryPlace[]=['hub','bay','office','park','workshop'];
const SPEAKERS:readonly StorySpeaker[]=['ahui','alin','laochen','player'];
const PHASES:readonly StoryPhase[]=['idle','travel','dialogue','choice','payout','done'];
const PAYOUTS:readonly StoryPayout[]=['none','pending','paid'];
const ACTIONS:readonly StoryStep['action'][]=['talk','collect','deliver'];
const ACTION_LABEL:{[K in StoryStep['action']]:string}={talk:"Talk",collect:"Claim",deliver:"Deliver"};

const isRecord=(value:unknown):value is Record<string,unknown>=>!!value&&typeof value==='object'&&!Array.isArray(value);
const finite=(value:unknown):value is number=>typeof value==='number'&&Number.isFinite(value);
const text=(value:unknown,max=400)=>typeof value==='string'&&value.trim().length>0&&value.length<=max?value:null;
const clonePoint=(point:StoryPoint):StoryPoint=>[point[0],point[1]];
const distance=(a:StoryPoint,b:StoryPoint)=>Math.hypot(a[0]-b[0],a[1]-b[1]);
const fail=(message:string):StoryActionResult=>({ok:false,message});
const ok=(message:string):StoryActionResult=>({ok:true,message});
const isStoryPanel=(phase:StoryPhase)=>phase==='dialogue'||phase==='choice';
/** Own dialog calls setModalOpen → world.paused. That pause must not lock continue/choices. */
const heldByWorld=(frame:StoryFrame,phase:StoryPhase)=>{
  if(frame.blocked)return 'blocked';
  if(frame.paused&&!isStoryPanel(phase))return 'paused';
  return null;
};
export function storyHotkeysOpen(state:{phase:StoryPhase;collapsed:boolean;blocked:boolean;dialogHidden:boolean}){
  return !state.collapsed&&!state.blocked&&!state.dialogHidden&&isStoryPanel(state.phase);
}

export function newStorySave():StorySave{
  return {version:1,id:'bay-last-delivery',stepId:null,phase:'idle',lineIndex:0,path:[],choices:{},debugFlagged:false,mustLeave:false,payout:'none'};
}

export function readStorySave(value:unknown):StorySave{
  const fresh=newStorySave();
  if(!isRecord(value)||value.version!==STORY_SAVE_VERSION||value.id!=='bay-last-delivery')return fresh;
  const phase=PHASES.includes(value.phase as StoryPhase)?value.phase as StoryPhase:fresh.phase;
  const payout=PAYOUTS.includes(value.payout as StoryPayout)?value.payout as StoryPayout:fresh.payout;
  const stepId=typeof value.stepId==='string'&&value.stepId.length>0&&value.stepId.length<80?value.stepId:null;
  const lineIndex=finite(value.lineIndex)&&value.lineIndex>=0?Math.min(32,Math.floor(value.lineIndex)):0;
  const path=Array.isArray(value.path)?[...new Set(value.path.filter((id):id is string=>typeof id==='string'&&id.length>0&&id.length<80))]:[];
  const choices=isRecord(value.choices)?Object.fromEntries(Object.entries(value.choices).filter((entry):entry is [string,string]=>entry[0].length<80&&typeof entry[1]==='string'&&entry[1].length>0&&entry[1].length<80)):{};
  const restored:StorySave={
    version:1,id:'bay-last-delivery',stepId,phase,lineIndex,path,choices,
    debugFlagged:value.debugFlagged===true,mustLeave:value.mustLeave===true,payout,
  };
  if((restored.phase==='idle'||restored.phase==='done')&&!restored.stepId)return restored;
  if(!restored.stepId&&restored.phase!=='idle'&&restored.phase!=='done')return {...fresh,payout:restored.payout};
  return restored;
}

export function validateStoryContent(content:CityStoryContent):string[]{
  const errors:string[]=[];
  if(content.schemaVersion!==1)errors.push("schemaVersion Must be 1");
  if(content.id!=='bay-last-delivery')errors.push("Task id Must be bay-last-delivery");
  if(!text(content.title,80))errors.push("Missing title");
  if(!text(content.synopsis,400))errors.push("Missing introduction");
  if(!finite(content.reward)||content.reward<0||content.reward>1e6)errors.push("Invalid reward amount");
  if(!isRecord(content.people))errors.push("Missing character table");
  else for(const speaker of SPEAKERS){
    const person=content.people[speaker];
    if(!person||!text(person.name,40)||!text(person.role,40))errors.push("Character "+speaker+" Incomplete");
  }
  if(!Array.isArray(content.steps)||content.steps.length===0)errors.push("Missing steps");
  const ids=new Set<string>();
  for(const step of content.steps??[]){
    if(!text(step.id,80)){errors.push("Missing Step id");continue;}
    if(ids.has(step.id))errors.push("Repeat Steps "+step.id);
    ids.add(step.id);
    if(!PLACES.includes(step.place))errors.push("Steps "+step.id+" Invalid location");
    if(!ACTIONS.includes(step.action))errors.push("Steps "+step.id+" Invalid Action");
    if(!text(step.title,80)||!text(step.objective,160))errors.push("Steps "+step.id+" Incomplete text");
    if(!Array.isArray(step.lines)||step.lines.some(line=>!SPEAKERS.includes(line.speaker)||!text(line.text,400)))errors.push("Steps "+step.id+" Invalid dialogue");
    if(step.next!==undefined&&(typeof step.next!=='string'||!step.next))errors.push("Steps "+step.id+" next Invalid");
    const choices=step.choices??[];
    const choiceIds=new Set<string>();
    for(const choice of choices){
      if(!text(choice.id,80)||!text(choice.label,80)||!text(choice.next,80)||!text(choice.consequence,200))errors.push("Steps "+step.id+" Incomplete options");
      if(choiceIds.has(choice.id))errors.push("Steps "+step.id+" Duplicate Option");
      choiceIds.add(choice.id);
    }
    if(!step.terminal&&!step.next&&choices.length===0)errors.push("Steps "+step.id+" Unable to continue or end");
  }
  if(content.firstStep&&!ids.has(content.firstStep))errors.push("firstStep Does Not Exist");
  for(const step of content.steps??[]){
    if(step.next&&!ids.has(step.next))errors.push("Steps "+step.id+" Points to an unknown location next");
    for(const choice of step.choices??[])if(choice.next&&!ids.has(choice.next))errors.push("Options "+choice.id+" Points to an Unknown Step");
  }
  if(errors.length||!ids.size)return errors;
  const graph=storyGraph(content);
  if(graph.cycles.length)errors.push("Step graph contains a cycle:"+graph.cycles.join(' / '));
  if(!graph.reachable.has(content.firstStep))errors.push("Unable to from firstStep Set off");
  if(!graph.terminals.length)errors.push("No reachable end step");
  return errors;
}

export function storyGraph(content:CityStoryContent){
  const byId=new Map(content.steps.map(step=>[step.id,step]));
  const edges=(step:StoryStep)=>step.choices?.length?step.choices.map(choice=>choice.next):step.terminal?[]:step.next?[step.next]:[];
  const reachable=new Set<string>();
  const stack=[content.firstStep];
  const cycles:string[]=[];
  const visiting=new Set<string>();
  const walk=(id:string)=>{
    if(!byId.has(id)||reachable.has(id)&&!visiting.has(id))return;
    if(visiting.has(id)){cycles.push(id);return;}
    visiting.add(id);reachable.add(id);
    for(const next of edges(byId.get(id)!))walk(next);
    visiting.delete(id);
  };
  walk(content.firstStep);
  while(stack.length){
    const id=stack.pop()!;
    if(!byId.has(id))continue;
    for(const next of edges(byId.get(id)!))if(!reachable.has(next)){reachable.add(next);stack.push(next);}
  }
  const terminals=content.steps.filter(step=>reachable.has(step.id)&&(step.terminal||(!step.next&&!step.choices?.length))).map(step=>step.id);
  const branchSteps=content.steps.filter(step=>reachable.has(step.id)&&(step.choices?.length??0)>=2);
  return {reachable,terminals,branchSteps:branchSteps.map(step=>step.id),cycles:[...new Set(cycles)],edges};
}

function copyContent(content:CityStoryContent):CityStoryContent{
  return {
    schemaVersion:1,id:'bay-last-delivery',title:content.title,synopsis:content.synopsis,
    firstStep:content.firstStep,reward:content.reward,
    people:{
      ahui:{...content.people.ahui},alin:{...content.people.alin},
      laochen:{...content.people.laochen},player:{...content.people.player},
    },
    steps:content.steps.map(step=>({
      id:step.id,place:step.place,title:step.title,objective:step.objective,action:step.action,
      lines:step.lines.map(line=>({...line})),next:step.next,
      choices:step.choices?.map(choice=>({...choice})),terminal:step.terminal,
    })),
  };
}

function adoptSave(content:CityStoryContent,value:unknown):StorySave{
  const save=readStorySave(value);
  const known=new Set(content.steps.map(step=>step.id));
  const path=save.path.filter(id=>known.has(id));
  const choices=Object.fromEntries(Object.entries(save.choices).filter(([stepId,choiceId])=>{
    const step=content.steps.find(item=>item.id===stepId);
    return !!step?.choices?.some(choice=>choice.id===choiceId);
  }));
  const stepId=save.stepId&&known.has(save.stepId)?save.stepId:null;
  if(save.phase!=='idle'&&save.phase!=='done'&&!stepId)return {...newStorySave(),payout:save.payout==='paid'?'paid':'none'};
  const step=stepId?content.steps.find(item=>item.id===stepId):undefined;
  const lineIndex=step?Math.min(save.lineIndex,Math.max(0,step.lines.length-1)):0;
  let phase=save.phase;
  if(phase==='choice'&&!step?.choices?.length)phase='dialogue';
  if(phase==='dialogue'&&step&&!step.lines.length)phase=step.choices?.length?'choice':step.terminal?'payout':'travel';
  if(phase==='done'||save.payout==='paid'&&phase==='payout')phase=save.payout==='paid'?'done':phase;
  return {...save,stepId,path,choices,lineIndex,phase};
}

function validFrame(frame:StoryFrame){
  return finite(frame.x)&&finite(frame.z)&&finite(frame.speed)&&finite(frame.debugEpoch);
}

function pointOf(frame:StoryFrame):StoryPoint{return [frame.x,frame.z];}

export class StoryGame{
  readonly content:CityStoryContent;
  readonly places:Record<StoryPlace,StoryPoint>;
  private saved:StorySave;
  private lastPosition:StoryPoint|null=null;
  private lastEpoch=0;
  private primed=false;
  constructor(content:CityStoryContent,places:Record<StoryPlace,StoryPoint>,save:unknown=newStorySave()){
    const errors=validateStoryContent(content);
    if(errors.length)throw new Error("Invalid city story content:"+errors.join('; '));
    for(const id of PLACES){
      const point=places[id];
      if(!Array.isArray(point)||point.length!==2||point.some(value=>!Number.isFinite(value)))throw new Error("Story location not configured:"+id);
    }
    this.content=copyContent(content);
    this.places={hub:clonePoint(places.hub),bay:clonePoint(places.bay),office:clonePoint(places.office),park:clonePoint(places.park),workshop:clonePoint(places.workshop)};
    this.saved=adoptSave(this.content,save);
  }
  get save():StorySave{return structuredClone(this.saved);}
  get active(){return this.saved.phase!=='idle'&&this.saved.phase!=='done';}
  get view():StoryView{
    const step=this.step();
    const line=step&&this.saved.phase==='dialogue'?step.lines[this.saved.lineIndex]??null:null;
    return {
      id:'bay-last-delivery',title:this.content.title,synopsis:this.content.synopsis,phase:this.saved.phase,
      active:this.active,completed:this.saved.payout==='paid'||this.saved.phase==='done',
      step:step?{
        id:step.id,place:step.place,title:step.title,objective:step.objective,action:step.action,
        point:clonePoint(this.places[step.place]),lineIndex:this.saved.lineIndex,lineCount:step.lines.length,
        line:line?{...line}:null,choices:(step.choices??[]).map(choice=>({...choice})),terminal:!!step.terminal,
      }:null,
      path:[...this.saved.path],choices:{...this.saved.choices},debugFlagged:this.saved.debugFlagged,
      mustLeave:this.saved.mustLeave,payout:this.saved.payout,
      destination:this.active&&step?{point:clonePoint(this.places[step.place]),title:this.content.title+' · '+step.title}:null,
    };
  }
  payoutRequest():{id:'bay-last-delivery';amount:number}|null{
    return this.saved.phase==='payout'&&this.saved.payout!=='paid'?{id:'bay-last-delivery',amount:this.content.reward}:null;
  }
  atObjective(frame:StoryFrame,extra=7){
    return validFrame(frame)&&this.near(frame,STORY_ARRIVE_RADIUS+extra);
  }
  readyToTalk(frame:StoryFrame):StoryActionResult{
    if(!validFrame(frame))return fail("City location is not ready.");
    if(frame.blocked)return fail("Another menu or task is active, Story progression paused.");
    if(!this.near(frame,STORY_ARRIVE_RADIUS))return fail("Return to the handoff point first. Dialogue progress is still at.");
    if(Math.abs(frame.speed)>=STORY_STOP_SPEED)return fail("Come to a complete stop first, Then continue talking.");
    if(frame.inVehicle)return fail("Please Exit the Vehicle First, Then continue talking.");
    return ok("At the junction.");
  }
  start(frame:StoryFrame):StoryActionResult{
    if(!validFrame(frame))return fail("City location is not ready.");
    if(frame.blocked)return fail("Another menu or task is active, City stories are currently unavailable.");
    if(frame.paused)return fail("Return to the city first, Then accept a job through City Stories.");
    if(this.active)return fail("Story in progress. You can continue the current trip, Or cancel and start over.");
    this.saved={...newStorySave(),payout:this.saved.payout==='paid'?'paid':'none'};
    this.enterStep(this.content.firstStep,frame);
    this.prime(frame);
    return ok("Order accepted · "+this.content.title+". Stop fully at the location and get out, press E Talk.");
  }
  cancel():StoryActionResult{
    if(!this.active&&this.saved.phase!=='done'&&this.saved.payout==='none')return fail("No city story is currently in progress.");
    const paid=this.saved.payout==='paid';
    this.saved={...newStorySave(),payout:paid?'paid':'none'};
    this.lastPosition=null;this.primed=false;
    return ok(paid?"This order has ended. Rewards will not be issued twice, You can replay the dialogue.":"This order has been canceled, Progress cleared, You can restart.");
  }
  retryStep(frame:StoryFrame):StoryActionResult{
    if(!this.active)return fail("No trip to retry.");
    if(!validFrame(frame))return fail("City location is not ready.");
    const hold=heldByWorld(frame,this.saved.phase);
    if(hold==='blocked')return fail("Another menu or task is active, Story progression paused.");
    if(hold==='paused')return fail("Return to the city first, Then retry this section.");
    if(!this.saved.debugFlagged&&!this.saved.mustLeave)return fail("This segment was not interrupted by a debug jump.");
    this.saved.debugFlagged=false;
    this.saved.mustLeave=this.near(frame,STORY_ARRIVE_RADIUS+4);
    this.saved.phase='travel';
    this.saved.lineIndex=0;
    this.prime(frame);
    return ok(this.saved.mustLeave?"Debug jump recorded. Leave the marked point first, Then drive back.":"Cleared debug markers for this section, Drive to the destination in the game.");
  }
  tick(frame:StoryFrame){
    if(!this.active||!validFrame(frame))return;
    const here=pointOf(frame);
    if(!this.primed||!this.lastPosition){this.prime(frame);return;}
    if(frame.debugEpoch!==this.lastEpoch)this.flagDebug(here,true);
    else if(!frame.paused&&!frame.blocked){
      const moved=distance(this.lastPosition,here);
      if(moved>STORY_TELEPORT_DISTANCE)this.flagDebug(here,this.near(frame,STORY_ARRIVE_RADIUS+4));
    }
    if(this.saved.debugFlagged){this.lastPosition=here;this.lastEpoch=frame.debugEpoch;return;}
    if(frame.paused||frame.blocked){this.lastPosition=here;this.lastEpoch=frame.debugEpoch;return;}
    if(this.saved.mustLeave&&!this.near(frame,STORY_LEAVE_RADIUS))this.saved.mustLeave=false;
    this.lastPosition=here;this.lastEpoch=frame.debugEpoch;
  }
  prompt(frame:StoryFrame):string|null{
    if(!this.active||!validFrame(frame)||heldByWorld(frame,this.saved.phase))return null;
    if(this.saved.phase==='dialogue'||this.saved.phase==='choice'){
      if(!this.near(frame,STORY_ARRIVE_RADIUS+7))return null;
      if(Math.abs(frame.speed)>=STORY_STOP_SPEED)return "Pull over and come to a full stop · Continue Dialogue";
      if(frame.inVehicle)return "After exiting the vehicle, press E · Continue Dialogue";
      return this.saved.phase==='choice'?"Choose a response":"Continue Dialogue · Click or Press Enter";
    }
    if(this.saved.phase==='payout')return this.saved.payout==='paid'||!this.near(frame,STORY_ARRIVE_RADIUS+7)?null:"Payment was not credited to the wallet · press E Retry";
    if(this.saved.phase!=='travel')return null;
    const step=this.step();if(!step)return null;
    if(!this.near(frame,STORY_ARRIVE_RADIUS+7))return null;
    if(this.saved.debugFlagged||this.saved.mustLeave)return "Debug jumps do not count as delivery · Retry this segment or cancel and start over";
    if(Math.abs(frame.speed)>=STORY_STOP_SPEED)return "Pull over and come to a full stop · "+step.title;
    if(frame.inVehicle)return "After exiting the vehicle, press E · "+ACTION_LABEL[step.action]+' · '+step.title;
    return "press E · "+ACTION_LABEL[step.action]+' · '+step.title;
  }
  interact(frame:StoryFrame):StoryActionResult{
    if(!validFrame(frame))return fail("City location is not ready.");
    if(!this.active)return fail("First accept a job through City Stories.");
    const hold=heldByWorld(frame,this.saved.phase);
    if(hold==='blocked')return fail("Another menu or task is active, Story progression paused.");
    if(hold==='paused')return fail("Return to the city first, Then continue this section.");
    if(this.saved.phase==='payout')return fail(this.saved.payout==='paid'?"This job has already been paid.":"Payout has not yet been credited to the wallet, Can retry.");
    if(this.saved.phase==='choice'||this.saved.phase==='dialogue'){
      const gate=this.readyToTalk(frame);if(!gate.ok)return gate;
      if(this.saved.phase==='choice')return fail("Please select a response, Follow only one branch at a time.");
      return this.advanceDialogue();
    }
    if(this.saved.phase!=='travel')return fail("Cannot advance the story now.");
    return this.beginStep(frame);
  }
  skip(frame:StoryFrame):StoryActionResult{
    if(!this.active)return fail("No dialogue in progress.");
    if(!validFrame(frame))return fail("Cannot skip dialogue now.");
    if(heldByWorld(frame,this.saved.phase))return fail("Cannot skip dialogue now.");
    if(this.saved.phase!=='dialogue')return fail("Not Currently in Dialogue.");
    const gate=this.readyToTalk(frame);if(!gate.ok)return gate;
    const step=this.step();if(!step||!step.lines.length)return fail("No dialogue to skip.");
    this.saved.lineIndex=step.lines.length-1;
    return ok("Skipped to the last line of this section. Continue again to reach the next stop or option.");
  }
  choose(choiceId:string,frame:StoryFrame):StoryActionResult{
    if(!validFrame(frame))return fail("City location is not ready.");
    if(this.saved.phase!=='choice')return fail("No branch is available to confirm.");
    const gate=this.readyToTalk(frame);if(!gate.ok)return gate;
    const step=this.step();const choice=step?.choices?.find(item=>item.id===choiceId);
    if(!choice)return fail("No such option.");
    if(!this.content.steps.some(item=>item.id===choice.next))return fail("This branch is not connected yet, Cannot navigate.");
    this.saved.choices[step!.id]=choice.id;
    this.saved.path.push(step!.id);
    this.enterStep(choice.next,frame);
    return ok(choice.consequence);
  }
  confirmPayout(success:boolean):StoryActionResult{
    if(this.saved.payout==='paid')return ok("Reward credited, Will Not Be Issued Again.");
    if(this.saved.phase!=='payout'&&this.saved.payout!=='pending')return fail("Cannot settle now.");
    this.saved.payout='pending';
    this.saved.phase='payout';
    if(!success)return fail("Wallet temporarily unavailable, Results not recorded, Can retry.");
    this.saved.payout='paid';
    this.saved.phase='done';
    if(this.saved.stepId&&!this.saved.path.includes(this.saved.stepId))this.saved.path.push(this.saved.stepId);
    return ok("Results saved.");
  }
  private step():StoryStep|null{
    return this.content.steps.find(step=>step.id===this.saved.stepId)??null;
  }
  private near(frame:StoryFrame,radius:number){
    const step=this.step();return !!step&&distance(pointOf(frame),this.places[step.place])<radius;
  }
  private prime(frame:StoryFrame){
    this.lastPosition=pointOf(frame);this.lastEpoch=frame.debugEpoch;this.primed=true;
  }
  private flagDebug(here:StoryPoint,mustLeave:boolean){
    if(!this.saved.debugFlagged||mustLeave)this.saved.mustLeave=mustLeave||this.saved.mustLeave;
    this.saved.debugFlagged=true;
    if(this.saved.phase==='travel')this.saved.mustLeave=mustLeave||this.near({x:here[0],z:here[1],speed:0,inVehicle:false,paused:false,blocked:false,debugEpoch:this.lastEpoch},STORY_ARRIVE_RADIUS+4);
    this.lastPosition=here;
  }
  private enterStep(stepId:string,frame?:StoryFrame){
    if(!this.content.steps.some(step=>step.id===stepId))return;
    this.saved.stepId=stepId;
    this.saved.phase='travel';
    this.saved.lineIndex=0;
    this.saved.debugFlagged=false;
    this.saved.mustLeave=false;
    if(frame&&validFrame(frame))this.prime(frame);
  }
  private beginStep(frame:StoryFrame):StoryActionResult{
    const step=this.step();if(!step)return fail("Current Step Is Invalid, Please cancel and start over.");
    if(this.saved.debugFlagged||this.saved.mustLeave)return fail("Debug jumps do not count as delivery. Please retry this section, Or cancel and start over.");
    if(!this.near(frame,STORY_ARRIVE_RADIUS))return fail("Move a little closer to the handoff point.");
    if(Math.abs(frame.speed)>=STORY_STOP_SPEED)return fail("Come to a complete stop first, Then get out and talk.");
    if(frame.inVehicle)return fail("Please Exit the Vehicle First, Then press E.");
    if(!step.lines.length){
      if(step.choices?.length){this.saved.phase='choice';return ok(step.objective);}
      return this.finishStep(frame);
    }
    this.saved.phase='dialogue';
    this.saved.lineIndex=0;
    return ok(step.lines[0].text);
  }
  private advanceDialogue():StoryActionResult{
    const step=this.step();if(!step)return fail("Current Dialogue Is Invalid.");
    if(this.saved.lineIndex<step.lines.length-1){
      this.saved.lineIndex+=1;
      return ok(step.lines[this.saved.lineIndex].text);
    }
    if(step.choices?.length){this.saved.phase='choice';return ok("Choose where to go next.");}
    return this.finishStep();
  }
  private finishStep(frame?:StoryFrame):StoryActionResult{
    const step=this.step();if(!step)return fail("Current Step Is Invalid.");
    if(step.choices?.length){this.saved.phase='choice';return ok("Choose where to go next.");}
    if(step.terminal||!step.next){
      if(this.saved.payout==='paid'){this.saved.phase='done';if(!this.saved.path.includes(step.id))this.saved.path.push(step.id);return ok("This order has already been settled.");}
      this.saved.payout='pending';
      this.saved.phase='payout';
      return ok("Segment complete, Wait for wallet settlement.");
    }
    if(!this.content.steps.some(item=>item.id===step.next))return fail("The next step is not connected yet, Cannot navigate.");
    this.saved.path.push(step.id);
    this.enterStep(step.next,frame);
    return ok("Continue to · "+this.step()!.title);
  }
}

function memoryStorage():StoryStorage{
  const data=new Map<string,string>();
  return {getItem:key=>data.get(key)??null,setItem:(key,value)=>{data.set(key,value);}};
}

function defaultStorage():StoryStorage|null{
  try{return globalThis.localStorage??null;}catch{return null;}
}

export function createStoryRuntime(content:CityStoryContent,hooks:StoryHooks,storage?:StoryStorage|null):StoryRuntime{
  const persistTo=storage===undefined?defaultStorage():storage;
  let raw:unknown=null;
  if(persistTo){try{raw=JSON.parse(persistTo.getItem(STORY_SAVE_KEY)??'null');}catch{raw=null;}}
  const game=new StoryGame(content,hooks.places,raw);
  let disposed=false,routeKey='',blockedSkip=false,lastSave='',payoutTried=false,lastModal:boolean|null=null,panelOpen=true;
  const persist=()=>{
    if(disposed||!persistTo)return;
    const next=JSON.stringify(game.save);
    if(next===lastSave)return;
    try{persistTo.setItem(STORY_SAVE_KEY,next);lastSave=next;}catch{hooks.toast("This story progress remains active, Browser did not allow save data to be written");}
  };
  const modal=(open:boolean)=>{if(lastModal===open)return;lastModal=open;hooks.setModalOpen(open);};
  const syncModal=()=>{
    const talking=isStoryPanel(game.view.phase);
    modal(talking&&panelOpen&&!hooks.frame().blocked);
  };
  const destinationKey=(view:StoryView)=>view.destination?view.destination.point[0]+','+view.destination.point[1]+':'+view.destination.title:'';
  const syncRoute=()=>{
    if(disposed)return;
    const frame=hooks.frame();
    const view=game.view;
    const key=destinationKey(view);
    if(frame.blocked){if(key)blockedSkip=true;return;}
    if(key===routeKey&&!blockedSkip)return;
    blockedSkip=false;routeKey=key;
    if(view.destination)hooks.navigate(view.destination.point,view.destination.title);
    else hooks.clearRoute();
  };
  const tryPayout=()=>{
    const request=game.payoutRequest();
    if(!request)return false;
    let success=false;
    try{success=hooks.credit(request.id,request.amount)===true;}catch{success=false;}
    const result=game.confirmPayout(success);
    panelOpen=false;
    persist();syncRoute();
    if(success)modal(false);
    else syncModal();
    hooks.toast(result.message);
    return success;
  };
  const after=(result:StoryActionResult,announce=true)=>{
    if(game.view.phase==='payout'&&game.payoutRequest()&&!payoutTried){payoutTried=true;tryPayout();return result.ok;}
    if(game.view.phase!=='payout')payoutTried=false;
    persist();syncRoute();
    if(isStoryPanel(game.view.phase)){if(result.ok)panelOpen=true;}
    else panelOpen=false;
    syncModal();
    if(announce)hooks.toast(result.message);
    return result.ok;
  };
  persist();syncRoute();
  return {
    game,
    tick(){
      if(disposed)return;
      game.tick(hooks.frame());
      if(game.payoutRequest()&&!payoutTried){payoutTried=true;tryPayout();return;}
      syncRoute();persist();syncModal();
    },
    interact(){
      if(disposed)return false;
      const frame=hooks.frame();
      const view=game.view;
      if(frame.blocked||disposed)return false;
      if(!view.active&&view.phase!=='payout')return false;
      const visible=panelOpen&&isStoryPanel(view.phase)&&!frame.blocked;
      const prompted=game.prompt(frame)!==null;
      if(!visible&&!prompted)return false;
      if(view.phase==='payout'){tryPayout();return true;}
      after(game.interact(frame));
      return true;
    },
    prompt(){return disposed?null:game.prompt(hooks.frame());},
    start(){const result=game.start(hooks.frame());after(result);return result;},
    cancel(){const result=game.cancel();panelOpen=false;after(result);syncModal();return result;},
    skip(){const result=game.skip(hooks.frame());after(result);return result;},
    choose(choiceId){const result=game.choose(choiceId,hooks.frame());after(result);return result;},
    retryStep(){const result=game.retryStep(hooks.frame());after(result);return result;},
    tryPayout,
    setPanelOpen(open){if(disposed)return;panelOpen=open;syncModal();},
    dispose(){if(disposed)return;disposed=true;panelOpen=false;modal(false);},
    get active(){return game.active;},
    get view(){return game.view;},
  };
}
