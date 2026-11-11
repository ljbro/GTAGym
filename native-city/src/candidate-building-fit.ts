import {Matrix,Vector3,type AbstractMesh,Mesh} from '@babylonjs/core';

// The Shanghai Hotel candidate was placed by its centre but is much wider
// than its retained OSM collision footprint (way/616351239). Its podium and
// glazing protruded into the alley used by training walk 0006. Fit the entire
// candidate inside an audited rectangle contained in that footprint; do not
// add an invisible wall across the alley or move the task to another street.
export const SHANGHAI_HOTEL_FIT={prefix:'landmark_shanghai_hotel_',minX:3189.6,maxX:3209.4,minZ:510,maxZ:540};

export function fitCandidateBuildingToFootprint(meshes:readonly AbstractMesh[]){
 const fit=SHANGHAI_HOTEL_FIT;
 const selected=meshes.filter((m):m is Mesh=>m instanceof Mesh&&m.name.startsWith(fit.prefix)&&m.getTotalVertices()>0);
 if(!selected.length||selected.every(m=>m.metadata?.collisionFootprintFit===fit.prefix))return null;
 if(selected.some(m=>m.metadata?.collisionFootprintFit===fit.prefix))throw Error('Partially fitted candidate building');
 const lo=new Vector3(Infinity,Infinity,Infinity),hi=new Vector3(-Infinity,-Infinity,-Infinity);
 for(const mesh of selected){mesh.computeWorldMatrix(true);const b=mesh.getBoundingInfo().boundingBox;lo.minimizeInPlace(b.minimumWorld);hi.maximizeInPlace(b.maximumWorld);}
 const scale=Math.min(1,(fit.maxX-fit.minX)/(hi.x-lo.x),(fit.maxZ-fit.minZ)/(hi.z-lo.z));
 const tx=(fit.minX+fit.maxX)/2-(lo.x+hi.x)/2*scale,tz=(fit.minZ+fit.maxZ)/2-(lo.z+hi.z)/2*scale;
 // Equal X/Z scales retain the plan proportions; preserve authored height.
 const transform=Matrix.Scaling(scale,1,scale).multiply(Matrix.Translation(tx,0,tz));
 for(const mesh of selected){
  const world=mesh.computeWorldMatrix(true).clone();mesh.unfreezeWorldMatrix();
  mesh.bakeTransformIntoVertices(world.multiply(transform).multiply(Matrix.Invert(world)));
  mesh.refreshBoundingInfo();mesh.freezeWorldMatrix();
  mesh.metadata={...mesh.metadata,collisionFootprintFit:fit.prefix};
 }
 return {scale,translation:[tx,tz],meshes:selected.length};
}
