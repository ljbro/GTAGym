import test from 'node:test';
import assert from 'node:assert/strict';
import {CityWalk} from '../src/city-walk.ts';
import {WALK_GOAL_LANDMARKS,chooseWalkGoalLandmark,isWalkGoalLandmarkChoice,walkGoalLandmarkSize,placeWalkGoalLandmark,assertWalkGoalLandmark,verifyWalkGoalLandmark,walkGoalInstruction,goalLandmarkBlocks,type WalkGoalLandmarkKind} from '../src/walk-goal-landmark.ts';
import {parseWalkDataset,WALK_DATASET_SCHEMA} from '../src/generated-walk-tasks.ts';

const flat={clear:()=>true,height:()=>0},route:[number,number][]=[[0,0],[0,100]];
test('only existing licensed asset kinds are accepted; random choices are seeded',()=>{
 assert(isWalkGoalLandmarkChoice('none'));assert(isWalkGoalLandmarkChoice('random'));
 for(const kind of Object.keys(WALK_GOAL_LANDMARKS) as WalkGoalLandmarkKind[]){assert(isWalkGoalLandmarkChoice(kind));const size=walkGoalLandmarkSize(kind);assert(size.width>.5&&size.depth>2);}
 for(const bad of ['__proto__','constructor','https://evil/van.glb','../van',null,5])assert(!isWalkGoalLandmarkChoice(bad));
 assert.equal(chooseWalkGoalLandmark('none',1),undefined);assert.equal(chooseWalkGoalLandmark('motorcycle-green',3),'motorcycle-green');
 assert.deepEqual(Array.from({length:30},(_,i)=>chooseWalkGoalLandmark('random',i)),Array.from({length:30},(_,i)=>chooseWalkGoalLandmark('random',i)));
 assert(new Set(Array.from({length:30},(_,i)=>chooseWalkGoalLandmark('random',i))).size>3);
});
test('each landmark has its full footprint supported, clear of walls and the route',()=>{
 for(const kind of Object.keys(WALK_GOAL_LANDMARKS) as WalkGoalLandmarkKind[]){
  const env={...flat,clear:(x:number)=>x<0},landmark=placeWalkGoalLandmark(kind,route,env);
  assert(landmark.pose.x<0);verifyWalkGoalLandmark(landmark,route,env);assert(goalLandmarkBlocks(landmark,landmark.pose.x,landmark.pose.z));
  for(let z=0;z<=100;z+=.2)assert(!goalLandmarkBlocks(landmark,0,z));
  assert(Math.hypot(landmark.pose.x,landmark.pose.z-100)<9);
 }
 assert.throws(()=>placeWalkGoalLandmark('motorcycle-green',route,{...flat,clear:()=>false}),/safe parking/i);
 assert.throws(()=>placeWalkGoalLandmark('van',route,{...flat,height:(x,z)=>x+z}),/safe parking/i);
});
test('saved landmark placement rejects unsupported terrain, changed obstacles, scale and route overlap',()=>{
 const landmark=placeWalkGoalLandmark('motorcycle-green',route,flat);
 verifyWalkGoalLandmark(landmark,route,flat);
 assert.throws(()=>verifyWalkGoalLandmark(landmark,route,{...flat,height:()=>2}),/unsupported/);
 assert.throws(()=>verifyWalkGoalLandmark(landmark,route,{...flat,clear:()=>false}),/blocked/);
 for(const change of [{x:0,z:100},{x:500},{width:10},{y:NaN},{pitch:NaN},{roll:.8}])assert.throws(()=>assertWalkGoalLandmark({...landmark,pose:{...landmark.pose,...change}},route));
 // A very narrow crossing must be caught continuously, not by coarse samples.
 assert.throws(()=>assertWalkGoalLandmark(landmark,[[landmark.pose.x,-1000],[landmark.pose.x,1000],[0,100]]),/clear/);
 assert.throws(()=>assertWalkGoalLandmark({...landmark,kind:'../../private'},route));
});
test('gentle slopes retain plane alignment without floating or moving the prop on reload',()=>{
 const env={...flat,height:(x:number,z:number)=>.03*x+.04*z},landmark=placeWalkGoalLandmark('pickup',route,env),before=structuredClone(landmark);
 verifyWalkGoalLandmark(landmark,route,env);assert.deepEqual(landmark,before);
 assert(Math.abs(landmark.pose.pitch!+Math.atan(.04))<1e-9);assert(Math.abs(landmark.pose.roll!-Math.atan(.03))<1e-9);
});
test('the real CityWalk controller can reach the goal beside a solid motorcycle',()=>{
 const landmark=placeWalkGoalLandmark('motorcycle-green',route,flat),walk=new CityWalk((x,z)=>goalLandmarkBlocks(landmark,x,z),()=>0);
 walk.active=true;walk.resetMotion();walk.yaw=0;
 for(let i=0;i<3750;i++)walk.step(new Set(['KeyW']),1/60);
 assert(Math.abs(walk.z-100)<.1);assert(!walk.clear(landmark.pose.x,landmark.pose.z,0));
});
test('optional dataset landmark and instructions survive parsing; original datasets still work',()=>{
 const goalLandmark=placeWalkGoalLandmark('motorcycle-green',route,flat),row={id:'rl-walk-test-0001',title:'Walking test',mode:'walk',category:'outdoor-foot',seed:42,instruction:walkGoalInstruction(goalLandmark.kind),points:route,length:100,turnCount:0,maxDuration:62.5,validation:{status:'walk-verified',scope:'test'},goalLandmark};
 const d={schema:WALK_DATASET_SCHEMA,split:'train',generatorVersion:'test',config:{},provenance:{},tasks:[row]};
 assert.deepEqual(parseWalkDataset(d).tasks[0].goalLandmark,goalLandmark);assert.equal(row.instruction.en,'Walk to the green motorcycle.');assert.equal(row.instruction.zh,"Walk to the green motorcycle.");
 assert.equal(walkGoalInstruction().en,'Walk to the marked destination.');
 assert.throws(()=>parseWalkDataset({...d,tasks:[{...row,goalLandmark:{kind:'remote.glb',pose:goalLandmark.pose}}]}));
 const {goalLandmark:_,...original}=row;assert.equal(parseWalkDataset({...d,tasks:[original]}).tasks[0].goalLandmark,undefined);
});
