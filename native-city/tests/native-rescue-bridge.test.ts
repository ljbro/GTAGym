import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import {createHash} from 'node:crypto';
import {rescueDriverInput} from '../../tests/rescue-route-driver.ts';
import {rescueBridgeLayout} from '../src/native-rescue-bridge-layout.ts';import {annotationTurns,nativeBends} from '../src/native-annotation-route.ts';import {CityCollision,stepCar,manualSteeringInput} from '../src/driving.ts';import {nativeDriveFootprintClear} from '../src/native-drive-vehicle-spec.ts';import {NativeCompanionRescue,rescueWindow} from '../src/native-companion-rescue.ts';import {trailerFootprintClear} from '../src/native-semi-articulation.ts';import {driveCarRoute} from '../../tests/car-route-driver.ts';
const read=(p:string)=>JSON.parse(fs.readFileSync(new URL('../../'+p,import.meta.url),'utf8')),route=read('native-city/src/native-rescue-routes.json')[0];
test('bridge vegetation clearance covers the entire deck, end ramps and overhanging crowns',()=>{
 const layout=rescueBridgeLayout(route,()=>0);
 for(let d=-12;d<=route.path.length+12;d+=2)for(const u of [-9.8,0,9.8]){
  const p=layout.station(d,u);assert(layout.vegetationReserved(p.x,p.z),`deck at ${d}/${u}`);
 }
 const near=layout.station(55,14),far=layout.station(55,30);
 assert(!layout.vegetationReserved(near.x,near.z,0));assert(layout.vegetationReserved(near.x,near.z,5));
 assert(!layout.vegetationReserved(far.x,far.z,5));
 const canopy=read('city/landscape/canopy-trees.json').trees;
 assert.equal(canopy.filter((p:number[])=>layout.vegetationReserved(p[0],p[1],0)).length,42,'real canopy trunks intersect the reserved bridge corridor');
});
test('continuous bridge triangles define the actual vehicle floor, including bends',()=>{
 const native=(x:number,z:number)=>.3*Math.sin(x/90)*Math.cos(z/70),layout=rescueBridgeLayout(route,native),g=layout.grid;
 for(let i=0;i<g.indices.length;i+=3){const p=g.indices.slice(i,i+3).map(k=>g.positions.slice(k*3,k*3+3)),x=p.reduce((s,p)=>s+p[0]/3,0),z=p.reduce((s,p)=>s+p[2]/3,0),y=p.reduce((s,p)=>s+p[1]/3,0),floor=layout.floorAt(x,z);assert(floor!==null);assert(Math.abs(floor+.06-y)<1e-6);}
 assert.equal(layout.floorAt(99999,99999),null);assert.equal(layout.elevation(0),0);assert.equal(layout.elevation(route.path.length),0);assert(layout.elevation(300)>11.9);
 for(const d of[route.path.length*.47,route.path.length*.8])for(const side of[-1,1]){const p=layout.station(d,side*9);assert(layout.blocked(p.x,p.z));}
});
test('player car and full moving boat convoy clear the proposed bridge',()=>{
 const layout=rescueBridgeLayout(route,()=>0),collision=new CityCollision(read('city/city.json')),blocked=(x:number,z:number)=>layout.blocked(x,z)||collision.blocked(x,z),[a,b]=route.path.points,state={x:a[0],z:a[1],yaw:Math.atan2(b[0]-a[0],b[1]-a[1]),speed:0,steer:0,distance:0};let previous=0,maxRise=0;
 const driven=driveCarRoute(route.path.points,state,(input,dt)=>{const before=[state.x,state.z],limit=manualSteeringInput(1,state.speed);stepCar(state,{...input,steer:Math.max(-limit,Math.min(limit,input.steer))},dt);assert(nativeDriveFootprintClear(state.x,state.z,state.yaw,'convertible',blocked));const floor=layout.floorAt(state.x,state.z);assert(floor!==null);const rise=Math.abs(floor-previous),travel=Math.hypot(state.x-before[0],state.z-before[1]);assert(rise<=travel*.18+.003,`ramp step ${rise} over ${travel}`);maxRise=Math.max(maxRise,rise);previous=floor;},{cruiseSpeed:36,cornerSpeed:14,lookAhead:9,lookSpeed:.2});assert(driven.complete);assert(maxRise<.17,`rise ${maxRise}`);
 const rescue=new NativeCompanionRescue(route.path.points),dummy={point:route.path.points[0],yaw:0,speed:0,driving:false,heightValid:false};let sideRun=0,maxSideRun=0,sternRun=0,maxSternRun=0;
 while(rescue.distance<rescue.length-.1){rescue.step(.1,dummy,dummy);const p=rescue.pose,t=rescue.trailer;assert(nativeDriveFootprintClear(...p.point,p.yaw,'semi-tractor',blocked));assert(trailerFootprintClear(t,blocked));
  for(const u of[-1.9,0,1.9])for(let v=-8.3;v<=-.3;v+=.5){const x=t.x+Math.cos(t.yaw)*u+Math.sin(t.yaw)*v,z=t.z-Math.sin(t.yaw)*u+Math.cos(t.yaw)*v;assert(!blocked(x,z));assert(layout.floorAt(x,z)!==null);}
  const side=rescueWindow(t,0),stern=rescueWindow(t,1);sideRun=nativeDriveFootprintClear(...side.point,side.yaw,'convertible',blocked)?sideRun+.1:0;sternRun=nativeDriveFootprintClear(...stern.point,stern.yaw,'convertible',blocked)?sternRun+.1:0;maxSideRun=Math.max(maxSideRun,sideRun);maxSternRun=Math.max(maxSternRun,sternRun);
 }assert(maxSideRun>5);assert(maxSternRun>5);
});
