import test from 'node:test';
import assert from 'node:assert/strict';
import calibration from '../src/native-water-expert-times.json' with {type:'json'};
import {nativeWaterTiming} from '../src/native-water-timing.ts';
import {ESCAPE_MAX_SECONDS} from '../src/native-escape-survival.ts';
for(const record of calibration.tasks)test(record.id+' retains a valid calibrated water time budget',()=>{
 const timing=nativeWaterTiming(record.id);
 assert(Number.isInteger(timing.expertTicks)&&timing.expertTicks>0);
 assert.equal(timing.expertSeconds,timing.expertTicks/calibration.hz);
 assert.equal(timing.maxDurationSeconds,timing.expertSeconds*2);
});
test('ordinary water tasks have calibrated budgets; escape keeps its independent 180 seconds',()=>{
 assert.equal(calibration.tasks.length,11);assert.equal(ESCAPE_MAX_SECONDS,180);
 for(const id of ['unknown','c05-n15','c05-n16'])assert.throws(()=>nativeWaterTiming(id),/lacks a valid expert trajectory/i);
});
