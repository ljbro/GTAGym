import test from 'node:test';
import assert from 'node:assert/strict';
import {cleanupHarness} from '../scripts/codex-eval/cleanup.mjs';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {run,parseCli} from '../scripts/codex-eval/run.mjs';

test('secondary failures cannot skip later cleanup or erase the primary error',async()=>{
 const calls=[],primary=Error('original feedback failure'),report={status:'evaluation_error',error:primary.message};
 const errors=await cleanupHarness({
  gateway:{close:async()=>{calls.push('gateway');throw Error('gateway cleanup');}},
  bridge:{close:async()=>{calls.push('bridge');}},
  session:{close:async()=>{calls.push('session');throw Error('stale close');}},
  workspaceCleanup:async()=>calls.push('workspace'),
 });
 report.cleanupErrors=errors.map(({stage,error})=>({stage,error:error.message}));
 assert.deepEqual(calls,['gateway','bridge','session','workspace']);assert.equal(report.error,'original feedback failure');
 assert.deepEqual(report.cleanupErrors,[{stage:'gateway',error:'gateway cleanup'},{stage:'game-session',error:'stale close'}]);
});
test('normal and absent optional resources clean up with no extra error',async()=>{
 assert.deepEqual(await cleanupHarness({session:{close:async()=>{}}}),[]);
});
test('the real runner commits report and preserves a primary error despite close failing',async t=>{
 const directory=await fs.mkdtemp(path.join(os.tmpdir(),'gta-cleanup-report-'));t.after(()=>fs.rm(directory,{recursive:true,force:true}));
 const bin=path.join(directory,'codex-fixture'),key=path.join(directory,'key');
 // Version-only stub: the injected gateway fails before any native turn/model call.
 await fs.writeFile(bin,'#!/bin/sh\necho codex-cli-fixture\n',{mode:0o700});await fs.writeFile(key,'fixture-key');
 const options=parseCli(['--task','c01-n04','--model','Qwen3.8-27B','--base-url','https://not-called.invalid','--key-file',key,'--codex-bin',bin,'--output',path.join(directory,'run')]);
 const session={started:false,receipts:new Map(),close:async()=>{throw Error('secondary stale close');}};
 await assert.rejects(run(options,{sessionFactory:()=>session,gatewayFactory:async()=>{throw Error('original transport fault');}}),/original transport fault/);
 const report=JSON.parse(await fs.readFile(path.join(options.output,'report.json'),'utf8'));
 assert.equal(report.status,'evaluation_error');assert.equal(report.error,'original transport fault');assert(report.finishedAt);
 assert.deepEqual(report.cleanupErrors,[{stage:'game-session',error:'secondary stale close'}]);
});
