import test from 'node:test';
import assert from 'node:assert/strict';
import {waterChannelPath} from '../src/native-water-channel.ts';

test('legacy boat channels retain 142m / 65m endpoint buffers',()=>{
 assert.deepEqual(waterChannelPath({path:{points:[[0,0],[0,100]]}}),[[0,-142],[0,0],[0,100],[0,165]]);
});
test('authored driving-channel padding overrides defaults without mutating source',()=>{
 const points=[[0,0],[0,100]];
 assert.deepEqual(waterChannelPath({path:{points},channel:{startPadding:22,endPadding:25}}),[[0,-22],[0,0],[0,100],[0,125]]);
 assert.deepEqual(points,[[0,0],[0,100]]);
 assert.deepEqual(waterChannelPath({path:{points},channel:{startPadding:0,endPadding:0}}),[[0,0],[0,100]]);
});
test('invalid padding or degenerate endpoints fail closed',()=>{
 for(const padding of [-1,NaN,Infinity])assert.throws(()=>waterChannelPath({path:{points:[[0,0],[0,100]]},channel:{startPadding:padding}}),/Invalid water-channel/);
 assert.throws(()=>waterChannelPath({path:{points:[[0,0],[0,0]]}}),/Invalid water-channel/);
});
