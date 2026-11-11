import test from 'node:test';
import assert from 'node:assert/strict';
import {showroomEntered} from '../src/native-showroom-layout.ts';
import {garageWorld,type GaragePlacement} from '../src/native-garage-layout.ts';
test('showroom entry accepts the room, including fast swept entry, at any site rotation',()=>{
 for(const yaw of [0,.4,Math.PI/2,-2.1]){
  const site:GaragePlacement={origin:[123,456],yaw,baseY:0,approach:[0,0],door:[0,0],goal:[0,0],originalGoal:[0,0]};
  const entered=(a:[number,number],b:[number,number])=>showroomEntered(site,garageWorld(site,...a),garageWorld(site,...b));
  assert(entered([-7,-1.925],[-5.7,-1.925]),'entry far from the old counter goal counts');
  assert(entered([-8,-1.925],[6,-1.925]),'fast frame with both ends outside still detects room');
  assert(entered([0,5.4],[0,5.4]),'inside near wall counts without a parking angle');
  assert(!entered([-8,-1.925],[-6,-1.925]),'outside facade does not count');
  assert(!entered([-8,6.3],[7,6.3]),'driving beside the building does not count');
 }
});
