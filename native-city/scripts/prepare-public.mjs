import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root=fileURLToPath(new URL('..',import.meta.url));
const repo=path.dirname(root),publicDir=path.join(root,'public');
fs.mkdirSync(publicDir,{recursive:true});
for(const name of ['city','assets','characters','tasks','training-tasks','licenses','favicon.svg']){
  const source=path.join(repo,name),target=path.join(publicDir,name);
  if(!fs.existsSync(source))throw Error('Missing repository asset: '+source);
  if(fs.existsSync(target)){
    if(!fs.lstatSync(target).isSymbolicLink()||fs.realpathSync(target)!==fs.realpathSync(source))throw Error('Refusing to replace existing public path: '+target);
    continue;
  }
  fs.symlinkSync(process.platform==='win32'?source:path.relative(publicDir,source),target,fs.statSync(source).isDirectory()?'junction':'file');
}
console.log('Development assets linked to this GTASuite repository.');
