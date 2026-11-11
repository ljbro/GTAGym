import fs from 'node:fs/promises';
import path from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {fileURLToPath} from 'node:url';

const execute=promisify(execFile);
/** YAML and JSON resolve to the same existing, strictly checked generator plan. */
export async function readGenerationSpec(file){
 if(!/\.ya?ml$/i.test(file))return JSON.parse(await fs.readFile(file,'utf8'));
 const helper=fileURLToPath(new URL('./read-generation-yaml.py',import.meta.url));
 try{
  const {stdout}=await execute('python3',[helper,path.resolve(file)],{timeout:10000,maxBuffer:8*1024*1024});
  return JSON.parse(stdout);
 }catch(error){throw Error('Invalid generation YAML: '+(error.stderr?.trim()||error.message));}
}
