import fs from 'node:fs/promises';
import path from 'node:path';

/** Read once per run: all episodes share the same exact Markdown snapshot. */
export async function loadPrompts({systemPrompt,promptsFile,tasks,instructionMode='provided'}){
 if(!['provided','none'].includes(instructionMode))throw Error('Invalid instruction mode');
 const systemPromptPath=path.resolve(systemPrompt);
 const [system,json]=await Promise.all([fs.readFile(systemPromptPath,'utf8'),fs.readFile(promptsFile,'utf8')]);
 if(!system.trim())throw Error('System prompt Markdown is empty: '+systemPromptPath);
 const prompts=JSON.parse(json);
 if(!prompts||Array.isArray(prompts)||typeof prompts!=='object')throw Error('Invalid prompts file');
 if(Object.hasOwn(prompts,'system'))throw Error('Move the JSON system field to a Markdown file and select it with --system-prompt');
 if(!prompts.instructions||Array.isArray(prompts.instructions)||typeof prompts.instructions!=='object')throw Error('Invalid task instructions');
 const language=prompts.language??'zh';
 if(!['zh','en'].includes(language))throw Error('Unsupported prompt language: '+language);
 if(prompts.instructionTemplate!==undefined&&typeof prompts.instructionTemplate!=='string')throw Error('Invalid instructionTemplate');
 const instructions=Object.fromEntries(tasks.map(taskId=>{
  const text=Object.hasOwn(prompts.instructions,taskId)?prompts.instructions[taskId]:prompts.instructionTemplate?.replaceAll('{{taskId}}',taskId);
  // Unknown IDs still fail; deliberately blank task text uses a neutral objective.
  if(text===undefined)throw Error('Missing instruction '+taskId);
  if(text!==null&&typeof text!=='string')throw Error('Invalid instruction '+taskId);
  return [taskId,instructionMode==='none'||text===null||!text.trim()?'play the game':text];
 }));
 return {system,systemPromptPath,instructions,language};
}

/** Markdown is the sole system-message source. Adapter descriptions are
 * checkpoint metadata only; never append them to the model's instructions. */
export function composeSystemPrompt(system){
 return system;
}
