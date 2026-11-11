import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {Client} from '@modelcontextprotocol/client';
import {StdioClientTransport} from '@modelcontextprotocol/client/stdio';

for(const mode of ['legacy',{pin:'2026-07-28'}])test(`stdio MCP ${JSON.stringify(mode)} discovery exposes only actions, with host bootstrap explicitly disabled`,async()=>{
 const directory=await fs.mkdtemp(path.join(os.tmpdir(),'gta-mcp-stdio-'));
 const output=path.join(directory,'unused'),transport=new StdioClientTransport({command:process.execPath,
  args:[fileURLToPath(new URL('../server.mjs',import.meta.url)),'--task','c01-n04','--output',output,'--bootstrap','off'],stderr:'pipe'});
 let stderr='';transport.stderr.on('data',b=>{stderr+=b.toString();});
 const client=new Client({name:'gtabench-protocol-test',version:'1.0.0'},{versionNegotiation:{mode}});
 try{
  await client.connect(transport);assert.equal(client.getServerVersion().name,'gtabench-game');
  const tools=await client.listTools();assert.deepEqual(tools.tools.map(t=>t.name),['game_step']);
  let unknown;
  try{unknown=await client.callTool({name:'game_observe',arguments:{}});}catch(error){assert(error.message);}
  if(unknown)assert.equal(unknown.isError,true);
  const unready=await client.callTool({name:'game_step',arguments:{request_id:'before-host',observation_id:'none',action:{keys:[],mouse:{}}}});
  assert(unready.isError);assert.equal(JSON.parse(unready.content[0].text).code,'HOST_NOT_READY');
  const resources=await client.listResources();assert.deepEqual(resources.resources.map(r=>r.uri),['game://rules']);
  const rules=(await client.readResource({uri:'game://rules'})).contents[0].text;
  assert(rules.includes('relative mouse displacement'));assert(!rules.includes('at most 10 screenshots'));
  assert(!rules.includes('Output nothing other than JSON'));assert(rules.includes('game_step.action'));assert(!rules.includes('game_observe'));
  await assert.rejects(client.readResource({uri:'game://task'}));
  await assert.rejects(fs.stat(output),e=>e.code==='ENOENT','Discovery and model calls must not bypass disabled host bootstrap');
 }finally{await client.close();await transport.close();await fs.rm(directory,{recursive:true,force:true});}
 assert(stderr.includes('stdio ready'));assert(!stderr.includes('Internal error'),stderr);
});
