import {Mesh,MeshBuilder,PBRMaterial,Texture,DynamicTexture,TransformNode,Vector3,Vector4,VertexData,PointLight,LoadAssetContainerAsync,type AssetContainer,type AbstractMesh,type Scene} from '@babylonjs/core';
import '@babylonjs/loaders/glTF';
import {NativeGarageSite} from './native-garage-site.ts';
import {interiorBounds,interiorSolids,insideSolid,interiorVehicleOverlap,interiorNearest,interiorRibbon,interiorFloorPoints,interiorGeometryPoints,type InteriorTask,type InteriorPlacement,type InteriorSolid} from './native-interior-layout.ts';
import {inRing} from './driving.ts';
import type {V2} from './city-types.ts';
import type {ArrivalGate} from './native-task-arrival.ts';
import {INTERIOR_TUNNEL_HALF_WIDTH} from './native-interior-layout.ts';
import {GARAGE_DIVIDER} from './native-garage-approach.ts';
import type {WalkLink} from './native-walk-traversal.ts';
import {WarehouseShutter,WAREHOUSE_SHUTTER,type ShutterActor} from './native-warehouse-shutter.ts';
import {InteriorMission} from './native-interior-mission.ts';
import {InteriorHint,interiorHintCandidate} from './native-interior-hint.ts';
import {WORKSHOP_YAW,workshopPoint,STORE_LAYOUT,STORE_STAIRS,storeStepHeight} from './native-interior-video-layout.ts';
import {STORE_VESTIBULE,WORKSHOP_REAR_LIMIT,interiorRoofSteps} from './native-interior-enclosure.ts';
import {nativeInteriorMap} from './native-interior-map.ts';
import {mapBox,moveInteriorPlan,type InteriorMinimapPlan} from './interior-minimap.ts';
import {extraInteriorLayout,extraFloorAt,extraBodyBlocked,extraMapPlan,EXTRA_SIGN_WIDTH,EXTRA_SIGN_HEIGHT,type ExtraLayout} from './native-extra-layout.ts';
import {InteriorPushDoor,interiorPushDoorSpecs,type PushDoorActor} from './native-interior-doors.ts';
import {InteriorSolidIndex} from './interior-solid-index.ts';

/** Task-owned native-city interiors. Geometry and collision use the same metre coordinates.
 * All ten tasks share lifecycle, not a shared generic corridor: each theme builds its own layout. */
