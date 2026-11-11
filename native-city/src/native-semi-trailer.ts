import {LoadAssetContainerAsync,TransformNode,Quaternion,Vector3,type AssetContainer,type Scene} from '@babylonjs/core';
import '@babylonjs/loaders/glTF';
import {SEMI,createTrailerState,stepTrailer,trailerAxle,type SemiPose,type TrailerState} from './native-semi-articulation.ts';
export class NativeSemiTrailer{
 readonly root:TransformNode;private container:AssetContainer|null=null;private disposed=false;
 private wheels:{node:TransformNode;rest:Quaternion}[]=[];state:TrailerState|null=null;
 constructor(readonly scene:Scene,readonly file:'semi-trailer.glb'|'boat-carrier.glb'='semi-trailer.glb'){this.root=new TransformNode('native-semi-trailer',scene);}
 async load(){
  const c=await LoadAssetContainerAsync('/assets/task-vehicles/'+this.file,this.scene);if(this.disposed){c.dispose();return;}this.container=c;c.addAllToScene();
  const heading=new TransformNode('native-semi-trailer-heading',this.scene);heading.parent=this.root;
  // Do not center this GLB: its origin is the kingpin, unlike the tractor.
  for(const n of c.rootNodes)n.parent=heading;
  for(const m of c.meshes){m.isPickable=false;m.receiveShadows=true;}
  for(const n of [...c.transformNodes,...c.meshes])if(/^wheel_[lr]r2?$/.test(n.name))this.wheels.push({node:n,rest:n.rotationQuaternion?.clone()??Quaternion.FromEulerVector(n.rotation)});
 }
 reset(p:SemiPose){this.state=createTrailerState(p);}
 sync(p:SemiPose,height:(x:number,z:number)=>number,advance=true,tractorRoot?:TransformNode){
  if(!this.state)this.reset(p);else if(advance)stepTrailer(this.state,p);
  const s=this.state!,axle=trailerAxle(s),frontY=height(s.x,s.z),backY=height(axle.x,axle.z),pitch=-Math.atan2(frontY-backY,SEMI.axleDistance);
  this.root.rotation.set(pitch,s.yaw,0);this.root.position.set(s.x,frontY+.105,s.z);
  if(tractorRoot){
   // Keep the visible kingpin on the pitched tractor's fifth wheel. Solving
   // rear axle height avoids a gap when tractor and trailer straddle a ramp.
   const hitch=Vector3.TransformCoordinates(new Vector3(0,SEMI.hitchHeight,-SEMI.hitchBack),tractorRoot.computeWorldMatrix(true));
   let axleX=axle.x,axleZ=axle.z;
   for(let i=0;i<5;i++){
    const c=Math.cos(s.yaw),sn=Math.sin(s.yaw),w=1.06;
    const left=height(axleX-c*w,axleZ+sn*w),right=height(axleX+c*w,axleZ-sn*w),roll=Math.atan2(right-left,2*w);
    const h=SEMI.hitchHeight*Math.cos(roll),length=SEMI.axleDistance;
    const ratio=Math.max(-1,Math.min(1,((left+right)/2+.105-hitch.y)/Math.hypot(length,h)));
    this.root.rotation.set(Math.atan2(h,length)+Math.asin(ratio),s.yaw,roll);
    this.root.position.setAll(0);
    const offset=Vector3.TransformNormal(new Vector3(0,SEMI.hitchHeight,0),this.root.computeWorldMatrix(true));
    this.root.position.copyFrom(hitch.subtract(offset));
    const rear=Vector3.TransformCoordinates(new Vector3(0,0,-length),this.root.computeWorldMatrix(true));axleX=rear.x;axleZ=rear.z;
   }
  }
  for(const w of this.wheels)w.node.rotationQuaternion=w.rest.multiply(Quaternion.RotationAxis(Vector3.Right(),s.travel/.52));
 }
 get meshes(){return this.root.getChildMeshes().filter(m=>m.getTotalVertices()>0);}
 get wheelStats(){return this.wheels.map(w=>{w.node.computeWorldMatrix(true);return {name:w.node.name,position:w.node.getAbsolutePosition().asArray(),rotation:w.node.rotationQuaternion?.asArray()};});}
 dispose(){this.disposed=true;this.container?.dispose();this.root.dispose(false,false);this.state=null;}
}
