import {Mesh,MeshBuilder,PBRMaterial,Texture,TransformNode,VertexData,type Scene,type AbstractMesh} from '@babylonjs/core';
import {floodLayout,type FloodSpec} from './native-flood-layout.ts';import {NativeDriveVehicle} from './native-drive-vehicle.ts';import type {WalkLink} from './native-walk-traversal.ts';
/** Task-owned dry concrete channel in the native riverside. The concrete bed
 * has solid foundations; no invisible ground override outside its footprint. */
export class NativeFloodSite{
 readonly root:TransformNode;readonly layout;readonly terrainMax:number;readonly terrainIntrusion:number;readonly links:WalkLink[]=[];readonly requiredLinks:string[]=[];readonly vehiclePlacements=[];readonly traversalClear=null;
 private materials:PBRMaterial[]=[];private textures:Texture[]=[];private bikes:NativeDriveVehicle[]=[];private disposed=false;private restoreGround:(()=>void)|null=null;elapsed=0;
 constructor(private scene:Scene,readonly spec:FloodSpec,private nativeHeight:(x:number,z:number)=>number){
  this.root=new TransformNode('native-flood-'+spec.id,scene);this.layout=floodLayout(spec);
  let high=-Infinity,intrusion=-Infinity;
  const audit=(x:number,z:number,surface:number)=>{const y=nativeHeight(x,z);high=Math.max(high,y);intrusion=Math.max(intrusion,y-surface);};
  for(let i=1;i<this.layout.points.length;i++){const a=this.layout.points[i-1],b=this.layout.points[i],d=Math.hypot(b[0]-a[0],b[1]-a[1]);for(let k=0;k<=Math.ceil(d/2);k++)for(let u=-26;u<=26;u++){const t=k/Math.ceil(d/2),x=a[0]+(b[0]-a[0])*t+(b[1]-a[1])*u/d,z=a[1]+(b[1]-a[1])*t-(b[0]-a[0])*u/d;const rise=4*Math.max(0,Math.min(1,(Math.abs(u)-spec.channel.halfWidth)/10));audit(x,z,spec.channel.floor+rise);}}
  for(const br of [spec.channel.bridge,...(spec.channel.additionalBridges??[])])for(let u=-90;u<=90;u+=2)for(const v of [-6,0,6])audit(br.point[0]+Math.cos(br.yaw)*u+Math.sin(br.yaw)*v,br.point[1]-Math.sin(br.yaw)*u+Math.cos(br.yaw)*v,spec.channel.floor+(br.height??7)*Math.min(1,(90-Math.abs(u))/62));
  this.terrainMax=high;this.terrainIntrusion=intrusion;if(intrusion>-.05){this.root.dispose();throw Error("Native terrain within the drainage channel footprint intrudes into the channel bed or slopes, Reject riverbeds that clip through geometry");}
  const concrete=this.mat('concrete',[.60,.57,.49],'/city/textures/paving.jpg'),edge=this.mat('edge',[.26,.28,.27]),road=this.mat('road',[.29,.29,.27],'/city/landscape/asphalt.jpg');
  const {floor,halfWidth}=this.layout,bed=this.layout.bank(-halfWidth),other=this.layout.bank(halfWidth);
  // Single closed prism; below-water faces extend to the authored foundation.
  const bottom=-10,sections=bed.map((a,i)=>[[a[0],floor,a[1]],[other[i][0],floor,other[i][1]],[other[i][0],bottom,other[i][1]],[a[0],bottom,a[1]]]);
  this.sweep('continuous-bed',sections,concrete);
  if(spec.channel.leftWater){const left=this.layout.bank(-halfWidth),right=this.layout.bank(-5),water=this.mat('side-stream',[.13,.28,.24]);water.roughness=.24;water.metallic=.2;this.sweep('side-stream',left.map((a,i)=>[[a[0],floor+.025,a[1]],[right[i][0],floor+.025,right[i][1]],[right[i][0],floor+.005,right[i][1]],[a[0],floor+.005,a[1]]]),water);}
  for(const side of [-1,1]){
   const low=this.layout.bank(side*halfWidth),crest=this.layout.bank(side*(halfWidth+10)),outer=this.layout.bank(side*(halfWidth+13));
   this.sweep('sloped-bank-'+side,low.map((a,i)=>[[a[0],floor,a[1]],[crest[i][0],floor+4,crest[i][1]],[outer[i][0],floor+4,outer[i][1]],[outer[i][0],bottom,outer[i][1]],[a[0],bottom,a[1]]]),concrete);
  }
  for(const bridge of [spec.channel.bridge,...(spec.channel.additionalBridges??[])]){
  const rise=bridge.height??7,point=(u:number,v:number,y:number)=>[bridge.point[0]+Math.cos(bridge.yaw)*u+Math.sin(bridge.yaw)*v,y,bridge.point[1]-Math.sin(bridge.yaw)*u+Math.cos(bridge.yaw)*v];
  // Supported bridge deck, piers and solid approach ramps; no detached slabs.
  for(const [a,b,ya,yb]of [[-90,-28,floor,floor+rise],[-28,28,floor+rise,floor+rise],[28,90,floor+rise,floor]]){
   const under=(u:number,y:number)=>Math.abs(u)<=28?y-.5:bottom;
   const sec=[[a,ya],[b,yb]].map(([u,y])=>[point(u,-6,y),point(u,6,y),point(u,6,under(u,y)),point(u,-6,under(u,y))]);
   // Ramps are closed wedges down to the riverbed, not a floating surface.
   if(a!==-28)for(let i=0;i<sec.length;i++){sec[i][2][1]=bottom;sec[i][3][1]=bottom;}
   this.sweep('bridge-'+a,sec,road);
   for(const side of [-1,1])this.sweep('bridge-parapet',[[a,ya],[b,yb]].map(([u,y])=>[point(u,side*6,y),point(u,side*6,y+1),point(u,side*6.2,y+1),point(u,side*6.2,y)]),edge);
  }
  for(const u of [-20,20]){const p=point(u,0,0),h=floor+rise-.5-bottom;this.box('bridge-pier',2.8,h,8,p[0],bottom+h/2,p[2],bridge.yaw,concrete);}
  if(bridge.kind==='steel')for(const v of [-5.5,5.5]){const p=point(0,v,floor+rise-.9);this.box('steel-girder',40,.7,.4,p[0],p[1],p[2],bridge.yaw,edge);}
  if(bridge.kind==='arch')for(const v of [-5,5]){const sec=Array.from({length:25},(_,i)=>{const u=-20+40*i/24,y=floor+rise-1.4-2.2*(u/20)**2;return [point(u,v-.45,y),point(u,v+.45,y),point(u,v+.45,y-.6),point(u,v-.45,y-.6)];});this.sweep('concrete-arch',sec,concrete);}
  }
 }
 private mat(name:string,color:[number,number,number],url?:string){const m=new PBRMaterial('flood-'+name,this.scene);m.albedoColor.set(...color);m.roughness=.92;m.backFaceCulling=false;if(url){const t=new Texture(url,this.scene);t.wrapU=t.wrapV=Texture.WRAP_ADDRESSMODE;t.anisotropicFilteringLevel=8;m.albedoTexture=t;this.textures.push(t);}this.materials.push(m);return m;}
 private box(name:string,w:number,h:number,d:number,x:number,y:number,z:number,yaw:number,mat:PBRMaterial){const m=MeshBuilder.CreateBox('flood-'+name,{width:w,height:h,depth:d},this.scene);m.parent=this.root;m.position.set(x,y,z);m.rotation.y=yaw;m.material=mat;m.receiveShadows=true;m.isPickable=false;return m;}
 private sweep(name:string,sections:number[][][],material:PBRMaterial){
  const positions=sections.flat(2),indices:number[]=[],uvs:number[]=[],normals:number[]=[],n=sections[0].length;let along=0;
  for(let i=0;i<sections.length;i++){if(i)along+=Math.hypot(sections[i][0][0]-sections[i-1][0][0],sections[i][0][2]-sections[i-1][0][2]);let cross=0;for(let k=0;k<n;k++){if(k)cross+=Math.hypot(...sections[i][k].map((v,j)=>v-sections[i][k-1][j]));uvs.push(along/5,cross/5);if(i){const a=(i-1)*n+k,b=(i-1)*n+(k+1)%n,c=i*n+(k+1)%n,d=i*n+k;indices.push(a,b,c,a,c,d);}}}
  for(let k=1;k<n-1;k++){indices.push(0,k+1,k);const o=(sections.length-1)*n;indices.push(o,o+k,o+k+1);}
  // Mirrored banks and the transverse bridge have opposite sweep winding.
  // Orient each closed prism outward for Babylon's left-handed normals.
  let volume=0;const origin=positions.slice(0,3);
  for(let i=0;i<indices.length;i+=3){const [a,b,c]=indices.slice(i,i+3).map(k=>positions.slice(k*3,k*3+3).map((v,j)=>v-origin[j]));volume+=a[0]*(b[1]*c[2]-b[2]*c[1])+a[1]*(b[2]*c[0]-b[0]*c[2])+a[2]*(b[0]*c[1]-b[1]*c[0]);}
  if(volume>0)for(let i=0;i<indices.length;i+=3)[indices[i+1],indices[i+2]]=[indices[i+2],indices[i+1]];
  const m=new Mesh('flood-'+name,this.scene),v=new VertexData();VertexData.ComputeNormals(positions,indices,normals);Object.assign(v,{positions,indices,uvs,normals});v.applyToMesh(m);m.parent=this.root;m.material=material;m.receiveShadows=true;m.isPickable=false;return m;
 }
 async load(){if(this.spec.channel.companions===false)return;for(let i=0;i<3;i++){const bike=new NativeDriveVehicle(this.scene,'motorcycle');this.bikes.push(bike);await bike.load();if(this.disposed){bike.dispose();return;}}this.update(0);}
 attachGround(world:{groundHeight:(x:number,z:number)=>number}){const original=world.groundHeight,wrapped=(x:number,z:number)=>this.floorAt(x,z)??original(x,z);world.groundHeight=wrapped;this.restoreGround=()=>{if(world.groundHeight===wrapped)world.groundHeight=original;};}
 update(dt:number){this.elapsed+=dt;this.bikes.forEach((bike,i)=>{const distance=Math.min(this.spec.path.length-4,45+i*15+this.elapsed*20),p=this.layout.pointAt(distance,(i-1)*3);bike.sync({...p,speed:distance<this.spec.path.length-4?20:0,steer:0},()=>this.layout.floor,dt);});}
 floorAt(x:number,z:number){return this.layout.floorAt(x,z);}
 drivingFloorAt(x:number,z:number){return this.floorAt(x,z);}
 get drivingNavigationPath(){return this.layout.points;}
 blocked(x:number,z:number){return this.layout.blocked(x,z);}
 vegetationReserved(x:number,z:number,radius=0){return this.layout.vegetationReserved(x,z,radius);}
 canFinish(_walk:unknown){return true;}
 get goalHeight(){return null;}
 get companionStats(){return this.bikes.map(b=>({position:b.root.position.asArray(),ready:!!b.bounds,rider:b.riderStats?.ready}));}
 get meshes():AbstractMesh[]{return [...this.root.getChildMeshes(),...this.bikes.flatMap(b=>b.meshes)];}
 dispose(){this.disposed=true;this.restoreGround?.();this.restoreGround=null;for(const b of this.bikes)b.dispose();this.bikes=[];this.root.dispose(false,false);for(const m of this.materials)m.dispose();for(const t of this.textures)t.dispose();}
}
