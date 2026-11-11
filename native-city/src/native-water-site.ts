import {Color3,Mesh,MeshBuilder,PBRMaterial,TransformNode,Vector3,VertexData,type Scene,type AbstractMesh} from '@babylonjs/core';
import type {CityData} from './city-types.ts';
import type {CityRider} from './city-rider.ts';
import {inRing} from './driving.ts';
import {NativeWaterMotion,diveFloor,waterWorld,type NativeWaterSpec} from './native-water-motion.ts';
import {NativeDiveEntranceView} from './native-dive-entrance-view.ts';
import {NativeSwimEffects} from './native-swim-effects.ts';
export class NativeWaterSite extends NativeWaterMotion{
 private entrance:NativeDiveEntranceView|null=null;
 private effects:NativeSwimEffects;
 readonly root:TransformNode;private rider:CityRider|null=null;private materials:PBRMaterial[]=[];private disposed=false;private firstPerson=false;private lookingBehind=false;
 constructor(private scene:Scene,spec:NativeWaterSpec,city:CityData,visibleSea:(x:number,z:number)=>boolean=()=>true){
  super(spec,(x,z)=>visibleSea(x,z)&&!city.land.some(p=>inRing(x,z,p[0])&&!p.slice(1).some(h=>inRing(x,z,h))));
  this.root=new TransformNode('native-water-'+spec.id,scene);
  this.effects=new NativeSwimEffects(scene,spec.waterHeight);for(const m of this.effects.meshes)m.parent=this.root;
  const sand=this.material('seabed',.35,.33,.24),stone=this.material('entrance-stone',.24,.30,.29);
  const mesh=new Mesh('continuous-dive-seabed',scene),data=new VertexData(),positions:number[]=[],indices:number[]=[],colors:number[]=[],normals:number[]=[];
  const cols=40,rows=56;
  for(let j=0;j<=rows;j++)for(let i=0;i<=cols;i++){
   const u=-60+120*i/cols,v=-25+(spec.path.length+65)*j/rows,[x,z]=spec.region?[spec.region.minX+(spec.region.maxX-spec.region.minX)*i/cols,spec.region.minZ+(spec.region.maxZ-spec.region.minZ)*j/rows]:waterWorld(spec,u,v);positions.push(x,diveFloor(spec,x,z),z);
   const shade=.83+.1*Math.sin(u*.31)*Math.sin(v*.43)+.05*Math.cos(u*1.5+v*.7);colors.push(shade,shade,shade,1);
   // Babylon's default ComputeNormals uses left-handed winding.
   if(i<cols&&j<rows){const a=j*(cols+1)+i;indices.push(a,a+1,a+cols+2,a,a+cols+2,a+cols+1);}
  }
  VertexData.ComputeNormals(positions,indices,normals);data.positions=positions;data.indices=indices;data.normals=normals;data.colors=colors;data.applyToMesh(mesh);mesh.parent=this.root;mesh.material=sand;mesh.receiveShadows=true;mesh.isPickable=false;
  const L=spec.path.length,floor=diveFloor(spec,...waterWorld(spec,0,L));
  if(spec.id==='c06-n02')this.entrance=new NativeDiveEntranceView(scene,spec,this.root);
  else if(spec.entrance!==false){
   for(const u of [-2.8,2.8])this.box('entrance-pier',2,4.2,1.2,u,floor+2.1,L,stone);
   this.box('entrance-lintel',7.6,.5,1.2,0,floor+4.45,L,stone);
  }
  // Seabed-bound stones give depth cues without floating scene components.
  for(let i=0;i<25;i++){
   const u=(i%2?1:-1)*(6+(i*7%39)),v=(i*13)%(L+10),[x,z]=waterWorld(spec,u,v),h=.15+(i%4)*.09;
   const rock=MeshBuilder.CreateSphere('seabed-rock',{diameter:1,segments:5},scene);rock.parent=this.root;rock.scaling.set(.7+(i%3)*.3,h,.5);rock.position.set(x,diveFloor(spec,x,z)+h*.22,z);rock.material=stone;rock.isPickable=false;
  }
 }
 private material(name:string,r:number,g:number,b:number){const m=new PBRMaterial('water-task-'+name,this.scene);m.albedoColor=new Color3(r,g,b);m.roughness=.95;m.backFaceCulling=false;this.materials.push(m);return m;}
 private box(name:string,w:number,h:number,d:number,u:number,y:number,v:number,material:PBRMaterial){const m=MeshBuilder.CreateBox(name,{width:w,height:h,depth:d},this.scene),[x,z]=waterWorld(this.spec,u,v);m.parent=this.root;m.position.set(x,y,z);m.rotation.y=Math.atan2(this.spec.path.forward[0],this.spec.path.forward[1]);m.material=material;m.isPickable=false;}
 async load(){const {createCityRider}=await import('./city-rider.ts');const rider=await createCityRider(this.scene,'swim');if(this.disposed){rider.dispose();return;}this.rider=rider;this.syncPose(0);}
 private syncPose(dt:number){this.rider?.setEnabled(!this.firstPerson);this.rider?.setPose({x:this.x,y:this.spec.waterHeight,z:this.z,yaw:this.yaw,speed:Math.hypot(this.speed,this.verticalSpeed),swimDepth:this.depth,swimPitch:-Math.atan2(this.verticalSpeed,Math.max(.6,this.speed))*.35},dt);}
 override step(keys:ReadonlySet<string>,dt:number){if(dt>0)this.lookingBehind=keys.has('KeyC');super.step(keys,dt);this.syncPose(dt);this.effects.update(this.x,this.z,this.depth,this.yaw,this.speed,dt);}
 override reset(){this.lookingBehind=false;super.reset();this.effects?.reset();this.syncPose(0);}
 toggleView(){this.firstPerson=!this.firstPerson;this.syncPose(0);}
 get camera(){
  const f=new Vector3(Math.sin(this.yaw+(this.lookingBehind?Math.PI:0)),0,Math.cos(this.yaw+(this.lookingBehind?Math.PI:0))),target=new Vector3(this.x,this.y+.1,this.z);
  if(this.firstPerson){const eye=target.add(new Vector3(Math.sin(this.yaw)*.6,0,Math.cos(this.yaw)*.6));return {eye,target:eye.add(f).add(new Vector3(0,-Math.sin(this.pitch),0))};}
  const eye=target.subtract(f.scale(3.6*Math.cos(this.pitch)));eye.y+=.6+Math.sin(this.pitch)*3.6;
  if(this.depth>.35)eye.y=Math.min(eye.y,this.spec.waterHeight-.2);
  eye.y=Math.max(diveFloor(this.spec,eye.x,eye.z)+.4,eye.y);
  return {eye,target};
 }
 get meshes():AbstractMesh[]{return [...this.root.getChildMeshes(),...(this.rider?.meshes??[])];}
 diagnostics(){return {depth:this.depth,floor:diveFloor(this.spec,this.x,this.z),canFinish:this.canFinish(),swim:this.rider?.swimPoseStats()};}
 dispose(){this.disposed=true;this.effects.dispose();this.rider?.dispose();this.rider=null;this.entrance?.dispose();this.entrance=null;this.root.dispose(false,false);for(const material of this.materials)material.dispose();}
}
