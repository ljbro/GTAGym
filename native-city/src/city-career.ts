/** Pure, deterministic city-life simulation. World/UI supply position and a monotonic debug epoch. */
export type CareerPoint = [number, number];
export type CareerRole = 'day-worker' | 'office' | 'city-worker';
export type CareerPlaceId = 'hub' | 'bay' | 'office' | 'park' | 'workshop';
export type CareerPlaces = Record<CareerPlaceId, CareerPoint>;
export type CareerMechanic = 'delivery' | 'comfort' | 'service';
export type CareerUpgradeId = 'insulated-box' | 'comfort-kit' | 'work-tools' | 'room-fund';
export type CareerFrame = {dt:number;position:CareerPoint;speed:number;odometer:number;debugEpoch:number;yaw?:number;paused?:boolean;inVehicle?:boolean};
export type CareerObjective = {id:string;label:string;position:CareerPoint;action:string;kind:'pickup'|'dropoff'|'service';holdSeconds:number};
export type CareerJob = {id:string;role:CareerRole;title:string;person:string;description:string;mechanic:CareerMechanic;basePay:number;requiredLevel:number;deadline:number;objectives:CareerObjective[];pickupLine:string;arrivalLine:string};
export type CareerEvent = {type:'message'|'objective'|'completed'|'choice'|'purchase';message:string;amount?:number;jobId?:string};
export type CareerAction = {ok:boolean;message:string;events:CareerEvent[]};
export type CareerSave = {version:2;cash:number;role:CareerRole;xp:Record<CareerRole,number>;completed:Record<string,number>;upgrades:CareerUpgradeId[];relations:Record<'ahui'|'alin'|'laochen',number>;choices:Record<string,string>;pendingChoice:string|null;supplied:boolean;totalEarned:number;legacyCompleted:string[]};
export type CareerChoiceOption = {id:string;label:string;consequence:string;cost:number;relationship:number};
export type CareerChoice = {id:string;person:string;title:string;line:string;relation:keyof CareerSave['relations'];options:CareerChoiceOption[]};
export type CareerUpgrade = {id:CareerUpgradeId;title:string;description:string;cost:number};
type ActiveContract = {jobId:string;objectiveIndex:number;elapsed:number;hold:number;quality:number;actualDistance:number;legDistance:number;legDrivenDistance:number;lastOdometer:number;invalid:boolean;debugEpoch:number;lastPosition:CareerPoint;lastSpeed:number;lastYaw:number|undefined;startOdometer:number;restBonus:boolean};
export const CAREER_SAVE_KEY = 'shenchengji-city-career-v2';
export const CAREER_ROLES: readonly {id:CareerRole;label:string;subtitle:string;person:string}[] = [
 {id:'day-worker',label:"Daily wage worker",subtitle:"One more trip, Get paid today for work done today",person:"A Hui"},
 {id:'office',label:"Young professional",subtitle:"Outside work, Also manage your own life",person:"A Lin"},
 {id:'city-worker',label:"City worker",subtitle:"Take the unseen everyday life, Take Good Care",person:"Lao Chen"},
];
export const CAREER_UPGRADES: readonly CareerUpgrade[] = [
 {id:'insulated-box',title:"Insulated delivery box",description:"Delivery time limit increased 35%, Quality loss from lateness is halved.",cost:420},
 {id:'comfort-kit',title:"Seat and cushioning kit",description:"Reduced comfort loss from hard braking and sharp turns during passenger trips 45%.",cost:560},
 {id:'work-tools',title:"Portable inspection tool",description:"Work time at each site reduced 40%, Worker contracts increased ¥ 25 Tool allowance.",cost:390},
 {id:'room-fund',title:"Fund for a room of your own",description:"Leave room ¥ 1,800 Housing Allowance, All contracts increase by 8% Long-term stability rewards.",cost:1800},
];
const isRecord = (value:unknown):value is Record<string,unknown> => !!value && typeof value==='object' && !Array.isArray(value);
const money = (v:unknown,fallback=0) => typeof v==='number'&&Number.isFinite(v)&&v>=0?Math.min(1e7,Math.floor(v)):fallback;
const roleIds = CAREER_ROLES.map(r=>r.id);
const upgradeIds = CAREER_UPGRADES.map(u=>u.id);
const dictNumbers=(v:unknown):Record<string,number>=>Object.fromEntries(isRecord(v)?Object.entries(v).filter(([k,n])=>k.length<100&&typeof n==='number'&&Number.isFinite(n)&&n>=0).map(([k,n])=>[k,money(n)]):[]);
const dictStrings=(v:unknown):Record<string,string>=>Object.fromEntries(isRecord(v)?Object.entries(v).filter((entry):entry is [string,string]=>entry[0].length<100&&typeof entry[1]==='string'&&entry[1].length<100):[]);
export function newCareerSave():CareerSave {return {version:2,cash:180,role:'day-worker',xp:{'day-worker':0,office:0,'city-worker':0},completed:{},upgrades:[],relations:{ahui:0,alin:0,laochen:0},choices:{},pendingChoice:null,supplied:false,totalEarned:0,legacyCompleted:[]};}
/** v2 survives reload; the prior three-story wallet migrates once. Active jobs never survive reload. */
export function readCareerSave(value:unknown,legacy?:unknown):CareerSave {
 const fresh=newCareerSave();
 if(!isRecord(value)||value.version!==2||typeof value.cash!=='number'||!Number.isFinite(value.cash)||value.cash<0){
  if(isRecord(legacy)&&legacy.version===1&&typeof legacy.cash==='number'&&Number.isFinite(legacy.cash)&&legacy.cash>=0){fresh.cash=money(legacy.cash,180);fresh.legacyCompleted=Array.isArray(legacy.completed)?[...new Set(legacy.completed.filter((v):v is string=>typeof v==='string'&&v.length<100))]:[];}
  return fresh;
 }
 const xp=dictNumbers(value.xp),relations=dictNumbers(value.relations),choices=dictStrings(value.choices);
 return {...fresh,cash:money(value.cash),role:roleIds.includes(value.role as CareerRole)?value.role as CareerRole:fresh.role,
  xp:{'day-worker':xp['day-worker']??0,office:xp.office??0,'city-worker':xp['city-worker']??0},completed:dictNumbers(value.completed),
  upgrades:Array.isArray(value.upgrades)?[...new Set(value.upgrades.filter((v):v is CareerUpgradeId=>upgradeIds.includes(v as CareerUpgradeId)))]:[],
  relations:{ahui:Math.min(20,relations.ahui??0),alin:Math.min(20,relations.alin??0),laochen:Math.min(20,relations.laochen??0)},choices,
  pendingChoice:typeof value.pendingChoice==='string'&&CHOICES.some(c=>c.id===value.pendingChoice)&&!choices[value.pendingChoice]?value.pendingChoice:null,
  supplied:value.supplied===true,totalEarned:money(value.totalEarned),legacyCompleted:Array.isArray(value.legacyCompleted)?[...new Set(value.legacyCompleted.filter((v):v is string=>typeof v==='string'&&v.length<100))]:[],
 };
}
const CHOICES: readonly CareerChoice[] = [
 {id:'ahui-first',person:"A Hui",relation:'ahui',title:"Treat yourself to a good meal today",line:"\"This order is settled. Go to the rest stop for a shared hot meal?Eating alone often means settling for less. \"",options:[{id:'share',label:"Invite him to share a hot meal · ¥ 32",consequence:"Relationship with Ahui +3, Start the next shift with supplies; Pay arrives as usual.",cost:32,relationship:3},{id:'save',label:"Save Money for Rent, Sit and chat for a while",consequence:"Relationship with Ahui +1, Meaningful time together can cost nothing.",cost:0,relationship:1}]},
 {id:'alin-first',person:"A Lin",relation:'alin',title:"The work group chat lit up again",line:"\"Can we go to the seaside for another two-minute walk?Today I want to decide for myself when to leave work. \"",options:[{id:'boundary',label:"Help her set her phone to Do Not Disturb",consequence:"Relationship with Alin +3, Unlock a more personal follow-up conversation.",cost:0,relationship:3},{id:'listen',label:"Let Her Finish Talking About Her Day, Plan to visit the seaside next time",consequence:"Relationship with Alin +2, She respects your plans.",cost:0,relationship:2}]},
 {id:'laochen-first',person:"Lao Chen",relation:'laochen',title:"When the City Lights Up",line:"\"We wrap up, Someone else was just heading home. Buy two cups of hot tea, The wind is a bit chilly tonight. \"",options:[{id:'tea',label:"Go to the window and buy two cups of hot tea · ¥ 18",consequence:"Connection with Lao Chen +3, Start the next shift with supplies.",cost:18,relationship:3},{id:'bench',label:"Sit together on the bench for a rest",consequence:"Connection with Lao Chen +1, Capture a chat after work.",cost:0,relationship:1}]},
 {id:'ahui-third',person:"A Hui",relation:'ahui',title:"Have a reliable partner",line:"\"Hard to tell real jobs from scams in temporary group chats. If there is reliable work later, I will call you first. \"",options:[{id:'partner',label:"Team up for jobs, Look Out for Each Other",consequence:"Relationship with Ahui +3, The relationship bonus from acquaintance referrals continues to increase.",cost:0,relationship:3},{id:'independent',label:"Remain free, Meet When You Have Time",consequence:"Relationship with Ahui +1, All contracts can still be freely accepted.",cost:0,relationship:1}]},
 {id:'alin-third',person:"A Lin",relation:'alin',title:"Next Time Will Not Be on the Way",line:"\"No need to take me back to the office today. Next day off, Let us make a real date to watch the sunset by the sea. \"",options:[{id:'date',label:"A Sincere Promise, Buy her another coffee · ¥ 26",consequence:"Relationship with Alin +4, Start the next shift with supplies. The relationship can develop into romance.",cost:26,relationship:4},{id:'friend',label:"Be friends who can watch the sea together",consequence:"Relationship with Alin +2, Friendship is also worth nurturing.",cost:0,relationship:2}]},
 {id:'laochen-third',person:"Lao Chen",relation:'laochen',title:"Even unseen places are remembered",line:"\"The station asks who recently repaired the streetlights here. I mentioned your name. \"",options:[{id:'team',label:"Write down the names of the entire crew",consequence:"Connection with Lao Chen +3, Share credit for work completed together.",cost:0,relationship:3},{id:'learn',label:"Thank him, Learn another repair tip",consequence:"Connection with Lao Chen +2, Start the next shift with supplies.",cost:0,relationship:2}]},
];
const success=(message:string,events:CareerEvent[]=[]):CareerAction=>({ok:true,message,events});
const failure=(message:string):CareerAction=>({ok:false,message,events:[]});
const distance=(a:CareerPoint,b:CareerPoint)=>Math.hypot(a[0]-b[0],a[1]-b[1]);
const clamp=(x:number,a:number,b:number)=>Math.max(a,Math.min(b,x));
const deltaAngle=(a:number,b:number)=>Math.atan2(Math.sin(a-b),Math.cos(a-b));
const relationFor:Record<CareerRole,keyof CareerSave['relations']>={'day-worker':'ahui',office:'alin','city-worker':'laochen'};
export const careerLevel=(xp:number)=>1+Math.floor(Math.max(0,xp)/200);

