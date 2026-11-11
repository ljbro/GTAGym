#!/usr/bin/env node
// Fixed socket transport only. Neither executable, path, task nor game state
// can be selected by a model argument. This process offers no other tools.
import net from 'node:net';
import {createInterface} from 'node:readline';
import {once} from 'node:events';
const socket=net.createConnection(process.env.GTA_CODEX_GAME_SOCKET);
socket.on('error',()=>{process.stderr.write('Game transport unavailable.\n');process.exitCode=1;process.stdin.destroy();});
await once(socket,'connect');
socket.write(JSON.stringify({auth:process.env.GTA_CODEX_GAME_TOKEN})+'\n');
socket.pipe(process.stdout);
for await(const line of createInterface({input:process.stdin,crlfDelay:Infinity})){
 if(Buffer.byteLength(line)>2*1024**2){socket.destroy();throw Error('MCP input too large');}
 if(!socket.write(line+'\n'))await once(socket,'drain');
}
socket.end();
