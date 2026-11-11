import {MeshBuilder,PBRMaterial,Color3,TransformNode,PointLight,Vector3,Texture,type Scene,type AbstractMesh} from '@babylonjs/core';
import {garageLocal,garageWorld,type GaragePlacement} from './native-garage-layout.ts';
import {showroomEntered,showroomReserved} from './native-showroom-layout.ts';
import type {V2} from './city-types.ts';
import type {WalkLink} from './native-walk-traversal.ts';
export class NativeShowroomSite{
 readonly root:TransformNode;readonly links:WalkLink[]=[];readonly traversalClear=null;readonly spec={id:'c01-n10'};
 private materials:PBRMaterial[]=[];private glass:AbstractMesh[]=[];private light:PointLight;private restoreGround:(()=>void)|null=null;private texture:Texture;
 broken=false;
 constructor(scene:Scene,readonly placement:GaragePlacement,heightAt:(x:number,z:number)=>number){
  this.root=new TransformNode('native-c01-n10-showroom',scene);this.root.position.set(placement.origin[0],placement.baseY,placement.origin[1]);this.root.rotation.y=placement.yaw;
  const mat=(name:string,r:number,g:number,b:number,metal=0)=>{const m=new PBRMaterial('showroom-'+name,scene);m.albedoColor=new Color3(r,g,b);m.metallic=metal;m.roughness=.38;this.materials.push(m);return m;};
  const stone=mat('stone',.6,.61,.59),floor=mat('tile',.64,.66,.64),steel=mat('aluminium',.15,.18,.2,.7),wood=mat('counter',.22,.11,.055),glass=mat('glass',.35,.62,.72,.2);glass.alpha=.22;glass.roughness=.08;glass.backFaceCulling=false;
  this.texture=new Texture('/city/textures/paving.jpg',scene);this.texture.uScale=this.texture.vScale=5;floor.albedoTexture=this.texture;
  const box=(name:string,w:number,h:number,d:number,x:number,y:number,z:number,m:PBRMaterial)=>{const mesh=MeshBuilder.CreateBox('showroom-'+name,{width:w,height:h,depth:d},scene);mesh.parent=this.root;mesh.position.set(x,y,z);mesh.material=m;mesh.receiveShadows=true;mesh.isPickable=false;return mesh;};
  box('foundation',12.5,.3,12.5,0,-.15,0,floor);
  // Continuous ground-following apron, not a floating rectangular road slab.
  const a=placement.originalGoal,b=placement.door,dx=b[0]-a[0],dz=b[1]-a[1],distance=Math.hypot(dx,dz),steps=Math.max(1,Math.ceil(distance));
  const sides=[-3,3].map(side=>Array.from({length:steps+1},(_,i)=>{const x=a[0]+dx*i/steps-dz*side/distance,z=a[1]+dz*i/steps+dx*side/distance,[u,v]=garageLocal(placement,x,z);return new Vector3(u,heightAt(x,z)+.035-placement.baseY,v);}));
  const apron=MeshBuilder.CreateRibbon('showroom-driveway',{pathArray:sides,sideOrientation:2},scene);apron.parent=this.root;apron.material=floor;apron.receiveShadows=true;apron.isPickable=false;
  box('back-wall',.3,4.6,12.5,6.1,2.3,0,stone);for(const z of [-6.1,6.1])box('side-wall',12.5,4.6,.3,0,2.3,z,stone);
  box('roof',12.7,.3,12.7,0,4.65,0,stone);
  // Wide storefront with a drive-through breakable centre pane.
  for(const z of [-6,-4.9,1.05,3.5,6])box('front-post',.22,4.5,.15,-6.1,2.25,z,steel);
  box('front-header',.25,.25,12.3,-6.1,4.37,0,steel);
  this.glass.push(box('breakable-window',.035,4.15,5.75,-6.12,2.1,-1.925,glass));
  box('display-window',.035,4.15,4.8,-6.12,2.1,3.6,glass);
  box('counter',1.15,1.05,7,4.8,.525,0,wood);box('counter-top',1.3,.10,7.15,4.8,1.1,0,stone);
  for(const z of [-3,0,3]){const m=mat('ceiling-light-'+z,1,.93,.78);m.emissiveColor=new Color3(.85,.75,.6);box('ceiling-light',5,.06,.3,0,4.42,z,m);}
  const [x,z]=garageWorld(placement,0,0);this.light=new PointLight('showroom-interior-light',new Vector3(x,placement.baseY+3.8,z),scene);this.light.intensity=18;this.light.range=16;this.light.includedOnlyMeshes=this.meshes;
 }
 get meshes(){return this.root.getChildMeshes();}
 vegetationReserved(x:number,z:number,radius=0){return showroomReserved(this.placement,x,z,radius);}
 floorAt(x:number,z:number){const [u,v]=garageLocal(this.placement,x,z);return Math.abs(u)<6.25&&Math.abs(v)<6.25?this.placement.baseY:null;}
 drivingFloorAt(x:number,z:number){return this.floorAt(x,z);}
 get goalHeight(){return this.placement.baseY;}
 attachGround(world:{groundHeight:(x:number,z:number)=>number}){const original=world.groundHeight,wrapped=(x:number,z:number)=>this.floorAt(x,z)??original(x,z);world.groundHeight=wrapped;this.restoreGround=()=>{if(world.groundHeight===wrapped)world.groundHeight=original;};}
 blocked(x:number,z:number){const [u,v]=garageLocal(this.placement,x,z);if(Math.abs(u)>6.5||Math.abs(v)>6.5)return false;return Math.abs(v)>5.85||u>4.1||u< -5.9&&(v< -4.75||v>.9);}
 update(car:{x:number;z:number},driving:boolean){const [u,v]=garageLocal(this.placement,car.x,car.z);if(driving&&!this.broken&&u> -8.8&&u< -3&&Math.abs(v+1.925)<2.3){this.broken=true;for(const m of this.glass)m.setEnabled(false);}}
 canFinish(_walk:unknown){return false;}
 canDriveFinish(car:{x:number;z:number;yaw:number},driving:boolean,previous:V2=[car.x,car.z]){
  if(!driving||!showroomEntered(this.placement,previous,[car.x,car.z]))return false;
  // A fast crossing can skip update()'s narrow glass proximity interval.
  this.broken=true;for(const mesh of this.glass)mesh.setEnabled(false);
  return true;
 }
 dispose(){this.restoreGround?.();this.light.dispose();this.root.dispose(false,false);this.texture.dispose();for(const m of this.materials)m.dispose();}
}
