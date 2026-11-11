/// <reference types="vite/client" />
import {Color3,Constants,LoadAssetContainerAsync,PBRMaterial,type AssetContainer,type Scene} from '@babylonjs/core';
// Asset location is a deployment setting, independent of whether Vite is in DEV.
// No source archives or Blender authoring files are needed by the browser.
const configuredBase=import.meta.env.VITE_CHARACTER_ASSET_BASE?.trim();
export const CHARACTER_ASSET_BASE=(configuredBase||'/characters').replace(/\/+$/,'');
export const CHARACTERS_ENABLED=!!CHARACTER_ASSET_BASE;
export const CHARACTER_CREDIT="Model miHoYo · MMD Modify Sea view";
export type LocalCharacter={id:'kuki'|'yelan'|'franklin'|'michael';name:string;file:string;displayHeight:number;bytes:number;triangles:number;gait:{walk:{cycleSeconds:number;authoredSpeed:number};run:{cycleSeconds:number;authoredSpeed:number}}};
type Manifest={schemaVersion:number;credit:string;models:LocalCharacter[]};
export type CharacterJob={phase:'idle'|'loading'|'ready'|'error';progress:number;message:string};
export const characterJobs:Record<'player'|'cafe',CharacterJob>={player:{phase:'idle',progress:0,message:''},cafe:{phase:'idle',progress:0,message:''}};
export function characterProgress(job:keyof typeof characterJobs,phase:CharacterJob['phase'],progress:number,message:string){characterJobs[job]={phase,progress,message};}
let manifestRequest:Promise<Manifest>|null=null;
export function localCharacterManifest():Promise<Manifest>{
 if(!CHARACTERS_ENABLED)return Promise.reject(Error("Character asset address not configured"));
 if(!manifestRequest)manifestRequest=(async()=>{
  const r=await fetch(CHARACTER_ASSET_BASE+'/manifest.json',{signal:AbortSignal.timeout(15000)});
  if(!r.ok)throw Error("Character asset manifest failed to read("+r.status+"), Please check the deployed assets or try again");
  const m=await r.json() as Manifest;
  if(m.schemaVersion!==1||!Array.isArray(m.models)||!['kuki','yelan'].every(id=>m.models.some(x=>x.id===id&&x.file===id+'.glb')))throw Error("Invalid character list");
  return m;
 })().catch(e=>{manifestRequest=null;throw e;});
 return manifestRequest;
}
/** Fetch embedded GLB bytes with progress. No runtime PMX/ZIP loader, external
 * texture URLs or object URLs survive this operation. A container owns all
 * resources until successful import; a failed/cancelled attempt is disposed. */
export async function loadLocalCharacter(scene:Scene,model:LocalCharacter,onProgress:(n:number)=>void,options:{base?:string;style?:'mmd'|'realistic'}={}):Promise<AssetContainer>{
 const abort=new AbortController(),dispose=scene.onDisposeObservable.addOnce(()=>abort.abort());
 const timer=setTimeout(()=>abort.abort(),90000);let container:AssetContainer|undefined;
 try{
  const r=await fetch((options.base??CHARACTER_ASSET_BASE)+'/'+model.file,{signal:abort.signal});
  if(!r.ok)throw Error(model.name+"Model loading failed("+r.status+')');
  const total=Number(r.headers.get('Content-Length'))||model.bytes;
  const chunks:Uint8Array[]=[];let length=0;
  const reader=r.body?.getReader();if(!reader)throw Error("Model response is empty");
  for(;;){const {value,done}=await reader.read();if(done)break;chunks.push(value);length+=value.length;onProgress(Math.min(.8,length/total*.8));}
  const bytes=new Uint8Array(length);let offset=0;for(const part of chunks){bytes.set(part,offset);offset+=part.length;}chunks.length=0;
  if(abort.signal.aborted||scene.isDisposed)throw Error("Character loading canceled");
  onProgress(.85);
  container=await LoadAssetContainerAsync(bytes,scene,{pluginExtension:'.glb',name:model.file});
  if(abort.signal.aborted||scene.isDisposed)throw Error("Character loading canceled");
  // The GLB loader resolves only after all embedded images are available.
  if(!container.meshes.some(m=>m.getTotalVertices()>0)||!container.skeletons.length)throw Error("Character skeleton or mesh missing");
  for(const material of container.materials)if(material instanceof PBRMaterial){
   if(options.style==='realistic'){
    material.maxSimultaneousLights=6;material.environmentIntensity=.85;
    material.enableSpecularAntiAliasing=true;material.forceIrradianceInFragment=true;
    for(const texture of material.getActiveTextures())texture.anisotropicFilteringLevel=8;
    continue; // Preserve the source skin/clothing materials; no MMD emissive treatment.
   }
   material.maxSimultaneousLights=6;material.directIntensity=.24;material.environmentIntensity=.36;
   material.specularIntensity=.18;material.roughness=.85;material.metallic=0;
   material.emissiveTexture=material.albedoTexture;material.emissiveColor=new Color3(.20,.20,.20);
   // MMD hair+ is a BLACK-background additive highlight shell. Treating
   // it as opaque hides the real green/blue base hair underneath.
   if(material.name.endsWith("hair+")){
    material.unlit=true;material.transparencyMode=PBRMaterial.PBRMATERIAL_ALPHABLEND;
    material.alphaMode=Constants.ALPHA_ADD;material.disableDepthWrite=true;
    material.emissiveTexture=null;material.emissiveColor=Color3.Black();material.alpha=.65;
   }
   material.enableSpecularAntiAliasing=true;material.forceIrradianceInFragment=true;
   for(const texture of material.getActiveTextures())texture.anisotropicFilteringLevel=8;
  }
  container.addAllToScene();onProgress(1);return container;
 }catch(e){container?.dispose();throw e;}
 finally{clearTimeout(timer);scene.onDisposeObservable.remove(dispose);}
}
