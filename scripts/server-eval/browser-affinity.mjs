// Trusted per-worker graphics selection. CUDA_VISIBLE_DEVICES does not do this.
import {execFileSync} from 'node:child_process';
import {setTimeout as sleep} from 'node:timers/promises';
import {ServerEnvironment} from '../server-eval/environment.mjs';

export function selectBrowserGPU(workerIndex){
 const devices=execFileSync('nvidia-smi',['--query-gpu=index,uuid,pci.bus_id','--format=csv,noheader'],{encoding:'utf8'}).trim().split('\n').map(line=>{
  const [index,uuid,pci]=line.split(',').map(s=>s.trim());
  return {index:Number(index),uuid,pci,prime:`pci-${pci.slice(-12).toLowerCase().replaceAll(':','_').replace('.','_')}`};
 });
 if(!Number.isInteger(workerIndex)||workerIndex<0||!devices.length)throw Error('Invalid worker GPU selection');
 return devices[workerIndex%devices.length];
}

export async function verifyBrowserGPU(browser,device,{timeoutMs=15000,pollMs=250,
 inventory=()=>execFileSync('nvidia-smi',['-q','-x'],{encoding:'utf8'})}={}){
 const cdp=await browser.newBrowserCDPSession();
 try{
  const deadline=performance.now()+timeoutMs;let attempts=0;
  for(;;){
  attempts++;
  const processes=(await cdp.send('SystemInfo.getProcessInfo')).processInfo.filter(p=>p.type==='GPU');
  const xml=inventory(),allocations=[];
  for(const block of xml.split('<gpu id=').slice(1))for(const entry of block.matchAll(/<process_info>([\s\S]*?)<\/process_info>/g)){
   const pid=Number(entry[1].match(/<pid>(.*?)<\/pid>/)?.[1]);
   if(processes.some(p=>p.id===pid))allocations.push({pid,uuid:block.match(/<uuid>(.*?)<\/uuid>/)?.[1],
    usedMiB:Number.parseFloat(entry[1].match(/<used_memory>(.*?)<\/used_memory>/)?.[1])});
  }
  const dominant=[...allocations].filter(p=>Number.isFinite(p.usedMiB)).sort((a,b)=>b.usedMiB-a.usedMiB)[0];
  // Chromium's GPU child and nvidia-smi accounting can appear at different
  // times during startup. Retry only a missing observation, never a real
  // allocation on the wrong GPU and never an already executed game action.
  if(!dominant&&performance.now()<deadline){await sleep(pollMs);continue;}
  if(dominant?.uuid!==device.uuid)throw Error('Graphics GPU selection failed: '+JSON.stringify({expected:device,allocations}));
  return {backend:'vulkan-pci',device,allocations,verified:true,verificationAttempts:attempts};
  }
 }finally{await cdp.detach();}
}

export function affinityEnvironmentFactory(device){
 // Each worker owns a separate Node process. Never vary this between sessions
 // within one worker, or concurrent browser launches would race on process.env.
 Object.assign(process.env,{DRI_PRIME:device.prime,MESA_VK_DEVICE_SELECT_FORCE_DEFAULT_DEVICE:'1',
  VK_INSTANCE_LAYERS:'VK_LAYER_MESA_device_select'});
 return settings=>{
  const env=new ServerEnvironment(settings),open=env.open.bind(env);
  env.diagnosticBrowserArgs=['--use-angle=vulkan'];
  env.open=async()=>{
   const report=await open();
   env.gpuPlacement=await verifyBrowserGPU(env.browser,device);
   return {...report,gpuPlacement:env.gpuPlacement};
  };
  return env;
 };
}
