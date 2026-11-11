import {Mesh,TransformNode,Vector3,Matrix,Quaternion,VertexBuffer,type AbstractMesh,type Material} from '@babylonjs/core';
type Door={pivot:TransformNode;side:number};
export type VehicleDoors={available:boolean;meshes:Mesh[];replacedMeshes:AbstractMesh[];update:(side:number,openness:number)=>void;dispose:()=>void};
type Vertex=number[];
/** Split polygon attributes together, keeping UVs/normals across new door edges. */
export function clipDoorPolygon(poly:Vertex[],axis:number,bound:number,sign:number){
 const inside:Vertex[]=[],outside:Vertex[]=[];
 for(let i=0;i<poly.length;i++){
  const a=poly[i],b=poly[(i+1)%poly.length],da=(a[axis]-bound)*sign,db=(b[axis]-bound)*sign;
  (da>=0?inside:outside).push(a);
  if((da>=0)!==(db>=0)){const t=da/(da-db),v=a.map((x,k)=>x+(b[k]-x)*t);inside.push(v);outside.push(v);}
 }
 return {inside,outside};
}
/** Original Baller hinge metadata when present; otherwise cut real front-door
 * panels from rigid car meshes. Never overlay a fake door on an intact body,
 * and never modify the shared ambient thin-instance geometry. */
