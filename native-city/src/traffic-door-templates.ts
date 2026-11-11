import {Matrix,TransformNode,type Mesh,type Scene} from '@babylonjs/core';
import {attachNativeVehicleDoors} from './native-vehicle-doors.ts';

/** Split once while loading, not on F. Ambient and owned cars use identical
 * closed-door geometry, winding and materials; only the instancing differs.
 */
export function prepareTrafficDoorTemplates(sources:Mesh[],scene:Scene){
 const root=new TransformNode('traffic-door-template',scene);
 for(const mesh of sources)mesh.parent=root;
 const doors=attachNativeVehicleDoors(root,sources,{width:2.1,height:1.65,seatZ:.3});
 const replaced=new Set(doors.replacedMeshes),meshes=[...sources.filter(m=>!replaced.has(m)),...doors.meshes];
 for(const mesh of meshes){
  const hinge=mesh.metadata?.trafficDoor?.hinge;
  if(hinge)mesh.bakeTransformIntoVertices(Matrix.Translation(...hinge as [number,number,number]));
  mesh.parent=null;mesh.setEnabled(false);mesh.alwaysSelectAsActiveMesh=true;
 }
 root.dispose(false,false);
 scene.onDisposeObservable.addOnce(()=>doors.dispose());
 return meshes;
}
