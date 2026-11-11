import test from 'node:test';
import assert from 'node:assert/strict';
import {installTaskKeyGate} from '../scripts/server-eval/task-key-gate.mjs';

test('task gate blocks the free-roam G shortcut on foot but preserves aircraft gear',()=>{
 const listeners=[],city={stats:{nativeTask:{active:true}},world:{flight:{active:false}}};
 const previous=globalThis.window;
 globalThis.window={__SHENCHENGJI_CITY__:city,addEventListener:(type,handler,options)=>listeners.push({type,handler,options})};
 try{
  installTaskKeyGate();installTaskKeyGate();assert.equal(listeners.length,1);assert.equal(listeners[0].options.capture,true);
  function key(code){let blocked=false;const event={code,preventDefault(){blocked=true;},stopImmediatePropagation(){this.stopped=true;}};listeners[0].handler(event);return {blocked,stopped:!!event.stopped};}
  assert.deepEqual(key('KeyG'),{blocked:true,stopped:true});
  for(const code of ['KeyF','KeyW','KeyV','Numpad8'])assert.deepEqual(key(code),{blocked:false,stopped:false});
  city.world.flight.active=true;assert.deepEqual(key('KeyG'),{blocked:false,stopped:false});
  city.world.flight.active=false;city.stats.nativeTask.active=false;assert.deepEqual(key('KeyG'),{blocked:false,stopped:false});
 }finally{if(previous===undefined)delete globalThis.window;else globalThis.window=previous;}
});
