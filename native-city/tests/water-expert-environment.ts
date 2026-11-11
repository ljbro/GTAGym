import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {CityCollision,inRing} from '../src/driving.ts';
import {loadLandmarkDetails,loadLandmarkCandidates} from '../src/landmark-details.ts';
import {loadCityMountains} from '../src/city-mountains.ts';
import {loadCityGroundRelief} from '../src/city-ground-relief.ts';
import {loadCoastalInfrastructure} from '../src/city-coastal-infrastructure.ts';
import type {CityData} from '../src/city-types.ts';
/** Use the production city/terrain loaders without creating a renderer.
 * The local fetch shim is scoped to loading; no network/GPU is required.
 * Decorative scene-mesh/prop collisions are NOT covered by this fixture. */
export async function loadWaterExpertEnvironment(repo:string){
 const sources:Record<string,string>={};
 const read=(relative:string)=>{const bytes=fs.readFileSync(path.join(repo,relative));sources[relative]=createHash('sha256').update(bytes).digest('hex');return bytes;};
 const data=JSON.parse(read('city/city.json').toString()) as CityData;
 const original=globalThis.fetch;
 globalThis.fetch=async input=>{
  const url=String(input);if(!url.startsWith('/city/')||url.includes('..'))throw Error('Unexpected terrain URL: '+url);
  return new Response(read(url.slice(1)),{status:200});
 };
 let heightAt:(x:number,z:number)=>number;
 try{
  const detail=await loadLandmarkDetails(data);await loadLandmarkCandidates(data);
  const mountains=await loadCityMountains(detail?.heightAt??(()=>0));
  const relief=await loadCityGroundRelief(mountains.heightAt,undefined,false);
  heightAt=(await loadCoastalInfrastructure(data,relief.heightAt)).heightAt;
 }finally{globalThis.fetch=original;}
 const collision=new CityCollision(data);
 const land=(x:number,z:number)=>data.land.some(p=>inRing(x,z,p[0])&&!p.slice(1).some(h=>inRing(x,z,h)));
 return {sources,env:{land,heightAt,blocked:(x:number,z:number)=>land(x,z)&&collision.blocked(x,z)}};
}
