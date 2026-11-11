import test from 'node:test';
import assert from 'node:assert/strict';
import {ordinaryOutdoorRouteMaxDuration} from '../src/native-task-timing.ts';
import {isOrdinaryOutdoorDrive,isOrdinaryOutdoorWalk,ordinaryDriveMaxDuration,ordinaryOutdoorTaskMaxDuration,ORDINARY_DRIVE_REFERENCE_SPEED,OUTDOOR_FOOT_REFERENCE_SPEED,OUTDOOR_FOOT_WALK_SPEED,OUTDOOR_FOOT_RUN_SPEED} from '../src/native-task-timing.ts';

test('ordinary outdoor driving uses the 18 m/s reference speed',()=>{
 assert.equal(ORDINARY_DRIVE_REFERENCE_SPEED,18);
 assert.equal(ordinaryDriveMaxDuration(1800),100);
 assert.equal(ordinaryDriveMaxDuration(18),1);
});

test('deadline is disabled for invalid or empty routes',()=>{
 assert.equal(ordinaryDriveMaxDuration(0),0);
 assert.equal(ordinaryDriveMaxDuration(-20),0);
 assert.equal(ordinaryDriveMaxDuration(Number.NaN),0);
 assert.equal(ordinaryDriveMaxDuration(Number.POSITIVE_INFINITY),0);
});

test('only ordinary outdoor drive tasks are eligible',()=>{
 assert.equal(isOrdinaryOutdoorDrive('drive','outdoor-road'),true);
 assert.equal(isOrdinaryOutdoorDrive('drive','chase'),false);
 assert.equal(isOrdinaryOutdoorDrive('drive','escape'),false);
 assert.equal(isOrdinaryOutdoorDrive('drive','follow'),false);
 assert.equal(isOrdinaryOutdoorDrive('walk','outdoor-road'),false);
});

test('outdoor walking uses walking speed only; running speed is unchanged',()=>{
 assert.equal(OUTDOOR_FOOT_WALK_SPEED,1.6);
 assert.equal(OUTDOOR_FOOT_RUN_SPEED,4.2);
 assert.equal(OUTDOOR_FOOT_REFERENCE_SPEED,1.6);
 assert.equal(ordinaryOutdoorTaskMaxDuration('walk','outdoor-foot',160),100);
 assert.equal(ordinaryOutdoorTaskMaxDuration('walk','outdoor-foot',100),62.5);
 assert.equal(isOrdinaryOutdoorWalk('walk','outdoor-foot'),true);
 assert.equal(isOrdinaryOutdoorWalk('walk','stairs'),false);
});

test('special task categories do not receive an outdoor deadline',()=>{
 for(const [mode,category] of [['drive','chase'],['drive','escape'],['drive','follow'],['walk','follow'],['walk','chase'],['swim','water'],['flight','air']] as const){
  assert.equal(ordinaryOutdoorTaskMaxDuration(mode,category,1000),0,`${mode}/${category}`);
 }
});

test('c07-n05 adds ten seconds once, without changing other task deadlines',()=>{
 const base=ordinaryOutdoorTaskMaxDuration('walk','outdoor-foot',100);
 assert.equal(ordinaryOutdoorTaskMaxDuration('walk','outdoor-foot',100,'c07-n05'),base+10);
 assert.equal(ordinaryOutdoorTaskMaxDuration('walk','outdoor-foot',100,'c07-n05'),72.5);
 assert.equal(ordinaryOutdoorTaskMaxDuration('walk','outdoor-foot',100,'c02-n14'),base);
 assert.equal(ordinaryOutdoorTaskMaxDuration('walk','outdoor-foot',0,'c07-n05'),0);
 assert.equal(ordinaryOutdoorTaskMaxDuration('walk','follow',100,'c07-n05'),0);
 assert.equal(ordinaryOutdoorTaskMaxDuration('drive','outdoor-road',180,'c07-n05'),10);
});

test('moving pickup and ladder missions into climbing preserves their deadlines',()=>{
 for(const id of ['c07-n01','c07-n04','c07-n05']){
  assert.equal(ordinaryOutdoorRouteMaxDuration('walk','stairs',[[0,0],[96,0],[96,32]],id),ordinaryOutdoorRouteMaxDuration('walk','outdoor-foot',[[0,0],[96,0],[96,32]],id));
 }
 assert.equal(ordinaryOutdoorTaskMaxDuration('walk','stairs',100,'c07-n05'),72.5);
 for(const id of ['c07-n02','c07-n03'])assert.equal(ordinaryOutdoorTaskMaxDuration('walk','stairs',100,id),0);
});

test('recalibration uses every segment of the final polyline including endpoint additions',()=>{
 const route:[number,number][]=[[0,0],[180,0],[180,90]];
 assert.equal(ordinaryOutdoorRouteMaxDuration('drive','outdoor-road',route),15);
 route.push([360,90]);
 assert.equal(ordinaryOutdoorRouteMaxDuration('drive','outdoor-road',route),25);
 assert.equal(ordinaryOutdoorRouteMaxDuration('walk','outdoor-foot',[[0,0],[96,0],[96,32]]),80);
 assert.equal(ordinaryOutdoorRouteMaxDuration('walk','outdoor-foot',[[0,0],[96,0],[96,32]],'c07-n05'),90);
 assert.equal(ordinaryOutdoorRouteMaxDuration('drive','chase',route),0);
 assert.equal(ordinaryOutdoorRouteMaxDuration('drive','outdoor-road',[]),0);
 assert.equal(ordinaryOutdoorRouteMaxDuration('walk','outdoor-foot',[[0,0],[NaN,1]]),0);
});
