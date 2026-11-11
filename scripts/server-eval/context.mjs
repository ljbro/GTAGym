/** Prune whole observation/action pairs before inference; retain instruction separately. */
export class ModelContext {
 constructor(system, instruction, {staticOriginal=false,language='zh'}={}) { this.system=system;this.instruction=instruction;this.turns=[];this.staticOriginal=staticOriginal;this.language=language; }
 observe({round,image,mime='image/jpeg'}) {
  // Cursor state is internal checkpoint metadata, not model observation text.
  this.turns.push({round,user:{role:'user',content:[
   {type:'image_url',image_url:{url:`data:${mime};base64,${image.toString('base64')}`}},
  ]}});
  const removed=!this.staticOriginal&&this.turns.length>10?this.turns.splice(0,5):[];
  return removed.map(t=>t.round);
 }
 reply(content) { this.turns.at(-1).assistant={role:'assistant',content}; }
 messages() { return [{role:'system',content:this.system},
  ...this.turns.flatMap((t,i)=>{
   // Attach the instruction to the oldest retained observation, not a separate
   // text-only user message. Never pin the first screenshot across pruning.
   const user=i===0&&this.instruction?{...t.user,content:[{type:'text',text:this.instruction},...t.user.content]}:t.user;
   return t.assistant?[user,t.assistant]:[user];
  })]; }
 get rounds(){return this.turns.map(t=>t.round);}
}
