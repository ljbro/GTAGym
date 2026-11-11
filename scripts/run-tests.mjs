import fs from 'node:fs/promises';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url));
const withCodex=process.argv.includes('--with-codex');
const optionalNative=new Set(['codex-eval.test.mjs','codex-early-stop.test.mjs',
 'codex-compaction.test.mjs','codex-image-only.test.mjs','codex-invalid-tool-feedback.test.mjs','codex-providers.test.mjs']);
const files=(await fs.readdir(path.join(root,'tests'))).filter(n=>n.endsWith('.test.mjs')&&(withCodex||!optionalNative.has(n))).sort().map(n=>'tests/'+n);
for(const dir of ['scripts/game-mcp/tests']){
 for(const n of (await fs.readdir(path.join(root,dir))).sort())if(n.endsWith('.test.mjs'))files.push(dir+'/'+n);
}
const child=spawn(process.execPath,['--experimental-transform-types','--test','--test-concurrency=2',...files],{cwd:root,env:process.env,stdio:'inherit'});
child.once('error',e=>{console.error(e);process.exitCode=1;});child.once('close',code=>{process.exitCode=code??1;});
