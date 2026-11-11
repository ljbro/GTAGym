import test from 'node:test';
import assert from 'node:assert/strict';
import {parseWallSeconds,startWallTimer} from '../scripts/codex-eval/time-limits.mjs';
import {parseCli} from '../scripts/codex-eval/run.mjs';

const args=['--task','c01-n04','--model','Qwen3.8-27B','--base-url','http://127.0.0.1:9999'];
test('native evaluations default to game/round limits; zero does not schedule an immediate watchdog',t=>{
 t.mock.timers.enable({apis:['setTimeout']});let expired=0;
 const options=parseCli(args);
 assert.equal(options.wallSeconds,0);assert.equal(options.maxRounds,300);assert.equal(options.requestSeconds,3600);
 assert.equal(startWallTimer(options.wallSeconds,()=>expired++),null);
 t.mock.timers.tick(86400*1000);assert.equal(expired,0);
 assert.equal(parseCli([...args,'--wall-seconds','0']).wallSeconds,0);
});
test('explicit host watchdog expires at its chosen deadline and rejects invalid limits',t=>{
 t.mock.timers.enable({apis:['setTimeout']});let expired=0;
 const options=parseCli([...args,'--wall-seconds','7200']);
 const timer=startWallTimer(options.wallSeconds,()=>expired++);
 assert(timer);t.mock.timers.tick(7199999);assert.equal(expired,0);
 t.mock.timers.tick(1);assert.equal(expired,1);clearTimeout(timer);
 for(const value of [-1,1,29,30.5,86401,'garbage']){
  assert.throws(()=>parseWallSeconds(value),/Invalid wallSeconds/);
  assert.throws(()=>parseCli([...args,'--wall-seconds='+value]),/Invalid wallSeconds/);
 }
 assert.equal(parseWallSeconds(30),30);assert.equal(parseWallSeconds(86400),86400);
});
