import {Mesh,ShaderMaterial,VertexBuffer,VertexData,Vector3,type Scene,type Observer} from '@babylonjs/core';
import {NativeBoatWakeView} from './native-boat-wake-view.ts';
import {UnderwaterTrail} from './native-underwater-trail.ts';
/** Surface stroke wake + rising breath bubbles; submarine uses a subtle
 * propeller turbulence trail instead of human breathing. No gameplay effects. */
export class NativeSwimEffects{
 readonly surface:NativeBoatWakeView|null;readonly bubbles:Mesh;readonly trail:UnderwaterTrail;
 private material:ShaderMaterial;private observer:Observer<Scene>;private positions=new Float32Array(96*12);private colors=new Float32Array(96*16);
 constructor(private scene:Scene,private waterHeight:number,private submarine=false){
  this.surface=new NativeBoatWakeView(scene,submarine?1.1:.32,submarine?2.15:.55,waterHeight,!submarine);
  this.surface.mesh.name=submarine?'native-submarine-surface-wake':'native-swimmer-surface-wake';
  this.trail=new UnderwaterTrail(submarine);this.bubbles=new Mesh(submarine?'native-submarine-turbulence':'native-swimmer-bubbles',scene);this.bubbles.isPickable=false;
  this.material=new ShaderMaterial('native-underwater-bubbles',scene,{
   vertexSource:`precision highp float;attribute vec3 position;attribute vec2 uv;attribute vec4 color;uniform mat4 worldViewProjection;varying vec2 vUV;varying vec4 vColor;void main(){vUV=uv;vColor=color;gl_Position=worldViewProjection*vec4(position,1.);}`,
   fragmentSource:`precision highp float;varying vec2 vUV;varying vec4 vColor;void main(){vec2 p=(vUV-.5)*2.;float r=length(p);float rim=smoothstep(.56,.83,r)*(1.-smoothstep(.83,1.,r));float glint=exp(-32.*dot(p-vec2(-.3,.38),p-vec2(-.3,.38)));float a=(rim*.45+glint*.65+.025)*(1.-smoothstep(.90,1.,r))*vColor.a;if(a<.003)discard;gl_FragColor=vec4(.61,.84,.86,a);}`,
  },{attributes:['position','uv','color'],uniforms:['worldViewProjection'],needAlphaBlending:true});
  this.material.backFaceCulling=false;this.material.disableDepthWrite=true;this.bubbles.material=this.material;
  const data=new VertexData(),uvs:number[]=[],indices:number[]=[];
  for(let i=0;i<96;i++){uvs.push(0,0,1,0,1,1,0,1);const n=i*4;indices.push(n,n+1,n+2,n,n+2,n+3);}
  data.positions=this.positions;data.colors=this.colors;data.uvs=uvs;data.indices=indices;data.applyToMesh(this.bubbles,true);this.bubbles.setEnabled(false);
  this.observer=scene.onBeforeRenderObservable.add(()=>this.draw());
 }
 get meshes(){return [...(this.surface?[this.surface.mesh]:[]),this.bubbles];}
 reset(){this.surface?.reset();this.trail.reset();this.bubbles.setEnabled(false);}
 update(x:number,z:number,depth:number,yaw:number,speed:number,dt:number,active=true){
  const surfaceSpeed=this.submarine?speed*Math.max(0,1-depth):speed;
  this.surface?.update(x,z,yaw,active&&depth<=(this.submarine?.9:.35)?surfaceSpeed:0,dt,false);
  this.trail.step(x,this.waterHeight-depth,z,yaw,this.waterHeight,dt,active);
 }
 private draw(){
  const particles=this.trail.particles,camera=this.scene.activeCamera;this.bubbles.setEnabled(particles.length>0);if(!particles.length||!camera)return;
  const matrix=camera.getWorldMatrix(),right=Vector3.TransformNormal(Vector3.Right(),matrix).normalize(),up=Vector3.TransformNormal(Vector3.Up(),matrix).normalize();
  const origin=particles.at(-1)!;this.bubbles.position.set(origin.x,origin.y,origin.z);this.colors.fill(0);this.positions.fill(0);
  for(let i=0;i<particles.length;i++){const p=particles[i],r=p.radius*(1+p.age*.16),alpha=(1-p.age/p.life)*Math.min(1,(p.age+.05)/.18);
   for(const [k,[u,v]]of [[-r,-r],[r,-r],[r,r],[-r,r]].entries()){
    const a=i*12+k*3;this.positions[a]=p.x-origin.x+right.x*u+up.x*v;this.positions[a+1]=p.y-origin.y+right.y*u+up.y*v;this.positions[a+2]=p.z-origin.z+right.z*u+up.z*v;this.colors[i*16+k*4+3]=alpha;
   }
  }
  this.bubbles.updateVerticesData(VertexBuffer.PositionKind,this.positions,true);this.bubbles.updateVerticesData(VertexBuffer.ColorKind,this.colors);
 }
 dispose(){this.scene.onBeforeRenderObservable.remove(this.observer);this.surface?.dispose();this.bubbles.dispose();this.material.dispose();}
}
