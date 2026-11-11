import {Mesh,MeshBuilder,PBRMaterial,Texture,TransformNode,VertexData,Vector3,type AbstractMesh,type Scene} from '@babylonjs/core';
import {farmPoint,farmRoadGrid,farmBlocked,type FarmSpec} from './native-farm-layout.ts';
import type {WalkLink} from './native-walk-traversal.ts';
/** Native-city ground and lighting remain authoritative. Added farm props are
 * an estimated task adaptation, not an assertion that the real park is a farm. */
export class NativeFarmSite{
 readonly root:TransformNode;readonly links:WalkLink[]=[];readonly requiredLinks:string[]=[];readonly vehiclePlacements=[];readonly traversalClear=null;
 readonly road:Mesh;private materials:PBRMaterial[]=[];private textures:Texture[]=[];readonly base:number;
 constructor(private scene:Scene,readonly spec:FarmSpec,private height:(x:number,z:number)=>number){
  this.root=new TransformNode('native-farm-'+spec.id,scene);
  let low=Infinity,high=-Infinity;for(let u=-13;u<=13;u++)for(let v=-10;v<=10;v++){const p=farmPoint(spec,u,v),y=height(...p);low=Math.min(low,y);high=Math.max(high,y);}
  if(high-low>.35)throw Error("Farmhouse site is too steep, Reject floating farmhouses");this.base=high+.04;
  const stone=this.mat('stone',[.77,.71,.59],'/city/textures/paving.jpg'),roof=this.mat('roof',[.38,.26,.18],'/city/landscape/asphalt.jpg'),wood=this.mat('wood',[.25,.17,.10]),glass=this.mat('glass',[.12,.22,.24]),soil=this.mat('dirt',[.55,.37,.19],'/city/landscape/asphalt.jpg'),green=this.mat('crops',[.18,.29,.07]);glass.roughness=.25;glass.metallic=.18;green.backFaceCulling=false;
  (stone.albedoTexture as Texture).uScale=4;(stone.albedoTexture as Texture).vScale=2;
  // A terrain material overlay needs polygon depth bias at long camera ranges;
  // do not lift the road into a floating slab to work around depth precision.
  soil.zOffset=-2;soil.zOffsetUnits=-2;
  const grid=farmRoadGrid(spec.path.points,height);this.road=this.mesh('continuous-dirt-road',grid.positions,grid.indices,grid.uvs,soil);
  // Foundations extend down into native ground, including the small variation.
  this.box('foundation',12.4,this.base-low+.14,9.4,0,(low+this.base)/2-.07,0,stone);
  this.box('farmhouse-walls',12,3.8,9,0,this.base+1.9,0,stone);
  this.gable('farmhouse-gable',0,0,6.5,5,this.base+3.8,1.9,roof);
  this.box('barn',4.2,3.1,6.2,9,this.base+1.55,4,wood);this.gable('barn-gable',9,4,2.3,3.3,this.base+3.1,.8,roof);
  this.box('barn-footing',4.4,this.base-low+.14,6.4,9,(low+this.base)/2-.07,4,stone);
  // Mounted windows and frames on both long walls, plus the front porch.
  for(const side of [-1,1])for(const v of [-2.6,0,2.6]){
   this.box('window-glass',.06,1.2,1.45,side*6.04,this.base+2,v,glass);
   for(const z of [v-.79,v+.79])this.box('window-jamb',.13,1.4,.1,side*6.09,this.base+2,z,wood);
   for(const y of [1.34,2.66])this.box('window-trim',.13,.1,1.68,side*6.09,this.base+y,v,wood);
   this.box('window-divider',.14,1.25,.045,side*6.10,this.base+2,v,wood);
  }
  this.box('porch-door',.15,2.25,1.05,-6.13,this.base+1.125,0,wood);
  this.box('porch-roof',2.8,.16,6.6,-7.25,this.base+2.8,0,roof);
  for(const v of [-3,3]){const p=farmPoint(spec,-8.3,v),h=this.base+2.72-height(...p);this.box('porch-post',.20,h,.20,-8.3,height(...p)+h/2,v,wood);}
  // Crop rows are connected to the soil: small leaves share one mesh.
  const verts:number[]=[],ids:number[]=[];
  for(let u=-11.5;u<=-9.5;u+=.65)for(let v=-8;v<=8;v+=.6){const [x,z]=farmPoint(spec,u,v),y=height(x,z)+.018;
   const h=.35+(.5+.5*Math.sin(u*23+v*11))*.2;
   for(const angle of [0,Math.PI/2]){const dx=Math.cos(angle)*.15,dz=Math.sin(angle)*.15,n=verts.length/3;verts.push(x-dx,y,z-dz,x+dx,y,z+dz,x,y+h,z);ids.push(n,n+1,n+2);}
  }this.mesh('crop-rows',verts,ids,[],green);
 }
 private mat(name:string,rgb:[number,number,number],url?:string){const m=new PBRMaterial('farm-'+name,this.scene);m.albedoColor.set(...rgb);m.roughness=.86;m.metallic=0;if(url){const t=new Texture(url,this.scene);t.wrapU=t.wrapV=Texture.WRAP_ADDRESSMODE;t.anisotropicFilteringLevel=8;m.albedoTexture=t;this.textures.push(t);}this.materials.push(m);return m;}
 private mesh(name:string,positions:number[],indices:number[],uvs:number[],material:PBRMaterial){const m=new Mesh('farm-'+name,this.scene),v=new VertexData();v.positions=positions;v.indices=indices;if(uvs.length)v.uvs=uvs;const normals:number[]=[];VertexData.ComputeNormals(positions,indices,normals);v.normals=normals;v.applyToMesh(m);m.parent=this.root;m.material=material;m.receiveShadows=true;m.isPickable=false;return m;}
 private box(name:string,w:number,h:number,d:number,u:number,y:number,v:number,material:PBRMaterial){const m=MeshBuilder.CreateBox('farm-'+name,{width:w,height:h,depth:d},this.scene),p=farmPoint(this.spec,u,v);m.parent=this.root;m.position.set(p[0],y,p[1]);m.rotation.y=this.spec.path.placement.yaw;m.material=material;m.receiveShadows=true;m.isPickable=false;return m;}
 private gable(name:string,u:number,v:number,w:number,d:number,y:number,h:number,material:PBRMaterial){
  const p:number[]=[],uv:number[]=[];for(const z of [-d,d])for(const [x,yy] of [[-w,y],[w,y],[0,y+h]]){const q=farmPoint(this.spec,u+x,v+z);p.push(q[0],yy,q[1]);uv.push((x+w)/2,(z+d)/2);}
  const m=this.mesh(name,p,[0,2,1,3,4,5,0,3,5,0,5,2,2,5,4,2,4,1,0,1,4,0,4,3],uv,material);m.material!.backFaceCulling=false;
 }
 floorAt(_x:number,_z:number):number|null{return null;}
 blocked(x:number,z:number){return farmBlocked(this.spec,x,z);}
 canFinish(_walk:unknown){return true;}
 get goalHeight(){return null;}
 get meshes():AbstractMesh[]{return this.root.getChildMeshes();}
 dispose(){this.root.dispose(false,false);for(const m of this.materials)m.dispose();for(const t of this.textures)t.dispose();}
}
