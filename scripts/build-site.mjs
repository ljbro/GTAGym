#!/usr/bin/env node
// Package only public runtime files, never the checkout or local experiments.
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {parseArgs} from 'node:util';

const root=fileURLToPath(new URL('../',import.meta.url));
const escape=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function taskUrl(id,base){
 if(!/^c\d{2}-n\d{2,3}$/.test(id))throw Error('Invalid public task ID');
 if(!base)return './?task='+id;
 const url=new URL(base.endsWith('/')?base:base+'/');
 if(!['https:','http:'].includes(url.protocol)||url.username||url.password||url.search||url.hash)throw Error('Expected an HTTP(S) site directory URL');
 return new URL('./?task='+id,url).href;
}
export async function buildSite({output=path.join(root,'dist/site'),baseURL}={}){
 output=path.resolve(output);
 if(![path.join(root,'dist/'),path.join(root,'.cache/')].some(prefix=>output.startsWith(prefix)))throw Error('Site output must be beneath dist/ or .cache/');
 const catalog=JSON.parse(await fs.readFile(path.join(root,'tasks/catalog.json'),'utf8'));
 const categories=JSON.parse(await fs.readFile(path.join(root,'configs/task-categories.json'),'utf8')).categories;
 if(catalog.length!==150||new Set(catalog.map(task=>task.id)).size!==150)throw Error('Expected the frozen 150-task benchmark');
 await fs.access(path.join(root,'native-city/dist/index.html'));
 for(const task of catalog)taskUrl(task.id,baseURL);
 await fs.mkdir(path.dirname(output),{recursive:true});await fs.mkdir(output);
 for(const directory of ['assets','city','characters','tasks','training-tasks/outdoor-walk','licenses'])
  await fs.cp(path.join(root,directory),path.join(output,directory),{recursive:true,filter:file=>!path.relative(root,file).split(path.sep).some(part=>part.startsWith('.'))});
 await fs.cp(path.join(root,'native-city/dist/assets'),path.join(output,'assets'),{recursive:true});
 await fs.copyFile(path.join(root,'native-city/dist/index.html'),path.join(output,'index.html'));
 await fs.copyFile(path.join(root,'favicon.svg'),path.join(output,'favicon.svg'));
 await fs.writeFile(path.join(output,'.nojekyll'),'');
 const sections=categories.map(category=>{
  const tasks=catalog.filter(task=>task.category===category.category);if(!tasks.length)return '';
  return `<section><h2>${escape(category.name)} (${tasks.length})</h2><table><thead><tr><th>Task</th><th>Instruction</th></tr></thead><tbody>`+
   tasks.map(task=>`<tr><td><a href="${escape(taskUrl(task.id,baseURL))}">${escape(task.id)}</a></td><td>${escape(task.instruction)}</td></tr>`).join('')+'</tbody></table></section>';
 }).join('\n');
 await fs.writeFile(path.join(output,'tasks.html'),`<!doctype html>
<html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>GTAGym: 150 playable tasks</title>
<style>body{font:16px/1.5 system-ui,sans-serif;max-width:1100px;margin:40px auto;padding:0 20px;color:#172225}h1{margin-bottom:8px}h2{margin-top:32px}table{border-collapse:collapse;width:100%}th,td{text-align:left;vertical-align:top;border-bottom:1px solid #dde4e8;padding:12px}td:first-child{white-space:nowrap}a{color:#1558a6}</style>
<h1>GTAGym: 150 playable tasks</h1><p>Choose a task, read its instruction, and press Start task. The task clock begins only when you start. Desktop keyboard and mouse recommended.</p>
${sections}</html>\n`);
 await fs.writeFile(path.join(output,'TASKS.md'),'# GTAGym task links\n\nOpen a link, read the instruction, and press Start task.\n\n| Task | Category | Instruction |\n| --- | --- | --- |\n'+catalog.map(task=>{
  const category=categories.find(c=>c.category===task.category)?.name??task.category;
  return `| [${task.id}](${taskUrl(task.id,baseURL)}) | ${category} | ${task.instruction.replaceAll('|','\\|').replaceAll('\n',' ')} |`;
 }).join('\n')+'\n');
 let bytes=0,files=0;
 async function check(directory){for(const entry of await fs.readdir(directory,{withFileTypes:true})){
  const file=path.join(directory,entry.name);if(entry.isSymbolicLink())throw Error('Static deployment cannot contain symlinks');
  if(entry.isDirectory())await check(file);else{const stat=await fs.stat(file);bytes+=stat.size;files++;}
 }}
 await check(output);if(bytes>1024**3)throw Error('Static site exceeds the 1 GiB GitHub Pages limit');
 return {output,tasks:catalog.length,files,bytes,taskDirectory:baseURL?new URL('tasks.html',baseURL.endsWith('/')?baseURL:baseURL+'/').href:'tasks.html'};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const {values}=parseArgs({options:{output:{type:'string'},'base-url':{type:'string'}}});
 console.log(JSON.stringify(await buildSite({output:values.output,baseURL:values['base-url']}),null,2));
}
