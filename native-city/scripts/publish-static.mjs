import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root=fileURLToPath(new URL('..',import.meta.url)),repo=path.dirname(root),dist=path.join(root,'dist');
if(!fs.existsSync(path.join(dist,'index.html')))throw Error('Run npm run build first.');
// Copy content-addressed build artifacts first, then update the entrypoint.
// Keep old chunks for already-open browser tabs; never empty the repository.
fs.cpSync(path.join(dist,'assets'),path.join(repo,'assets'),{recursive:true});
fs.copyFileSync(path.join(dist,'index.html'),path.join(repo,'index.html'));
console.log('Published native city to GTAbench/index.html and assets/.');