export class NativeInteriorSite{
 readonly root:TransformNode;readonly links:WalkLink[]=[];readonly traversalClear=null;
 readonly solids:InteriorSolid[];readonly points:V2[];private materials:PBRMaterial[]=[];private textures:Texture[]=[];
 private solidIndex:InteriorSolidIndex;
 private lights:PointLight[]=[];private containers:AssetContainer[]=[];private garage:NativeGarageSite|null=null;
 private restoreGround:(()=>void)|null=null;private disposed=false;private ceilings:AbstractMesh[]=[];
 readonly shutter:WarehouseShutter|null;private shutterMesh:Mesh|null=null;private shutterVertices:Float32Array|null=null;
 readonly mission:InteriorMission;private cash:Mesh[]=[];private safeDoor:TransformNode|null=null;
 readonly interactionHint=new InteriorHint();
 readonly pushDoors:InteriorPushDoor[]=[];private doorViews:{door:InteriorPushDoor;mesh:Mesh;index:number}[]=[];
 private minimapPlan:InteriorMinimapPlan|null=null;
 readonly extra:ExtraLayout|undefined;private activeFloorY=0;
 private ribbon;private long:boolean;private wall:PBRMaterial;private floor:PBRMaterial;private metal:PBRMaterial;private wood:PBRMaterial;private glow:PBRMaterial;
 constructor(private scene:Scene,readonly spec:InteriorTask,readonly placement:InteriorPlacement,private terrain:(x:number,z:number)=>number,trainingLayout?:ExtraLayout){
  this.extra=trainingLayout??extraInteriorLayout(spec.id);
  if(placement.rotation){const c=Math.cos(placement.rotation),s=Math.sin(placement.rotation);spec=this.spec={...spec,points:spec.points.map(([x,z])=>[c*x+s*z,-s*x+c*z])};}
  this.mission=new InteriorMission(spec.id,placement);
  this.shutter=['c09-n03','c09-n01'].includes(spec.id)?new WarehouseShutter(placement):null;
  this.root=new TransformNode('native-interior-'+spec.id,scene);this.root.position.set(placement.x,placement.y,placement.z);
  this.points=spec.points.map(p=>[p[0]+placement.x,p[1]+placement.z]);this.solids=trainingLayout?.solids??interiorSolids(spec);this.solidIndex=new InteriorSolidIndex(this.solids);
  this.long=spec.theme==='parking'||spec.theme==='tunnel';this.ribbon=interiorRibbon(interiorGeometryPoints(interiorFloorPoints(spec.points)),10);
  this.wall=this.mat('wall',[.67,.66,.60],'painted_plaster_wall');this.floor=this.mat('floor',[.60,.60,.56],'concrete_floor_02');
  this.metal=this.mat('steel',[.21,.24,.25]);this.metal.metallic=.7;this.metal.roughness=.4;
  this.wood=this.mat('wood',[.58,.40,.22],'oak_veneer_01');this.glow=this.mat('lamp',[.95,.91,.77]);this.glow.emissiveColor.set(.9,.82,.6);
  if(this.long)this.buildLong();else this.buildRooms();
  this.buildPushDoors();
  this.update({x:this.points[0][0],z:this.points[0][1]});
 }
 private mat(name:string,rgb:[number,number,number],asset?:string){
  const m=new PBRMaterial('interior-'+name,this.scene);m.albedoColor.set(...rgb);m.roughness=.82;m.metallic=0;m.maxSimultaneousLights=6;
  if(asset){const texture=(suffix:string)=>{const t=new Texture('/assets/interiors/native-materials/'+asset+'_'+suffix+'.webp',this.scene);t.anisotropicFilteringLevel=8;t.wrapU=t.wrapV=Texture.WRAP_ADDRESSMODE;this.textures.push(t);return t;};m.albedoTexture=texture('diff');m.bumpTexture=texture('nor_gl');m.bumpTexture.level=.45;m.bumpTexture.gammaSpace=false;}
  this.materials.push(m);return m;
 }
 private box(name:string,w:number,h:number,d:number,x:number,y:number,z:number,mat=this.wall,yaw=0){
  const faceUV=[new Vector4(0,0,w/2,h/2),new Vector4(0,0,w/2,h/2),new Vector4(0,0,d/2,h/2),new Vector4(0,0,d/2,h/2),new Vector4(0,0,w/2,d/2),new Vector4(0,0,w/2,d/2)];
  const mesh=MeshBuilder.CreateBox('interior-'+name,{width:w,height:h,depth:d,faceUV},this.scene);
  // Face order differs between mesh builders; derive metre UVs from each
  // face's normal rather than stretching a thin wall's thickness over its side.
  const p=mesh.getVerticesData('position')!,n=mesh.getVerticesData('normal')!,uv=[];
  for(let i=0;i<p.length;i+=3)uv.push((Math.abs(n[i])>.5?p[i+2]:p[i])/2,(Math.abs(n[i+1])>.5?p[i+2]:p[i+1])/2);mesh.setVerticesData('uv',uv);
  mesh.parent=this.root;mesh.position.set(x,y,z);mesh.rotation.y=yaw;mesh.material=mat;mesh.receiveShadows=true;mesh.isPickable=false;return mesh;
 }
 private tube(name:string,points:Vector3[],radius:number,mat=this.metal){const m=MeshBuilder.CreateTube('interior-'+name,{path:points,radius,tessellation:8,cap:Mesh.CAP_ALL},this.scene);m.parent=this.root;m.material=mat;m.receiveShadows=true;m.isPickable=false;return m;}
 private buildPushDoors(){
  for(const spec of interiorPushDoorSpecs(this.spec,this.extra)){
   const door=new InteriorPushDoor(spec);this.pushDoors.push(door);
   const c=Math.cos(spec.yaw),s=Math.sin(spec.yaw);
   if(!this.extra){for(const side of [-1,1])this.box(spec.name+'-jamb',.08,spec.h+.08,.22,spec.x+c*side*spec.w/2,spec.y+spec.h/2,spec.z-s*side*spec.w/2,this.metal,spec.yaw);
    this.box(spec.name+'-header',spec.w+.08,.10,.22,spec.x,spec.y+spec.h+.04,spec.z,this.metal,spec.yaw);}
   for(const [index,leaf] of door.leaves.entries()){
    const mesh=this.box(leaf.name,leaf.w,leaf.h,leaf.d,leaf.x,(leaf.y??0)+leaf.h/2,leaf.z,this.wood,leaf.yaw);this.doorViews.push({door,mesh,index});
    for(const face of [-1,1]){const handle=this.box(spec.name+'-handle',.15,.045,.07,(index?-.34:.34)*leaf.w,1.02-leaf.h/2,face*(leaf.d/2+.035),this.metal);handle.parent=mesh;}
    const kick=this.box(spec.name+'-kickplate',leaf.w-.08,.22,.012,0,-leaf.h/2+.16,-leaf.d/2-.009,this.metal);kick.parent=mesh;
   }
  }
 }
 get doorSnapshot(){return this.pushDoors.map(d=>d.snapshot);}
 private doorsBlocked(x:number,z:number,y:number,pad=.24,height=1.65){return this.pushDoors.some(d=>d.blocked(x,z,y,pad,height));}
 private mapDoors(){return this.pushDoors.flatMap(d=>d.leaves).filter(s=>(s.y??0)<this.activeFloorY+1.8&&(s.y??0)+s.h>this.activeFloorY+.1).map(s=>mapBox(s.x+this.placement.x,s.z+this.placement.z,s.w,s.d,s.yaw));}
 private light(x:number,y:number,z:number,warm=false){
  const p=new PointLight('interior-light',new Vector3(x+this.placement.x,y+this.placement.y,z+this.placement.z),this.scene);p.diffuse.set(warm?1:.91,warm?.67:.95,warm?.32:1);p.intensity=28;p.range=warm?25:18;this.lights.push(p);
 }
 private fixture(x:number,y:number,z:number,yaw=0,warm=false){this.box('lamp-housing',1.25,.13,.38,x,y,z,this.metal,yaw);this.box('lamp-diffuser',1.1,.035,.29,x,y-.075,z,this.glow,yaw);this.light(x,y-.16,z,warm);}
 private foundation(){
  const b=this.extra?.bounds??interiorBounds(this.spec);let low=this.placement.y;
  for(let x=b.minX;x<=b.maxX;x+=3)for(let z=b.minZ;z<=b.maxZ;z+=3)low=Math.min(low,this.terrain(x+this.placement.x,z+this.placement.z));
  const depth=this.placement.y-low+.2;
  const top=this.extra?-.025:0; // Imported floors own y=0; avoid coplanar foundation shimmer.
  this.box('grounded-foundation',b.maxX-b.minX,depth+top,b.maxZ-b.minZ,(b.minX+b.maxX)/2,(top-depth)/2,(b.minZ+b.maxZ)/2,this.floor);
 }
 private buildRooms(){
  this.foundation();
  if(this.extra){this.buildExtra();return;}
  const glass=this.mat('glass',[.35,.52,.56]);glass.alpha=.25;glass.metallic=.12;glass.roughness=.1;glass.backFaceCulling=false;
  for(const s of this.solids){const material=s.material==='glass'?glass:s.material==='wood'?this.wood:s.material==='metal'?this.metal:this.wall;
   this.box(s.name,s.w,s.h,s.d,s.x,s.h/2,s.z,material,s.yaw??0);
   if(s.material==='wall'){this.box(s.name+'-skirting',s.w+.018,.19,s.d+.018,s.x,.095,s.z,this.metal,s.yaw??0);}
  }
  if(this.spec.theme==='bank')this.buildBank();
  else if(this.spec.theme==='garage'){
   // Imported garage has its own actual walls, floor, cabinets and doorway holes.
   const p=this.placement;this.garage=new NativeGarageSite(this.scene,{origin:[p.x,p.z],baseY:p.y,yaw:0,door:[p.x-6.22,p.z-1.925],approach:[p.x-10,p.z-1.925],goal:this.points.at(-1)!,originalGoal:this.points[0]});
   // Continuous threshold ramp meets the GLB tile at y=.157 without a step or floating road overlay.
   this.ribbonMesh('garage-threshold',[[new Vector3(-10,0,-5.5),new Vector3(-6.15,.157,-5.5)],[new Vector3(-10,0,1.6),new Vector3(-6.15,.157,1.6)]],this.floor);
   const brick=this.mat('driveway-brick',[.69,.53,.42],'brick_wall_001');
   for(const mesh of this.root.getChildMeshes())if(mesh.name.startsWith('interior-garage-yard-')||mesh.name==='interior-'+GARAGE_DIVIDER.name)mesh.material=brick;
   const g=GARAGE_DIVIDER,soil=this.mat('garden-soil',[.19,.23,.10]);
   this.box('courtyard-planter-infill',g.w-.28,.035,g.d-.28,g.x,g.h+.0175,g.z,soil);
   // Low planted surface stays below sightlines and is supported by the solid base.
   const hedge=this.mat('courtyard-hedge',[.13,.27,.075]);
   this.box('courtyard-planted-bed',g.w-.6,.18,g.d-.6,g.x,g.h+.125,g.z,hedge);
   for(const x of [3.79,5.69])this.box('closed-service-door-frame',.10,3.1,.12,x,1.55,2.23,this.metal);
   this.box('closed-service-door-lintel',2,.10,.12,4.74,3.05,2.23,this.metal);
   this.box('closed-service-door-handle',.22,.055,.10,5.32,1.05,2.20,this.metal);
  }else if(this.spec.theme==='workshop')this.buildWorkshop();else this.buildBusiness();
 }
 private buildBank(){
  for(const s of interiorRoofSteps(this.spec,this.solids))this.box(s.name,s.w,s.h,s.d,s.x,(s.y??0)+s.h/2,s.z,this.wall);
  const brick=this.mat('bank-brick',[.49,.43,.36],'brick_wall_001');
  const alarm=this.mat('bank-alarm',[.7,.025,.012]);alarm.emissiveColor.set(.85,.015,.005);
  for(const [x,z] of [[10.42,-4],[.92,10],[10.42,17.5]]){
   this.box('alarm-wall-base',.15,.38,.32,x,2.65,z,this.metal);
   this.box('alarm-red-lens',.18,.18,.19,x-.05,2.68,z,alarm);
   const lamp=new PointLight('bank-alarm-light',new Vector3(x+this.placement.x-.2,2.65+this.placement.y,z+this.placement.z),this.scene);lamp.diffuse.set(1,.035,.01);lamp.intensity=5;lamp.range=10;this.lights.push(lamp);
  }
  for(const s of this.solids.filter(s=>s.material==='cage')){
   this.root.getChildMeshes().find(m=>m.name==='interior-'+s.name)?.setEnabled(false);
   for(let z=s.z-s.d/2;z<=s.z+s.d/2+.01;z+=.28)this.box('cash-cage-bar',.07,s.h,.05,s.x,s.h/2,z,this.metal);
   for(const y of [.12,1.5,3.1])this.box('cash-cage-rail',.09,.07,s.d,s.x,y,s.z,this.metal);
  }
  this.box('cash-cage-entry-header',.12,.18,2.8,-10.5,3.15,5.8,this.metal);
  // Two distinct rooms replace the former single straight security corridor.
  const securityTile=this.mat('security-tile',[.46,.51,.51],'floor_tiles_06');securityTile.zOffset=-1;
  this.box('security-room-floor',14.1,.006,5.04,3.55,-.003,-7.02,securityTile);
  this.box('security-monitor',.18,.55,.65,-1.7,1.14,-5.15,this.metal);
  this.box('security-monitor-screen',.02,.38,.48,-1.59,1.14,-5.15,this.glow);
  for(let y=.3;y<2.2;y+=.45)this.box('equipment-rack-shelf',.95,.06,2.3,9.85,y,-2.1,this.metal);
  this.box('equipment-door-header',2.65,.20,.30,8,2.9,-4.5,this.metal);
  for(const x of [6.77,9.23])this.box('equipment-door-frame',.10,2.85,.32,x,1.425,-4.5,this.metal);
  for(const r of this.spec.rooms??[]){
   const h=r.id==='warehouse'?4.6:3.5,x=(r.minX+r.maxX)/2,z=(r.minZ+r.maxZ)/2,w=r.maxX-r.minX,d=r.maxZ-r.minZ;
   this.ceilings.push(this.box(r.id+'-ceiling',w,.20,d,x,h+.1,z,this.wall));
   if(w>2){this.fixture(x,h-.18,z);for(let at=r.minZ+1;at<r.maxZ;at+=3)this.box('supported-ceiling-beam',w,.18,.13,x,h-.11,at,this.metal);}
   if(r.id==='security-corridor'){
    this.tube('wall-conduit',[new Vector3(r.minX+.16,2.8,r.minZ+.3),new Vector3(r.minX+.16,2.8,r.maxZ-.3)],.055);
    this.light(x,2.8,r.minZ+4,true);
   }
   if(r.id==='vault'){
    // Safe-deposit drawers are attached to the far wall, not hovering across the passage.
    for(let row=0;row<6;row++)for(let col=0;col<8;col++){
     this.box('deposit-drawer',.12,.30,1.0,r.minX+.23,.4+row*.36,r.minZ+.8+col*1.25,this.metal);
     this.box('deposit-handle',.08,.025,.23,r.minX+.32,.4+row*.36,r.minZ+.8+col*1.25,this.glow);
    }
    for(const z of [4.18,7.4])this.box('vault-steel-jamb',.46,3.3,.23,-5,1.65,z,this.metal);
    this.box('vault-lintel',.46,.26,3.45,-5,3.18,5.8,this.metal);
   }
  }
  // The warehouse's raised shutter is wound inside a supported headbox.
  if(this.shutter){this.box('shutter-supported-lintel',.4,.25,5.2,10.6,4.475,6.44);}
  else{this.box('shutter-headbox',.8,.75,5.15,10.6,4.2,6.44,this.metal);
   this.tube('shutter-coil',[new Vector3(10.5,3.96,3.97),new Vector3(10.5,3.96,8.89)],.32,this.metal);
   for(const z of [3.9,8.98])this.box('shutter-guide',.20,4.2,.12,10.46,2.1,z,this.metal);}
  for(const p of this.spec.props??[])if(p.kind==='crate'){
   for(const z of [p.z-p.depth/2-.016,p.z+p.depth/2+.016])for(const side of [-1,1])this.box('crate-brace',.10,p.height,.045,p.x+side*p.width*.35,p.height/2,z,brick);
  }else if(p.kind==='cash'){
   const money=this.mat('cash',[.40,.47,.31]);for(let i=0;i<6;i++)this.box('cash-bundle',.25,.11,.42,p.x+(i%2-.5)*.36,p.height+.055,p.z+(Math.floor(i/2)-1)*.48,money);
  }
  // Office and vault leaves are built by the shared push-door controller.
  // Source 226–230s: exit leads into a roofed loading bay, not an empty pad.
  this.ceilings.push(this.box('loading-bay-supported-roof',7.4,.22,7.2,14.25,4.41,6.45,this.metal));
  const yellow=this.mat('loading-yellow',[.65,.47,.08]);
  for(const z of [2.95,9.95]){
   this.box('loading-column-bumper',.49,.9,.59,16.7,.45,z,yellow);
   for(const y of [.22,.52,.82])this.box('loading-column-stripe',.5,.1,.60,16.7,y,z,this.metal);
   for(let x=11;x<17.8;x+=.45)this.box('loading-wall-rib',.06,4.1,.26,x,2.05,z,this.metal);
  }
  for(const x of [12.4,16.2]){this.box('loading-roof-crossbeam',.20,.22,7,x,4.2,6.45,this.metal);this.fixture(x,4,6.45,Math.PI/2);}
  this.box('loading-freight-crate',1.4,1.25,1.1,13.3,.625,8.65,this.wood);
  this.solids.push({name:'loading-freight-crate',x:13.3,z:8.65,w:1.4,d:1.1,h:1.25});
  for(const z of [8.08,9.22])for(const x of [12.8,13.8])this.box('loading-crate-brace',.1,1.25,.035,x,.625,z,this.wood);
  this.tube('loading-ceiling-pipe',[new Vector3(10.9,4.04,3.4),new Vector3(17.7,4.04,3.4)],.06);
  for(const x of [11.2,14.2,17.2])this.tube('loading-pipe-hanger',[new Vector3(x,4.04,3.4),new Vector3(x,4.3,3.4)],.025);
  if(this.spec.id==='c09-n01'){
   // Wall-side safe, with a real hinged door and removable bundles. Clear of
   // both the incoming and return route; the interaction point is in front.
   this.box('cash-safe-back',.10,1.65,1.5,-14.95,.825,7.6,this.metal);
   for(const z of [6.9,8.3])this.box('cash-safe-side',.9,1.65,.10,-14.55,.825,z,this.metal);
   for(const y of [.05,1.6])this.box('cash-safe-shelf',.9,.10,1.5,-14.55,y,7.6,this.metal);
   this.solids.push({name:'cash-safe-body',x:-14.55,z:7.6,w:.9,d:1.5,h:1.65});
   this.safeDoor=new TransformNode('cash-safe-hinge',this.scene);this.safeDoor.parent=this.root;this.safeDoor.position.set(-14.06,0,8.35);
   const door=this.box('cash-safe-door',.09,1.5,1.5,0,.82,-.75,this.metal);door.parent=this.safeDoor;
   const handle=MeshBuilder.CreateTorus('interior-safe-handle',{diameter:.35,thickness:.045,tessellation:20},this.scene);handle.parent=this.safeDoor;handle.position.set(.09,.85,-.8);handle.rotation.z=Math.PI/2;handle.material=this.metal;
   const label=new DynamicTexture('cash-safe-label',{width:512,height:128},this.scene,false);this.textures.push(label);
   label.drawText('CASH',null,86,'bold 72px sans-serif','#eeeeee','#1b2225',true);
   const labelMat=this.mat('cash-safe-label',[1,1,1]);labelMat.albedoTexture=label;labelMat.emissiveTexture=label;labelMat.emissiveColor.set(.45,.45,.45);labelMat.backFaceCulling=false;
   const plate=MeshBuilder.CreatePlane('interior-safe-label',{width:1.12,height:.28},this.scene);plate.parent=this.safeDoor;plate.position.set(.095,1.3,-.75);plate.rotation.y=-Math.PI/2;plate.material=labelMat;
   const money=this.mat('safe-money',[.42,.5,.32]);for(let i=0;i<4;i++)this.cash.push(this.box('safe-cash',.45,.12,.25,-14.5,.48+Math.floor(i/2)*.13,7.4+i%2*.32,money));
  }
 }
 private buildExtra(){
  const e=this.extra!,tile=this.mat('reference-tile',[.53,.56,.52],'floor_tiles_06');
  if(e.steps)this.wall.albedoColor.set(.40,.49,.36);
  else if(e.id==='c09-n07')this.wall.albedoColor.set(.82,.86,.80);
  const trim=this.mat('reference-trim',e.steps?[.25,.29,.21]:[.24,.34,.32]);
  for(const s of [...e.floors,...e.steps??[]])this.box(s.name,s.w,s.h,s.d,s.x,s.y+s.h/2,s.z,s.material==='wood'?this.wood:tile,s.yaw??0);
  // Upstairs floor finish must not also appear as checkerboard ceiling below.
  for(const s of e.floors.filter(s=>s.y>0))this.box(s.name+'-soffit',s.w,.02,s.d,s.x,s.y-.01,s.z,this.wall,s.yaw??0);
  for(const s of e.solids){
   this.box(s.name,s.w,s.h,s.d,s.x,s.y+s.h/2,s.z,s.material==='wall'?this.wall:s.material==='door'||s.material==='wood'?this.wood:this.metal,s.yaw??0);
   if(s.material==='wall')this.box(s.name+'-skirting',s.w+.018,.18,s.d+.018,s.x,s.y+.09,s.z,trim,s.yaw??0);
   if(s.name.startsWith('queue-rail'))for(const side of [-1,1])this.box('queue-post',.08,s.y+s.h,.08,s.x+(s.w>s.d?side*s.w/2:0),(s.y+s.h)/2,s.z+(s.d>s.w?side*s.d/2:0),this.metal);
  }
  for(const s of e.ceilings)this.ceilings.push(this.box(s.name,s.w,s.h,s.d,s.x,s.y+s.h/2,s.z,this.wall));
  for(const d of e.doors){
   const c=Math.cos(d.yaw??0),s=Math.sin(d.yaw??0),at=(u:number,v:number)=>[d.x+c*u+s*v,d.z-s*u+c*v];
   for(const u of [-d.w/2,d.w/2]){const [x,z]=at(u,0);this.box(d.name+'-jamb',.10,d.h,.28,x,d.y+d.h/2,z,this.metal,d.yaw??0);}
   this.box(d.name+'-header',d.w+.1,.14,.28,d.x,d.y+d.h,d.z,this.metal,d.yaw??0);
   // Real and locked doors share the same closed-leaf presentation below.
  }
  for(const [i,s] of e.signs.entries()){
   const t=new DynamicTexture('interior-sign-'+i,{width:512,height:128},this.scene,false),ctx=t.getContext() as CanvasRenderingContext2D;ctx.fillStyle='#253d34';ctx.fillRect(0,0,512,128);ctx.fillStyle='#eeeece';ctx.font='bold 42px sans-serif';ctx.textAlign='center';ctx.fillText(s.text,256,80,480);t.update();
   const m=this.mat('sign-'+i,[1,1,1]);m.albedoTexture=t;m.emissiveTexture=t;m.emissiveColor.set(.25,.25,.25);this.textures.push(t);
   // A double-sided textured plane mirrors lettering when seen from behind.
   // Two outward-facing surfaces keep English readable from either approach.
   for(const side of [0,1]){
    const yaw=s.yaw+side*Math.PI;
    const sign=MeshBuilder.CreatePlane('reference-sign-'+i+'-'+side,{width:EXTRA_SIGN_WIDTH,height:EXTRA_SIGN_HEIGHT,sideOrientation:Mesh.FRONTSIDE},this.scene);
    sign.parent=this.root;sign.position.set(s.x-Math.sin(yaw)*.003,s.y,s.z-Math.cos(yaw)*.003);sign.rotation.y=yaw;sign.material=m;
   }
   if(e.id==='c09-n07'){
    const top=s.y+EXTRA_SIGN_HEIGHT/2;
    const ceiling=e.ceilings.find(c=>c.y>top&&Math.abs(s.x-c.x)<c.w/2&&Math.abs(s.z-c.z)<c.d/2);
    if(ceiling)for(const u of [-.65,.65])this.box('sign-ceiling-mount-'+i,.03,ceiling.y-top+.01,.03,s.x+Math.cos(s.yaw)*u,(ceiling.y+top)/2,s.z-Math.sin(s.yaw)*u,this.metal);
   }
  }
  // Lights are supported by the ceiling, not floating guidance markers.
  const lights=e.lights.length?e.lights:e.floors.map(s=>({x:s.x,z:s.z,y:3.1}));
  const fixture=(x:number,y:number,z:number)=>{
   this.fixture(x,y,z,0,e.id==='c09-n06');
   const ceiling=[...e.ceilings,...e.floors].filter(s=>s.y>y&&Math.abs(x-s.x)<=s.w/2&&Math.abs(z-s.z)<=s.d/2).sort((a,b)=>a.y-b.y)[0];
   if(ceiling&&ceiling.y>y+.07)for(const dx of [-.4,.4])this.box('lamp-suspension',.035,ceiling.y-y-.06,.035,x+dx,(ceiling.y+y+.06)/2,z,this.metal);
  };
  for(const p of lights)fixture(p.x,p.y,p.z);
  if(e.id==='c09-n07')for(let i=3;i<e.points.length;i+=3){const [x,z]=e.points[i];fixture(x,3.1,z);}
  if(e.steps){
   for(const x of [6.1,8.9])this.tube('wood-stair-handrail',[new Vector3(x,.9,-3),new Vector3(x,4.5,6)],.055,this.wood);
   for(const x of [6.1,8.9])for(let i=0;i<=4;i++)this.box('handrail-wall-bracket',.16,.04,.04,x+(x<7.5?-.05:.05),.9+i*.9,-3+i*2.25,this.metal);
   for(const x of [-8,-4]){this.box('sewing-machine-base',.55,.08,.32,x,4.5,8,this.metal);this.box('sewing-machine-body',.35,.30,.19,x,4.69,8,this.wall);}
  }
 }
 private buildWorkshop(){
  const box=(name:string,u:number,y:number,v:number,w:number,h:number,d:number,mat=this.wall)=>{const [x,z]=workshopPoint(u,v);return this.box(name,w,h,d,x,y,z,mat,WORKSHOP_YAW);};
  const black=this.mat('showroom-black-tile',[.055,.065,.065]),white=this.mat('showroom-white-tile',[.74,.73,.66]);black.roughness=white.roughness=.25;black.zOffset=white.zOffset=-1;
  for(let u=-8;u<8;u++)for(let v=-9;v<0;v++)box('showroom-checker-tile',u+.5,-.003,v+.5,1,.006,1,(u+v)%2?black:white);
  this.ceilings.push(box('workshop-ceiling',0,4.8,0,16,.2,18));
  this.ceilings.push(box('workshop-rear-ceiling',0,4.8,(9+WORKSHOP_REAR_LIMIT)/2,16,.2,WORKSHOP_REAR_LIMIT-9));
  {const [x,z]=workshopPoint(0,11);this.fixture(x,4.35,z,WORKSHOP_YAW);}
  for(const v of [-7,-3,2,6]){box('workshop-supported-beam',0,4.5,v,16,.25,.25,this.metal);for(const u of [-4,4]){const [x,z]=workshopPoint(u,v);this.fixture(x,4.35,z,WORKSHOP_YAW);}}
  for(const v of [0,9]){const w=v===0?7:9;box('workshop-door-header',0,4,v,w,.55,.6,this.metal);for(const u of [-w/2,w/2])box('workshop-door-guide',u,1.8,v,.12,3.6,.2,this.metal);}
  const red=this.mat('workshop-toolbox',[.5,.07,.035]);for(let j=0;j<6;j++)box('tool-drawer',-6.95,.2+j*.15,4,1.03,.12,3.8,red);
  for(let v=2.4;v<6;v+=.8)for(const y of [.55,1.5]){const [x,z]=workshopPoint(7,v);const tire=MeshBuilder.CreateTorus('interior-rack-tire',{diameter:.62,thickness:.18,tessellation:16},this.scene);tire.parent=this.root;tire.position.set(x,y,z);tire.rotation.x=Math.PI/2;tire.material=this.metal;}
 }
 private buildBusiness(){
  const b=STORE_LAYOUT,s=STORE_STAIRS;
  const tile=this.mat('shop-tile',[.71,.70,.62],'floor_tiles_06');tile.roughness=.55;
  const width=b.maxX-b.minX;
  this.box('shop-tile-floor',width,.008,b.partition-b.front,0,0,(b.front+b.partition)/2,tile);
  // Enclosed entrance vestibule retains the original start and shop doorway.
  const entry=STORE_VESTIBULE;
  this.ceilings.push(this.box('entry-vestibule-ceiling',entry.maxX-entry.minX,.2,entry.maxZ-entry.minZ,0,3.6,(entry.minZ+entry.maxZ)/2));
  this.fixture(0,3.25,-9);
  this.ceilings.push(this.box('shop-ceiling',width,.2,b.rearDoor-b.front,0,3.6,(b.front+b.rearDoor)/2));
  this.ceilings.push(this.box('stairwell-ceiling',2.6,.2,6,1.05,4.8,12.8));
  for(const z of [-4.6,-.2,4.2,7.8])for(const x of [-3.8,3.8])this.fixture(x,3.25,z);
  this.fixture(1.05,4.45,13.7);
  const frame=this.mat('shop-red-door',[.36,.09,.06]),glass=this.mat('shop-door-glass',[.42,.58,.56]);glass.alpha=.25;glass.roughness=.18;glass.backFaceCulling=false;
  // Door panels are closed initially and move with the push-door controller.
  for(const x of [-1.35,1.35]){
   this.box('shop-door-jamb',.12,2.7,.15,x,1.35,b.front,frame);
  }
  this.box('shop-door-header',2.8,.16,.18,0,2.7,b.front,frame);
  this.box('shop-front-header',width,.65,.3,0,3.18,b.front);
  const sign=this.mat('shop-sign',[.21,.32,.22]);this.box('shop-signboard',8,.65,.18,0,3.65,b.front-.2,sign);
  for(const x of [-3.8,3.8]){this.box('shop-awning-support',.12,3.4,.12,x,1.7,b.front-1.4,this.metal);this.solids.push({name:'shop-awning-support',x,z:b.front-1.4,w:.12,d:.12,h:3.4});}
  this.box('shop-supported-awning',9,.12,1.6,0,3.42,b.front-.7,this.metal);
  for(const side of [-1,1])for(let u=1.65;u<b.maxX-.2;u+=.35)this.tube('shop-front-security-bar',[new Vector3(side*u,.25,b.front-.18),new Vector3(side*u,2.8,b.front-.18)],.022);
  const green=this.mat('shelf-green-bottles',[.12,.30,.12]),red=this.mat('shelf-red-goods',[.48,.14,.07]);
  for(const shelf of this.solids.filter(s=>s.name.startsWith('shelf'))){
   this.root.getChildMeshes().find(m=>m.name==='interior-'+shelf.name)?.setEnabled(false);
   for(const x of [shelf.x-shelf.w/2+.05,shelf.x+shelf.w/2-.05])for(const z of [shelf.z-shelf.d/2+.05,shelf.z+shelf.d/2-.05])this.box('shop-shelf-post',.07,shelf.h,.07,x,shelf.h/2,z,this.metal);
   this.box('shop-shelf-backing',shelf.w,shelf.h,.07,shelf.x,shelf.h/2,shelf.z,this.wood);
   for(let y=.15;y<shelf.h-.3;y+=.5){this.box('shop-shelf-board',shelf.w,.06,shelf.d,shelf.x,y,shelf.z,this.metal);
    for(let x=shelf.x-shelf.w/2+.28;x<shelf.x+shelf.w/2-.1;x+=.8)for(let z=shelf.z-shelf.d/2+.23;z<shelf.z+shelf.d/2-.1;z+=.5){
     const bottle=MeshBuilder.CreateCylinder('interior-shop-bottle',{height:.29,diameterBottom:.12,diameterTop:.065,tessellation:8},this.scene);bottle.parent=this.root;bottle.position.set(x,y+.175,z);bottle.material=green;
     this.box('shop-boxed-goods',.28,.23,.26,x+.25,y+.145,z,red);
    }
   }
  }
  const counter=this.solids.find(s=>s.name==='checkout');
  if(counter){this.box('checkout-top',counter.w+.12,.10,counter.d+.12,counter.x,1.10,counter.z,this.wood);this.box('register',.45,.32,.55,counter.x,1.31,counter.z-.5,this.metal);}
  const cart=this.solids.find(s=>s.name==='stock-cart')!;
  for(const x of [cart.x-.7,cart.x,cart.x+.7])this.box('stock-delivery-carton',.6,.45,.48,x,cart.h+.225,cart.z,this.wood);
  // Distinct tiled sales floor / worn back room, with physical door trims.
  this.box('stock-door-header',2.7,.18,.28,.95,2.7,b.partition);
  for(const x of [-.28,2.22])this.box('stock-door-jamb',.09,2.7,.31,x,1.35,b.partition,frame);
  this.box('stair-door-header',2.35,.18,.25,1.05,2.85,b.rearDoor);
  for(const x of [-.04,2.14])this.box('stair-door-jamb',.08,2.8,.26,x,1.4,b.rearDoor,this.wood);
  // Actual stepped geometry and floor sampler share the same dimensions.
  for(let i=0;i<s.count;i++){
   const top=(i+1)*s.rise;
   this.box('store-stair-'+i,s.maxX-s.minX,top,s.tread,(s.minX+s.maxX)/2,top/2,s.startZ+(i+.5)*s.tread,this.floor);
  }
  this.box('store-stair-landing',s.maxX-s.minX,s.count*s.rise,s.landingEnd-s.endZ,1.05,s.count*s.rise/2,(s.endZ+s.landingEnd)/2,this.floor);
  for(const x of [s.minX+.1,s.maxX-.1]){
   this.tube('store-stair-handrail',[new Vector3(x,.94,s.startZ-.3),new Vector3(x,2.84,s.endZ),new Vector3(x,2.84,s.landingEnd-.2)],.035);
   for(const z of [10.3,11.7,13.1,14.8]){const y=z<s.endZ?.94+1.9*(z-(s.startZ-.3))/(s.endZ-(s.startZ-.3)):2.84;this.tube('store-handrail-wall-bracket',[new Vector3(x,y,z),new Vector3(x+(x<1?-.15:.15),y,z)],.025);}
  }
  for(const light of this.lights)light.intensity=12;
 }
 private ribbonMesh(name:string,paths:Vector3[][],mat:PBRMaterial){const m=MeshBuilder.CreateRibbon('interior-'+name,{pathArray:paths,sideOrientation:Mesh.DOUBLESIDE},this.scene);const positions=m.getVerticesData('position')!,uv=[];for(let i=0;i<positions.length;i+=3)uv.push(positions[i]/3,(positions[i+2]+positions[i+1])/3);m.setVerticesData('uv',uv);m.parent=this.root;m.material=mat;m.receiveShadows=true;m.isPickable=false;return m;}
 private buildLong(){
  const tunnel=this.spec.theme==='tunnel',width=tunnel?INTERIOR_TUNNEL_HALF_WIDTH:8.5;
  const shape=interiorGeometryPoints(interiorFloorPoints(this.spec.points)),strip=this.ribbon,edge=interiorRibbon(shape,width),paths=[strip.left,strip.right].map(side=>side.map(([x,z])=>new Vector3(x,0,z)));
  this.ribbonMesh('continuous-road',paths,this.floor);
  if(!tunnel)this.ceilings.push(this.ribbonMesh('parking-continuous-ceiling',[edge.left,edge.right].map(side=>side.map(([x,z])=>new Vector3(x,5.2,z))),this.wall));
  // Close beyond the playable endpoints, leaving 8 m of spawn/braking clearance.
  for(const index of [0,shape.length-1]){
   const a=edge.left[index],b=edge.right[index],h=tunnel?6:5.2;
   const s={name:'enclosure-long-end-'+index,x:(a[0]+b[0])/2,z:(a[1]+b[1])/2,w:.3,d:Math.hypot(b[0]-a[0],b[1]-a[1])+.3,h,yaw:Math.atan2(b[0]-a[0],b[1]-a[1])};
   this.solids.push(s);this.box(s.name,s.w,s.h,s.d,s.x,s.h/2,s.z,this.wall,s.yaw);
  }
  // Footings join the exact same road vertices to native terrain, sealing every side.
  for(const side of [strip.left,strip.right])this.ribbonMesh('ground-connected-road-edge',[side.map(([x,z])=>new Vector3(x,0,z)),side.map(([x,z])=>new Vector3(x,this.terrain(x+this.placement.x,z+this.placement.z)-this.placement.y-.15,z))],this.wall);
  const rock=this.mat('tunnel-rock',[.50,.46,.39],'concrete_floor_02');rock.bumpTexture!.level=.75;
  if(tunnel){
   const p:number[]=[],uv:number[]=[],indices:number[]=[],steps=18;
   let textureDistance=0;
   for(let i=0;i<shape.length;i++){
    if(i)textureDistance+=Math.hypot(shape[i][0]-shape[i-1][0],shape[i][1]-shape[i-1][1]);
    const a=edge.left[i],b=edge.right[i],cx=(a[0]+b[0])/2,cz=(a[1]+b[1])/2,dx=(b[0]-a[0])/(2*width),dz=(b[1]-a[1])/(2*width);
    for(let j=0;j<=steps;j++){const angle=j*Math.PI/steps,s=Math.cos(angle)*width,y=Math.sin(angle)*6+.02;p.push(cx+dx*s,y,cz+dz*s);uv.push(textureDistance/3,angle*width/3);}
    if(i)for(let j=0;j<steps;j++){const a=(i-1)*(steps+1)+j,b=a+steps+1;indices.push(a,b,a+1,a+1,b,b+1);}
   }
   const mesh=new Mesh('interior-continuous-rock-vault',this.scene),v=new VertexData(),normals:number[]=[];VertexData.ComputeNormals(p,indices,normals);Object.assign(v,{positions:p,indices,normals,uvs:uv});v.applyToMesh(mesh);mesh.parent=this.root;rock.backFaceCulling=false;mesh.material=rock;mesh.receiveShadows=true;mesh.isPickable=false;
  }
  let along=0,next=0;
  for(let i=1;i<this.spec.points.length;i++){
   const a=this.spec.points[i-1],b=this.spec.points[i],dx=b[0]-a[0],dz=b[1]-a[1],length=Math.hypot(dx,dz),yaw=Math.atan2(dx,dz);
   for(;next<=along+length;next+=tunnel?18:12){
    const t=(next-along)/(length||1),x=a[0]+dx*t,z=a[1]+dz*t;
    if(tunnel){
     const arch=Array.from({length:25},(_,j)=>{const angle=j*Math.PI/24,u=Math.cos(angle)*width;return new Vector3(x+Math.cos(yaw)*u,Math.sin(angle)*5.96,z-Math.sin(yaw)*u);});
     this.tube('tunnel-supported-arch',arch,.15,this.wall);this.fixture(x,5.65,z,yaw,true);
    }else{
     for(const side of [-1,1]){const u=side*7.3,cx=x+Math.cos(yaw)*u,cz=z-Math.sin(yaw)*u;this.box('parking-column',.65,5.1,.65,cx,2.55,cz);this.box('column-foot',.9,.12,.9,cx,.06,cz,this.metal);this.solids.push({name:'parking-column',x:cx,z:cz,w:.9,d:.9,h:5.1});}
     this.box('parking-crossbeam',17.8,.4,.4,x,4.93,z,this.wall,yaw);this.fixture(x,4.65,z,yaw);
    }
    // Standard physical centre dashes, never task guidance floating in the scene.
    const stripe=this.box('road-marking',.12,.004,tunnel?4:2.5,x,.001,z,this.glow,yaw);stripe.material!.zOffset=-1;
   }
   along+=length;
  }
  for(const side of [edge.left,edge.right]){
   this.tube('continuous-road-curb',side.map(([x,z])=>new Vector3(x,.09,z)),.09,this.wall);
   if(!tunnel)this.ribbonMesh('parking-edge-barrier',[side.map(([x,z])=>new Vector3(x,0,z)),side.map(([x,z])=>new Vector3(x,5.2,z))],this.wall);
   // Collision follows the visible curb/wall segments, not an invisible
   // narrower band, and remains active when approached from outside the pad.
   for(let i=1;i<side.length;i++){const a=side[i-1],b=side[i];this.solids.push({name:'long-side-wall',x:(a[0]+b[0])/2,z:(a[1]+b[1])/2,w:.2,d:Math.hypot(b[0]-a[0],b[1]-a[1])+.03,h:tunnel?6:5.2,yaw:Math.atan2(b[0]-a[0],b[1]-a[1])});}
  }
 }
 async load(){
  if(this.shutter){
   const c=await LoadAssetContainerAsync('/assets/interiors/roller-shutter/polyhaven-rollershutter-door.glb',this.scene);if(this.disposed){c.dispose();return;}this.containers.push(c);c.addAllToScene();
   const frame=new TransformNode('warehouse-shutter-resource',this.scene);frame.parent=this.root;frame.position.set(10.48,0,6.44);frame.rotation.y=Math.PI/2;frame.scaling.set(5.05/1.08,4.35/2.4,1.5);
   for(const m of c.meshes)if(m instanceof Mesh&&m.getTotalVertices()){
    m.parent=frame;m.rotationQuaternion=null;m.rotation.setAll(0);m.scaling.setAll(1);m.position.setAll(0);m.isPickable=false;m.receiveShadows=true;
    if(m.name==='shutter-curtain'){this.shutterMesh=m;this.shutterVertices=Float32Array.from(m.getVerticesData('position')!);m.setVerticesData('position',this.shutterVertices,true);}
   }
   if(!this.shutterMesh)throw Error("Roller shutter asset is missing a movable curtain");this.shutter.ready=true;
  }
  if(this.garage)await this.garage.load();
  if(this.spec.theme==='workshop'){
   const c=await LoadAssetContainerAsync('/assets/task-vehicles/convertible.glb',this.scene);if(this.disposed){c.dispose();return;}this.containers.push(c);c.addAllToScene();
   const parked=new TransformNode('interior-workshop-parked-car',this.scene);for(const n of c.rootNodes)n.parent=parked;
   const bounds=parked.getHierarchyBoundingVectors(true),scale=4.7/(bounds.max.z-bounds.min.z);parked.scaling.setAll(scale);
   parked.position.set(-(bounds.min.x+bounds.max.x)*scale/2,-bounds.min.y*scale,-(bounds.min.z+bounds.max.z)*scale/2);
   const frame=new TransformNode('parked-car-placement',this.scene),[px,pz]=workshopPoint(-4.8,4);frame.parent=this.root;frame.position.set(px,0,pz);frame.rotation.y=WORKSHOP_YAW;parked.parent=frame;
   for(const m of c.meshes){m.receiveShadows=true;m.isPickable=false;}
   this.solids.push({name:'parked-convertible',x:px,z:pz,w:(bounds.max.x-bounds.min.x)*scale,d:4.7,h:(bounds.max.y-bounds.min.y)*scale,yaw:WORKSHOP_YAW});
  }
  // A menu/loading render may have cached the footprint before async props loaded.
  this.minimapPlan=null;
 }
 get meshes(){return [...this.root.getChildMeshes(),...this.garage?.meshes??[]];}
 get interiorMinimap():InteriorMinimapPlan{
  const p=this.placement;
  if(this.extra)return {...moveInteriorPlan(extraMapPlan(this.extra,this.activeFloorY),p.x,p.z),doors:this.mapDoors()};
  const plan=this.minimapPlan??=moveInteriorPlan(nativeInteriorMap(this.spec,this.solids),p.x,p.z);
  const garage=this.garage?.interiorMinimap;
  return {...plan,floors:[...plan.floors,...garage?.floors??[]],walls:[...plan.walls,...garage?.walls??[]],doors:[...this.mapDoors(),...(this.shutter&&!this.shutter.open?[mapBox(p.x+WAREHOUSE_SHUTTER.x,p.z+WAREHOUSE_SHUTTER.z,WAREHOUSE_SHUTTER.width,WAREHOUSE_SHUTTER.depth)]:[])]};
 }
 get navigationPoints():V2[]{return this.mission.localRoute?.map(p=>[p[0]+this.placement.x,p[1]+this.placement.z])??this.points;}
 stepMission(actor:ShutterActor|null|undefined){this.mission.step(actor);if(this.safeDoor)this.safeDoor.rotation.y=this.mission.stage?-Math.PI*.65:0;for(const m of this.cash)m.setEnabled(!this.mission.stage);}
 private local(x:number,z:number):V2{return [x-this.placement.x,z-this.placement.z];}
 private contains(x:number,z:number){if(this.long)return inRing(x,z,this.ribbon.ring);const b=this.extra?.bounds??interiorBounds(this.spec);return x>=b.minX&&x<=b.maxX&&z>=b.minZ&&z<=b.maxZ;}
 floorAt(x:number,z:number){const [u,v]=this.local(x,z);if(!this.contains(u,v))return null;const imported=this.garage?.floorAt(x,z);if(imported!=null)return imported;
  if(this.extra){const h=extraFloorAt(this.extra,u,v,this.activeFloorY+.45);return h===null?null:this.placement.y+h;}
  if(this.spec.theme==='garage'&&u>=-10&&u<=-6.15&&v>=-5.5&&v<=1.6)return this.placement.y+.157*(u+10)/3.85;
  if(this.spec.theme==='store')return this.placement.y+storeStepHeight(u,v);
  return this.placement.y;
 }
 drivingFloorAt(x:number,z:number){return this.floorAt(x,z);}
 walkFloorAt(x:number,z:number,maxY:number){if(!this.extra)return this.floorAt(x,z);const [u,v]=this.local(x,z),h=extraFloorAt(this.extra,u,v,maxY-this.placement.y);return h===null?null:this.placement.y+h;}
 bodyBlocked(x:number,z:number,y:number){const [u,v]=this.local(x,z);if(this.doorsBlocked(u,v,y-this.placement.y,0))return true;if(!this.extra)return this.blocked(x,z);return extraBodyBlocked(this.extra,u,v,y-this.placement.y,0);}
 cameraBlocked(x:number,z:number,y:number){const [u,v]=this.local(x,z);if(this.doorsBlocked(u,v,y-this.placement.y-.09,.15,.18))return true;if(!this.extra)return this.blocked(x,z);return extraBodyBlocked(this.extra,u,v,y-this.placement.y-.09,.15,.18);}
 get resetWalkHeight(){return this.extra?this.placement.y:undefined;}
 blocked(x:number,z:number){const [u,v]=this.local(x,z);
  if(this.doorsBlocked(u,v,this.activeFloorY))return true;
  if(this.extra)return extraBodyBlocked(this.extra,u,v,this.activeFloorY);
  return !!this.shutter&&!this.shutter.open&&insideSolid(this.shutterSolid,u,v)||!!this.garage?.blocked(x,z)||this.solidIndex.query(u,v).some(s=>insideSolid(s,u,v));
 }
 private get shutterSolid(){const s=WAREHOUSE_SHUTTER;return {name:'closed-warehouse-shutter',x:s.x,z:s.z,w:s.width,d:s.depth,h:s.height};}
 interactionPrompt(actor:ShutterActor|null|undefined){return this.mission.coverPrompt(actor)||this.mission.prompt(actor)||this.shutter?.prompt(actor)||this.mission.guidance(actor);}
 encounterHint(actor:ShutterActor|null|undefined,dt:number,enabled:boolean){
  const candidate=interiorHintCandidate(this.mission,this.shutter,actor);
  return this.interactionHint.step(candidate,dt,enabled);
 }
 interact(actor:ShutterActor|null|undefined){return this.mission.interact(actor)||!!this.shutter?.interact(actor);}
 vehicleBlocked(x:number,z:number,yaw:number,width:number,length:number){
  const [u,v]=this.local(x,z);
  if(this.pushDoors.some(d=>d.leaves.some(s=>interiorVehicleOverlap(s,u,v,yaw,width,length))))return true;
  if(this.shutter&&!this.shutter.open&&interiorVehicleOverlap(this.shutterSolid,u,v,yaw,width,length))return true;
  if(this.solidIndex.query(u,v,(width+length)/2+.1).some(s=>interiorVehicleOverlap(s,u,v,yaw,width,length)))return true;
  return this.garage?.vehicleBlocked(x,z,yaw,width,length)??false;
 }
 vegetationReserved(x:number,z:number,radius=0){const [u,v]=this.local(x,z);return this.contains(u,v)||this.long&&interiorNearest(this.spec.points,u,v).distance<12+radius;}
 get goalHeight(){return this.extra?this.placement.y+this.extra.goalY:this.floorAt(...this.points.at(-1)!)!;}
 get arrivalGate():ArrivalGate|undefined{
  if(this.spec.id!=='c01-n03')return undefined;
  const end=this.points.at(-1)!,before=this.points.slice(0,-1).reverse().find(p=>Math.hypot(p[0]-end[0],p[1]-end[1])>1e-6);
  return before?{forward:[end[0]-before[0],end[1]-before[1]],halfWidth:INTERIOR_TUNNEL_HALF_WIDTH-.5,halfDepth:1.5}:undefined;
 }
 canFinish(walk:{active:boolean;feetY:number;airborne:boolean;traversing:boolean;coverCrouched?:boolean;crouchBlend?:number}|null){return this.mission.ready&&(this.spec.id!=='c09-n02'||!!walk?.coverCrouched&&(walk.crouchBlend??0)>=.99)&&(!this.shutter||this.shutter.open)&&(this.spec.mode==='drive'||!!walk?.active&&!walk.airborne&&!walk.traversing&&Math.abs(walk.feetY-this.goalHeight)<(this.spec.theme==='store'?.12:.35));}
 get resetPose(){const [a,b]=this.points;return {x:a[0],z:a[1],yaw:Math.atan2(b[0]-a[0],b[1]-a[1]),speed:0,steer:0,distance:0};}
 get resetWalkPose(){return this.spec.mode==='walk';}
 attachGround(world:{groundHeight:(x:number,z:number)=>number}){const old=world.groundHeight,wrapped=(x:number,z:number)=>this.floorAt(x,z)??old(x,z);world.groundHeight=wrapped;this.restoreGround=()=>{if(world.groundHeight===wrapped)world.groundHeight=old;};}
 update(actor:{x:number;z:number;feetY?:number;yaw?:number;active?:boolean;airborne?:boolean;traversing?:boolean},dt=0,keys:ReadonlySet<string>=new Set()){
  if(actor.feetY!==undefined)this.activeFloorY=actor.feetY-this.placement.y;
  const local:PushDoorActor={...actor,x:actor.x-this.placement.x,z:actor.z-this.placement.z,feetY:(actor.feetY??this.placement.y)-this.placement.y,yaw:actor.yaw??0,active:!!actor.active};
  for(const d of this.pushDoors)d.step(local,keys,dt);
  for(const v of this.doorViews){const leaf=v.door.leaves[v.index];v.mesh.position.set(leaf.x,(leaf.y??0)+leaf.h/2,leaf.z);v.mesh.rotation.y=leaf.yaw!;}
  if(this.shutter){const before=this.shutter.progress;this.shutter.step(dt);if(before!==this.shutter.progress&&this.shutterMesh&&this.shutterVertices){const p=Float32Array.from(this.shutterVertices),t=this.shutter.progress,lift=(t*t*(3-2*t))*2.12;for(let i=1;i<p.length;i+=3)p[i]=Math.min(2.115,p[i]+lift);this.shutterMesh.updateVerticesData('position',p);this.shutterMesh.refreshBoundingInfo({});if(this.shutter.open)this.shutterMesh.setEnabled(false);}}
  const nearby=[...this.lights].sort((a,b)=>Math.hypot(a.position.x-actor.x,a.position.z-actor.z)-Math.hypot(b.position.x-actor.x,b.position.z-actor.z)).slice(0,4);for(const l of this.lights){const enabled=nearby.includes(l);if(l.isEnabled()!==enabled)l.setEnabled(enabled);}}
 dispose(){if(this.disposed)return;this.disposed=true;this.restoreGround?.();this.garage?.dispose();for(const l of this.lights)l.dispose();for(const c of this.containers)c.dispose();this.root.dispose(false,false);for(const m of this.materials)m.dispose();for(const t of this.textures)t.dispose();}
}
