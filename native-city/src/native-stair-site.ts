import {MeshBuilder,PBRMaterial,TransformNode,Vector3,Quaternion,type Scene,type AbstractMesh} from '@babylonjs/core';
import {stairPoint,stairLocal,stairFloor,type StairLayout,type StairPanel} from './native-stair-layout.ts';
import type {WalkLink,WalkPoint} from './native-walk-traversal.ts';
type Rail={a:number[];b:number[]};
/** Concrete exterior stairs. Every tread is supported down to native ground. */
export class NativeStairSite{
 readonly root:TransformNode;readonly links:WalkLink[]=[];readonly requiredLinks:string[]=[];readonly vehiclePlacements=[];
 readonly spec;private materials:PBRMaterial[]=[];private rails:Rail[]=[];
 constructor(private scene:Scene,readonly layout:StairLayout){
  this.root=new TransformNode('native-stairs-'+layout.spec.id,scene);
  this.spec={id:layout.spec.id,path:{points:layout.points,length:layout.spec.length}};
  const stone=this.mat('concrete',.53,.51,.46),edge=this.mat('tread-nose',.30,.32,.30),steel=this.mat('steel',.15,.19,.18,.55),plaster=this.mat('room-plaster',.68,.63,.52),door=this.mat('door',.12,.19,.22,.3);
  for(const p of layout.panels){const h=p.y-layout.base+.10;this.box(p.landing?'landing':'tread',p.w,h,p.d,p.x,p.y-h/2,p.z,p.yaw,stone);}
  // Guard every exposed outside edge; internal tread seams stay traversable.
  const lowIndex=layout.spec.heights[0]===0?0:layout.points.length-1,low=layout.points[lowIndex],neighbor=layout.points[lowIndex===0?1:lowIndex-1];
  const len=Math.hypot(low[0]-neighbor[0],low[1]-neighbor[1]),exit=[(low[0]-neighbor[0])/len,(low[1]-neighbor[1])/len];
  for(const p of layout.panels)for(const axis of [0,1])for(const sign of [-1,1]){
   const size=axis===0?p.d:p.w,count=Math.ceil(size/.45);
   for(let i=0;i<count;i++){
    const at=(t:number,out=0)=>axis===0?stairPoint(p,sign*(p.w/2+out),t):stairPoint(p,t,sign*(p.d/2+out));
    const t0=-size/2+i*size/count,t1=-size/2+(i+1)*size/count,mid=at((t0+t1)/2),out=at((t0+t1)/2,.08),adjacent=stairFloor(layout,...out);
    if(adjacent!==null&&Math.abs(adjacent-p.y)<.35)continue;
    // The lower landing opens into the yard; the upper landing meets the door.
    if(Math.abs(p.y-layout.base)<.04&&(mid[0]-low[0])*exit[0]+(mid[1]-low[1])*exit[1]>.65)continue;
    const a=at(t0),b=at(t1);this.rails.push({a,b});
    this.bar('handrail',new Vector3(a[0],p.y+1.02,a[1]),new Vector3(b[0],p.y+1.02,b[1]),.045,steel);
    this.bar('guard-midrail',new Vector3(a[0],p.y+.5,a[1]),new Vector3(b[0],p.y+.5,b[1]),.028,steel);
    this.box('guard-post',.05,1.04,.05,a[0],p.y+.52,a[1],0,steel);
   }
  }
  const r=layout.room,h=r.y-layout.base+2.7;
  this.box('exterior-room',r.w,h,r.d,r.x,layout.base+h/2,r.z,r.yaw,plaster);
  this.box('room-roof',r.w+.18,.12,r.d+.18,r.x,layout.base+h+.06,r.z,r.yaw,stone);
  const side=-layout.roomSide,[dx,dz]=stairPoint(r,side*(r.w/2+.025),0);
  this.box('upper-door',.055,2.1,1.15,dx,r.y+1.05,dz,r.yaw,door);
  // Fixed door jambs and lintel, mounted on the actual exterior wall.
  for(const v of [-.65,.65]){const [x,z]=stairPoint(r,side*(r.w/2+.07),v);this.box('door-jamb',.12,2.22,.1,x,r.y+1.11,z,r.yaw,edge);}
  this.box('door-lintel',.12,.1,1.4,dx,r.y+2.2,dz,r.yaw,edge);
 }
 private mat(name:string,r:number,g:number,b:number,metal=0){const m=new PBRMaterial(this.spec.id+'-'+name,this.scene);m.albedoColor.set(r,g,b);m.roughness=.8;m.metallic=metal;this.materials.push(m);return m;}
 private box(name:string,w:number,h:number,d:number,x:number,y:number,z:number,yaw:number,material:PBRMaterial){const m=MeshBuilder.CreateBox(this.spec.id+'-'+name,{width:w,height:h,depth:d},this.scene);m.parent=this.root;m.position.set(x,y,z);m.rotation.y=yaw;m.material=material;m.isPickable=false;m.receiveShadows=true;return m;}
 private bar(name:string,a:Vector3,b:Vector3,r:number,material:PBRMaterial){const d=b.subtract(a),m=MeshBuilder.CreateCylinder(this.spec.id+'-'+name,{height:d.length(),diameter:r,tessellation:6},this.scene);m.parent=this.root;m.position.copyFrom(a.add(b).scale(.5));m.rotationQuaternion=Quaternion.FromUnitVectorsToRef(Vector3.Up(),d.normalize(),new Quaternion());m.material=material;m.isPickable=false;}
 floorAt(x:number,z:number){return stairFloor(this.layout,x,z);}
 blocked(x:number,z:number){
  const r=this.layout.room,[u,v]=stairLocal(r,x,z);if(Math.abs(u)<r.w/2+.08&&Math.abs(v)<r.d/2+.08)return true;
  return this.rails.some(({a,b})=>{const dx=b[0]-a[0],dz=b[1]-a[1],t=Math.max(0,Math.min(1,((x-a[0])*dx+(z-a[1])*dz)/(dx*dx+dz*dz)));return Math.hypot(x-a[0]-dx*t,z-a[1]-dz*t)<.10;});
 }
 traversalClear=(p:WalkPoint)=>!this.blocked(p.x,p.z)&&p.y>=(this.floorAt(p.x,p.z)??this.layout.base)-.04;
 get goalHeight(){return this.layout.base+this.layout.spec.heights.at(-1)!;}
 get meshes():AbstractMesh[]{return this.root.getChildMeshes();}
 canFinish(walk:{active:boolean;feetY:number;airborne:boolean;traversing:boolean}|null){return !!walk?.active&&!walk.airborne&&!walk.traversing&&Math.abs(walk.feetY-this.goalHeight)<.07;}
 dispose(){this.root.dispose(false,false);for(const m of this.materials)m.dispose();}
}
