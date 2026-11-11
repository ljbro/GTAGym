#!/usr/bin/env node
import fs from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {harnessRules} from './rules.mjs';

export const codexAgentsURL=new URL('../../harness/codex/AGENTS.md',import.meta.url);
const templateURL=new URL('../../harness/codex/AGENTS.template.md',import.meta.url);
const systemURL=new URL('../server-eval/system-prompt.en.md',import.meta.url);
const marker='{{ENVIRONMENT_RULES}}';

/** All prompt text comes from editable Markdown; no per-task instruction is read. */
export async function renderCodexAgents(){
 const [template,system]=await Promise.all([fs.readFile(templateURL,'utf8'),fs.readFile(systemURL,'utf8')]);
 if(!template.trim()||!system.trim())throw Error('Codex guidance Markdown must not be empty');
 if(template.split(marker).length!==2)throw Error('The Codex template must have exactly one environment-rules marker');
 const content=template.replace(marker,harnessRules(system,{language:'en'}).trim()).trimEnd()+'\n';
 if(Buffer.byteLength(content)>32*1024)throw Error('Codex guidance exceeds 32 KiB; review its size before deployment');
 return content;
}

async function main(args){
 if(args.length!==1||!['--check','--write','--print'].includes(args[0]))throw Error('Usage: node scripts/game-mcp/build-codex-agents.mjs --check|--write|--print');
 const content=await renderCodexAgents();
 if(args[0]==='--print'){process.stdout.write(content);return;}
 if(args[0]==='--write'){
  // A mechanical build of the checked-in template, not a new prompt source.
  await fs.writeFile(codexAgentsURL,content);process.stdout.write('Updated harness/codex/AGENTS.md\n');return;
 }
 const actual=await fs.readFile(codexAgentsURL,'utf8');
 if(actual!==content)throw Error('harness/codex/AGENTS.md is stale. Review the Markdown sources, then run with --write.');
 process.stdout.write(`Codex guidance is in sync (${Buffer.byteLength(content)} bytes).\n`);
}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)main(process.argv.slice(2)).catch(error=>{process.stderr.write(error.message+'\n');process.exitCode=1;});
