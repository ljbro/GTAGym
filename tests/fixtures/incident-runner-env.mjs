// Only loaded explicitly by the queue regression test; no real browser/model.
import fs from 'node:fs/promises';
import path from 'node:path';
import {EventEmitter} from 'node:events';
import {createRequire} from 'node:module';
import {IncidentEnvironment} from '../../scripts/server-eval/incident-environment.mjs';
const sharp=createRequire(new URL('../../native-city/package.json',import.meta.url))('sharp');
const image=await sharp({create:{width:240,height:360,channels:3,background:'#408080'}}).jpeg().toBuffer();
Object.assign(IncidentEnvironment.prototype,{
 async open(){this.browser=new EventEmitter();this.browser.isConnected=()=>!this.closed;return {build:'fixture'};},
 async reset(taskId){this.taskId=taskId;},
 async state(){return {taskId:this.taskId,active:true,elapsed:0};},
 async observe(){return image;},
 async inspectRenderHealth(){return {healthy:false,kind:'synthetic-queue-test'};},
 async assertFrozen(){return true;},
 async preserveIncident({directory}){this.incidentHeld=true;this.incident={directory,taskId:this.taskId};await new Promise(r=>setTimeout(r,150));await fs.mkdir(directory,{recursive:true});await fs.writeFile(path.join(directory,'incident.json'),JSON.stringify(this.incident));return this.incident;},
 async close(){this.closed=true;this.browser?.emit('disconnected');console.log(JSON.stringify({event:'fixture_browser_closed',taskId:this.taskId,id:this.id}));},
});
