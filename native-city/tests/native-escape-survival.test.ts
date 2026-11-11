import test from 'node:test';import assert from 'node:assert/strict';
import {NavigationPolicePursuit,POLICE_RULES,insidePoliceSector,policeSectorOrigin,policeSectorPolygon,type PoliceUnit} from '../src/offmap-navigation-police.ts';
import {escapeSurvivalOutcome,escapeSurvivalHint} from '../src/native-escape-survival.ts';
const player={x:0,y:0,z:-6};
function pursuit(){
 const n=new NavigationPolicePursuit({player:{spawn:{position:[0,0,0],yaw:0}},navigation:{path:[[0,0,0],[0,0,-100]],mode:'drive',category:'escape'}} as any,20);
 n.units=[{id:'one',position:{x:0,y:0,z:0},yaw:0,speed:0,cursor:0,bornAt:0,scheduledAt:0,stuckSeconds:0}];n.nextSpawnAt=1000;return n;
}
test('capture uses a 12m radius and 90-degree sector, same polygon as minimap',()=>{
 const unit=pursuit().units[0],origin=policeSectorOrigin(unit);assert.equal(POLICE_RULES.radius,12);assert.equal(POLICE_RULES.angleDegrees,90);
 assert(insidePoliceSector(unit,{...origin,z:origin.z-12}));assert(!insidePoliceSector(unit,{...origin,z:origin.z-12.01}));
 assert(!insidePoliceSector(unit,{...origin,z:origin.z+1}));assert(!insidePoliceSector(unit,{...origin,x:origin.x+4,z:origin.z-1}));
 for(const p of policeSectorPolygon(unit).slice(1)){assert(Math.abs(Math.hypot(p.x-origin.x,p.z-origin.z)-12)<1e-8);assert(insidePoliceSector(unit,p));}
});
test('requires continuous 3s exposure, resets on leaving and latches capture',()=>{
 const n=pursuit();for(let i=0;i<29;i++)assert.equal(n.checkCapture(player,.1),false);
 assert.equal(n.checkCapture({x:50,y:0,z:0},.1),false);assert.equal(n.exposureSeconds,0);
 for(let i=0;i<29;i++)assert.equal(n.checkCapture(player,.1),false);assert(n.checkCapture(player,.1));
 assert(n.checkCapture({x:50,y:0,z:0}));assert.equal(n.capturedBy,'one');
});
test('overlapping sectors and step pre/post checks do not double-count time',()=>{
 const n=pursuit();n.units.push({...n.units[0],id:'two'} as PoliceUnit);
 for(let i=0;i<29;i++){n.step(.1,player,0,0,()=>true,()=>0);assert.equal(n.capturedBy,null);}
 assert(Math.abs(n.exposureSeconds-2.9)<1e-8);n.step(.1,player,0,0,()=>true,()=>0);assert(n.capturedBy);
});
test('clean minute wins within 180s, capture wins ties, missing clean minute times out',()=>{
 assert.equal(escapeSurvivalOutcome(59.999,false,59.999),null);assert.equal(escapeSurvivalOutcome(60,false,60),'success');
 assert.equal(escapeSurvivalOutcome(60,false,0),null);assert.equal(escapeSurvivalOutcome(179.9,false,59.9),null);
 assert.equal(escapeSurvivalOutcome(180,false,60),'success');assert.equal(escapeSurvivalOutcome(180,false,59.9),'failure');
 assert.equal(escapeSurvivalOutcome(180.1,false,60),'failure');assert.equal(escapeSurvivalOutcome(60,true,60),'failure');
 assert.match(escapeSurvivalHint(0,0,0),/Remaining 180 seconds/i);assert.match(escapeSurvivalHint(179.9,1.5,0),/Remaining 1 seconds.*1.5 \/ 3/i);
});
test('even a zero-duration scan resets the clean minute; proximity outside sector does not',()=>{
 const n=pursuit(),behind={x:0,y:0,z:3};
 for(let i=0;i<599;i++)n.checkCapture(behind,.1);
 assert(Math.abs(n.unscannedSeconds-59.9)<1e-8);
 n.checkCapture(player);assert.equal(n.unscannedSeconds,0);assert.equal(n.capturedBy,null);
 for(let i=0;i<600;i++)n.checkCapture(behind,.1);
 assert(Math.abs(n.unscannedSeconds-60)<1e-8);assert.equal(n.exposureSeconds,0);
 n.checkCapture(behind,0,true);assert.equal(n.unscannedSeconds,0,'pre-movement scan cannot award a safe frame');
});
test('police step counts safe time once, not in both pre/post movement checks',()=>{
 const n=pursuit();for(let i=0;i<10;i++)n.step(.1,{x:0,y:0,z:3},0,0,()=>true,()=>0);
 assert(Math.abs(n.unscannedSeconds-1)<1e-8);
});
