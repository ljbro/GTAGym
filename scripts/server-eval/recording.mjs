import fs from 'node:fs';
import fsp from 'node:fs/promises';
import {createGzip} from 'node:zlib';
import {pipeline} from 'node:stream/promises';
import {spawn} from 'node:child_process';
import {once} from 'node:events';

async function write(stream,data){if(stream.destroyed)throw Error('Recording stream closed');if(!stream.write(data))await once(stream,'drain');}
function header(name,size){
 if(!/^[a-zA-Z0-9_.\/-]+$/.test(name)||name.includes('..')||name.length>99)throw Error('Invalid archive entry');
 const h=Buffer.alloc(512);h.write(name);h.write('0000644\0',100);h.write('0000000\0',108);h.write('0000000\0',116);
 h.write(size.toString(8).padStart(11,'0')+'\0',124);h.write('00000000000\0',136);h.fill(32,148,156);h[156]=48;
 h.write('ustar\0',257);h.write('00',263);h.write([...h].reduce((a,b)=>a+b,0).toString(8).padStart(6,'0')+'\0 ',148);
 return h;
}
/** Streaming tar.gz: never keeps the full trajectory or video in memory. */
export class Archive {
 constructor(file){
  if(fs.existsSync(file))throw Error('Refusing to overwrite archive '+file);
  this.file=file;this.partial=file+'.partial';this.stream=createGzip({level:6});
  this.done=pipeline(this.stream,fs.createWriteStream(this.partial,{flags:'wx'}));this.done.catch(e=>{this.error=e;});
 }
 async add(name,data){if(this.error)throw this.error;const b=Buffer.isBuffer(data)?data:Buffer.from(data);await write(this.stream,header(name,b.length));await write(this.stream,b);await this.pad(b.length);}
 async json(name,data){return this.add(name,JSON.stringify(data,null,2));}
 async pad(size){const n=(512-size%512)%512;if(n)await write(this.stream,Buffer.alloc(n));}
 async fileEntry(name,file){const {size}=await fsp.stat(file);await write(this.stream,header(name,size));for await(const chunk of fs.createReadStream(file))await write(this.stream,chunk);await this.pad(size);}
 async finish(){await write(this.stream,Buffer.alloc(1024));this.stream.end();await this.done;await fsp.rename(this.partial,this.file);}
}
/** Simulation-time MP4, no inference/loading dead time. CPU encoding stays on server. */
export class Video {
 constructor(file,{fps=10,crf=28,inputCodec='mjpeg'}={}){
  if(!['mjpeg','png'].includes(inputCodec))throw Error('Invalid video input codec');
  this.file=file;this.frames=0;this.stderr='';
  this.process=spawn('ffmpeg',['-hide_banner','-loglevel','error','-y','-f','image2pipe','-framerate',String(fps),'-vcodec',inputCodec,'-i','pipe:0','-an','-c:v','libx264','-preset','veryfast','-crf',String(crf),'-threads','2','-pix_fmt','yuv420p','-movflags','+faststart',file],{stdio:['pipe','ignore','pipe']});
  this.process.stderr.on('data',d=>{this.stderr=(this.stderr+d).slice(-4096);});
  this.done=new Promise((resolve,reject)=>{this.process.on('error',reject);this.process.on('close',code=>code===0?resolve():reject(Error(`ffmpeg ${code}: ${this.stderr}`)));});
  this.done.catch(e=>{this.error=e;});this.process.stdin.on('error',e=>{this.error=e;});
 }
 async frame(jpeg){if(this.error)throw this.error;await write(this.process.stdin,jpeg);this.frames++;}
 async finish(){this.process.stdin.end();await this.done;return this.file;}
 async abort(){this.process.kill('SIGKILL');await this.done.catch(()=>{});}
}
