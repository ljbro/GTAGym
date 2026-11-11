import {Mesh,PBRMaterial,Texture,VertexData,type Scene} from '@babylonjs/core';
import {channelBank,waterChannelPath} from './native-water-channel.ts';
import type {BoatSpec} from './native-boat-motion.ts';
/** Two solid continuous banks rooted in the actual task seabed. */
export class NativeWaterChannelView{
 readonly meshes:Mesh[]=[];private material:PBRMaterial;
 constructor(scene:Scene,spec:BoatSpec){
  const path=waterChannelPath(spec),width=spec.channelHalfWidth!,bottom=spec.waterHeight-spec.deepFloorDepth-.1,top=spec.waterHeight+.85;
  this.material=new PBRMaterial('native-channel-stone',scene);this.material.albedoTexture=new Texture('/city/textures/architecture/light-stone.png',scene);this.material.roughness=.94;this.material.backFaceCulling=false;
  for(const side of [-1,1]){
   const inside=channelBank(path,side*width),outside=channelBank(path,side*(width+3)),positions:number[]=[],indices:number[]=[],uvs:number[]=[],normals:number[]=[];let along=0;
   path.forEach((p,i)=>{if(i)along+=Math.hypot(p[0]-path[i-1][0],p[1]-path[i-1][1]);const a=inside[i],b=outside[i];
    for(const [x,y,z,v]of [[a[0],bottom,a[1],0],[b[0],bottom,b[1],3],[b[0],top,b[1],3+top-bottom],[a[0],top,a[1],6+top-bottom]]){positions.push(x,y,z);uvs.push(along/3,v/3);}
    if(i)for(let k=0;k<4;k++){const a=(i-1)*4+k,b=(i-1)*4+(k+1)%4,c=i*4+(k+1)%4,d=i*4+k;indices.push(a,b,c,a,c,d);}
   });
   indices.push(0,2,1,0,3,2);const n=positions.length/3-4;indices.push(n,n+1,n+2,n,n+2,n+3);
   VertexData.ComputeNormals(positions,indices,normals);const data=new VertexData();Object.assign(data,{positions,indices,normals,uvs});
   const mesh=new Mesh('native-continuous-channel-bank-'+side,scene);data.applyToMesh(mesh);mesh.material=this.material;mesh.receiveShadows=true;mesh.isPickable=false;this.meshes.push(mesh);
  }
 }
 dispose(){for(const mesh of this.meshes)mesh.dispose(false,false);this.material.dispose(false,true);}
}
