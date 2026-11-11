import {Color3,DynamicTexture,Mesh,MeshBuilder,PBRMaterial,Vector3,type Scene} from '@babylonjs/core';
import {CLIMB_SITE,NativeClimbSite} from './native-climb-site.ts';

/** A permanent, collidable city workshop, with an open cage and individual rungs. */
export function createNativeClimbScene(scene:Scene,site:NativeClimbSite){
 const meshes:Mesh[]=[],materials:PBRMaterial[]=[];
 const material=(name:string,color:string,metallic=0)=>{const m=new PBRMaterial('city-climb:'+name,scene);m.albedoColor=Color3.FromHexString(color);m.roughness=metallic?.48:.93;m.metallic=metallic;materials.push(m);return m;};
 const palette={wall:material('concrete','#ada89a'),roof:material('roof','#696d6c'),metal:material('galvanized-steel','#8d9b9d',.65),crate:material('timber','#907051'),dark:material('trim','#344344',.4),yellow:material('safety-yellow','#e9b84b',.25),glass:material('old-window','#506b71',.1),paving:material('yard','#777874')};
 const add=(mesh:Mesh,m:PBRMaterial)=>{mesh.material=m;mesh.receiveShadows=true;mesh.isPickable=false;mesh.metadata={cityClimb:true};meshes.push(mesh);return mesh;};
 const box=(name:string,x:number,y:number,z:number,w:number,h:number,d:number,m:PBRMaterial)=>{const mesh=MeshBuilder.CreateBox('city-climb:'+name,{width:w,height:h,depth:d},scene);mesh.position.set(x,y,z);return add(mesh,m);};
 const pipe=(name:string,a:Vector3,b:Vector3,r=.035,m=palette.metal)=>add(MeshBuilder.CreateTube('city-climb:'+name,{path:[a,b],radius:r,tessellation:8,cap:Mesh.CAP_ALL},scene),m);
 const y=site.groundY,l=site.ladder,top=l.top;
 box('yard',CLIMB_SITE.x,y-.07,CLIMB_SITE.z,CLIMB_SITE.width,.14,CLIMB_SITE.depth,palette.paving);
 for(const solid of site.solids)box(solid.name,solid.x,solid.y+solid.height/2,solid.z,solid.width,solid.height,solid.depth,palette[solid.material]);
 for(const x of [3485.15,3494.85])box('wall-pier',x,y+2.05,909.97,.28,4.1,.17,palette.roof);
 for(const x of [3486.8,3493.2]){
  box('window-frame',x,y+2.6,909.94,2.3,1.1,.10,palette.dark);
  box('window-glass',x,y+2.6,909.88,2.12,.91,.04,palette.glass);
  for(const dx of [-.36,.36])box('window-mullion',x+dx,y+2.6,909.84,.04,.95,.06,palette.metal);
 }
 for(let x=3475.3;x<3483;x+=.3)box('workshop-siding',x,y+2.4,907.97,.035,4.8,.08,palette.roof);
 box('workshop-door',3479,y+1.3,907.9,3.2,2.6,.12,palette.dark);
 for(let h=.2;h<2.6;h+=.16)box('roller-door-slat',3479,y+h,907.82,3.1,.035,.05,palette.metal);
 for(const x of [l.x-.43,l.x+.43])pipe('ladder-rail',new Vector3(x,y+.05,909.8),new Vector3(x,top+1.03,909.8),.044);
 for(let h=.24;h<=CLIMB_SITE.roofHeight+.02;h+=.28)pipe('ladder-rung',new Vector3(l.x-.43,y+h,909.8),new Vector3(l.x+.43,y+h,909.8),.033);
 for(const h of [.5,1.7,2.9,4.05])for(const x of [l.x-.43,l.x+.43])pipe('ladder-bracket',new Vector3(x,y+h,909.8),new Vector3(x,y+h,910.08),.027,palette.dark);
 // Semicircular hoops open towards the roof; no solid box obstructs the body.
 for(let h=2.1;h<=5.1;h+=.65){const path=Array.from({length:17},(_,i)=>{const a=i*Math.PI/16;return new Vector3(l.x-.76*Math.cos(a),y+h,909.84-.76*Math.sin(a));});add(MeshBuilder.CreateTube('city-climb:cage-hoop',{path,radius:.025,tessellation:6},scene),palette.yellow);}
 for(const a of [Math.PI/4,Math.PI/2,3*Math.PI/4])pipe('cage-upright',new Vector3(l.x-.76*Math.cos(a),y+2.1,909.84-.76*Math.sin(a)),new Vector3(l.x-.76*Math.cos(a),y+5.1,909.84-.76*Math.sin(a)),.018,palette.yellow);
 for(const x of [l.x-.72,l.x+.72]){
  pipe('top-handrail',new Vector3(x,top+1.02,909.8),new Vector3(x,top+1.02,911.1),.035,palette.yellow);
  pipe('top-post',new Vector3(x,top,911.1),new Vector3(x,top+1.02,911.1),.035,palette.yellow);
 }
 for(const dx of [-.7,.7])for(const dz of [-.5,.5])box('crate-corner',3494+dx,y+.36,903+dz,.10,.75,.10,palette.dark);
 for(const h of [.16,.5])box('crate-strap',3494,y+h,902.23,2.02,.06,.035,palette.dark);
 for(let i=0;i<7;i++)box('vent-louvre',3493,top+.2+i*.11,915.17,1.45,.025,.08,palette.dark);
 const sign=(name:string,x:number,sy:number,z:number,w:number,h:number,draw:(ctx:CanvasRenderingContext2D)=>void)=>{
  const texture=new DynamicTexture('city-climb:'+name,{width:1024,height:512},scene,false);const ctx=texture.getContext() as CanvasRenderingContext2D;draw(ctx);texture.update();
  const m=material(name,'#ffffff');m.albedoTexture=texture;m.emissiveColor=new Color3(.13,.13,.13);m.backFaceCulling=false;
  const plane=MeshBuilder.CreatePlane('city-climb:'+name,{width:w,height:h},scene);plane.position.set(x,sy,z);add(plane,m);
 };
 sign('workshop-sign',3479,y+3.65,907.78,5.8,1.65,ctx=>{ctx.fillStyle='#293d40';ctx.fillRect(0,0,1024,512);ctx.fillStyle='#eac571';ctx.font='bold 110px sans-serif';ctx.fillText("Huaqiangbei · Maintenance Workshop",38,195);ctx.fillStyle='#e0e0d1';ctx.font='56px sans-serif';ctx.fillText('ROOFTOP ACCESS  /  08',40,350);});
 sign('graffiti',3487.15,y+1,909.77,3.1,1.4,ctx=>{ctx.fillStyle='#ada89a';ctx.fillRect(0,0,1024,512);ctx.strokeStyle='#59868a';ctx.lineWidth=35;ctx.beginPath();ctx.moveTo(30,350);ctx.lineTo(220,150);ctx.lineTo(340,355);ctx.lineTo(510,120);ctx.lineTo(715,350);ctx.lineTo(970,120);ctx.stroke();ctx.fillStyle='#d9be80';ctx.font='italic bold 142px sans-serif';ctx.fillText('UP ↑',180,340);});
 // No in-world start/goal rings. Navigation keeps its existing minimap target.
 // Batch small authored parts by material. Physics keeps the same explicit solids.
 const merged:Mesh[]=[];
 for(const m of materials){const group=meshes.filter(mesh=>mesh.material===m);if(!group.length)continue;const mesh=Mesh.MergeMeshes(group,true,true,undefined,false,false);if(mesh){mesh.name='city-climb:'+m.name;mesh.isPickable=false;mesh.receiveShadows=true;merged.push(mesh);}}
 return {meshes:merged,dispose(){for(const mesh of merged)mesh.dispose();for(const m of materials)m.dispose(false,true);}};
}
