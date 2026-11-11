import test from 'node:test';import assert from 'node:assert/strict';
import {NativeCompanionRescue,RESCUE_RULES,rescueWindow,type RescuePlayer} from '../src/native-companion-rescue.ts';
import {rescueFeedback} from '../src/native-rescue-hud.ts';
function rider(r:NativeCompanionRescue):RescuePlayer{return {point:[...r.window.point],yaw:r.window.yaw,speed:RESCUE_RULES.speed,driving:true,heightValid:true};}
function advance(r:NativeCompanionRescue,change:(p:RescuePlayer)=>void=()=>{},count=1){let result;for(let i=0;i<count;i++){const a=rider(r),b={...a,point:[a.point[0],a.point[1]+RESCUE_RULES.speed*.025] as [number,number]};change(a);change(b);result=r.step(.025,a,b);}return result;}
test('rescue truck takes time to turn and pickup compares actual cornering speed',()=>{
 const r=new NativeCompanionRescue([[0,0],[0,150],[150,150],[150,350]]);let time=0,minSpeed=100,turnTime=0,maxYaw=0;
 while(r.stage!=='failed'&&time<120){
  const p={...rider(r),driving:false},yaw=r.pose.yaw;r.step(.02,p,p);time+=.02;
  const d=Math.abs(Math.atan2(Math.sin(r.pose.yaw-yaw),Math.cos(r.pose.yaw-yaw)));maxYaw=Math.max(maxYaw,d);
  if(d>.002){turnTime+=.02;minSpeed=Math.min(minSpeed,r.speed);assert(r.conditions({...rider(r),speed:r.speed}).speed);}
 }
 assert(minSpeed<10);assert(turnTime>3);assert(maxYaw<.05);assert.equal(r.boarded,0);
});
test('one side transfer immediately succeeds, with no stern or route-percentage requirement',()=>{
 const r=new NativeCompanionRescue([[0,0],[0,1000]]);
 advance(r,p=>p.point=[0,r.pose.point[1]],200);assert.equal(r.boarded,0);assert.equal(r.stage,'side');
 const outcome=advance(r,()=>{},80);assert.equal(r.boarded,1);assert.equal(r.stage,'complete');
 assert.equal(outcome,'success');assert(r.distance<r.length*.45);
 assert.equal(advance(r,p=>{p.driving=false;},200),'success');assert.equal(r.boarded,1);
});
test('rescue HUD uses scoring predicates and shows progress/reset and missing conditions',()=>{
 const r=new NativeCompanionRescue([[0,0],[0,1000]]),p=rider(r);
 assert.equal(rescueFeedback(r,p).aligned,r.aligned(p));assert.equal(rescueFeedback(r,p).progress,0);
 for(const [field,phrase] of [['driving',"Enter vehicle"],['heightValid',"Bridge deck"]] as const){const wrong={...p,[field]:false};assert(!rescueFeedback(r,wrong).aligned);assert.match(rescueFeedback(r,wrong).status,new RegExp(phrase,'i'));}
 assert.match(rescueFeedback(r,{...p,point:[0,0]}).status,/Blue dot/i);
 // Being far behind on the bridge ramp is not evidence of being off the bridge.
 assert.match(rescueFeedback(r,{...p,point:[0,0],heightValid:false}).status,/Blue dot/i);
 assert.match(rescueFeedback(r,{...p,yaw:Math.PI}).status,/Same direction/i);
 assert.match(rescueFeedback(r,{...p,speed:RESCUE_RULES.speed+11}).status,/Throttle/i);
 advance(r,()=>{},40);const transfer=rescueFeedback(r,rider(r));assert(transfer.progress>0&&transfer.progress<100);assert.match(transfer.status,/Boarding/i);
 advance(r,p=>{p.point[0]-=3;},16);assert.equal(rescueFeedback(r,rider(r)).progress,0);
 advance(r,()=>{},80);assert.equal(rescueFeedback(r,rider(r)).progress,100);assert.match(rescueFeedback(r,rider(r)).status,/Picked up/i);
});
test('walking, wrong height, opposite heading and excessive relative speed reject rescue',()=>{
 for(const change of[(p:RescuePlayer)=>{p.driving=false;},(p:RescuePlayer)=>{p.heightValid=false;},(p:RescuePlayer)=>{p.yaw=Math.PI;},(p:RescuePlayer)=>{p.speed=RESCUE_RULES.speed+11;},(p:RescuePlayer)=>{p.point[0]+=1.9;}]){const r=new NativeCompanionRescue([[0,0],[0,1000]]);advance(r,change,90);assert.equal(r.boarded,0);assert.equal(r.hold,0);}
});
test('side contact must persist through animation; discontinuity cannot satisfy boarding',()=>{
 const r=new NativeCompanionRescue([[0,0],[0,1000]]);advance(r,()=>{},40);assert.equal(r.stage,'side-transfer');assert(r.transfer>0);
 advance(r,p=>{p.point[0]-=3;},16);assert.equal(r.stage,'side');assert.equal(r.transfer,0);assert.equal(r.boarded,0);
 advance(r,()=>{},40);const p=rider(r);r.step(.1,p,p,true);assert.equal(r.hold,0);assert.equal(r.transfer,0);
 r.step(30,p,p);assert.equal(r.boarded,0);assert(r.hold<=.25);
});
test('expanded window accepts imperfect alignment and succeeds faster',()=>{
 const r=new NativeCompanionRescue([[0,0],[0,1000]]);
 assert.equal(advance(r,p=>{p.point[0]-=1.6;p.point[1]+=3.5;p.yaw+=Math.PI/4;p.speed+=9;},64),'success');
});
test('brief steering drift freezes progress, resumes, but never earns rescue time',()=>{
 const r=new NativeCompanionRescue([[0,0],[0,1000]]);advance(r,()=>{},30);
 const saved=r.transfer;assert(saved>0);
 advance(r,p=>{p.point[0]-=3;},12);assert.equal(r.transfer,saved);assert.equal(r.stage,'side-transfer');
 advance(r,()=>{},1);assert(r.transfer>saved);
 advance(r,p=>{p.point[0]-=3;},16);assert.equal(r.hold,0);assert.equal(r.transfer,0);
 assert.equal(advance(r,()=>{},64),'success');
});
test('leaving vehicle or bridge resets immediately even within grace period',()=>{
 for(const field of ['driving','heightValid'] as const){const r=new NativeCompanionRescue([[0,0],[0,1000]]);advance(r,()=>{},30);advance(r,p=>{p[field]=false;});assert.equal(r.hold,0);assert.equal(r.transfer,0);assert.equal(r.stage,'side');}
});
test('target arriving first fails even if player is near its endpoint',()=>{
 const r=new NativeCompanionRescue([[0,0],[0,100]]);let outcome;for(let i=0;i<300&&!outcome;i++)outcome=advance(r,p=>{p.driving=false;});assert.equal(outcome,'failure');assert.equal(r.stage,'failed');assert.equal(r.boarded,0);
});
test('rescue slots are trailer-relative, not world-axis fixed or inside trailer',()=>{
 const a=rescueWindow({x:10,z:20,yaw:0},0),b=rescueWindow({x:10,z:20,yaw:Math.PI/2},0),stern=rescueWindow({x:0,z:0,yaw:0},1);
 assert.deepEqual(a.point,[5.75,15.5]);assert(Math.abs(b.point[0]-5.5)<1e-8);assert(Math.abs(b.point[1]-24.25)<1e-8);
 assert(stern.point[1]+4.7/2<-9.5);assert(RESCUE_RULES.transferSeconds>1);
});
