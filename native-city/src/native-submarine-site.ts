import {Color3,Color4,DynamicTexture,HemisphericLight,Mesh,MeshBuilder,PBRMaterial,SpotLight,TransformNode,Vector3,VertexData,Scene,Texture,type AbstractMesh,type Observer} from '@babylonjs/core';
import {NativeSubmarineMotion} from './native-submarine-motion.ts';
import {MARINE_PIPE,SUBMARINE_TASK,MarineFacilityLayout} from './native-marine-facility.ts';
import {NativeSwimEffects} from './native-swim-effects.ts';

/** Owns reusable facility visuals only; all large structures use layout.boxes.
 * No GTA V proprietary assets, render-target overlays or global fog changes. */
export class NativeMarineFacilityView{
 readonly root:TransformNode;readonly materials:PBRMaterial[]=[];private texture:DynamicTexture;
 constructor(readonly scene:Scene,readonly layout:MarineFacilityLayout){
  this.root=new TransformNode('marine-facility',scene);
  const origin=layout.world(0,0);this.root.position.set(origin[0],0,origin[1]);this.root.rotation.y=Math.atan2(layout.spec.path.forward[0],layout.spec.path.forward[1]);
  this.texture=new DynamicTexture('marine-concrete-grain',{width:128,height:128},scene,true,Texture.TRILINEAR_SAMPLINGMODE);
  const ctx=this.texture.getContext();let seed=171;
  for(let y=0;y<128;y++)for(let x=0;x<128;x++){seed=(Math.imul(seed,1664525)+1013904223)>>>0;const c=180+(seed%56);ctx.fillStyle=`rgb(${c},${c},${c})`;ctx.fillRect(x,y,1,1);}this.texture.update(false);
  const concrete=this.material('weathered-concrete',.38,.43,.41),steel=this.material('oxidized-steel',.18,.27,.26),paint=this.material('safety-yellow',.85,.64,.13),glass=this.material('dark-glass',.04,.13,.17);
  concrete.albedoTexture=this.texture;concrete.roughness=.95;steel.metallic=.5;glass.roughness=.2;
  const mats={concrete,steel,paint,glass};
  for(const b of layout.boxes){const mesh=MeshBuilder.CreateBox(b.name,{width:b.w,height:b.h,depth:b.d},scene);mesh.position.set(b.u,b.y,b.v);this.attach(mesh,mats[b.material]);}
  const sand=this.material('rippled-seabed',.26,.38,.31),data=new VertexData(),positions:number[]=[],indices:number[]=[],normals:number[]=[],uvs:number[]=[],colors:number[]=[];
  const cols=72,rows=96;
  for(let j=0;j<=rows;j++)for(let i=0;i<=cols;i++){
   const u=-85+170*i/cols,v=-45+215*j/rows;positions.push(u,layout.floor(u,v),v);uvs.push(u/8,v/8);
   const shade=.83+.13*Math.sin(u*.38+v*.21)+.04*Math.sin(v*4);colors.push(shade,shade,shade,1);
   if(i<cols&&j<rows){const a=j*(cols+1)+i;indices.push(a,a+1,a+cols+2,a,a+cols+2,a+cols+1);}
  }
  VertexData.ComputeNormals(positions,indices,normals);Object.assign(data,{positions,indices,normals,uvs,colors});const bed=new Mesh('marine-continuous-seabed',scene);data.applyToMesh(bed);sand.albedoTexture=this.texture;this.attach(bed,sand);
  const p=MARINE_PIPE,y=layout.pipeY;
  this.shell('intake-tunnel',p.mouth,p.end,p.inner,p.outer,steel);
  this.headwall(concrete);
  // Flanges, bolt heads and low-profile service lighting are attached to pipe.
  const lamp=this.material('intake-lamps',.35,.7,.65);lamp.emissiveColor.set(.22,.65,.56);
  for(const v of [92,100,108,116,124]){
   const path=Array.from({length:65},(_,i)=>new Vector3(Math.sin(i*Math.PI/32)*4.62,y+Math.cos(i*Math.PI/32)*4.62,v));
   this.attach(MeshBuilder.CreateTube('pipe-flange',{path,radius:.15,tessellation:8},scene),steel);
   for(const sign of [-1,1]){const m=MeshBuilder.CreateBox('pipe-guidance-light',{width:.14,height:.4,depth:.5},scene);m.position.set(sign*3.87,y+.3,v);this.attach(m,lamp);}
  }
  // External utility pipes descend continuously from pump house to seabed.
  for(const pipe of layout.utilities)this.attach(MeshBuilder.CreateTube('service-pipe',{path:pipe.points.map(p=>Vector3.FromArray(p)),radius:pipe.radius,tessellation:12},scene),steel);
  // Rock clusters remain outside the playable corridor; their bottoms rest
  // on the same floor function. No unsupported scenery or goal hoop.
  for(const b of layout.rocks){
   const rock=MeshBuilder.CreateSphere('seabed-rock',{diameter:2,segments:6},scene);rock.scaling.set(b.xRadius,b.yRadius,b.zRadius);rock.position.set(b.u,b.y,b.v);this.attach(rock,concrete);
  }
 }
 material(name:string,r:number,g:number,b:number){const m=new PBRMaterial('marine-'+name,this.scene);m.albedoColor.set(r,g,b);m.emissiveColor.set(r*.22,g*.22,b*.22);m.metallic=0;m.maxSimultaneousLights=6;m.roughness=.9;m.backFaceCulling=false;this.materials.push(m);return m;}
 attach(m:Mesh,material:PBRMaterial){m.parent=this.root;m.material=material;m.isPickable=false;m.receiveShadows=true;return m;}
 private shell(name:string,a:number,b:number,inside:number,outside:number,mat:PBRMaterial){
  const positions:number[]=[],indices:number[]=[],normals:number[]=[],uvs:number[]=[];
  for(const r of [inside,outside])for(const v of [a,b])for(let i=0;i<=64;i++){const t=i*Math.PI/32;positions.push(Math.sin(t)*r,this.layout.pipeY+Math.cos(t)*r,v);uvs.push(i/8,v/4);}
  const quad=(a:number,b:number,c:number,d:number)=>indices.push(a,b,c,a,c,d);
  for(let i=0;i<64;i++){quad(i,i+1,66+i,65+i);quad(130+i,195+i,196+i,131+i);quad(i,130+i,131+i,i+1);quad(65+i,66+i,196+i,195+i);}
  VertexData.ComputeNormals(positions,indices,normals);const data=new VertexData();Object.assign(data,{positions,indices,normals,uvs});const m=new Mesh(name,this.scene);data.applyToMesh(m);this.attach(m,mat);
 }
 private headwall(mat:PBRMaterial){
  const positions:number[]=[],indices:number[]=[],normals:number[]=[],uvs:number[]=[];
  for(const v of [91.7,93])for(let i=0;i<=64;i++){
   const t=i*Math.PI/32,s=Math.sin(t),c=Math.cos(t),edge=Math.min(15/Math.max(1e-6,Math.abs(s)),(c>0?-5-this.layout.pipeY:this.layout.pipeY+18.3)/Math.max(1e-6,Math.abs(c)));
   for(const r of [4,edge]){positions.push(s*r,this.layout.pipeY+c*r,v);uvs.push(s*r/4,c*r/4);}
  }
  for(let i=0;i<64;i++){for(const base of [0,130]){const a=base+i*2;indices.push(a,a+1,a+3,a,a+3,a+2);}const a=i*2+1;indices.push(a,a+130,a+132,a,a+132,a+2);}
  VertexData.ComputeNormals(positions,indices,normals);const data=new VertexData();Object.assign(data,{positions,indices,normals,uvs});const m=new Mesh('intake-headwall-with-open-bore',this.scene);data.applyToMesh(m);this.attach(m,mat);
 }
 get meshes(){return this.root.getChildMeshes();}
 dispose(){this.root.dispose(false,false);for(const m of this.materials)m.dispose();this.texture.dispose();}
}

