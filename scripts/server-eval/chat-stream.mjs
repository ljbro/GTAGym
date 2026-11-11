/** Collect an OpenAI-compatible SSE response without changing policy history.
 * The reconstructed completion is used by the existing parser; original chunks
 * remain in the compressed response record for reasoning/usage diagnostics. */
export async function readChatStream(response) {
 if(!response.body)throw Error('Model stream terminated without a response body');
 const reader=response.body.getReader(),decoder=new TextDecoder();
 const chunks=[],choices=new Map();let buffer='',data=[],done=false,first=null,last=null,usage;
 const dispatch=()=>{
  if(!data.length)return;
  const payload=data.join('\n');data=[];
  if(payload==='[DONE]'){done=true;return;}
  let chunk;
  try{chunk=JSON.parse(payload);}catch{throw Error('Model stream terminated with invalid JSON');}
  if(chunk.error){const error=Error('Model stream error: '+(chunk.error.message??chunk.error.code??'unknown'));error.modelResponse={error:chunk.error,providerStream:{chunks:[...chunks,chunk]}};throw error;}
  chunks.push(chunk);first??=chunk;last=chunk;
  if(chunk.usage!=null)usage=chunk.usage;
  for(const incoming of chunk.choices??[]){
   const index=incoming.index??0;
   const choice=choices.get(index)??{index,message:{role:'assistant',content:''},finish_reason:null};
   for(const [key,value] of Object.entries(incoming.delta??{})){
    if(value==null)continue;
    if(key==='role')choice.message.role=value;
    else if(typeof value==='string')choice.message[key]=(choice.message[key]??'')+value;
    else choice.message[key]=value; // Original structured deltas are retained below.
   }
   if(incoming.finish_reason!=null)choice.finish_reason=incoming.finish_reason;
   if(incoming.stop_reason!=null)choice.stop_reason=incoming.stop_reason;
   choices.set(index,choice);
  }
 };
 const line=value=>{
  if(value===''){dispatch();return;}
  if(value.startsWith('data:'))data.push(value.slice(5).replace(/^ /,''));
 };
 try{
  while(!done){
   const next=await reader.read();
   buffer+=decoder.decode(next.value??new Uint8Array(),{stream:!next.done});
   let newline;
   while((newline=buffer.indexOf('\n'))>=0){const value=buffer.slice(0,newline).replace(/\r$/,'');buffer=buffer.slice(newline+1);line(value);if(done)break;}
   if(next.done){if(buffer)line(buffer.replace(/\r$/,''));dispatch();break;}
  }
  if(!done||!choices.size||[...choices.values()].some(c=>c.finish_reason==null))throw Error('Model stream terminated before a complete final response');
  return {...first,...last,object:'chat.completion',choices:[...choices.values()].sort((a,b)=>a.index-b.index),
   ...(usage?{usage}:{}),providerStream:{format:'openai-sse',complete:true,chunks}};
 }catch(error){
  error.modelResponse??={object:'chat.completion.partial',choices:[...choices.values()],...(usage?{usage}:{}),providerStream:{format:'openai-sse',complete:false,chunks}};
  throw error;
 }finally{
  await reader.cancel().catch(()=>{});reader.releaseLock();
 }
}
