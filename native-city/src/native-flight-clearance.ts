import {Mesh,Vector3,VertexBuffer,type AbstractMesh} from '@babylonjs/core';
import {NATIVE_FLIGHT_RUNWAYS} from './native-flight-route.ts';
import {runwayLocal} from './city-flight-ground.ts';

/** Remove whole connected props from a merged mesh, including split normals.
 * Positions are in world space. Ground surfaces below the deck stay intact. */
export function flightSiteClearanceIndices(positions:ArrayLike<number>,indices:ArrayLike<number>){
 const parent=Array.from({length:positions.length/3},(_,i)=>i);
 const root=(i:number):number=>{while(parent[i]!==i){parent[i]=parent[parent[i]];i=parent[i];}return i;};
 const join=(a:number,b:number)=>{parent[root(a)]=root(b);};
 const welded=new Map<string,number>();
 for(let i=0;i<parent.length;i++){
  const key=[positions[i*3],positions[i*3+1],positions[i*3+2]].join(',');
  const other=welded.get(key);if(other===undefined)welded.set(key,i);else join(i,other);
 }
 for(let i=0;i<indices.length;i+=3){join(indices[i],indices[i+1]);join(indices[i],indices[i+2]);}
 const groups=new Map<number,number[]>();
 for(const index of Array.from(indices)){const key=root(index),group=groups.get(key);if(group)group.push(index);else groups.set(key,[index]);}
 const removed=new Set<number>();
 for(const [key,group] of groups)for(const runway of NATIVE_FLIGHT_RUNWAYS){
  let alongMin=Infinity,alongMax=-Infinity,rightMin=Infinity,rightMax=-Infinity,top=-Infinity;
  for(const index of group){
   const p=runwayLocal(runway,{x:positions[index*3],z:positions[index*3+2]});
   alongMin=Math.min(alongMin,p.along);alongMax=Math.max(alongMax,p.along);
   rightMin=Math.min(rightMin,p.right);rightMax=Math.max(rightMax,p.right);top=Math.max(top,positions[index*3+1]);
  }
  const deck=alongMin<runway.length/2+20&&alongMax>-runway.length/2-20&&rightMin<30&&rightMax>-30;
  const ramp=alongMin<-244&&alongMax>-278&&rightMin<42&&rightMax>30;
  if(top>runway.y&&(deck||ramp)){removed.add(key);break;}
 }
 return Array.from(indices).filter(index=>!removed.has(root(index)));
}

/** Central Park's authored trees and furniture predate the airfield. Clear
 * their actual visible triangles before flight collision meshes are cached. */
export function clearNativeFlightSites(meshes:readonly AbstractMesh[]){
 for(const mesh of meshes){
  if(!(mesh instanceof Mesh)||!/^landmark_central_park_/.test(mesh.name))continue;
  const positions=mesh.getVerticesData(VertexBuffer.PositionKind),indices=mesh.getIndices();if(!positions||!indices)continue;
  const world=mesh.computeWorldMatrix(true),point=Vector3.Zero(),transformed=new Float32Array(positions.length);
  for(let i=0;i<positions.length;i+=3){Vector3.TransformCoordinatesFromFloatsToRef(positions[i],positions[i+1],positions[i+2],world,point);point.toArray(transformed,i);}
  const kept=flightSiteClearanceIndices(transformed,indices);
  if(kept.length===indices.length)continue;
  if(!kept.length){mesh.dispose(false,false);continue;}
  mesh.makeGeometryUnique();mesh.setIndices(kept);
 }
}
