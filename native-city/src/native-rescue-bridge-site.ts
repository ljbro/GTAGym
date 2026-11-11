import {Mesh,MeshBuilder,PBRMaterial,Texture,TransformNode,VertexData,Vector3,type Scene,type AbstractMesh} from '@babylonjs/core';
import {rescueBridgeLayout,type RescueBridgeSpec} from './native-rescue-bridge-layout.ts';
import type {WalkLink} from './native-walk-traversal.ts';
export class NativeRescueBridgeSite{
 readonly root:TransformNode;readonly layout;readonly links:WalkLink[]=[];readonly requiredLinks:string[]=[];readonly vehiclePlacements=[];readonly traversalClear=null;
 private materials:PBRMaterial[]=[];private textures:Texture[]=[];private restore:(()=>void)|null=null;
 dynamicBlocked:((x:number,z:number)=>boolean)|null=null;
 constructor(private scene:Scene,readonly spec:RescueBridgeSpec,private nativeHeight:(x:number,z:number)=>number){
  this.root=new TransformNode('native-rescue-bridge-'+spec.id,scene);this.layout=rescueBridgeLayout(spec,nativeHeight);
  const concrete=this.mat('concrete',[.54,.56,.55]),steel=this.mat('steel',[.28,.33,.34]),road=this.mat('road',[.8,.82,.82],'/city/landscape/asphalt.jpg'),white=this.mat('marking',[.84,.85,.8]);
  const g=this.layout.grid;this.mesh('continuous-road',g.positions,g.indices,g.uvs,road);
  // The underside and edge beams are continuous too; piers physically reach
  // native terrain instead of hovering above the ground under a thin road.
  this.mesh('continuous-deck-underside',g.positions.map((v,i)=>i%3===1?v-.6:v),g.indices.flatMap((v,i,a)=>i%3===0?[v,a[i+2],a[i+1]]:[]),g.uvs,concrete);
  for(const side of[-1,1]){
   const top:Vector3[]=[],bottom:Vector3[]=[],rail:Vector3[]=[];
   for(let d=-12;d<=spec.path.length+12;d+=2){const p=this.layout.station(d,side*9.65);top.push(new Vector3(p.x,p.y+.06,p.z));bottom.push(new Vector3(p.x,p.y-.54,p.z));rail.push(new Vector3(p.x,p.y+.85,p.z));if(Math.round(d)%8===4)this.box('rail-post',.14,1,.14,[p.x,p.y+.5,p.z],p.yaw,steel);}
   const edge=MeshBuilder.CreateRibbon('rescue-bridge-supported-deck-edge',{pathArray:[top,bottom],sideOrientation:Mesh.DOUBLESIDE},scene);edge.parent=this.root;edge.material=concrete;
   const guard=MeshBuilder.CreateTube('rescue-bridge-guardrail',{path:rail,radius:.12,tessellation:6,cap:Mesh.CAP_ALL},scene);guard.parent=this.root;guard.material=steel;
  }
  for(let d=20;d<spec.path.length;d+=28){const p=this.layout.station(d),base=nativeHeight(p.x,p.z),h=p.y-.54-base;if(h>.12){this.box('grounded-pier',2.6,h+.12,2.6,[p.x,base+h/2-.06,p.z],p.yaw,concrete);this.box('pier-crossbeam',18,.7,2.8,[p.x,p.y-.9,p.z],p.yaw,concrete);}}
  // Two supported tower portals and suspension cables along the long span.
  const start=spec.path.length*.47,end=spec.path.length*.8;
  for(const d of[start,end]){const mid=this.layout.station(d);for(const side of[-1,1]){const p=this.layout.station(d,side*9),base=nativeHeight(p.x,p.z),height=p.y+22-base;this.box('grounded-tower',1.2,height,2.4,[p.x,base+height/2,p.z],p.yaw,steel);}this.box('tower-crossbeam',19.2,1.2,2.4,[mid.x,mid.y+21.4,mid.z],mid.yaw,steel);}
  for(const side of[-1,1]){const cable:Vector3[]=[];for(let i=0;i<=40;i++){const t=i/40,d=start+(end-start)*t,p=this.layout.station(d,side*9),rise=5+17*(2*t-1)**2;cable.push(new Vector3(p.x,p.y+rise,p.z));if(i%2===0)this.box('supported-suspender',.09,rise,.09,[p.x,p.y+rise/2,p.z],p.yaw,steel);}const mesh=MeshBuilder.CreateTube('rescue-bridge-suspension-cable',{path:cable,radius:.12,tessellation:6},scene);mesh.parent=this.root;mesh.material=steel;}
  // Paint sits on the very same deck triangles, not upright floating quads.
  for(let d=0;d<spec.path.length;d+=12){const positions:number[]=[],uv:number[]=[],indices:number[]=[];for(let k=0;k<=8;k++){const p=this.layout.station(d+k*.5);for(const u of[-.07,.07]){const x=p.x+Math.cos(p.yaw)*u,z=p.z-Math.sin(p.yaw)*u;positions.push(x,this.layout.heightAt(x,z)+.072,z);uv.push(u,k);}if(k){const a=(k-1)*2;indices.push(a,a+1,a+2,a+1,a+3,a+2);}}this.mesh('painted-dash',positions,indices,uv,white);}
 }
 private mat(name:string,rgb:[number,number,number],url?:string){const m=new PBRMaterial('rescue-bridge-'+name,this.scene);m.albedoColor.set(...rgb);m.roughness=.85;m.metallic=0;if(url){const t=new Texture(url,this.scene);t.anisotropicFilteringLevel=8;m.albedoTexture=t;this.textures.push(t);}this.materials.push(m);return m;}
 private box(name:string,width:number,height:number,depth:number,p:number[],yaw:number,material:PBRMaterial){const m=MeshBuilder.CreateBox('rescue-bridge-'+name,{width,height,depth},this.scene);m.parent=this.root;m.position.set(p[0],p[1],p[2]);m.rotation.y=yaw;m.material=material;m.receiveShadows=true;m.isPickable=false;return m;}
 private mesh(name:string,positions:number[],indices:number[],uvs:number[],material:PBRMaterial){const m=new Mesh('rescue-bridge-'+name,this.scene),v=new VertexData(),normals:number[]=[];VertexData.ComputeNormals(positions,indices,normals);Object.assign(v,{positions,indices,uvs,normals});v.applyToMesh(m);m.parent=this.root;m.material=material;m.receiveShadows=true;m.isPickable=false;return m;}
 attachGround(world:{groundHeight:(x:number,z:number)=>number}){const old=world.groundHeight,wrapped=(x:number,z:number)=>this.floorAt(x,z)??old(x,z);world.groundHeight=wrapped;this.restore=()=>{if(world.groundHeight===wrapped)world.groundHeight=old;};}
 floorAt(x:number,z:number){return this.layout.floorAt(x,z);}
 drivingFloorAt(x:number,z:number){return this.floorAt(x,z);}
 get drivingNavigationPath(){return this.layout.points;}
 vegetationReserved(x:number,z:number,radius=0){return this.layout.vegetationReserved(x,z,radius);}
 blocked(x:number,z:number){return this.layout.blocked(x,z)||!!this.dynamicBlocked?.(x,z);}
 canFinish(_walk:unknown){return true;}
 get goalHeight(){return null;}
 get resetPose(){const [a,b]=this.spec.path.points;return{x:a[0],z:a[1],yaw:Math.atan2(b[0]-a[0],b[1]-a[1]),speed:0,steer:0,distance:0};}
 get meshes():AbstractMesh[]{return this.root.getChildMeshes();}
 dispose(){this.restore?.();this.restore=null;this.root.dispose(false,false);for(const m of this.materials)m.dispose();for(const t of this.textures)t.dispose();}
}