export class NativeSubmarineSite extends NativeSubmarineMotion{
 private effects:NativeSwimEffects;
 readonly facility:NativeMarineFacilityView;readonly vessel:TransformNode;
 private light:HemisphericLight;private lamp:SpotLight;private mats:PBRMaterial[]=[];
 private behind=false;private propeller:TransformNode;private sky:AbstractMesh|null;private skyEnabled:boolean;private clearColor:Color4;
 private fogObserver:Observer<Scene>;private fog:{mode:number;color:Color3;density:number;start:number;end:number};
 constructor(private scene:Scene,sea:(x:number,z:number)=>boolean){
  super(SUBMARINE_TASK,sea);this.facility=new NativeMarineFacilityView(scene,this.layout);this.vessel=new TransformNode('yellow-minisub',scene);
  this.effects=new NativeSwimEffects(scene,this.spec.waterHeight,true);
  const material=(name:string,color:Color3,metallic=0)=>{const m=new PBRMaterial('minisub-'+name,scene);m.albedoColor=color;m.metallic=metallic;m.roughness=.36;this.mats.push(m);return m;};
  const yellow=material('hull',new Color3(.92,.67,.07),.3),black=material('frame',new Color3(.055,.09,.10),.7),glass=material('porthole',new Color3(.03,.16,.2),.4),white=material('headlight',new Color3(.7,.95,1));white.emissiveColor.set(.7,.95,1);
  const sphere=(name:string,x:number,y:number,z:number,sx:number,sy:number,sz:number,mat:PBRMaterial)=>{const m=MeshBuilder.CreateSphere(name,{diameter:2,segments:24},scene);m.scaling.set(sx,sy,sz);m.position.set(x,y,z);m.parent=this.vessel;m.material=mat;m.isPickable=false;return m;};
  sphere('pressure-hull',0,0,0,1.02,.95,2.15,yellow);sphere('front-dome',0,.12,1.72,.82,.73,.64,glass);
  sphere('top-hatch',0,.87,-.3,.55,.33,.65,yellow);
  for(const x of [-1.1,1.1]){
   sphere('ballast-tank',x,-.5,0,.28,.32,1.85,yellow);sphere('lamp',x,.12,1.65,.14,.14,.13,white);
   const path=[new Vector3(x,-.8,-2),new Vector3(x,-1,-1.6),new Vector3(x,-1,1.6),new Vector3(x,-.6,2)];
   const frame=MeshBuilder.CreateTube('landing-skid',{path,radius:.075,tessellation:8},scene);frame.parent=this.vessel;frame.material=black;frame.isPickable=false;
  }
  const shroud=MeshBuilder.CreateTorus('rear-thruster-shroud',{diameter:1,thickness:.14,tessellation:32},scene);shroud.parent=this.vessel;shroud.position.z=-2.2;shroud.rotation.x=Math.PI/2;shroud.material=black;
  this.propeller=new TransformNode('minisub-propeller',scene);this.propeller.parent=this.vessel;this.propeller.position.z=-2.25;
  sphere('propeller-hub',0,0,-2.25,.13,.13,.12,black);
  for(let i=0;i<3;i++){const blade=MeshBuilder.CreateBox('propeller-blade',{width:.16,height:.42,depth:.065},scene),a=i*Math.PI*2/3;blade.parent=this.propeller;blade.position.set(Math.sin(a)*.25,Math.cos(a)*.25,0);blade.rotation.z=-a;blade.material=black;}
  // Pressure-hull bands, hatch rim, handrails and a short instrument mast.
  for(const z of [-1.15,.8]){const ring=MeshBuilder.CreateTorus('hull-band',{diameter:2.03,thickness:.055,tessellation:40},scene);ring.parent=this.vessel;ring.position.z=z;ring.rotation.x=Math.PI/2;ring.scaling.x=.85;ring.scaling.z=.8;ring.material=black;}
  const mast=MeshBuilder.CreateCylinder('instrument-mast',{height:.32,diameter:.13},scene);mast.parent=this.vessel;mast.position.set(0,1.11,-.9);mast.material=black;
  for(const x of [-.8,.8]){const rail=MeshBuilder.CreateTube('top-handhold',{path:[new Vector3(x,.48,-1),new Vector3(x,.7,-.7),new Vector3(x,.7,.5),new Vector3(x,.48,.8)],radius:.04,tessellation:8},scene);rail.parent=this.vessel;rail.material=black;}
  this.light=new HemisphericLight('marine-local-fill',new Vector3(0,1,0),scene);this.light.diffuse.set(.48,.77,.79);this.light.groundColor.set(.1,.22,.23);this.light.intensity=.75;this.light.renderPriority=10;this.light.includedOnlyMeshes=this.meshes;
  this.lamp=new SpotLight('minisub-headlights',Vector3.Zero(),new Vector3(0,0,1),Math.PI/2,2,scene);this.lamp.diffuse.set(.7,.9,1);this.lamp.intensity=450;this.lamp.range=42;this.lamp.renderPriority=20;this.lamp.includedOnlyMeshes=this.facility.meshes;
  this.fog={mode:scene.fogMode,color:scene.fogColor.clone(),density:scene.fogDensity,start:scene.fogStart,end:scene.fogEnd};
  this.sky=scene.getMeshByName('atmosphere');this.skyEnabled=this.sky?.isEnabled()??false;this.clearColor=scene.clearColor.clone();
  this.fogObserver=scene.onBeforeRenderObservable.add(()=>{
   if((scene.activeCamera?.position.y??0)<this.spec.waterHeight-.1){scene.fogMode=Scene.FOGMODE_EXP2;scene.fogDensity=.024;scene.fogColor.set(.035,.14,.16);this.sky?.setEnabled(false);scene.clearColor.set(.003,.013,.015,1);}
   else this.restoreFog();
  });
  this.sync();
 }
 async load(){}
 private sync(){
  this.vessel?.position.set(this.x,this.y,this.z);if(this.vessel){this.vessel.rotation.y=this.yaw;this.vessel.setEnabled(!this.firstPerson);}
  if(this.lamp){this.lamp.position.set(this.x+Math.sin(this.yaw)*2,this.y+.15,this.z+Math.cos(this.yaw)*2);this.lamp.direction.set(Math.sin(this.yaw),-.06,Math.cos(this.yaw));}
 }
 override step(keys:ReadonlySet<string>,dt:number){if(dt>0)this.behind=keys.has('KeyC');super.step(keys,dt);if(this.propeller)this.propeller.rotation.z+=this.speed*dt*4;this.sync();this.effects.update(this.x,this.z,this.depth,this.yaw,this.speed,dt);}
 override reset(){super.reset();this.behind=false;this.effects?.reset();this.sync();}
 override toggleView(){super.toggleView();this.sync();}
 get camera(){
  const theta=this.yaw+this.orbitYaw+(this.behind?Math.PI:0),f=new Vector3(Math.sin(theta)*Math.cos(this.orbitPitch),-Math.sin(this.orbitPitch),Math.cos(theta)*Math.cos(this.orbitPitch));
  const target=new Vector3(this.x,this.y+.25,this.z);
  if(this.firstPerson){const eye=target.add(new Vector3(Math.sin(this.yaw)*1.9,0,Math.cos(this.yaw)*1.9));return {eye,target:eye.add(f.scale(10))};}
  // Ray-march the same solids: camera cannot cross a pile, intake wall or
  // tube ceiling when following the sub into its confined destination.
  let distance=.5;
  for(let d=.5;d<=8;d+=.2){const q=target.subtract(f.scale(d));const [u,v]=this.layout.local(q.x,q.z);if(!this.layout.clear(u,q.y,v,.25))break;distance=d;}
  const eye=target.subtract(f.scale(distance));eye.y+=Math.max(0,1-this.depth/3)*1.1;
  if(this.depth>3)eye.y=Math.min(eye.y,this.spec.waterHeight-.25);
  return {eye,target};
 }
 get meshes():AbstractMesh[]{return [...this.facility.meshes,...this.vessel.getChildMeshes(),...this.effects.meshes];}
 private restoreFog(){this.scene.fogMode=this.fog.mode;this.scene.fogDensity=this.fog.density;this.scene.fogColor.copyFrom(this.fog.color);this.scene.fogStart=this.fog.start;this.scene.fogEnd=this.fog.end;this.sky?.setEnabled(this.skyEnabled);this.scene.clearColor.copyFrom(this.clearColor);}
 dispose(){this.scene.onBeforeRenderObservable.remove(this.fogObserver);this.restoreFog();this.effects.dispose();this.facility.dispose();this.vessel.dispose(false,false);this.light.dispose();this.lamp.dispose();for(const m of this.mats)m.dispose();}
}
