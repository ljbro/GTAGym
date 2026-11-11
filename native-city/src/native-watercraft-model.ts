import {LoadAssetContainerAsync,Mesh,MeshBuilder,PBRMaterial,Color3,TransformNode,Vector3,VertexBuffer,type Scene,type AssetContainer,type AbstractMesh} from '@babylonjs/core';
import '@babylonjs/loaders/glTF';
import {WATERCRAFT,type WatercraftKind} from './native-watercraft-spec.ts';
/** All lengths are fitted uniformly from rendered vertices, preserving the
 * imported hierarchy and the attribution embedded in the original GLB. */
export class NativeWatercraftModel{
 readonly root:TransformNode;private container:AssetContainer|null=null;private disposed=false;
 private helmMaterial:PBRMaterial|null=null;
 bounds:{min:number[];max:number[]}|null=null;
 constructor(private scene:Scene,readonly kind:WatercraftKind='yacht'){this.root=new TransformNode('native-watercraft-'+kind,scene);}
 async load(){
  const fit=WATERCRAFT[this.kind];
  const container=await LoadAssetContainerAsync('/assets/task-watercraft/sources/'+fit.file,this.scene);
  if(this.disposed){container.dispose();return;}this.container=container;container.addAllToScene();
  // Sea-Doo contains a skinned handlebar/key animation. Freeze and bake its
  // current bind presentation before measuring or cloning a rigid hull.
  // Otherwise animation changes the bounds and shared skeletons distort clones.
  for(const group of container.animationGroups){group.stop();group.reset();}
  for(const m of container.meshes)if(m instanceof Mesh&&m.skeleton){
   m.computeWorldMatrix(true);m.skeleton.prepare(true);
   const positions=m.getPositionData(true,true),normals=m.getNormalsData(true,true);
   m.makeGeometryUnique();if(positions)m.setVerticesData(VertexBuffer.PositionKind,positions);if(normals)m.setVerticesData(VertexBuffer.NormalKind,normals);m.skeleton=null;
  }
  // Inspected from both ends: imported Babylon mesh points its bow toward -Z.
  const heading=new TransformNode('motoryacht-bow-positive-z',this.scene);heading.parent=this.root;
  const model=new TransformNode('motoryacht-metre-normalizer',this.scene);model.parent=heading;
  for(const node of container.rootNodes)node.parent=model;
  let min=new Vector3(Infinity,Infinity,Infinity),max=min.negate();
  // The parent may already be placed/rotated while the GLB loads. Measure in
  // its own frame, otherwise a city heading distorts scale and hull centering.
  const inverseRoot=this.root.computeWorldMatrix(true).clone().invert();
  for(const m of model.getChildMeshes()){const positions=m.getVerticesData(VertexBuffer.PositionKind);if(!positions)continue;const matrix=m.computeWorldMatrix(true);
   for(let i=0;i<positions.length;i+=3){const world=Vector3.TransformCoordinates(Vector3.FromArray(positions,i),matrix),p=Vector3.TransformCoordinates(world,inverseRoot);min=Vector3.Minimize(min,p);max=Vector3.Maximize(max,p);}
   m.isPickable=false;m.receiveShadows=true;
   // The imported rubber-pad/registration overlays are nearly coplanar with
   // the hull. Large native-city coordinates otherwise cause depth flicker.
   if(this.kind==='jetski'&&m.material){if(/Foot|Pads/i.test(m.material.name))m.material.zOffset=-1;if(/Registration/i.test(m.material.name))m.material.zOffset=-2;}
  }
  const scale=fit.length/(max.z-min.z);if(!Number.isFinite(scale)||scale<=0)throw Error("Boats GLB Invalid dimensions");
  model.scaling.setAll(scale);model.position.set(-(min.x+max.x)*scale/2,-min.y*scale,-(min.z+max.z)*scale/2);
  // Normalize in the model's unrotated frame first. Centering world-space
  // bounds after applying the heading would shift the hull relative to its
  // collision box and stern boarding point.
  heading.rotation.y=fit.heading;
  this.bounds={min:[-(max.x-min.x)*scale/2,0,-fit.length/2],max:[(max.x-min.x)*scale/2,(max.y-min.y)*scale,fit.length/2]};
  // This asset has an open space behind the helm console, but no captain's
  // chair there. Add a supported seat instead of leaving the pelvis in midair.
  if(this.kind==='yacht'){
   const [x,y,z]=fit.driver,mat=new PBRMaterial('yacht-helm-upholstery',this.scene);mat.albedoColor=new Color3(.16,.22,.40);mat.roughness=.82;this.helmMaterial=mat;
   const box=(name:string,w:number,h:number,d:number,px:number,py:number,pz:number)=>{const m=MeshBuilder.CreateBox(name,{width:w,height:h,depth:d},this.scene);m.parent=this.root;m.position.set(px,py,pz);m.material=mat;m.isPickable=false;m.receiveShadows=true;};
   box('yacht-supported-helm-pedestal',.24,y-.17-1.15,.25,x,(y-.17+1.15)/2,z);
   box('yacht-helm-seat',.48,.10,.48,x,y-.17,z);
   box('yacht-helm-backrest',.48,.42,.08,x,y+.07,z-.23);
  }
 }
 setPose(x:number,y:number,z:number,yaw:number,time=0,support?:{bottomY:number;pitch:number;grounded:boolean}){const afloat=!support?.grounded;this.root.position.set(x,(support?.bottomY??y-WATERCRAFT[this.kind].waterline)+(afloat?Math.sin(time*1.7)*.025:0),z);this.root.rotation.set(support?.grounded?-support.pitch:Math.sin(time*.8)*.004,yaw,afloat?Math.sin(time*.9)*.006:0);}
 get meshes():AbstractMesh[]{return this.root.getChildMeshes();}
 localPoint(point:readonly number[]){return Vector3.TransformCoordinates(new Vector3(point[0],point[1],point[2]),this.root.computeWorldMatrix(true));}
 dispose(){this.disposed=true;this.container?.dispose();this.root.dispose(false,false);this.helmMaterial?.dispose();}
}
