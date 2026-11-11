import {Color3,DynamicTexture,Mesh,MeshBuilder,Quaternion,StandardMaterial,TransformNode,VertexData} from '@babylonjs/core';
import type {DrivingWorld} from './city-world.ts';
import {NATIVE_FLIGHT_LAUNCH,NATIVE_FLIGHT_DESTINATION,NATIVE_FLIGHT_RUNWAYS,NATIVE_FLIGHT_TASK,NativeFlightMission} from './native-flight-route.ts';

export function createNativeFlightTarget(world:DrivingWorld,state:NativeFlightMission){
 const flight=world.flight;if(!flight?.loaded)throw Error("Mission aircraft has not loaded yet.");
 const sim=flight.sim;
 const model=state.hasNpc?flight.modelRoot.clone('native-flight-npc',null,false):null;
 if(model){model.scaling.setAll(1.8);model.setEnabled(false);for(const mesh of model.getChildMeshes())mesh.isPickable=false;}
 const propeller=model?.getChildTransformNodes().find(node=>node.name.endsWith('floatplane_propeller'));
 const material=new StandardMaterial('native-flight-target-ring-material',world.scene);
 material.diffuseColor=Color3.FromHexString('#f5d079');material.emissiveColor=material.diffuseColor.scale(.65);material.disableLighting=true;
 const diameter=state.hasNpc?state.config.completionRadius*2:state.config.vehicle==='helicopter'?24:70;
 const ring=MeshBuilder.CreateTorus('native-flight-target-ring',{diameter,thickness:.7,tessellation:64},world.scene);
 ring.material=material;ring.isPickable=false;ring.setEnabled(false);
 function update(mission:NativeFlightMission,dt:number){
  const airborne=!['boarding','takeoff','complete'].includes(mission.stage);
  model?.setEnabled(airborne);ring.setEnabled(airborne&&mission.stage!=='landing');
  const p=mission.navigationTarget;ring.position.set(p.x,p.y,p.z);
  ring.rotation.set(Math.PI/2,Math.atan2(p.x-sim.pose.x,p.z-sim.pose.z),0);
  if(model){const npc=mission.npcTarget;model.position.set(npc.x,npc.y,npc.z);model.rotationQuaternion=Quaternion.RotationYawPitchRoll(mission.npcYaw,0,0);}
  if(propeller){propeller.rotationQuaternion=null;propeller.rotation.z+=dt*85;}
 }
 return {update,dispose(){model?.dispose(false,false);ring.dispose();material.dispose();}};
}

/** Two paved training sites inside the city. Flight and walking use the same
 * deck heights; vegetation reserves these footprints before it is populated. */
