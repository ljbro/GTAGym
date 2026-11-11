import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {RoadGraph} from '../src/navigation.ts';
import {CityCollision} from '../src/driving.ts';
import {calibratedM06Route} from '../src/native-direct-road-route.ts';
import {findShowroomPlacement,showroomInside,showroomReserved} from '../src/native-showroom-layout.ts';
import {garageWorld} from '../src/native-garage-layout.ts';
import {NATIVE_DRIVE_ASSIGNMENTS,nativeDriveFootprintClear} from '../src/native-drive-vehicle-spec.ts';
const graph=new RoadGraph([],JSON.parse(fs.readFileSync(new URL('../../city/navigation.json',import.meta.url),'utf8')));
const collision=new CityCollision(JSON.parse(fs.readFileSync(new URL('../../city/city.json',import.meta.url),'utf8')));
test('M06 routes preserve endpoints/data, remove detours and remain on clear native roads',()=>{
 for(const [id,kind,a,b,max]of [
  ['c01-n12','motorcycle-bagger',[-5929,945],[-5211.6,1484.7],3500],
  ['c01-n13','van',[1222.3,-621.8],[-12.4,-251.6],5100],
 ]as const){
  assert.equal(NATIVE_DRIVE_ASSIGNMENTS[id].kind,kind);
  const source:[number,number][]=[[...a],[0,0],[...b]],before=JSON.stringify(source),r=calibratedM06Route(graph,id,source);
  assert.equal(JSON.stringify(source),before);assert.deepEqual(r.points[0],a);assert.deepEqual(r.points.at(-1),b);assert(r.length<max);
  assert.equal(new Set(r.points.map(p=>p.join(','))).size,r.points.length,'no exact repeated nodes');
  const expected=id==='c01-n12'?'LLRRRRLLLLRRRLRLR':'RRRRRRLLRLLRRRR';assert.equal(r.turnDirections.map(t=>t[0].toUpperCase()).join(''),expected);
  for(let i=1;i<r.points.length;i++){
   const p=r.points[i-1],q=r.points[i],d=Math.hypot(q[0]-p[0],q[1]-p[1]),n=Math.ceil(d/2),yaw=Math.atan2(q[0]-p[0],q[1]-p[1]);
   for(let k=0;k<=n;k++){
    const x=p[0]+(q[0]-p[0])*k/n,z=p[1]+(q[1]-p[1])*k/n;
    assert(nativeDriveFootprintClear(x,z,yaw,kind,(x,z)=>collision.blocked(x,z)),`${id} footprint at ${x},${z}`);
    const road=collision.nearest(x,z);assert(road&&road.d<road.road.width/2,'route stays on actual road');
   }
  }
 }
});
test('c01-n10 showroom has a clear plot and entry no longer requires the whole car inside',()=>{
 const actualEnd:[number,number]=[1452.2,2348.3];
 assert.equal(graph.route(actualEnd,[4690.44,1674.19]).length,0,'old hard-coded goal was unreachable and ignored');
 const site=findShowroomPlacement(graph,actualEnd,{blocked:(x,z)=>collision.blocked(x,z),heightAt:()=>0,roadAt:(x,z)=>collision.nearest(x,z)});
 assert(graph.route(actualEnd,site.originalGoal).length>0,'showroom connects to actual route end');
 const yaw=site.yaw+Math.PI/2;
 // Existing road goal can already be the showroom's selected entrance node.
 // A one-point graph route means no road connector is needed, not unreachable.
 assert.equal(graph.route(site.originalGoal,site.originalGoal).length,1);
 assert(!showroomInside(site,...site.approach,yaw));assert(!showroomInside(site,...site.door,yaw));
 assert(showroomInside(site,...site.goal,yaw));
 assert(showroomInside(site,...garageWorld(site,-5.7,-1.925),yaw),'entry before the rear crosses is enough');
 assert(showroomInside(site,...garageWorld(site,4,0),yaw));
 assert(showroomInside(site,...garageWorld(site,0,5.5),yaw));
 assert(!showroomInside(site,...garageWorld(site,0,6),yaw));
 assert(showroomReserved(site,...site.origin));assert(showroomReserved(site,...site.approach));
 assert(showroomReserved(site,(site.originalGoal[0]+site.door[0])/2,(site.originalGoal[1]+site.door[1])/2));
 assert(!showroomReserved(site,site.origin[0]+100,site.origin[1]+100));
 for(let x=-6;x<=6;x++)for(let z=-6;z<=6;z++)assert(!collision.blocked(...garageWorld(site,x,z)));
});
