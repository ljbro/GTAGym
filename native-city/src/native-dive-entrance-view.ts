import {Color3,MeshBuilder,PBRMaterial,Texture,TransformNode,Vector3,Vector4,type Scene} from '@babylonjs/core';
import {diveEntranceBoxes} from './native-dive-entrance.ts';
import {diveFloor,waterWorld,type NativeWaterSpec} from './native-water-motion.ts';
/** Original authored service portal, using existing licensed material assets. */
export class NativeDiveEntranceView{
 readonly root:TransformNode;private materials:PBRMaterial[]=[];
 constructor(scene:Scene,spec:NativeWaterSpec,parent:TransformNode){
  const L=spec.path.length,floor=diveFloor(spec,...waterWorld(spec,0,L)),[x,z]=waterWorld(spec,0,L);
  this.root=new TransformNode('dive-service-entrance',scene);this.root.parent=parent;this.root.position.set(x,floor,z);this.root.rotation.y=Math.atan2(spec.path.forward[0],spec.path.forward[1]);
  const material=(name:string,color:Color3,metallic=0)=>{const m=new PBRMaterial('dive-entrance-'+name,scene);m.albedoColor=color;m.metallic=metallic;m.roughness=.85;this.materials.push(m);return m;};
  const concrete=material('aged-concrete',new Color3(.51,.55,.51));
  concrete.albedoTexture=new Texture('/assets/interiors/native-materials/concrete_floor_02_diff.webp',scene);
  concrete.bumpTexture=new Texture('/assets/interiors/native-materials/concrete_floor_02_nor_gl.webp',scene);concrete.bumpTexture.level=.3;
  const metal=material('dark-steel',new Color3(.14,.19,.18),.65),paint=material('aged-gate',new Color3(.18,.3,.29),.4),rust=material('oxidized-fittings',new Color3(.25,.16,.09),.2),moss=material('algae',new Color3(.16,.23,.12));
  const light=material('protected-lamp',new Color3(.56,.79,.7));light.emissiveColor.set(.24,.52,.42);
  const box=(name:string,u:number,y:number,v:number,w:number,h:number,d:number,mat:PBRMaterial)=>{
   const faceUV=[new Vector4(0,0,w/3,h/3),new Vector4(0,0,w/3,h/3),new Vector4(0,0,d/3,h/3),new Vector4(0,0,d/3,h/3),new Vector4(0,0,w/3,d/3),new Vector4(0,0,w/3,d/3)];
   const mesh=MeshBuilder.CreateBox('dive-entrance-'+name,{width:w,height:h,depth:d,faceUV},scene);mesh.parent=this.root;mesh.position.set(u,y,v);mesh.material=mat;mesh.receiveShadows=true;mesh.isPickable=false;return mesh;
  };
  const mats={concrete,metal,paint};
  for(const b of diveEntranceBoxes(floor,L))box(b.name,b.u,b.y-floor,b.v-L,b.width,b.height,b.depth,mats[b.material]);
  // Gate ribs and a mounted service wheel. All ornament sits on solid walls.
  for(const u of [-5.5,-4.65,-3.8,-2.95])box('gate-rib',u,2,-1.19,.09,3.65,.08,metal);
  for(const y of [.45,3.55])box('gate-crossmember',-4.25,y,-1.21,3.45,.11,.09,metal);
  const wheel=MeshBuilder.CreateTorus('dive-entrance-valve',{diameter:.66,thickness:.055,tessellation:24},scene);wheel.parent=this.root;wheel.position.set(-4.25,2,-1.32);wheel.rotation.x=Math.PI/2;wheel.material=rust;wheel.isPickable=false;
  for(const a of [0,Math.PI/3,2*Math.PI/3]){const spoke=box('valve-spoke',-4.25,2,-1.32,.62,.04,.04,rust);spoke.rotation.z=a;}
  for(const u of [-1.73,1.73])for(const y of [.35,1.2,2.1,3,3.8]){
   const bolt=MeshBuilder.CreateCylinder('dive-entrance-anchor',{diameter:.08,height:.05,tessellation:6},scene);bolt.parent=this.root;bolt.position.set(u,y,-1.16);bolt.rotation.x=Math.PI/2;bolt.material=rust;bolt.isPickable=false;
  }
  for(const u of [4.3,5.1]){
   const path=[new Vector3(u,-.3,-1.15),new Vector3(u,3.15,-1.15),new Vector3(u+.3,3.5,-1.15),new Vector3(6.5,3.5,-1.15)];
   const pipe=MeshBuilder.CreateTube('dive-entrance-service-pipe',{path,radius:.095,tessellation:12,cap:3},scene);pipe.parent=this.root;pipe.material=metal;pipe.isPickable=false;
   for(const y of [.6,1.8,2.9])box('pipe-clamp',u,y,-1.17,.3,.08,.3,rust);
  }
  for(const u of [-2.2,2.2]){
   box('lamp-housing',u,3.45,-1.08,.42,.7,.18,metal);
   box('lamp-lens',u,3.45,-1.19,.25,.49,.06,light);
   for(const y of [3.24,3.45,3.66])box('lamp-guard',u,y,-1.24,.3,.025,.035,metal);
  }
  for(const v of [2.5,5.5,8]){
   for(const u of [-1.78,1.78])box('passage-lamp',u,2.8,v,.06,.18,.65,light);
  }
  // Irregular adhered sediment at wall feet, not floating markers or labels.
  for(let i=0;i<20;i++){
   const u=-7.6+i*.8;if(Math.abs(u)<1.9)continue;
   const h=.13+(i*7%6)*.065;box('tidal-stain',u,h/2,-1.012,.68,h,.018,moss);
  }
 }
 dispose(){this.root.dispose(false,false);for(const m of this.materials)m.dispose(false,true);}
}
