import {Mesh,VertexData,PBRMaterial,Color3,TransformNode,Vector3,type Scene,type AbstractMesh} from '@babylonjs/core';
import type {CityRider} from './city-rider.ts';import {NativeShoreMotion,type ShoreEnvironment} from './native-shore-motion.ts';import {waterWorld,type NativeWaterSpec} from './native-water-motion.ts';
import {NativeSwimEffects} from './native-swim-effects.ts';
/** Shore ramp and locomotion share one continuous sampled surface. Native city
 * land and ocean remain intact; this owned slope joins them at their boundary. */
export class NativeShoreSite extends NativeShoreMotion{
 private effects:NativeSwimEffects;
 readonly root:TransformNode;private material:PBRMaterial;private swimRider:CityRider|null=null;private walkRider:CityRider|null=null;private disposed=false;private firstPerson=false;private lookingBehind=false;private actorsEnabled=true;
 constructor(private scene:Scene,spec:NativeWaterSpec,env:ShoreEnvironment,startOnLand=false){
  super(spec,env,startOnLand);this.root=new TransformNode('native-shore-'+spec.id,scene);
  this.effects=new NativeSwimEffects(scene,spec.waterHeight);for(const m of this.effects.meshes)m.parent=this.root;
  // Transfer destinations extend behind the navigation endpoint. Continue the
  // same seabed under the entire platform foundation, not just its front lip.
  const back=spec.freeRoamRegion?40:15;
  const mesh=new Mesh('continuous-shore-ramp',scene),data=new VertexData(),positions:number[]=[],indices:number[]=[],normals:number[]=[],colors:number[]=[],cols=40,rows=Math.ceil(spec.path.length+back+15);
  for(let j=0;j<=rows;j++)for(let i=0;i<=cols;i++){
   const u=-20+i,v=-back+(spec.path.length+back+15)*j/rows,[x,z]=waterWorld(spec,u,v),y=this.floor.at(x,z);positions.push(x,y,z);
   const dry=Math.max(0,Math.min(1,(y-spec.waterHeight)/.3)),grain=.92+.045*Math.sin(x*.75)*Math.cos(z*.73);colors.push((.62+dry*.24)*grain,(.67+dry*.10)*grain,(.55+dry*.03)*grain,1);
   if(i<cols&&j<rows){const a=j*(cols+1)+i;indices.push(a,a+1,a+cols+2,a,a+cols+2,a+cols+1);}
  }
  VertexData.ComputeNormals(positions,indices,normals);data.positions=positions;data.indices=indices;data.normals=normals;data.colors=colors;data.applyToMesh(mesh);mesh.parent=this.root;mesh.receiveShadows=true;mesh.isPickable=false;
  this.material=new PBRMaterial('shore-sand',scene);this.material.albedoColor=new Color3(.72,.64,.45);this.material.roughness=.95;mesh.material=this.material;
 }
 async load(){try{const {createCityRider}=await import('./city-rider.ts');const swim=await createCityRider(this.scene,'swim');if(this.disposed){swim.dispose();return;}this.swimRider=swim;const walk=await createCityRider(this.scene);if(this.disposed){walk.dispose();return;}this.walkRider=walk;this.sync(0);}catch(e){this.dispose();throw e;}}
 private sync(dt:number){const swim=this.mode==='swim';this.swimRider?.setEnabled(this.actorsEnabled&&swim&&!this.firstPerson);this.walkRider?.setEnabled(this.actorsEnabled&&!swim&&!this.firstPerson);
  this.effects.update(this.x,this.z,this.swimmer.depth,this.yaw,this.swimmer.speed,dt,this.actorsEnabled&&swim);
  if(swim)this.swimRider?.setPose({x:this.x,y:this.spec.waterHeight,z:this.z,yaw:this.yaw,speed:Math.hypot(this.swimmer.speed,this.swimmer.verticalSpeed),swimDepth:this.swimmer.depth},dt);
  else{this.walkRider?.setPose({x:this.x,y:this.walker.feetY,z:this.z,yaw:this.yaw,speed:dt>0?this.walker.speed:0},dt);this.walkRider?.setTraversalPose(this.walker.traversalPose);}
 }
 override step(keys:ReadonlySet<string>,dt:number){if(dt>0)this.lookingBehind=keys.has('KeyC');super.step(keys,dt);this.sync(dt);}
 override reset(){this.lookingBehind=false;super.reset();this.effects?.reset();this.sync(0);}
 toggleView(){this.firstPerson=!this.firstPerson;this.sync(0);}
 setActorsEnabled(enabled:boolean){this.actorsEnabled=enabled;if(!enabled)this.effects.reset();this.sync(0);}
 get camera(){
  const f=new Vector3(Math.sin(this.yaw+(this.lookingBehind?Math.PI:0)),0,Math.cos(this.yaw+(this.lookingBehind?Math.PI:0))),target=new Vector3(this.x,this.y+(this.mode==='swim'?.1:1.3),this.z);
  if(this.firstPerson){const eye=this.mode==='swim'?target.add(new Vector3(Math.sin(this.yaw)*.6,0,Math.cos(this.yaw)*.6)):new Vector3(this.x,this.y+1.53,this.z);return {eye,target:eye.add(f.scale(3)).add(new Vector3(0,-Math.sin(this.pitch)*3,0))};}
  const eye=target.subtract(f.scale(3.7*Math.cos(this.pitch)));eye.y+=.7+Math.sin(this.pitch)*3.7;
  if(this.mode==='swim'&&this.swimmer.depth>.35)eye.y=Math.min(eye.y,this.spec.waterHeight-.2);eye.y=Math.max(eye.y,this.floor.at(eye.x,eye.z)+.35);return {eye,target};
 }
 get meshes():AbstractMesh[]{return [...this.root.getChildMeshes(),...(this.swimRider?.meshes??[]),...(this.walkRider?.meshes??[])];}
 diagnostics(){return {mode:this.mode,depth:this.depth,feetY:this.mode==='walk'?this.walker.feetY:null,floor:this.floor.at(this.x,this.z),grounded:this.mode==='walk'&&!this.walker.airborne,canFinish:this.canFinish(),swim:this.swimRider?.swimPoseStats(),walkingAvatar:!!this.walkRider};}
 dispose(){this.disposed=true;this.effects.dispose();this.swimRider?.dispose();this.walkRider?.dispose();this.root.dispose(false,false);this.material.dispose();}
}
