import {MeshBuilder,PBRMaterial,Color3,TransformNode,type Scene,type AbstractMesh} from '@babylonjs/core';
import {NativeWalkVehicles} from './native-walk-vehicles.ts';
import {pickupWorld,pickupLocal,pickupFloor,hoodHeight,type PickupClimbLayout} from './native-pickup-climb-layout.ts';
import type {V2} from './city-types.ts';
import type {WalkLink,WalkPoint} from './native-walk-traversal.ts';
type Host={scene:Scene;groundHeight:(x:number,z:number)=>number;collision:{blocked:(x:number,z:number)=>boolean}};
/** Owned, grounded climb site. The existing city and its buildings stay intact. */
export class NativePickupClimbSite{
 readonly root:TransformNode;readonly links:WalkLink[];readonly requiredLinks=['pickup-hood','pickup-roof'];
 readonly spec:{id:string;path:{points:V2[];length:number}};
 private vehicles:NativeWalkVehicles;private materials:PBRMaterial[]=[];
 constructor(private host:Host,readonly layout:PickupClimbLayout,points:V2[]){
  this.root=new TransformNode('native-c07-n01-pickup-climb',host.scene);
  this.spec={id:'c07-n01',path:{points,length:points.slice(1).reduce((n,b,i)=>n+Math.hypot(b[0]-points[i][0],b[1]-points[i][1]),0)}};
  this.links=layout.links.flatMap(l=>[l,{...l,id:l.id+':reverse',from:l.to,to:l.from}]);
  this.vehicles=new NativeWalkVehicles(this.root,host,()=>false);
  const plaster=this.material('warm-plaster',.63,.58,.48),tile=this.material('clay-roof',.37,.15,.09),edge=this.material('roof-edge',.22,.12,.085),metal=this.material('window-frame',.10,.12,.13),glass=this.material('window-glass',.14,.25,.29);
  glass.metallic=.65;glass.roughness=.15;
  // Solid masonry extends to ground, with a continuous walkable roof slab.
  this.box('annex-walls',5,2.65,4.25,0,1.325,4.975,plaster);
  this.box('continuous-roof-slab',5.2,.13,4.45,0,2.715,4.975,tile);
  // Shallow tile ridges are attached to the slab, not floating slabs/strips.
  for(let u=-2.4;u<=2.4;u+=.3)this.box('tile-ridge',.10,.025,4.3,u,2.785,4.98,tile);
  for(const u of [-2.54,2.54])this.box('eave-edge',.12,.20,4.5,u,2.67,4.98,edge);
  this.box('front-fascia',5.2,.20,.12,0,2.67,2.79,edge);
  this.box('window-bay',5,4.6,2.05,0,2.3,8.13,plaster);
  this.box('upper-roof',5.25,.15,2.3,0,4.675,8.13,tile);
  this.box('window-glazing',1.8,1.25,.045,0,3.68,7.079,glass);
  for(const u of [-.96,0,.96])this.box('window-mullion',.065,1.42,.1,u,3.68,7.03,metal);
  for(const y of [2.97,4.39])this.box('window-frame',2,.07,.1,0,y,7.03,metal);
  this.box('window-sill',2.12,.10,.28,0,2.98,6.98,edge);
  // Grounded foundation conceals the small terrain tolerance below the walls.
  this.box('annex-foundation',5.1,.25,6.45,0,-.10,5.975,edge);
 }
 async load(){await this.vehicles.load('c07-n01',this.spec.path.points,{x:this.layout.x,z:this.layout.z,y:this.layout.y,yaw:this.layout.yaw,width:2.366,depth:5.3});}
 private material(name:string,r:number,g:number,b:number){const m=new PBRMaterial('pickup-climb-'+name,this.host.scene);m.albedoColor=new Color3(r,g,b);m.roughness=.8;this.materials.push(m);return m;}
 private box(name:string,w:number,h:number,d:number,u:number,y:number,v:number,material:PBRMaterial){const m=MeshBuilder.CreateBox('pickup-climb-'+name,{width:w,height:h,depth:d},this.host.scene),[x,z]=pickupWorld(this.layout,u,v);m.parent=this.root;m.position.set(x,this.layout.y+y,z);m.rotation.y=this.layout.yaw;m.material=material;m.isPickable=false;m.receiveShadows=true;}
 get meshes():AbstractMesh[]{return this.root.getChildMeshes();}
 get vehiclePlacements(){return this.vehicles.poses;}
 get goalHeight(){return this.layout.roofY;}
 floorAt(x:number,z:number){return pickupFloor(this.layout,x,z);}
 blocked(x:number,z:number){
  const [u,v]=pickupLocal(this.layout,x,z);
  // Supported tops are traversable; ground movement cannot step up 1.4m/2.8m.
  if(this.floorAt(x,z)!==null)return false;
  return Math.abs(u)<1.43&&Math.abs(v)<2.88||Math.abs(u)<2.78&&v>2.59&&v<9.4;
 }
 traversalClear=(p:WalkPoint,link:WalkLink)=>{
  const [u,v]=pickupLocal(this.layout,p.x,p.z);
  if(this.host.collision.blocked(p.x,p.z))return false;
  if(Math.abs(u)<2.78&&v>7.0&&v<9.4)return p.y>=this.layout.y+4.8;
  if(Math.abs(u)<2.78&&v>2.59&&v<=7.0)return p.y>=this.layout.roofY-.035;
  if(Math.abs(u)<1.43&&Math.abs(v)<2.88){
   // This lane covers the hood only; the tall cab remains solid.
   if(v<1.20)return p.y>=this.layout.y+1.96;
   return p.y>=this.layout.y+hoodHeight(Math.min(2.43,v))-.035;
  }
  return this.links.some(l=>l.id===link.id)||p.y>=this.host.groundHeight(p.x,p.z);
 };
 canFinish(walk:{active:boolean;airborne:boolean;traversing:boolean;feetY:number;x:number;z:number}|null){return !!walk?.active&&!walk.airborne&&!walk.traversing&&Math.abs(walk.feetY-this.goalHeight)<.15&&Math.hypot(walk.x-this.layout.goal[0],walk.z-this.layout.goal[1])<1;}
 dispose(){this.vehicles.dispose();this.root.dispose(false,false);for(const m of this.materials)m.dispose();}
}
