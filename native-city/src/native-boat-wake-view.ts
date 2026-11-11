import {Mesh,ShaderMaterial,VertexBuffer,VertexData,type Scene} from '@babylonjs/core';
import {BoatWake} from './native-boat-wake.ts';
/** One transparent draw call, no downloaded assets, render targets or canvas. */
export class NativeBoatWakeView{
 readonly mesh:Mesh;readonly motion:BoatWake;
 private material:ShaderMaterial;private positions=new Float32Array(320*12);private colors=new Float32Array(320*16);
 constructor(scene:Scene,halfWidth:number,halfLength:number,private height:number,swimmer=false){
  this.motion=new BoatWake(halfWidth,halfLength,swimmer);
  this.mesh=new Mesh('native-boat-foam-wake',scene);this.mesh.isPickable=false;this.mesh.hasVertexAlpha=true;
  this.material=new ShaderMaterial('native-boat-foam',scene,{
   vertexSource:`precision highp float;attribute vec3 position;attribute vec2 uv;attribute vec4 color;uniform mat4 worldViewProjection;varying vec2 vUV;varying vec4 vColor;void main(){vUV=uv;vColor=color;gl_Position=worldViewProjection*vec4(position,1.);}`,
   fragmentSource:`precision highp float;varying vec2 vUV;varying vec4 vColor;uniform float stroke;
    float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
    float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(hash(i),hash(i+vec2(1.,0.)),f.x),mix(hash(i+vec2(0.,1.)),hash(i+vec2(1.,1.)),f.x),f.y);}
    void main(){vec2 q=(vUV-.5)*2.;float n=noise(vUV*vec2(12.,19.)+vColor.r*3.);
     float edge=1.-smoothstep(.35,1.,dot(q,q)+n*.23);
     float bubbles=smoothstep(.27,.73,n)*.72+.12;
     float ring=smoothstep(.3,.60,length(q))*(1.-smoothstep(.60,1.,length(q)));
     float alpha=mix(edge*bubbles,ring,stroke)*vColor.a;if(alpha<.003)discard;
     gl_FragColor=vec4(mix(vec3(.53,.73,.73),vec3(.91,.96,.93),n),alpha);}`,
  },{attributes:['position','uv','color'],uniforms:['worldViewProjection','stroke'],needAlphaBlending:true});
  this.material.setFloat('stroke',swimmer?1:0);
  this.material.backFaceCulling=false;this.material.disableDepthWrite=true;this.mesh.material=this.material;
  const data=new VertexData(),uvs:number[]=[],indices:number[]=[];
  for(let i=0;i<320;i++){uvs.push(0,0,1,0,1,1,0,1);const n=i*4;indices.push(n,n+1,n+2,n,n+2,n+3);}
  data.positions=this.positions;data.colors=this.colors;data.uvs=uvs;data.indices=indices;data.applyToMesh(this.mesh,true);this.mesh.setEnabled(false);
 }
 reset(){this.motion.reset();this.mesh.setEnabled(false);}
 update(x:number,z:number,yaw:number,speed:number,dt:number,grounded:boolean){
  this.motion.step(x,z,yaw,speed,dt,grounded);
  const patches=this.motion.patches;this.mesh.setEnabled(patches.length>0);if(!patches.length)return;
  this.colors.fill(0);
  // Local origin stays near the boat; historical patches remain in world space.
  this.mesh.position.set(x,this.height+.035,z);
  for(let i=0;i<320;i++){
   const p=patches[i];if(!p){this.positions.fill(0,i*12,i*12+12);continue;}
   const t=p.age/p.life,spread=1+p.age*.38,w=p.width*spread/2,l=p.length*(1+p.age*.15)/2;
   const alpha=p.strength*(1-t)*(1-t)*Math.min(1,(p.age+.05)/.15),c=Math.cos(p.yaw),s=Math.sin(p.yaw);
   for(const [k,[u,v]] of [[-w,-l],[w,-l],[w,l],[-w,l]].entries()){
    const a=i*12+k*3;this.positions[a]=p.x-x+c*u+s*v;this.positions[a+1]=0;this.positions[a+2]=p.z-z-s*u+c*v;
    const b=i*16+k*4;this.colors[b]=p.seed;this.colors[b+3]=alpha;
   }
  }
  this.mesh.updateVerticesData(VertexBuffer.PositionKind,this.positions,true);
  this.mesh.updateVerticesData(VertexBuffer.ColorKind,this.colors);
 }
 dispose(){this.mesh.dispose();this.material.dispose();}
}
