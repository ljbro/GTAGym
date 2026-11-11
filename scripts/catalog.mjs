import fs from 'node:fs/promises';
import path from 'node:path';
import {parseArgs} from 'node:util';
import {ServerEnvironment} from './server-eval/environment.mjs';
import {loadPrompts} from './server-eval/prompts.mjs';
const {values}=parseArgs({options:{url:{type:'string',default:'http://127.0.0.1:4200/'},output:{type:'string',default:'.cache/benchmark-live.json'},renderer:{type:'string',default:'gpu'}}});
const env=new ServerEnvironment({url:values.url,renderer:values.renderer});
try{
 await env.open();
 const categories=await env.evaluate(()=>{
  const category=document.querySelector('#native-task-category'),picker=document.querySelector('#native-task-picker');
  if(!category||!picker)throw Error('Task menu is unavailable');
  return [...category.options].filter(o=>o.value!=='all').map(o=>{
   category.value=o.value;category.dispatchEvent(new Event('change',{bubbles:true}));
   const tasks=[...picker.options].map(t=>t.value);
   return {category:o.value,label:o.textContent.replace(/\(\d+\)$/,'').trim(),available:tasks.length,tasks};
  });
 });
 const tasks=categories.flatMap(c=>c.tasks);
 if(!tasks.length||new Set(tasks).size!==tasks.length)throw Error('Invalid live task catalog');
 await loadPrompts({systemPrompt:'scripts/server-eval/system-prompt.en.md',promptsFile:'tasks/instructions.json',tasks});
 const output=path.resolve(values.output);await fs.mkdir(path.dirname(output),{recursive:true});
 await fs.writeFile(output,JSON.stringify({schema:'gtasuite.benchmark.v1',scope:'all',build:new URL(env.build).pathname,categories},null,2),{flag:'wx'});
 console.log(JSON.stringify({output,tasks:tasks.length,categories:categories.map(c=>({category:c.category,count:c.tasks.length}))},null,2));
}finally{await env.close();}