export function attachNativeVehicleDoors(root:TransformNode,sources:readonly AbstractMesh[],fit?:{width:number;height:number;seatZ:number}):VehicleDoors{
 const doors:Door[]=[],created:Mesh[]=[],replacedMeshes:AbstractMesh[]=[],materials:Material[]=[],scene=root.getScene(),inverse=Matrix.Invert(root.computeWorldMatrix(true));
 const nodes=[root,...root.getDescendants()].filter((n):n is TransformNode=>n instanceof TransformNode);
 const described=nodes.flatMap(n=>{const spec=n.metadata?.gltf?.extras?.offmapDoor??n.metadata?.offmapDoor;return spec?[{n,spec}]:[];});
 if(described.length===2&&described.every(({spec})=>Array.isArray(spec.hinge)&&spec.hinge.length===3&&spec.hinge.every(Number.isFinite)&&Array.isArray(spec.attachedNodes)&&spec.attachedNodes.every((name:string)=>nodes.some(n=>n.name===name)))){
  for(const {n,spec} of described){
   const hinge=Vector3.TransformCoordinates(Vector3.FromArray(spec.hinge),n.computeWorldMatrix(true).multiply(inverse));
   const pivot=new TransformNode(n.name+'-entry-hinge',scene);pivot.parent=root;pivot.position.copyFrom(hinge);pivot.computeWorldMatrix(true);
   n.setParent(pivot);for(const name of spec.attachedNodes)nodes.find(n=>n.name===name)!.setParent(pivot);
   doors.push({pivot,side:Math.sign(hinge.x)||spec.side});
  }
 }else if(fit){
  for(const side of [-1,1]){
   const pivot=new TransformNode('entry-hinge-'+side,scene);pivot.parent=root;pivot.position.set(side*fit.width*.44,.45,fit.seatZ+.8);doors.push({pivot,side});
  }
  for(const source of sources){
   if(!(source instanceof Mesh)||source.skeleton||/wheel|brake|rubber|led|cockpit|seat|leather|steering|badge|plate/i.test(source.name))continue;
   const positions=source.getVerticesData(VertexBuffer.PositionKind),indices=source.getIndices();if(!positions||!indices)continue;
   const kinds=[VertexBuffer.PositionKind,...[VertexBuffer.NormalKind,VertexBuffer.UVKind,VertexBuffer.UV2Kind,VertexBuffer.ColorKind,VertexBuffer.TangentKind].filter(k=>source.isVerticesDataPresent(k))];
   const arrays=kinds.map(k=>source.getVerticesData(k)!),sizes=kinds.map(k=>source.getVertexBuffer(k)!.getSize()),matrix=source.computeWorldMatrix(true).multiply(inverse);
   const vertices:Vertex[]=[];
   for(let i=0;i<positions.length/3;i++){
    const p=Vector3.TransformCoordinates(Vector3.FromArray(positions,i*3),matrix),v=[p.x,p.y,p.z];
    for(let j=1;j<kinds.length;j++){const a=Array.from(arrays[j].slice(i*sizes[j],(i+1)*sizes[j]));if(kinds[j]===VertexBuffer.NormalKind){const n=Vector3.TransformNormal(Vector3.FromArray(a),matrix).normalize();a.splice(0,3,n.x,n.y,n.z);}v.push(...a);}vertices.push(v);
   }
   const buffers:Vertex[][]=[[],[],[]];
   const triangulate=(poly:Vertex[],out:Vertex[])=>{for(let i=1;i<poly.length-1;i++)out.push(poly[0],poly[i],poly[i+1]);};
   for(let i=0;i<indices.length;i+=3){
    let remaining:Vertex[][]=[[vertices[indices[i]],vertices[indices[i+1]],vertices[indices[i+2]]]];
    for(let d=0;d<2;d++){
     const side=doors[d].side,rest:Vertex[][]=[];
     const planes=[[0,side*fit.width*.31,side],[1,.38,1],[1,fit.height*.91,-1],[2,fit.seatZ-.8,1],[2,fit.seatZ+.8,-1]];
     for(const polygon of remaining){let inside=polygon;for(const [axis,bound,sign] of planes){if(inside.length<3)break;const cut=clipDoorPolygon(inside,axis,bound,sign);if(cut.outside.length>=3)rest.push(cut.outside);inside=cut.inside;}if(inside.length>=3)triangulate(inside,buffers[d+1]);}
     remaining=rest;
    }
    for(const polygon of remaining)triangulate(polygon,buffers[0]);
   }
   if(!buffers[1].length&&!buffers[2].length)continue;
   buffers.forEach((vertices,part)=>{
    if(!vertices.length)return;
    const mesh=new Mesh(source.name+'-entry-'+part,scene);mesh.parent=part?doors[part-1].pivot:root;
    const offset=part?doors[part-1].pivot.position:Vector3.Zero();
    let start=0;for(let j=0;j<kinds.length;j++){const values=vertices.flatMap(v=>v.slice(start,start+sizes[j]));if(j===0)for(let i=0;i<values.length;i+=3){values[i]-=offset.x;values[i+1]-=offset.y;values[i+2]-=offset.z;}mesh.setVerticesData(kinds[j],values);start+=sizes[j];}
    const indices=vertices.map((_,i)=>i);if(matrix.determinant()<0)for(let i=0;i<indices.length;i+=3)[indices[i+1],indices[i+2]]=[indices[i+2],indices[i+1]];
    mesh.setIndices(indices);mesh.material=source.material;mesh.sideOrientation=source.sideOrientation;mesh.isPickable=false;mesh.receiveShadows=true;
    if(part)mesh.metadata={...source.metadata,trafficDoor:{side:doors[part-1].side,hinge:offset.asArray()}};
    if(part&&source.material){const material=source.material.clone(source.material.name+'-door-inside');if(material){material.backFaceCulling=false;if('twoSidedLighting' in material)material.twoSidedLighting=true;mesh.material=material;materials.push(material);}}
    created.push(mesh);
   });source.setEnabled(false);replacedMeshes.push(source);
  }
 }
 return {available:doors.length>0,meshes:created,replacedMeshes,update(side,openness){const t=Number.isFinite(openness)?Math.max(0,Math.min(1,openness)):0;for(const door of doors)door.pivot.rotationQuaternion=Quaternion.RotationAxis(Vector3.Up(),door.side===side?-door.side*1.15*t:0);},dispose(){for(const material of materials)material.dispose(false,false);materials.length=0;}};
}
