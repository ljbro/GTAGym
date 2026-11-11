import http from 'node:http';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {parseArgs} from 'node:util';

const root=fileURLToPath(new URL('../',import.meta.url));
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript','.mjs':'text/javascript',
 '.css':'text/css','.json':'application/json','.svg':'image/svg+xml','.glb':'model/gltf-binary',
 '.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.webp':'image/webp',
 '.bin':'application/octet-stream','.hdr':'application/octet-stream','.wasm':'application/wasm',
 '.mp4':'video/mp4','.mp3':'audio/mpeg','.ogg':'audio/ogg','.woff2':'font/woff2'};
export function createGameServer(repository=root){
 const bases=[path.join(repository,'native-city/dist'),repository].map(p=>path.resolve(p));
 return http.createServer(async(req,res)=>{
  try{
   const name=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
   if(!['GET','HEAD'].includes(req.method)||name.split('/').some(p=>p.startsWith('.'))||
      !/^\/(?:$|assets\/|city\/|characters\/|tasks\/|training-tasks\/|licenses\/|favicon\.svg$)/.test(name)){
    res.writeHead(404);res.end();return;
   }
   const relative=name==='/'?'index.html':name.slice(1);let file;
   for(const base of bases){
    const candidate=path.resolve(base,relative);
    if(!candidate.startsWith(base+path.sep))continue;
    try{if(!(await fsp.stat(candidate)).isFile())continue;
     const real=await fsp.realpath(candidate);
     if(!real.startsWith(base+path.sep)||real!==candidate)continue;
     file=real;break;
    }catch(e){if(!['ENOENT','ENOTDIR'].includes(e.code))throw e;}
   }
   if(!file){res.writeHead(404);res.end();return;}
   const stat=await fsp.stat(file);let start=0,end=stat.size-1,status=200;
   const range=req.headers.range;
   if(range){
    const m=/^bytes=(\d*)-(\d*)$/.exec(range);
    if(!m||!m[1]&&!m[2]){res.writeHead(416,{'Content-Range':`bytes */${stat.size}`});res.end();return;}
    if(!m[1])start=Math.max(0,stat.size-Number(m[2]));
    else{start=Number(m[1]);if(m[2])end=Math.min(end,Number(m[2]));}
    if(!Number.isSafeInteger(start)||!Number.isSafeInteger(end)||start<0||start>end||start>=stat.size){
     res.writeHead(416,{'Content-Range':`bytes */${stat.size}`});res.end();return;
    }
    status=206;
   }
   const headers={'Content-Type':mime[path.extname(file)]??'application/octet-stream',
    'Content-Length':end-start+1,'Accept-Ranges':'bytes','Cache-Control':'no-store',
    'X-Content-Type-Options':'nosniff',...(status===206?{'Content-Range':`bytes ${start}-${end}/${stat.size}`}:{})};
   res.writeHead(status,headers);
   if(req.method==='HEAD'){res.end();return;}
   const stream=fs.createReadStream(file,{start,end});stream.on('error',()=>res.destroy());
   res.on('close',()=>stream.destroy());stream.pipe(res);
  }catch{res.writeHead(400);res.end();}
 });
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const {values}=parseArgs({options:{port:{type:'string',default:'4200'},host:{type:'string',default:'127.0.0.1'},help:{type:'boolean'}}});
 if(values.help){console.log('node scripts/serve-game.mjs [--port 4200] [--host 127.0.0.1]');process.exit(0);}
 const port=Number(values.port);
 if(!Number.isInteger(port)||port<1024||port>65535)throw Error('Invalid port');
 try{await fsp.access(path.join(root,'native-city/dist/index.html'));}
 catch{throw Error('Game build missing. Run npm ci and npm run build first.');}
 const server=createGameServer();
 server.listen(port,values.host,()=>console.log(`GTASuite game: http://${values.host}:${port}/`));
 for(const sig of ['SIGINT','SIGTERM'])process.once(sig,()=>{server.closeAllConnections();server.close(()=>process.exit(0));});
}
