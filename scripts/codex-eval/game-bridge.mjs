import net from 'node:net';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {randomBytes} from 'node:crypto';
import {createInterface} from 'node:readline';
import {once} from 'node:events';
import {HostObservations} from '../game-mcp/observation-host.mjs';
import {modelMcpMessage} from '../game-mcp/public-observation.mjs';

export async function startGameBridge(session,{schema,description,toolResult,imageOnly=false,onTerminal=()=>{}}){
 const observations=imageOnly?new HostObservations():null;
 const rejectedCalls=new Map();
 const directory=await fs.mkdtemp(path.join(os.tmpdir(),'gta-codex-')),socketPath=path.join(directory,'step.sock'),token=randomBytes(32).toString('hex'),sockets=new Set();
 await fs.chmod(directory,0o700);
 const server=net.createServer(socket=>{
  sockets.add(socket);socket.once('close',()=>sockets.delete(socket));socket.on('error',()=>{});
  void(async()=>{
   let authenticated=false;
   for await(const line of createInterface({input:socket,crlfDelay:Infinity})){
    if(Buffer.byteLength(line)>2*1024**2)throw Error('Oversized MCP input');
    const message=JSON.parse(line);
    if(!authenticated){if(message.auth!==token)throw Error('Bad socket credential');authenticated=true;continue;}
    if(!Object.hasOwn(message,'id'))continue;
    let result,error;
    if(message.jsonrpc!=='2.0')error={code:-32600,message:'Invalid request'};
    else if(message.method==='initialize')result={protocolVersion:message.params?.protocolVersion??'2024-11-05',capabilities:{tools:{}},serverInfo:{name:'gtabench-game-only',version:'1.0.0'}};
    else if(message.method==='ping')result={};
    else if(message.method==='tools/list')result={tools:[{name:'game_step',description,inputSchema:schema,annotations:{readOnlyHint:false,destructiveHint:false,idempotentHint:true,openWorldHint:false}}]};
    else if(['resources/list','resources/templates/list','prompts/list'].includes(message.method))result=message.method==='resources/templates/list'?{resourceTemplates:[]}:message.method==='prompts/list'?{prompts:[]}:{resources:[]};
    else if(message.method==='tools/call'&&message.params?.name==='game_step'){
     // Host-issued, error-only receipts. They are NEVER passed to the action
     // executor or observation generation; retries return the same safe error.
     const args=message.params.arguments,rejected=rejectedCalls.get(args?.request_id);
     if(rejected){
      await session.event?.({event:'invalid_tool_feedback',requestId:args.request_id,executed:false});
      socket.write(JSON.stringify({jsonrpc:'2.0',id:message.id,result:{isError:true,content:[{type:'text',text:rejected.message}]}})+'\n');continue;
     }
     let forwarded=message;
     if(observations){const bound=observations.request(message);if(bound.reply){socket.write(JSON.stringify(modelMcpMessage(bound.reply))+'\n');continue;}forwarded=bound.forward;}
     try{
      const snapshot=await session.step(forwarded.params.arguments);result=toolResult(snapshot);
      if(observations&&snapshot.metadata?.done){
       observations.response({jsonrpc:'2.0',id:message.id,result});onTerminal(snapshot);continue;
      }
     }
     catch(e){const known=typeof e.code==='string',errorBlock={type:'text',text:JSON.stringify({code:known?e.code:'INTERNAL_ERROR',message:known?e.message:'Game operation failed; evaluator must inspect private logs.'})};
      result={isError:true,content:[errorBlock]};}
    }else error={code:-32601,message:'Only game_step is available'};
    const response={jsonrpc:'2.0',id:message.id,...error?{error}:{result}};
    if(observations){socket.write(JSON.stringify(modelMcpMessage(observations.response(response)))+'\n');}
    else socket.write(JSON.stringify(response)+'\n');
   }
  })().catch(()=>socket.destroy());
 });
 server.listen(socketPath);await once(server,'listening');await fs.chmod(socketPath,0o600);
 return {socketPath,token,
  rejectGameTool(message){
   if(typeof message!=='string'||message.length>200)throw Error('Invalid host tool rejection message');
   const request_id='invalid_tool_'+randomBytes(16).toString('hex');
   rejectedCalls.set(request_id,{message});
   // Intentionally invalid action as defense in depth: even if this receipt
   // bypassed the branch above, strict action validation cannot execute it.
   return {request_id,action:{__invalid_tool:true}};
  },
  initialize(snapshot){if(!observations)throw Error('Private observation binding is not enabled');observations.initialize(snapshot);},
  feedback(snapshot){if(!observations)throw Error('Private observation binding is not enabled');observations.feedback(snapshot);},
  modelRequest(){observations?.modelRequest({type:'api_request',method:'POST',path:'/responses'});},
  modelResponse(items){observations?.modelResponse(items);},
  async close(){for(const socket of sockets)socket.destroy();await new Promise(resolve=>server.close(resolve));await fs.rm(directory,{recursive:true,force:true});}};
}