export function createNativeFlightLaunch(world:DrivingWorld){
 const places=[NATIVE_FLIGHT_LAUNCH,NATIVE_FLIGHT_DESTINATION].map(place=>({...place,arrival:[...place.arrival] as [number,number]}));
 world.data.landmarks.push(...places);
 const roots:TransformNode[]=[],materials:StandardMaterial[]=[],textures:DynamicTexture[]=[];
 function material(name:string,color:string,glow=0){const m=new StandardMaterial(name,world.scene);m.diffuseColor=Color3.FromHexString(color);m.specularColor=Color3.Black();m.emissiveColor=m.diffuseColor.scale(glow);materials.push(m);return m;}
 const asphalt=material('native-runway-asphalt','#343c43'),white=material('native-runway-markings','#eef1e5',.15),lights=material('native-runway-lights','#9cffe3',.8);
 NATIVE_FLIGHT_RUNWAYS.forEach((runway,index)=>{
  const root=new TransformNode('native-flight-runway-'+runway.id,world.scene);roots.push(root);root.position.set(runway.x,runway.y,runway.z);root.rotation.y=runway.yaw;
  const box=(name:string,width:number,height:number,depth:number,x:number,y:number,z:number,mat:StandardMaterial)=>{
   const mesh=MeshBuilder.CreateBox(name,{width,height,depth},world.scene);mesh.parent=root;mesh.position.set(x,y,z);mesh.material=mat;mesh.receiveShadows=true;mesh.isPickable=false;return mesh;
  };
  box('native-flight-runway-deck',60,1,runway.length+40,0,-.5,0,asphalt);
  const ramp=new Mesh('native-flight-city-access-ramp',world.scene),rampData=new VertexData();
  rampData.positions=[30,0,-278,42,-runway.y,-278,30,0,-244,42,-runway.y,-244];rampData.indices=[0,1,2,1,3,2];
  const normals:number[]=[];VertexData.ComputeNormals(rampData.positions,rampData.indices,normals);rampData.normals=normals;rampData.applyToMesh(ramp);
  ramp.parent=root;ramp.material=asphalt;ramp.receiveShadows=true;ramp.isPickable=false;
  for(const side of [-1,1]){
   box('native-flight-runway-edge',.35,.025,runway.length,side*(runway.width/2-1),.02,0,white);
   for(let z=-280;z<=280;z+=40)box('native-flight-runway-edge-light',.45,.3,.6,side*24,.15,z,lights);
   for(const z of [-280,280])for(const x of [3,6,9,12,15,18])box('native-flight-runway-threshold',1.4,.03,14,x*side,.02,z,white);
  }
  for(let z=-246;z<=246;z+=36)box('native-flight-runway-centerline',.7,.03,17,0,.02,z,white);
  const padZ=index?-145:-255,pad=MeshBuilder.CreateTorus('native-flight-helipad',{diameter:22,thickness:.25,tessellation:64},world.scene);
  pad.parent=root;pad.position.set(0,.06,padZ);pad.material=white;pad.isPickable=false;
  for(const x of [-3,3])box('native-flight-helipad-H',.6,.03,8,x,.055,padZ,white);
  box('native-flight-helipad-H',6,.03,.6,0,.055,padZ,white);
  const sign=MeshBuilder.CreatePlane(index?'native-flight-arrival-sign':'native-flight-launch-sign',{width:20,height:6},world.scene);
  sign.parent=root;sign.position.set(27,8,-260);sign.billboardMode=Mesh.BILLBOARDMODE_Y;sign.isPickable=false;
  const texture=new DynamicTexture('native-flight-airfield-text-'+index,{width:1024,height:320},world.scene,false);textures.push(texture);
  const ctx=texture.getContext() as CanvasRenderingContext2D;ctx.fillStyle='#10292e';ctx.fillRect(0,0,1024,320);ctx.textAlign='center';ctx.fillStyle='#f5d079';ctx.font='bold 54px sans-serif';ctx.fillText(runway.name,512,85);ctx.fillStyle='#eff8ef';ctx.font='42px sans-serif';ctx.fillText(index?"Urban Landing Site":"City Flight Center",512,178);ctx.font='36px sans-serif';ctx.fillText(index?'ARRIVALS':'CITY AIRFIELD',512,259);texture.update();
  const signMaterial=material('native-flight-airfield-sign-'+index,'#ffffff',1);signMaterial.diffuseTexture=texture;signMaterial.disableLighting=true;signMaterial.backFaceCulling=false;sign.material=signMaterial;
 });
 let disposed=false;
 void world.flight?.load().then(()=>{if(!disposed&&!world.flight?.active&&!world.flight?.parked)world.flight?.park(NATIVE_FLIGHT_TASK.spawn,NATIVE_FLIGHT_TASK.yaw);}).catch(error=>console.error('Parked aircraft could not load',error));
 return {dispose(){disposed=true;for(const root of roots)root.dispose(false,false);for(const m of materials)m.dispose();for(const t of textures)t.dispose();for(const place of places){const index=world.data.landmarks.indexOf(place);if(index>=0)world.data.landmarks.splice(index,1);}}};
}
