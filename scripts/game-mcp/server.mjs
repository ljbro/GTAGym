#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import {serveStdio} from '@modelcontextprotocol/server/stdio';
import {loadConfig,help} from './config.mjs';
import {GameSession} from './session.mjs';
import {createGameServer} from './tools.mjs';
import {prepareInitialObservation} from './bootstrap.mjs';

if(process.argv.includes('--help')){process.stdout.write(help);process.exit(0);}
let session;
try{
 const options=await loadConfig(process.argv.slice(2));session=new GameSession(options);
 const privateError=error=>{
  // Never return stack traces, local paths, game state or provider secrets in MCP.
  process.stderr.write('[gtabench-mcp] Internal error; inspect the evaluator-owned output directory.\n');
  if(session.directoryReady)void fs.appendFile(path.join(options.output,'server-errors.log'),String(error.stack??error)+'\n').catch(()=>{});
 };
 let lastCall=Date.now(),activeCalls=0,handle,stopping;
 const originalStep=session.step.bind(session);
 const activity=fn=>(...args)=>{lastCall=Date.now();activeCalls++;return fn(...args).finally(()=>{lastCall=Date.now();activeCalls--;});};
 session.step=activity(originalStep);
 const shutdown=reason=>{
  stopping??=(async()=>{clearInterval(idle);await session.close(reason);await handle?.close();})();
  stopping.catch(privateError);return stopping;
 };
 // serveStdio negotiates the modern MCP spec and older MCP clients.
 handle=serveStdio(()=>createGameServer(session,{onError:privateError}),{onerror:privateError});
 const idle=setInterval(()=>{
  if(options.idleSeconds&&!activeCalls&&!session.inFlight&&Date.now()-lastCall>options.idleSeconds*1000)void shutdown('idle_timeout');
 },1000);idle.unref();
 for(const signal of ['SIGINT','SIGTERM'])process.once(signal,()=>{void shutdown(signal);});
 process.stdin.once('end',()=>{void shutdown('client_disconnected');});
 process.stdin.once('close',()=>{void shutdown('client_disconnected');});
 process.stdout.on('error',()=>{void shutdown('client_disconnected');});
 process.stderr.write(`[gtabench-mcp] stdio ready; private host bootstrap ${options.bootstrap}.\n`);
 if(options.bootstrap==='on')void activity(()=>prepareInitialObservation(session))().catch(error=>{
  privateError(error);process.exitCode=1;void shutdown('bootstrap_failure');
 });
}catch(error){
 process.stderr.write('[gtabench-mcp] '+error.message+'\n');
 await session?.close('startup_failure');process.exitCode=1;
}
