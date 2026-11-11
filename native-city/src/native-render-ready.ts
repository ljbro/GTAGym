type RenderMesh={isDisposed:()=>boolean;isEnabled:()=>boolean;isVisible:boolean;visibility:number;isReady:(completeCheck:boolean)=>boolean};
/** GLB parsing is not GPU readiness. Gate task input on the actual body mesh,
 * not only its enabled parent, and bound shader failures instead of silently
 * launching an invisible vehicle. Does not wait for the entire city's LODs.
 */
export async function waitForVehicleRendering(meshes:readonly RenderMesh[],options:{cancelled?:()=>boolean;now?:()=>number;wait?:()=>Promise<void>;timeoutMs?:number}={}){
 const now=options.now??(()=>performance.now()),wait=options.wait??(()=>new Promise<void>(resolve=>setTimeout(resolve,25))),deadline=now()+(options.timeoutMs??60000);
 if(!meshes.length)throw Error("Player vehicle has no renderable body mesh, Please restart the mission.");
 let checks=0;
 for(;;){
  if(options.cancelled?.()||meshes.some(m=>m.isDisposed()))throw Error("Vehicle rendering preparation canceled.");
  // Check every submesh (including the opaque body), not just transparent glass.
  const ready=meshes.map(m=>m.isEnabled()&&m.isVisible&&m.visibility>0&&m.isReady(true));checks++;
  if(ready.every(Boolean))return {checks,meshes:meshes.length};
  if(now()>=deadline)throw Error("Player vehicle body material failed to prepare for rendering, Mission has not started yet; Reload the page or change graphics quality and try again.");
  await wait();
 }
}
