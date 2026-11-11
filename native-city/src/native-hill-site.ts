import {Mesh,MeshBuilder,PBRMaterial,Texture,TransformNode,VertexData,Vector3,type AbstractMesh,type Scene} from '@babylonjs/core';
import {hillLayout,type HillSpec} from './native-hill-layout.ts';
import {farmRoadGrid} from './native-farm-layout.ts';
import type {WalkLink} from './native-walk-traversal.ts';
/** One task-owned heightfield and road; no elevated strips or detached walls. */
export class NativeHillSite{
 readonly root:TransformNode;readonly layout;readonly links:WalkLink[]=[];readonly requiredLinks:string[]=[];readonly vehiclePlacements=[];readonly traversalClear=null;
 private materials:PBRMaterial[]=[];private textures:Texture[]=[];private restoreGround:(()=>void)|null=null;
 constructor(private scene:Scene,readonly spec:HillSpec,private nativeHeight:(x:number,z:number)=>number){
  this.root=new TransformNode('native-hill-'+spec.id,scene);this.layout=hillLayout(spec,nativeHeight);
  const rock=this.mat('rock',[.85,.85,.8],'/city/grassland-v2/soil-color.jpg'),road=this.mat('road',[1,1,1],'/city/landscape/asphalt.jpg'),concrete=this.mat('bridge',[.62,.60,.54],'/city/landscape/asphalt.jpg'),metal=this.mat('rail',[.28,.30,.27]);
  this.mesh('continuous-terrain',this.layout.positions,this.layout.indices,this.layout.uvs,rock);
  road.zOffset=-2;road.zOffsetUnits=-2;
  const grid=farmRoadGrid(spec.path.points,this.layout.heightAt,16,this.layout.grid),roadMesh=this.mesh('continuous-road',grid.positions,grid.indices,grid.uvs,road),colors:number[]=[];
  for(let i=0;i<grid.positions.length;i+=3){const along=this.layout.project(grid.positions[i],grid.positions[i+2]).along,t=Math.max(0,Math.min(1,(along/spec.path.length-.29)/.04));colors.push(.25+.30*t,.27+.17*t,.28+.02*t,1);}roadMesh.setVerticesData('color',colors);roadMesh.useVertexColors=true;
  // The source clip begins inside a tunnel. Its shell is continuous and its
  // side walls reach the ground; both openings stay clear of the driving lane.
  const first=spec.path.points[0],second=spec.path.points[1],yaw0=Math.atan2(second[0]-first[0],second[1]-first[1]);
  const tunnelPoint=(u:number,y:number,v:number)=>[first[0]+Math.cos(yaw0)*u+Math.sin(yaw0)*v,y,first[1]-Math.sin(yaw0)*u+Math.cos(yaw0)*v];
  const tunnelBase=this.layout.heightAt(first[0],first[1]),tp:number[]=[],ti:number[]=[],tu:number[]=[],profile:number[][]=[];
  profile.push([9,-.2],[9,3]);for(let j=1;j<=32;j++){const a=j/32*Math.PI;profile.push([9*Math.cos(a),3+6*Math.sin(a)]);}profile.push([-9,-.2],[-9.6,-.2],[-9.6,3]);for(let j=31;j>=0;j--){const a=j/32*Math.PI;profile.push([9.6*Math.cos(a),3+6.6*Math.sin(a)]);}profile.push([9.6,-.2]);
  for(const v of [-15,45])for(const [u,y]of profile){tp.push(...tunnelPoint(u,tunnelBase+y,v));tu.push(u/3,v/3);}const n=profile.length;
  for(let j=0;j<n;j++){const k=(j+1)%n;ti.push(j,k,n+k,j,n+k,n+j);}
  // Strip end caps follow inner/outer rings without sealing the road aperture.
  for(let j=0;j<34;j++){const outer=n-1-j;for(const offset of [0,n])ti.push(offset+j,offset+j+1,offset+outer-1,offset+j,offset+outer-1,offset+outer);}
  this.mesh('grounded-tunnel',tp,ti,tu,concrete).material!.backFaceCulling=false;
  const {bridge,bridgeBase}=this.layout,point=(u:number,y:number,v:number)=>[bridge.x+Math.cos(bridge.yaw)*u+Math.sin(bridge.yaw)*v,y,bridge.z-Math.sin(bridge.yaw)*u+Math.cos(bridge.yaw)*v];
  // Closed curved spandrel: shared arch profile, not hovering horizontal bars.
  const positions:number[]=[],indices:number[]=[],uvs:number[]=[],count=40,top=bridgeBase+14;
  for(let i=0;i<=count;i++){const u=-14+28*i/count,bottom=bridgeBase+3+9*Math.sqrt(Math.max(0,1-(u/14)**2));for(const [y,v]of [[bottom,-4],[top,-4],[top,4],[bottom,4]]){positions.push(...point(u,y,v));uvs.push(u/4,v/4);}}
  for(let i=1;i<=count;i++)for(let j=0;j<4;j++){const a=(i-1)*4+j,b=(i-1)*4+(j+1)%4,c=i*4+(j+1)%4,d=i*4+j;indices.push(a,b,c,a,c,d);}indices.push(0,2,1,0,3,2,count*4,count*4+1,count*4+2,count*4,count*4+2,count*4+3);
  const arch=this.mesh('supported-arch',positions,indices,uvs,concrete);arch.material!.backFaceCulling=false;
  for(const side of [-1,1]){const u=side*17;let low=Infinity;for(let a=u-3;a<=u+3;a+=1)for(let v=-4;v<=4;v++)low=Math.min(low,this.layout.heightAt(...point(a,0,v).filter((_,i)=>i!==1) as [number,number]));const h=top-low+.15;this.box('bridge-abutment',6,h,8,point(u,low+h/2-.15,0),bridge.yaw,concrete);}
  for(const side of [-1,1])this.box('bridge-parapet',40,1, .3,point(0,top+.5,side*3.85),bridge.yaw,concrete);
  // All posts meet the sampled terrain; rail vertices follow the same road grade.
  for(let i=2;i<spec.path.points.length;i++){const a=spec.path.points[i-1],b=spec.path.points[i],length=Math.hypot(b[0]-a[0],b[1]-a[1]),yaw=Math.atan2(b[0]-a[0],b[1]-a[1]),path:Vector3[]=[];
   for(let j=0,n=Math.ceil(length/3);j<=n;j++){const x=a[0]+(b[0]-a[0])*j/n-Math.cos(yaw)*9,z=a[1]+(b[1]-a[1])*j/n+Math.sin(yaw)*9,y=this.layout.heightAt(x,z);path.push(new Vector3(x,y+1,z));if(j%4===0)this.box('grounded-rail-post',.16,1.15,.16,[x,y+.575,z],yaw,metal);}
   const rail=MeshBuilder.CreateTube('hill-guardrail',{path,radius:.09,tessellation:6,cap:Mesh.CAP_ALL},scene);rail.parent=this.root;rail.material=metal;rail.isPickable=false;
  }
 }
 private mat(name:string,rgb:[number,number,number],url?:string){const m=new PBRMaterial('hill-'+name,this.scene);m.albedoColor.set(...rgb);m.roughness=.88;m.metallic=0;if(url){const t=new Texture(url,this.scene);t.anisotropicFilteringLevel=8;t.wrapU=t.wrapV=Texture.WRAP_ADDRESSMODE;m.albedoTexture=t;this.textures.push(t);}this.materials.push(m);return m;}
 private mesh(name:string,positions:number[],indices:number[],uvs:number[],material:PBRMaterial){const m=new Mesh('hill-'+name,this.scene),vd=new VertexData(),normals:number[]=[];VertexData.ComputeNormals(positions,indices,normals);Object.assign(vd,{positions,indices,uvs,normals});vd.applyToMesh(m);m.parent=this.root;m.material=material;m.receiveShadows=true;m.isPickable=false;return m;}
 private box(name:string,width:number,height:number,depth:number,p:number[],yaw:number,material:PBRMaterial){const m=MeshBuilder.CreateBox('hill-'+name,{width,height,depth},this.scene);m.parent=this.root;m.position.set(p[0],p[1],p[2]);m.rotation.y=yaw;m.material=material;m.receiveShadows=true;m.isPickable=false;return m;}
 attachGround(world:{groundHeight:(x:number,z:number)=>number}){const original=world.groundHeight,wrapped=(x:number,z:number)=>this.floorAt(x,z)??original(x,z);world.groundHeight=wrapped;this.restoreGround=()=>{if(world.groundHeight===wrapped)world.groundHeight=original;};}
 floorAt(x:number,z:number){return this.layout.floorAt(x,z);}
 get drivingNavigationPath(){return this.spec.path.points;}
 vegetationReserved(x:number,z:number,radius=0){return this.layout.vegetationReserved(x,z,radius);}
 drivingFloorAt(x:number,z:number){return this.floorAt(x,z);}
 blocked(x:number,z:number){return this.layout.blocked(x,z);}
 canFinish(_walk:unknown){return true;}
 get goalHeight(){return null;}
 get resetPose(){const [a,b]=this.spec.path.points;return {x:a[0],z:a[1],yaw:Math.atan2(b[0]-a[0],b[1]-a[1]),speed:0,steer:0,distance:0};}
 get meshes():AbstractMesh[]{return this.root.getChildMeshes();}
 dispose(){this.restoreGround?.();this.restoreGround=null;this.root.dispose(false,false);for(const m of this.materials)m.dispose();for(const t of this.textures)t.dispose();}
}
