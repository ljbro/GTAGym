/** Privileged generation-only browser bundle. Not imported by gameplay/MCP. */
import type {V2} from './city-types.ts';
import type {DrivingWorld} from './city-world.ts';
import type {OutdoorGeneratorEnvironment} from './outdoor-task-generator.ts';
import {renderedWaterClearance} from './outdoor-water-clearance.ts';
import {GenerationCache} from './generation-cache.ts';
export {generateOutdoorTask,validateOutdoorGeneratorConfig} from './outdoor-task-generator.ts';
export {probeOutdoorRoute} from './outdoor-task-validation.ts';
export {parseOutdoorDataset} from './generated-outdoor-tasks.ts';

// Exact even/odd polygon membership; index edges by Z instead of scanning the
// complete Shenzhen coastline at every 0.5m clearance sample.
function indexedRing(ring:readonly V2[]){
 const bins=new Map<number,[V2,V2][]>();
 for(let i=0,j=ring.length-1;i<ring.length;j=i++){const a=ring[i],b=ring[j];if(a[1]===b[1])continue;for(let z=Math.floor(Math.min(a[1],b[1])/32);z<=Math.floor(Math.max(a[1],b[1])/32);z++){const list=bins.get(z)??[];list.push([a,b]);bins.set(z,list);}}
 return (x:number,z:number)=>{let inside=false;for(const [a,b] of bins.get(Math.floor(z/32))??[])if((a[1]>z)!==(b[1]>z)&&x<(b[0]-a[0])*(z-a[1])/(b[1]-a[1])+a[0])inside=!inside;return inside;};
}
export function createOutdoorGenerationEnvironment(world:DrivingWorld,roads:OutdoorGeneratorEnvironment['roads'],walkingStarts:readonly V2[]):OutdoorGeneratorEnvironment{
 if(!world.walk)throw Error('Walking controller is not loaded');
 const land=world.data.land.map(p=>p.map(indexedRing)),extent=world.data.meta.extent,rendered=renderedWaterClearance(world.scene.meshes,world.coastal?.manifest.waterHeight??-.25,extent);
 const landAt=(x:number,z:number)=>land.some(p=>p[0](x,z)&&!p.slice(1).some(h=>h(x,z)));
 const wetCache=new GenerationCache<string,boolean>(),walkCache=new GenerationCache<string,boolean>(),heightCache=new GenerationCache<string,number>();
 const height=(x:number,z:number)=>{const key=`${x.toFixed(4)},${z.toFixed(4)}`;if(!heightCache.has(key))heightCache.set(key,world.walkingSurfaceHeight(x,z));return heightCache.get(key)!;};
 const wet=(x:number,z:number,margin=0)=>{const key=`${x.toFixed(4)},${z.toFixed(4)},${margin}`;if(wetCache.has(key))return wetCache.get(key)!;
  let clear=x>=extent[0]-1000&&x<=extent[2]+1000&&z>=extent[1]-1000&&z<=extent[3]+1000;
  if(clear)for(let i=0;i<9;i++){const a=(i-1)*Math.PI/4,px=x+(i?Math.cos(a)*margin:0),pz=z+(i?Math.sin(a)*margin:0);if(landAt(px,pz)||!rendered.allows(px,pz)||world.propBlocked(px,pz)){clear=false;break;}}
  wetCache.set(key,clear);return clear;
 };
 const waterStarts:V2[]=[];
 for(const p of world.data.land)for(let i=1;i<p[0].length;i++){const a=p[0][i-1],b=p[0][i],length=Math.hypot(b[0]-a[0],b[1]-a[1]);if(length<1)continue;
  const n=Math.max(1,Math.ceil(length/50));for(let j=0;j<n;j++){const x=a[0]+(b[0]-a[0])*(j+.5)/n,z=a[1]+(b[1]-a[1])*(j+.5)/n;
   for(const distance of [-40,-15,15,40]){const point:V2=[x+(b[1]-a[1])/length*distance,z-(b[0]-a[0])/length*distance];if(wet(...point,8))waterStarts.push(point);}
  }
 }
 const driveClear=(x:number,z:number,yaw:number)=>{const body={id:world,x,z,yaw,y:world.groundHeight(x,z),width:2.1,length:4.9,height:1.5,kind:'car' as const};return world.streetStaticClear(body,body);};
 return {roads,ground:world.groundHeight,driveClear,
  driveSpawnClear:(x,z,yaw)=>{const road=world.collision.nearest(x,z);return !!road&&road.d<=road.road.width/2-1.1&&driveClear(x,z,yaw);},
  walk:{starts:walkingStarts,height,clear:(x,z)=>{const key=`${x.toFixed(4)},${z.toFixed(4)}`;if(!walkCache.has(key))walkCache.set(key,world.walk!.clear(x,z,height(x,z)));return walkCache.get(key)!;}},
  water:{starts:waterStarts,height:world.coastal?.manifest.waterHeight??-.25,clear:wet}};
}