export class CareerGame {
 readonly places:CareerPlaces;
 readonly jobs:CareerJob[];
 private saved:CareerSave;
 private contract:ActiveContract|null=null;
 constructor(places:CareerPlaces,save:CareerSave=newCareerSave()){
  for(const [id,p] of Object.entries(places))if(!Array.isArray(p)||p.length!==2||p.some(n=>!Number.isFinite(n)))throw new Error('Invalid career place '+id);
  this.places=structuredClone(places);this.saved=readCareerSave(save);
  const objective=(id:CareerPlaceId,label:string,kind:CareerObjective['kind'],holdSeconds=0):CareerObjective=>({id,label,position:[...this.places[id]],kind,holdSeconds,action:kind==='pickup'?"Connect / Claim":kind==='service'?"Complete the inspection":"Delivered / Hand over"});
  const contract=(job:Omit<CareerJob,'deadline'>):CareerJob=>({...job,deadline:Math.max(100,job.objectives.slice(1).reduce((s,p,i)=>s+distance(p.position,job.objectives[i].position),0)/11+55)});
  this.jobs=[
   contract({id:'hot-meal',role:'day-worker',title:"Deliver the Food While Hot",person:"A Hui",description:"Pick up meals at the station, Deliver to the seaside duty post. Daily pay is settled after delivery, Better punctuality earns a higher quality bonus.",mechanic:'delivery',basePay:190,requiredLevel:1,objectives:[objective('hub',"Bayside Life Station · Pick up food",'pickup'),objective('bay',"Seaside Duty Post · Deliver a hot meal",'dropoff')],pickupLine:"\"The food is still warm today, Do not rush into danger, Deliver it safely. \"",arrivalLine:"\"Just in Time for Shift Change, The food just arrived too. Hard work, Got paid for today. \""}),
   contract({id:'two-stop-relay',role:'day-worker',title:"Two-stop delivery run",person:"A Hui",description:"Visit both the park and office building in one trip. A mid-route handover does not reset the time limit, Rewards are settled after the full round.",mechanic:'delivery',basePay:330,requiredLevel:2,objectives:[objective('hub',"Bayside Life Station · Collect two meals",'pickup'),objective('park',"Park service point · First Stop",'dropoff'),objective('office',"Office building lobby · The Last Stop",'dropoff')],pickupLine:"\"Run both copies together, Choose your own route. Do not leave any behind. \"",arrivalLine:"\"Both Sides Received It, I will call you next time a job like this comes up. \""}),
   contract({id:'quiet-ten-minutes',role:'office',title:"Take ten minutes back for yourself",person:"A Lin",description:"Pick up Alin at the community stop just after work, Drive smoothly to the seaside. Hard Braking, Sharp turns reduce comfort; No rush, Just Want to Be More Comfortable.",mechanic:'comfort',basePay:230,requiredLevel:1,objectives:[objective('hub',"Community Service Station · Wait for Alin to finish work",'pickup'),objective('bay',"Seaside Path · Save some time for yourself",'dropoff')],pickupLine:"\"Had six meetings today. I want to listen for a while without notification sounds. \"",arrivalLine:"\"Such a quiet journey. So today could end like this after all. \""}),
   contract({id:'weekend-boundary',role:'office',title:"Leave on time today",person:"A Lin",description:"Once Familiar, She invites you to travel from the rest stop to Xiangmihu. Comfort and relationship affect the final bonus, Staying steady is more useful than fighting for lanes.",mechanic:'comfort',basePay:315,requiredLevel:2,objectives:[objective('office',"Office building lobby · Meet up after work",'pickup'),objective('park',"Park Entrance · No overtime tonight",'dropoff')],pickupLine:"\"Agreed, No work talk this time. What has made you happy lately?\"",arrivalLine:"\"See You Next Time, No need to keep using being on the way as an excuse. \""}),
   contract({id:'after-rain-round',role:'city-worker',title:"Post-rain Inspection",person:"Lao Chen",description:"Collect tools at the station, Check seaside lighting and park drainage at each stop. Keep the vehicle parked until the work progress bar fills, Then press E Confirm.",mechanic:'service',basePay:260,requiredLevel:1,objectives:[objective('hub',"Community Service Station · Collect the Inspection Form",'pickup'),objective('bay',"Coastal Light Cluster · Check the Wiring",'service',7),objective('park',"Park drainage outlet · Clear Fallen Leaves",'service',9)],pickupLine:"\"The rain just stopped, Check both the lights and the drainage. We finish, Now I can feel safe on the roads at night. \"",arrivalLine:"\"Both locations are working normally. Look at this area lighting up, Then I feel at ease. \""}),
   contract({id:'night-repair',role:'city-worker',title:"Before the city lights come on",person:"Lao Chen",description:"Pick up equipment from the repair station, Handle public facilities in the park and office buildings in sequence. Multi-stop jobs offer higher rewards, Tool upgrades reduce work time at each stop.",mechanic:'service',basePay:350,requiredLevel:2,objectives:[objective('workshop',"Maintenance Station · Collect backup equipment",'pickup'),objective('park',"Park searchlight · Service the Lights",'service',11),objective('office',"Streetlight outside the office building · Replace Connector",'service',10)],pickupLine:"\"Before everyone leaves work, Turn on the streetlights. Have you checked all the tools??\"",arrivalLine:"\"This area is done. walking, Return to the rest stop for a hot drink. \""}),
  ];
 }
 get save():CareerSave{return structuredClone(this.saved);}
 get active(){
  const a=this.contract;if(!a)return null;const job=this.jobs.find(j=>j.id===a.jobId)!;
  const raw=job.objectives[a.objectiveIndex],holdSeconds=raw.holdSeconds*(this.owned('work-tools')?.6:1);
  return {jobId:a.jobId,title:job.title,person:job.person,mechanic:job.mechanic,objective:{...raw,position:[...raw.position] as CareerPoint,holdSeconds},objectiveIndex:a.objectiveIndex,objectiveCount:job.objectives.length,elapsed:a.elapsed,remainingSeconds:Math.max(0,this.deadline(job)-a.elapsed),quality:Math.round(a.quality),holdSeconds:a.hold,holdProgress:holdSeconds>0?clamp(a.hold/holdSeconds,0,1):1,invalid:a.invalid,actualDistance:a.actualDistance,basePay:job.basePay};
 }
 get view(){
  const s=this.saved,level=careerLevel(s.xp[s.role]);
  return {cash:s.cash,role:s.role,level,xp:s.xp[s.role],nextLevelXp:level*200,totalEarned:s.totalEarned,completedCount:Object.values(s.completed).reduce((a,b)=>a+b,0),roomFund:s.upgrades.includes('room-fund'),supplied:s.supplied,relations:{...s.relations},active:this.active,
   jobs:this.jobs.filter(j=>j.role===s.role).map(j=>({...j,objectives:structuredClone(j.objectives),unlocked:level>=j.requiredLevel,completed:s.completed[j.id]??0,deadline:this.deadline(j)})),
   roles:CAREER_ROLES.map(r=>({...r,level:careerLevel(s.xp[r.id]),selected:r.id===s.role})),
   upgrades:CAREER_UPGRADES.map(u=>({...u,owned:this.owned(u.id),affordable:s.cash>=u.cost})),
   pendingChoice:this.choice,
  };
 }
 get choice(){const c=CHOICES.find(c=>c.id===this.saved.pendingChoice);return c?{...c,options:c.options.map(o=>({...o,affordable:this.saved.cash>=o.cost}))}:null;}
 private owned(id:CareerUpgradeId){return this.saved.upgrades.includes(id);}
 private deadline(job:CareerJob){return Math.round(job.deadline*(job.mechanic==='delivery'&&this.owned('insulated-box')?1.35:1));}
 selectRole(role:CareerRole):CareerAction{
  if(this.contract)return failure("Complete or end the current contract first, Try another perspective on life.");
  if(!roleIds.includes(role))return failure("This role is not available yet.");
  this.saved.role=role;return success("Now using"+CAREER_ROLES.find(r=>r.id===role)!.label+"from the perspective of.");
 }
 accept(jobId:string,frame:CareerFrame):CareerAction{
  if(this.contract)return failure("You already have an active contract, You can continue or end it first.");
  if(this.choice)return failure("First respond to the message you just received, Then begin the next chapter of life.");
  const job=this.jobs.find(j=>j.id===jobId);
  if(!job||job.role!==this.saved.role)return failure("Switch to the identity associated with this contract first.");
  if(careerLevel(this.saved.xp[job.role])<job.requiredLevel)return failure("Complete two basic contracts, Rise to 2 levels to unlock.");
  if(!validFrame(frame))return failure("City location is not ready.");
  this.contract={jobId,objectiveIndex:0,elapsed:0,hold:0,quality:100,actualDistance:0,legDistance:0,legDrivenDistance:0,lastOdometer:frame.odometer,invalid:false,debugEpoch:frame.debugEpoch,lastPosition:[...frame.position],lastSpeed:frame.speed,lastYaw:frame.yaw,startOdometer:frame.odometer,restBonus:this.saved.supplied};
  this.saved.supplied=false;
  return success("Accepted · "+job.title,[{type:'objective',jobId,message:"First reach "+job.objectives[0].label+", Stop and press E."}]);
 }
 cancel():CareerAction{if(!this.contract)return failure("No active contracts.");this.contract=null;return success("This order has ended, No Charge. You can accept it again anytime.");}
 tick(frame:CareerFrame):CareerEvent[]{
  const a=this.contract;if(!a)return [];
  if(!validFrame(frame)){a.invalid=true;return [];}
  const events:CareerEvent[]=[],movement=distance(frame.position,a.lastPosition),dt=clamp(frame.dt,0,.5);
  // A debug jump or nonphysical position/odometer reset can never be turned into a payout.
  if(!a.invalid&&(frame.debugEpoch!==a.debugEpoch||movement>Math.max(45,dt*110)||frame.odometer<a.startOdometer-2)){
   a.invalid=true;events.push({type:'message',message:"A debug skip was used in this contract, Cannot settle. Accept another job after finishing."});
  }
  if(frame.paused){a.lastPosition=[...frame.position];a.lastSpeed=frame.speed;a.lastYaw=frame.yaw;a.lastOdometer=frame.odometer;return events;}
  const job=this.jobs.find(j=>j.id===a.jobId)!,obj=job.objectives[a.objectiveIndex];
  a.actualDistance+=movement;a.legDistance+=movement;
  if(frame.inVehicle!==false)a.legDrivenDistance+=Math.min(Math.max(0,frame.odometer-a.lastOdometer),movement*1.5+1);
  a.lastOdometer=frame.odometer;
  if(a.objectiveIndex>0){
   a.elapsed+=dt;
   if(job.mechanic==='delivery'&&a.elapsed>this.deadline(job))a.quality=Math.max(20,a.quality-dt*(this.owned('insulated-box')?.19:.38));
   if(job.mechanic==='comfort'&&dt>.005){
    const braking=Math.max(0,(a.lastSpeed-frame.speed)/dt-6.5),turn=frame.yaw!==undefined&&a.lastYaw!==undefined?Math.max(0,Math.abs(deltaAngle(frame.yaw,a.lastYaw))/dt*Math.abs(frame.speed)-7):0;
    const protection=(this.owned('comfort-kit')?.55:1)*(a.restBonus?.85:1);
    a.quality=Math.max(20,a.quality-(braking*.5+turn*.27)*dt*protection);
   }
  }
  const required=obj.holdSeconds*(this.owned('work-tools')?.6:1);
  if(required>0)a.hold=distance(frame.position,obj.position)<28&&Math.abs(frame.speed)<1?Math.min(required,a.hold+dt):0;
  a.lastPosition=[...frame.position];a.lastSpeed=frame.speed;a.lastYaw=frame.yaw;
  return events;
 }
 prompt(frame:CareerFrame):string|null{
  const a=this.active;if(!a)return null;if(a.invalid)return "Debug skipping was used for this order · press J Accept another order after finishing";
  if(distance(frame.position,a.objective.position)>35)return null;
  if(Math.abs(frame.speed)>=1)return "Pull over and come to a full stop · "+a.objective.label;
  if(a.objective.holdSeconds>0&&a.holdProgress<1)return "Inspection in progress · "+Math.ceil(a.objective.holdSeconds-a.holdSeconds)+" seconds · Stay parked";
  return "press E · "+a.objective.action+' · '+a.objective.label;
 }
 interact(frame:CareerFrame):CareerAction{
  const a=this.contract;if(!a)return failure("Accept a contract in the life journal, Start Again.");
  if(!validFrame(frame)||frame.paused)return failure("Return to the city before the handoff.");
  if(frame.debugEpoch!==a.debugEpoch||distance(frame.position,a.lastPosition)>45||frame.odometer<a.startOdometer-2)a.invalid=true;
  if(a.invalid)return failure("Debug jumps do not trigger wage payouts. Please at J End this job in the journal, then accept it again.");
  const job=this.jobs.find(j=>j.id===a.jobId)!,obj=job.objectives[a.objectiveIndex];
  if(distance(frame.position,obj.position)>=28)return failure("Move a little closer to the handoff point.");
  if(Math.abs(frame.speed)>=1)return failure("Come to a complete stop first, Then hand over.");
  if(a.objectiveIndex>0){const previous=job.objectives[a.objectiveIndex-1],minimumDistance=Math.min(90,distance(previous.position,obj.position)*.6);if(a.legDistance<minimumDistance)return failure("You must walk the entire route before the handover.");if(job.mechanic==='comfort'&&a.legDrivenDistance<Math.max(minimumDistance,distance(previous.position,obj.position)*.65))return failure("The transport task requires actually driving the passenger along the entire route, Then get out and talk.");}
  const required=obj.holdSeconds*(this.owned('work-tools')?.6:1);
  if(a.hold+1e-6<required)return failure("Inspections remaining "+Math.ceil(required-a.hold)+" seconds, Please remain parked.");
  if(a.objectiveIndex<job.objectives.length-1){
   const first=a.objectiveIndex===0;a.objectiveIndex++;a.hold=0;a.legDistance=0;a.legDrivenDistance=0;
   const message=first?job.pickupLine:"This stop is complete, Continue to "+job.objectives[a.objectiveIndex].label+'. ';
   return success(message,[{type:'objective',jobId:job.id,message}]);
  }
  const qualityFactor=.65+.65*(a.quality/100),qualityBonus=a.restBonus?18:0,relationBonus=this.saved.relations[relationFor[job.role]]*4,toolBonus=job.mechanic==='service'&&this.owned('work-tools')?25:0;
  const amount=Math.round((job.basePay*qualityFactor+qualityBonus+relationBonus+toolBonus)*(this.owned('room-fund')?1.08:1));
  this.saved.cash=money(this.saved.cash+amount);this.saved.totalEarned=money(this.saved.totalEarned+amount);this.saved.xp[job.role]+=100;
  this.saved.completed[job.id]=(this.saved.completed[job.id]??0)+1;
  const roleCompleted=this.jobs.filter(j=>j.role===job.role).reduce((sum,j)=>sum+(this.saved.completed[j.id]??0),0),person=relationFor[job.role];
  const choiceId=person+'-'+(roleCompleted>=3?'third':'first');
  if(!this.saved.choices[choiceId]&&CHOICES.some(c=>c.id===choiceId))this.saved.pendingChoice=choiceId;
  const message=job.arrivalLine+"  Income +¥ "+amount+" · Quality "+Math.round(a.quality)+" · Experience +100";this.contract=null;
  const events:CareerEvent[]=[{type:'completed',message,amount,jobId:job.id}];if(this.choice)events.push({type:'choice',message:this.choice.title});
  return success(message,events);
 }
 choose(optionId:string):CareerAction{
  const c=this.choice;if(!c)return failure("No messages are currently awaiting a reply.");const option=c.options.find(o=>o.id===optionId);
  if(!option)return failure("Please select a reply.");if(this.saved.cash<option.cost)return failure("Insufficient balance, You can still choose a response that costs nothing.");
  this.saved.cash-=option.cost;this.saved.relations[c.relation]=Math.min(20,this.saved.relations[c.relation]+option.relationship);this.saved.choices[c.id]=option.id;this.saved.pendingChoice=null;
  if(option.cost>0||option.id==='learn')this.saved.supplied=true;
  return success(option.consequence,[{type:'choice',message:option.consequence}]);
 }
 purchase(upgradeId:CareerUpgradeId):CareerAction{
  if(this.contract)return failure("Finish the current contract first, Then install the upgrade.");const upgrade=CAREER_UPGRADES.find(u=>u.id===upgradeId);
  if(!upgrade)return failure("This upgrade is not available yet.");if(this.owned(upgradeId))return failure("You already own this upgrade.");if(this.saved.cash<upgrade.cost)return failure("Still need ¥ "+(upgrade.cost-this.saved.cash)+", Do another job and save up little by little.");
  this.saved.cash-=upgrade.cost;this.saved.upgrades.push(upgradeId);return success("Purchased · "+upgrade.title,[{type:'purchase',message:upgrade.description,amount:-upgrade.cost}]);
 }
 replenish(frame:CareerFrame):CareerAction{
  if(this.contract)return failure("After the current contract ends, Then return for supplies.");if(this.saved.supplied)return failure("Supplies replenished, Takes effect when work starts next time.");
  if(!validFrame(frame)||distance(frame.position,this.places.hub)>40||Math.abs(frame.speed)>=1)return failure("Come to a full stop near the service station, Then you can buy a hot meal to replenish supplies.");
  if(this.saved.cash<18)return failure("One Supply Pack ¥ 18, The balance is still too low.");this.saved.cash-=18;this.saved.supplied=true;
  return success("Hot food and water are ready · Reduced comfort loss on the next order 15%, Completion bonus ¥ 18.",[{type:'purchase',message:"Rest stop resupply complete",amount:-18}]);
 }
 /** The three legacy narrative rides may credit this shared wallet once, without duplicating migration rewards. */
 creditLegacy(id:string,amount:number):CareerAction{
  if(!id||id.length>100||!Number.isFinite(amount)||amount<=0||amount>1000||this.saved.legacyCompleted.includes(id))return failure("This trip has been logged in the journal.");
  this.saved.legacyCompleted.push(id);this.saved.cash=money(this.saved.cash+amount);this.saved.totalEarned=money(this.saved.totalEarned+amount);return success("Income +¥ "+Math.floor(amount));
 }
}
function validFrame(frame:CareerFrame){return Array.isArray(frame.position)&&frame.position.length===2&&frame.position.every(Number.isFinite)&&Number.isFinite(frame.speed)&&Number.isFinite(frame.odometer)&&Number.isFinite(frame.debugEpoch)&&Number.isFinite(frame.dt)&&frame.dt>=0&&(frame.yaw===undefined||Number.isFinite(frame.yaw));}
