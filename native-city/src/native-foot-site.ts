import {DynamicTexture,MeshBuilder,PBRMaterial,TransformNode,Vector3,type AbstractMesh,type Scene} from '@babylonjs/core';
import {gardenWorld,gardenLocal,GARDEN_SOLIDS,type GardenLayout} from './native-garden-layout.ts';
import {inRing} from './driving.ts';
import type {V2} from './city-types.ts';
import type {WalkLink,WalkPoint} from './native-walk-traversal.ts';
import specs from './native-manual-walks.json';
import {NativeWalkVehicles} from './native-walk-vehicles.ts';
import {WALK_VEHICLES} from './native-walk-vehicle-layout.ts';
import type {WalkLadder} from './city-walk.ts';
import {nativeTaskRoofHeight} from './native-task-roof-height.ts';
import {verifyWalkGoalLandmark,type WalkGoalLandmark} from './walk-goal-landmark.ts';
export type ManualWalk=typeof specs[number];
export type FootSiteSpec=Pick<ManualWalk,'id'|'requirements'>&{path:Pick<ManualWalk['path'],'points'|'length'|'roof'|'building'>;garden?:GardenLayout;goalLandmark?:WalkGoalLandmark};
type Host={scene:Scene;car:TransformNode;groundHeight:(x:number,z:number)=>number;collision:{blocked:(x:number,z:number)=>boolean};walkingSurfaceHeight?:(x:number,z:number)=>number;propBlocked?:(x:number,z:number)=>boolean;walk?:{clear:(x:number,z:number,y:number)=>boolean}|null};
type Solid={x:number;z:number;y:number;w:number;d:number;h:number;yaw:number};
/** Small task-specific additions to the existing city, not a replacement map.
 * Roof/step heights and vehicle placements are native adaptations, not video measurements. */
