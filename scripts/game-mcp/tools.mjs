import {McpServer} from '@modelcontextprotocol/server';
import * as z from 'zod/v4';
import {KEYS} from '../server-eval/protocol.mjs';
import {GameError} from './session.mjs';
import {GAME_MCP_INSTRUCTIONS,GAME_STEP_DESCRIPTION,gameStepDescription} from './public-observation.mjs';

export function gameStepSchemas(maxSeconds=1){
 const description=gameStepDescription(maxSeconds);
 const actionSchema=z.object({
 keys:z.array(z.object({key:z.enum(KEYS),duration_seconds:z.number().gt(0).max(maxSeconds)}).strict()).max(KEYS.length),
 mouse:z.object({
  move:z.object({dx:z.number().min(-640).max(640),dy:z.number().min(-360).max(360)}).strict().optional(),
  scroll:z.object({direction:z.enum(['up','down']),steps:z.number().int().min(1).max(6)}).strict().optional(),
  buttons:z.array(z.object({button:z.enum(['left','right']),event:z.enum(['down','up'])}).strict()).max(2).optional(),
 }).strict().optional(),
 wait_seconds:z.number().gt(0).max(maxSeconds).optional(),
}).strict();

 const gameStepInputSchema=z.object({request_id:z.string().regex(/^[-a-zA-Z0-9_]{1,64}$/),observation_id:z.string().min(1).max(100),action:actionSchema}).strict();
 return {actionSchema,gameStepInputSchema,gameStepJSONSchema:z.toJSONSchema(gameStepInputSchema),description};
}
export const {actionSchema,gameStepInputSchema,gameStepJSONSchema}=gameStepSchemas();
export {GAME_STEP_DESCRIPTION};

export function toolResult(snapshot){
 return {content:[{type:'text',text:JSON.stringify(snapshot.metadata)},
  ...(snapshot.image?[{type:'image',data:snapshot.image,mimeType:snapshot.mimeType}]:[])],
  structuredContent:snapshot.metadata,
  ...(snapshot.metadata.outcome==='evaluation_error'?{isError:true}:{})};
}

export function createGameServer(session,{onError=()=>{}}={}){
 const schemas=gameStepSchemas(session.options.maxActionSeconds??1);
 const server=new McpServer({name:'gtabench-game',version:'0.1.0'},{instructions:GAME_MCP_INSTRUCTIONS});
 const call=fn=>async args=>{
  try{return toolResult(await fn(args));}
  catch(error){
   if(!(error instanceof GameError))onError(error);
   const safe=error instanceof GameError?{code:error.code,message:error.message}:{code:'INTERNAL_ERROR',message:'The game service failed. The evaluator must inspect its private logs.'};
   return {isError:true,content:[{type:'text',text:JSON.stringify(safe)}]};
  }
 };
 server.registerTool('game_step',{
  title:'Execute a GTAbench keyboard/mouse action',
  description:schemas.description,
  inputSchema:schemas.gameStepInputSchema,
  annotations:{readOnlyHint:false,destructiveHint:false,idempotentHint:true,openWorldHint:false},
 },call(args=>session.step(args)));
 server.registerResource('game-rules','game://rules',{description:'Shared environment controls adapted from the benchmark Markdown for MCP. Does not contain the per-task objective or a fixed history limit. Supply action payloads inside game_step.action.',mimeType:'text/markdown'},async uri=>({contents:[{uri:uri.href,mimeType:'text/markdown',text:session.options.system}]}));
 return server;
}