export class NativeFootSite {
 readonly root:TransformNode;readonly links:WalkLink[]=[];readonly requiredLinks:string[]=[];
 readonly manualLadders:WalkLadder[]=[];
 private solids:Solid[]=[];private materials:PBRMaterial[]=[];
 private textures:DynamicTexture[]=[];
 private floors:{x:number;z:number;w:number;d:number;yaw:number;y:number}[]=[];
 private roofY:number|null=null;
 private vehicles:NativeWalkVehicles|null=null;
 constructor(readonly spec:FootSiteSpec,private host:Host){
  this.root=new TransformNode(`native-foot-${spec.id}`,host.scene);
  if(spec.garden)this.garden(spec.garden);
  const req=spec.requirements,roof=spec.path.roof;
  if(roof&&spec.path.building){
   const e=roof.edge,n=roof.outward,g=host.groundHeight(e[0],e[1]);
   this.roofY=nativeTaskRoofHeight(spec.id,spec.path.building.height,g);
   // Clear the native facade trim. Rungs and the body's climbing axis are
   // deliberately separate; previously both occupied the same vertical plane.
   const standoff=2.15,bodyOffset=.48,yaw=Math.atan2(-n[0],-n[1]);
   const plane={x:e[0]+n[0]*standoff,y:this.base(e[0]+n[0]*standoff,e[1]+n[1]*standoff),z:e[1]+n[1]*standoff};
   const from={x:plane.x+n[0]*bodyOffset,y:this.base(plane.x+n[0]*bodyOffset,plane.z+n[1]*bodyOffset),z:plane.z+n[1]*bodyOffset},to={x:e[0]-n[0]*2,y:this.roofY,z:e[1]-n[1]*2};
   const steel=this.mat('ladder-steel',.43,.46,.45,.6),height=this.roofY-g;
   for(const side of [-.43,.43]){
    this.box('ladder-rail',.075,height+1.05,.075,plane.x+Math.cos(yaw)*side,g+(height+1.05)/2,plane.z-Math.sin(yaw)*side,yaw,steel);
    this.box('ladder-foot-plate',.24,.08,.28,plane.x+Math.cos(yaw)*side,g+.04,plane.z-Math.sin(yaw)*side,yaw,steel);
   }
   const lastRungY=g+Math.floor(height/.3)*.3;
   for(let h=.3;g+h<=lastRungY+.001;h+=.3)this.box('ladder-rung',.88,.055,.09,plane.x,g+h,plane.z,yaw,steel);
   for(let h=.45;h<height;h+=1.4)for(const side of [-.43,.43])this.box('ladder-wall-bracket',.08,.10,standoff+.06,e[0]+n[0]*standoff/2+Math.cos(yaw)*side,g+h,e[1]+n[1]*standoff/2-Math.sin(yaw)*side,yaw,steel);
   // A supported top bridge replaces the old unsupported horizontal slide.
   const depth=standoff+.55,cx=e[0]+n[0]*(standoff-.55)/2,cz=e[1]+n[1]*(standoff-.55)/2;
   this.box('ladder-top-landing',1.12,.12,depth,cx,this.roofY-.06,cz,yaw,steel);
   this.floors.push({x:cx,z:cz,w:1.12,d:depth,yaw,y:this.roofY});
   for(const side of [-.48,.48])this.box('ladder-landing-beam',.1,.24,depth,cx+Math.cos(yaw)*side,this.roofY-.24,cz-Math.sin(yaw)*side,yaw,steel);
   const link:WalkLink={id:'roof-ladder',kind:'ladder',from:roof.at==='start'?to:from,to:roof.at==='start'?from:to,top:this.roofY,duration:height/.70+2.1,
    ladder:{plane,outward:{x:n[0],z:n[1]},bodyOffset,rungSpacing:.3,firstRungY:g+.3,lastRungY,railTopY:this.roofY+.95,landingY:this.roofY}};
   if(spec.id==='c07-n05'){
    // Walk toward the outer landing to automatically bridge the final 0.73 m onto
    // the ladder. Vertical travel uses the same W/S controller as c07-n04.
    this.manualLadders.push({id:'c07-n05-roof-ladder',x:from.x,z:from.z,bottom:from.y,top:this.roofY,yaw,
     exit:{x:plane.x-n[0]*.25,z:plane.z-n[1]*.25}});
   }else this.addLink(link);
  }
  if(req.vault){
   const p=this.at(50),metal=this.mat('railing',.25,.28,.29,.65),y=this.base(p.x,p.z);
   const half=spec.id==='c02-n14'?4:2;
   for(let side=-half;side<=half;side++){
    const x=p.x+Math.cos(p.yaw)*side,z=p.z-Math.sin(p.yaw)*side,ground=host.groundHeight(x,z),height=Math.max(.1,y+1.12-ground);
    this.box('railing-post',.07,height,.07,x,ground+height/2,z,p.yaw,metal);
   }
   for(const h of [.48,1.05])this.box('railing-bar',half*2+.1,.07,.07,p.x,y+h,p.z,p.yaw,metal);
   this.solids.push({x:p.x,z:p.z,y,w:half*2+.1,d:.15,h:1.1,yaw:p.yaw});
   const point=(d:number)=>({x:p.x+Math.sin(p.yaw)*d,z:p.z+Math.cos(p.yaw)*d,y:this.base(p.x+Math.sin(p.yaw)*d,p.z+Math.cos(p.yaw)*d)});
   this.addLink({id:'midpoint-railing',kind:'vault',from:point(-1.15),to:point(1.15),top:y+1.1,duration:1.15,triggerRadius:.6,vaultGrip:{x:p.x,y:y+1.085,z:p.z}});
  }
  if(req.stairs){
   const p=this.at(spec.path.length),stone=this.mat('entry-stone',.49,.48,.43);
   // Four 18cm risers ending at a supported entrance platform.
   for(let i=0;i<4;i++){const distance=-3.8+i*.95,x=p.x+Math.sin(p.yaw)*distance,z=p.z+Math.cos(p.yaw)*distance,y=this.base(x,z),h=(i+1)*.18;
    this.box('entrance-step',3,h,.95,x,y+h/2,z,p.yaw,stone);this.floors.push({x,z,w:3,d:.95,yaw:p.yaw,y:y+h});}
   const y=this.base(p.x,p.z);this.box('entrance-platform',3,.72,1.2,p.x,y+.36,p.z,p.yaw,stone);this.floors.push({x:p.x,z:p.z,w:3,d:1.2,yaw:p.yaw,y:y+.72});
   this.entry(p,1.5,'shop');
   if(spec.id==='c02-n15')this.gunStore(p);
  }
  if(req.warehouse)this.warehouse();
  if(req.entrance)this.entry(this.at(spec.path.length),1.4,'factory');
  if(['c02-n12','c02-n14','c02-n09'].includes(spec.id))this.entry(this.at(spec.path.length),2,'residence');
  // Explicit GLB requests replace the former generic-car/box-bike placeholders.
  if(!WALK_VEHICLES[spec.id]){
   if(req.startVehicle)this.vehicle(req.startVehicle,this.at(0),3.1);
   if(req.endVehicle)this.vehicle(req.endVehicle,this.at(spec.path.length),3.1);
  }
  if(req.policeLine){const p=this.at(45);this.vehicle('police',p,3.8);this.vehicle('police',p,-3.8);}
 }
 async loadVehicles(){
  const landmark=this.spec.goalLandmark;
  if(landmark){
   const height=(x:number,z:number)=>this.host.walkingSurfaceHeight?.(x,z)??this.base(x,z);
   verifyWalkGoalLandmark(landmark,this.spec.path.points as V2[],{height,clear:(x,z)=>this.host.walk?.clear(x,z,height(x,z))??!(this.host.collision.blocked(x,z)||this.host.propBlocked?.(x,z)||this.blocked(x,z))});
  }
  this.vehicles=new NativeWalkVehicles(this.root,this.host,(x,z)=>this.blocked(x,z));
  await this.vehicles.load(this.spec.id,this.spec.path.points as V2[],landmark?.pose,landmark?[{model:landmark.kind,at:1,note:'Generated walking goal landmark; fixed seeded placement, no boarding required'}]:undefined);
 }
 get vehiclePlacements(){return this.vehicles?.poses??[];}
 private mat(name:string,r:number,g:number,b:number,metallic=0){const m=new PBRMaterial(`${this.spec.id}-${name}`,this.host.scene);m.albedoColor.copyFromFloats(r,g,b);m.roughness=metallic?.32:.8;m.metallic=metallic;this.materials.push(m);return m;}
 private box(name:string,w:number,h:number,d:number,x:number,y:number,z:number,yaw:number,m:PBRMaterial,solid=false){
  const mesh=MeshBuilder.CreateBox(`${this.spec.id}-${name}`,{width:w,height:h,depth:d},this.host.scene);mesh.parent=this.root;mesh.position.set(x,y,z);mesh.rotation.y=yaw;mesh.material=m;mesh.receiveShadows=true;mesh.isPickable=false;
  if(solid)this.solids.push({x,z,w,d,h,y:y-h/2,yaw});return mesh;
 }
 private local(s:{x:number;z:number;yaw:number},x:number,z:number){const dx=x-s.x,dz=z-s.z;return [dx*Math.cos(s.yaw)-dz*Math.sin(s.yaw),dx*Math.sin(s.yaw)+dz*Math.cos(s.yaw)];}
 private base(x:number,z:number){return this.host.groundHeight(x,z)+.105;}
 at(distance:number){const ps=this.spec.path.points;let left=distance;for(let i=1;i<ps.length;i++){const a=ps[i-1],b=ps[i],d=Math.hypot(b[0]-a[0],b[1]-a[1]);if(left<=d||i===ps.length-1){const t=Math.min(1,left/d);return {x:a[0]+(b[0]-a[0])*t,z:a[1]+(b[1]-a[1])*t,yaw:Math.atan2(b[0]-a[0],b[1]-a[1])};}left-=d;}throw Error('Empty walking route');}
 private addLink(link:WalkLink){this.links.push(link,{...link,id:`${link.id}:reverse`,from:link.to,to:link.from});this.requiredLinks.push(link.id);}
 floorAt(x:number,z:number):number|null{
  if(this.roofY!==null&&this.spec.path.building&&inRing(x,z,this.spec.path.building.rings[0] as V2[]))return this.roofY;
  let result:number|null=null;for(const f of this.floors){const [u,v]=this.local(f,x,z);if(Math.abs(u)<=f.w/2+.001&&Math.abs(v)<=f.d/2+.001)result=Math.max(result??-Infinity,f.y);}return result;
 }
 blocked(x:number,z:number){return !!this.vehicles?.blocked(x,z)||this.solids.some(s=>{const [u,v]=this.local(s,x,z);return Math.abs(u)<s.w/2+.23&&Math.abs(v)<s.d/2+.23;});}
 traversalClear=(p:WalkPoint,link:WalkLink)=>{
  // Height-aware collision only for this site's owned obstacles and roof.
  for(const s of this.solids){const [u,v]=this.local(s,p.x,p.z);if(Math.abs(u)<s.w/2+.23&&Math.abs(v)<s.d/2+.23&&p.y<s.y+s.h+.02&&p.y+1.7>s.y)return false;}
  const roof=this.floorAt(p.x,p.z);
  if(roof!==null)return p.y>=roof-.04;
  if(this.host.collision.blocked(p.x,p.z)){
   // Building collision has an inflated footprint; only the owned ladder's
   // top transition can cross that margin, and only above the actual roof.
   return link.kind==='ladder'&&this.links.some(l=>l.id===link.id)&&this.roofY!==null&&p.y>=this.roofY;
  }return true;
 };
 get meshes():AbstractMesh[]{return this.root.getChildMeshes();}
 vegetationReserved(x:number,z:number,radius=0){
  if(this.spec.id==='c02-n15'){
   const p=this.at(this.spec.path.length),[u,v]=this.local(p,x,z);
   return Math.abs(u)<5.8+radius&&v>-5.8-radius&&v<9.8+radius;
  }
  const g=this.spec.garden;if(!g)return false;const [u,v]=gardenLocal(g,x,z);return Math.abs(u)<16+radius&&v>0-radius&&v<40+radius;
 }
 get goalHeight(){const p=this.at(this.spec.path.length);return this.floorAt(p.x,p.z)??this.base(p.x,p.z);}
 canFinish(walk:{x?:number;z?:number;active:boolean;feetY:number;airborne:boolean;traversing:boolean;completedLinks:Set<string>}|null){
  if(!walk?.active||walk.airborne||walk.traversing||Math.abs(walk.feetY-this.goalHeight)>=.2)return false;
  if(this.spec.garden){if(walk.x===undefined||walk.z===undefined)return false;const [u,v]=gardenLocal(this.spec.garden,walk.x,walk.z);return u>=9.4&&u<=10.8&&v>=1.3&&v<=3;}
  return true;
 }
 private garden(g:GardenLayout){
  const paving=this.mat('garden-paving',.52,.50,.44),stone=this.mat('garden-bed-stone',.39,.39,.32),leaves=this.mat('garden-hedge',.12,.25,.065),wood=this.mat('garden-door',.22,.12,.055);
  // One terrain-following connected surface, not overlapping road slabs.
  const rows:Vector3[][]=[];
  for(let u=-15.5;u<=15.5;u+=1){const row:Vector3[]=[];for(let v=1.5;v<=39.5;v+=1){const [x,z]=gardenWorld(g,u,v);row.push(new Vector3(x,this.base(x,z),z));}rows.push(row);}
  const floor=MeshBuilder.CreateRibbon('garden-continuous-paving',{pathArray:rows,sideOrientation:2},this.host.scene);floor.parent=this.root;floor.material=paving;floor.receiveShadows=true;floor.isPickable=false;
  for(const s of GARDEN_SOLIDS){
   const [x,z]=gardenWorld(g,s.x,s.z),y=this.base(x,z);
   this.box('garden-planter-base',s.w,.45,s.d,x,y+.225,z,g.yaw,stone);
   if(s.w>10&&s.d>10){
    const soil=this.mat('garden-soil',.20,.15,.09);this.box('garden-soil',s.w-.3,.06,s.d-.3,x,y+.48,z,g.yaw,soil);
    for(const [u,v,w,d] of [[-8.4,13,1.1,24.8],[8.4,13,1.1,24.8],[0,.9,16,.8],[0,25.1,16,.8]]){const [hx,hz]=gardenWorld(g,u,v);this.box('garden-border-shrubs',w,1.1,d,hx,y+1.05,hz,g.yaw,leaves);}
    for(const v of [5,11,17,22])for(const u of [-4,4]){const [hx,hz]=gardenWorld(g,u,v),shrub=MeshBuilder.CreateSphere('garden-low-shrub',{diameter:2.2,segments:10},this.host.scene);shrub.parent=this.root;shrub.position.set(hx,y+1,hz);shrub.scaling.y=.5;shrub.material=leaves;shrub.isPickable=false;}
   }else this.box('garden-hedge',s.w-.08,s.h-.45,s.d-.08,x,y+.45+(s.h-.45)/2,z,g.yaw,leaves);
   this.solids.push({...s,x,z,y,yaw:g.yaw});
  }
  // Door trim is attached to the existing native building, not a new box house.
  const [x,z]=gardenWorld(g,10,.25),y=this.base(x,z);
  this.box('garden-house-door',1.8,2.5,.2,x,y+1.25,z,g.yaw,wood);
  for(const u of [8.95,11.05]){const [x,z]=gardenWorld(g,u,.4);this.box('garden-door-frame',.18,2.7,.3,x,this.base(x,z)+1.35,z,g.yaw,stone);}
  this.box('garden-door-lintel',2.28,.18,.3,x,y+2.7,z,g.yaw,stone);
 }
 private gunStore(p:{x:number;z:number;yaw:number}){
  // Keep the existing steps, porch and arrival surface. The shop is behind
  // the closed doorway, so the authored approach and goal remain reachable.
  const y=this.floorAt(p.x,p.z)??this.base(p.x,p.z);
  const wall=this.mat('gun-store-render',.66,.63,.55),base=this.mat('gun-store-base',.37,.37,.34),
   red=this.mat('gun-store-red',.40,.065,.05),metal=this.mat('gun-store-frame',.18,.20,.20,.6),
   glass=this.mat('gun-store-glass',.055,.10,.13,.35),roof=this.mat('gun-store-roof',.29,.30,.29);
  glass.roughness=.19;
  const local=(u:number,v:number)=>[p.x+Math.cos(p.yaw)*u+Math.sin(p.yaw)*v,p.z-Math.sin(p.yaw)*u+Math.cos(p.yaw)*v];
  const box=(name:string,w:number,h:number,d:number,u:number,level:number,v:number,m:PBRMaterial,solid=false)=>{
   const [x,z]=local(u,v);return this.box('gun-store-'+name,w,h,d,x,y+level,z,p.yaw,m,solid);
  };
  // Sample the footprint so the foundation reaches the terrain on sloped sites.
  let bottom=y;
  for(let u=-4.8;u<=4.8;u+=2.4)for(let v=2.1;v<=8.9;v+=1.7){const [x,z]=local(u,v);bottom=Math.min(bottom,this.host.groundHeight(x,z)-.08);}
  const foundation=Math.max(.12,y-bottom);
  box('foundation',9.6,foundation,6.8,0,-foundation/2,5.5,base,true);
  box('front-wall',9.6,4,.28,0,2,2.24,wall,true);
  box('back-wall',9.6,4,.28,0,2,8.76,wall,true);
  for(const side of [-4.66,4.66])box('side-wall',.28,4,6.8,side,2,5.5,wall,true);
  box('roof',10,.20,7.1,0,4.08,5.5,roof);
  box('roof-fascia',10,.22,.18,0,4.12,1.98,red);
  for(const side of [-4.77,4.77])box('corner-trim',.18,4.02,.36,side,2.01,2.18,base);
  for(const side of [-3.1,3.1]){
   box('window',2.25,1.85,.06,side,1.5,2.06,glass);
   for(const offset of [-1.17,1.17])box('window-jamb',.09,2.02,.12,side+offset,1.5,2.00,metal);
   for(const height of [.53,2.47])box('window-rail',2.42,.09,.12,side,height,2.00,metal);
   box('window-sill',2.5,.12,.32,side,.44,1.94,base);
   for(let i=-2;i<=2;i++)box('security-bar',.028,1.85,.05,side+i*.36,1.5,1.96,metal);
  }
  // Door panes, mullions and handles sit on the original closed door leaf.
  for(const side of [-.65,.65])box('door-pane',1.17,2.2,.025,side,1.39,1.994,glass);
  for(const side of [-1.27,0,1.27])box('door-stile',.065,2.6,.08,side,1.3,1.96,metal);
  box('door-kickplate',2.6,.24,.06,0,.14,1.96,metal);
  for(const side of [-.17,.17])box('door-handle',.045,.5,.09,side,1.18,1.87,metal);
  box('sign-backing',8.4,.92,.18,0,3.46,2.04,red);
  const texture=new DynamicTexture('gun-store-sign',{width:1280,height:160},this.host.scene,false),ctx=texture.getContext() as CanvasRenderingContext2D;
  ctx.fillStyle='#70221c';ctx.fillRect(0,0,1280,160);ctx.strokeStyle='#e6d6ad';ctx.lineWidth=5;ctx.strokeRect(10,10,1260,140);
  ctx.fillStyle='#fff5da';ctx.textAlign='center';ctx.textBaseline='middle';ctx.font='bold 90px sans-serif';ctx.fillText('GUN STORE',640,66,1190);
  ctx.font='22px sans-serif';ctx.fillText('SPORTING ARMS & SUPPLIES',640,129,1190);texture.update();this.textures.push(texture);
  const signMaterial=this.mat('gun-store-sign',1,1,1);signMaterial.albedoTexture=texture;signMaterial.emissiveTexture=texture;signMaterial.emissiveColor.set(.18,.18,.18);
  const sign=MeshBuilder.CreatePlane(`${this.spec.id}-gun-store-sign`,{width:8.15,height:.86},this.host.scene),[x,z]=local(0,1.941);
  sign.parent=this.root;sign.position.set(x,y+3.46,z);sign.rotation.y=p.yaw;sign.material=signMaterial;sign.isPickable=false;
  box('roof-vent',1.4,.65,1.2,-2.8,4.5,7.2,metal);
 }
 private entry(p:{x:number;z:number;yaw:number},ahead:number,kind:string){
  const x=p.x+Math.sin(p.yaw)*ahead,z=p.z+Math.cos(p.yaw)*ahead,y=this.floorAt(p.x,p.z)??this.base(x,z),stone=this.mat(`${kind}-stone`,.48,.46,.42),dark=this.mat(`${kind}-door`,.12,.19,.2,.2);
  const ground=this.host.groundHeight(x,z),foundation=Math.max(.08,y-ground);
  this.box('entry-foundation',3.3,foundation,1.8,x,y-foundation/2,z,p.yaw,stone);
  this.floors.push({x,z,w:3.3,d:1.8,yaw:p.yaw,y});
  // Supported porch, positioned beyond the reachable goal, with a real opening.
  for(const side of [-1.45,1.45])this.box('entry-column',.24,2.8,.3,x+Math.cos(p.yaw)*side,y+1.4,z-Math.sin(p.yaw)*side,p.yaw,stone,true);
  this.box('entry-canopy',3.2,.18,1.4,x,y+2.85,z,p.yaw,stone);
  this.box('entry-door',2.65,2.6,.16,x+Math.sin(p.yaw)*.6,y+1.3,z+Math.cos(p.yaw)*.6,p.yaw,dark,true);
 }
 private warehouse(){
  const p=this.at(0),y=this.base(p.x,p.z),wall=this.mat('warehouse-concrete',.48,.47,.43),metal=this.mat('roller-door',.4,.44,.46,.6);
  const local=(u:number,v:number)=>[p.x+Math.cos(p.yaw)*u+Math.sin(p.yaw)*v,p.z-Math.sin(p.yaw)*u+Math.cos(p.yaw)*v];
  // Spawn inside a small loading bay, facing its wide, raised shutter.
  for(const side of [-3,3]){const [x,z]=local(side,0);this.box('warehouse-side',.24,3.7,7,x,y+1.85,z,p.yaw,wall,true);}
  let [x,z]=local(0,-3.5);this.box('warehouse-back',6.2,3.7,.24,x,y+1.85,z,p.yaw,wall,true);
  this.box('warehouse-roof',6.3,.22,7.2,p.x,y+3.8,p.z,p.yaw,wall);
  [x,z]=local(0,3.3);this.box('raised-shutter-case',6.1,.55,.55,x,y+3.35,z,p.yaw,metal);
  for(const side of [-2.85,2.85]){const [x,z]=local(side,3.3);this.box('shutter-guide',.13,3.3,.14,x,y+1.65,z,p.yaw,metal,true);}
 }
 private vehicle(kind:string,p:{x:number;z:number;yaw:number},side:number){
  // Search both shoulders; do not place a required vehicle inside a building.
  const candidates=[side,-side,side*1.4,-side*1.4];let site:null|{x:number;z:number}=null;
  for(const offset of candidates){const x=p.x+Math.cos(p.yaw)*offset,z=p.z-Math.sin(p.yaw)*offset;
   if(!this.host.collision.blocked(x,z)&&!this.blocked(x,z)){site={x,z};break;}}
  if(!site)throw Error(`Task ${this.spec.id} vehicle placement point is obstructed for`);
  const {x,z}=site,y=this.base(x,z);
  if(!['white-car','red-car','police'].includes(kind))throw Error(`No vehicle configured GLB: ${kind}`);
   const root=this.host.car.clone(`${this.spec.id}-${kind}`,null,false);if(!root)throw Error("Native car model is not ready yet");root.parent=this.root;root.position.set(x,y,z);root.rotation.set(0,p.yaw,0);root.setEnabled(true);
   for(const mesh of root.getChildMeshes()){mesh.isPickable=false;mesh.receiveShadows=true;const material=mesh.material?.clone(`${this.spec.id}-${mesh.material.name}`);if(material){mesh.material=material;if(material instanceof PBRMaterial){this.materials.push(material);if(/carpaint|vehicle[_-]?body|body[_-]?paint/i.test(material.name))material.albedoColor.copyFromFloats(...(kind==='red-car'?[.7,.025,.02]:[.93,.95,.96]) as [number,number,number]);}}}
   if(kind==='police'){const red=this.mat('police-red',.8,.025,.015),blue=this.mat('police-blue',.025,.15,.85);this.box('police-lightbar-red',.6,.15,.25,x-.3*Math.cos(p.yaw),y+1.4,z+.3*Math.sin(p.yaw),p.yaw,red);this.box('police-lightbar-blue',.6,.15,.25,x+.3*Math.cos(p.yaw),y+1.4,z-.3*Math.sin(p.yaw),p.yaw,blue);}
  this.solids.push({x,z,y,w:2,d:4.9,h:1.5,yaw:p.yaw});
 }
 dispose(){this.vehicles?.dispose();this.root.dispose(false,false);for(const m of this.materials)m.dispose();for(const t of this.textures)t.dispose();}
}
