import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {NATIVE_FLIGHT_TASK as config,NATIVE_FLIGHT_LAUNCH,NATIVE_FLIGHT_DESTINATION,NATIVE_FLIGHT_RUNWAYS,FLIGHT_DEPARTURE,FLIGHT_ARRIVAL,nativeFlightSurfaceAt,NativeFlightMission,nativeFlightTarget} from '../src/native-flight-route.ts';
import {FlightSimulation,flightBasis,flightChaseCamera} from '../src/city-flight-simulation.ts';
import {FLIGHT_GEAR_CLEARANCE,runwayContains,runwayPoint} from '../src/city-flight-ground.ts';
import {FlightCityCollision} from '../src/city-flight-collision.ts';
import {inRing,CityCollision} from '../src/driving.ts';
import {CityWalk} from '../src/city-walk.ts';
import {flightTestControls} from './flight-pilot.mjs';
const data=JSON.parse(fs.readFileSync(new URL('../../city/city.json',import.meta.url),'utf8'));
const extent=data.meta.extent;
const collision=new FlightCityCollision(data,(x,z)=>nativeFlightSurfaceAt(x,z)??0);
const close=(a:number,b:number)=>assert.ok(Math.abs(a-b)<1e-8,a+' != '+b);
const aircraft=()=>{const sim=new FlightSimulation();sim.runways=NATIVE_FLIGHT_RUNWAYS;sim.start(config.spawn,config.yaw);return sim;};

test('real city walking can reach the parked plane; airfield map markers are not solid buildings',()=>{
 const city=new CityCollision({...data,landmarks:[...data.landmarks,NATIVE_FLIGHT_LAUNCH,NATIVE_FLIGHT_DESTINATION]});
 const walk=new CityWalk((x,z)=>city.blocked(x,z),(x,z)=>nativeFlightSurfaceAt(x,z)??0);
 walk.active=true;walk.x=NATIVE_FLIGHT_LAUNCH.x;walk.z=NATIVE_FLIGHT_LAUNCH.z;walk.yaw=NATIVE_FLIGHT_LAUNCH.yaw;
 for(let i=0;i<800;i++)walk.step(new Set(['KeyW']),1/60);
 assert.ok(walk.distance>15);assert.ok(Math.hypot(walk.x-config.spawn.x,walk.z-config.spawn.z)<config.boardingRadius);
});

test('both airfields and city boarding point are inland, inside the city and clear of building footprints',()=>{
 const points=[{x:NATIVE_FLIGHT_LAUNCH.x,z:NATIVE_FLIGHT_LAUNCH.z}];
 for(const r of NATIVE_FLIGHT_RUNWAYS)for(let s=-r.length/2-20;s<=r.length/2+20;s+=20)for(const side of [-30,0,30]){
  const p=runwayPoint(r,s,side);points.push(p);
  assert.equal(collision.sweep({...p,y:r.y+2},{...p,y:r.y+2}),null);
 }
 for(let right=24;right<=45;right+=.5){const p=runwayPoint(FLIGHT_DEPARTURE,-261,right);points.push(p);const next=runwayPoint(FLIGHT_DEPARTURE,-261,right+.5);assert.ok(Math.abs((nativeFlightSurfaceAt(p.x,p.z)??0)-(nativeFlightSurfaceAt(next.x,next.z)??0))<.1,'city entrance has a walkable ramp');}
 for(const p of points){
  assert.ok(p.x>extent[0]+200&&p.x<extent[2]-200&&p.z>extent[1]+200&&p.z<extent[3]-200);
  assert.ok(data.land.some((rings:number[][][])=>inRing(p.x,p.z,rings[0])&&!rings.slice(1).some(r=>inRing(p.x,p.z,r))));
  assert.ok(!data.water.some((water:{rings:number[][][]})=>inRing(p.x,p.z,water.rings[0])));
 }
});

test('ground spawn, runway, camera and NPC share the configured heading',()=>{
 close(config.yaw,Math.atan2(config.direction.x,config.direction.z));
 close(config.spawn.y,FLIGHT_DEPARTURE.y+FLIGHT_GEAR_CLEARANCE);
 const p={...config.spawn,yaw:config.yaw,pitch:0,roll:0},f=flightBasis(p).forward,shot=flightChaseCamera(p),target=nativeFlightTarget(0);
 close(Math.atan2(shot.target.x-shot.eye.x,shot.target.z-shot.eye.z),p.yaw);
 close(Math.atan2(target.x-p.x,target.z-p.z),p.yaw);
 close(FLIGHT_DEPARTURE.yaw,p.yaw);assert.ok((shot.eye.x-p.x)*f.x+(shot.eye.z-p.z)*f.z<0);
});

test('real controls complete ground roll, takeoff, NPC approach, landing and stationary finish',()=>{
 const sim=aircraft(),mission=new NativeFlightMission(),stages=new Set([mission.stage]);
 // Waiting on the ground neither moves the plane nor advances an airborne NPC.
 for(let i=0;i<120;i++){sim.step(new Set(),1/60,i*1000/60,(a,b)=>collision.sweep(a,b),extent);mission.step(null,1/60,false,extent);}
 assert.deepEqual(sim.pose,{...config.spawn,yaw:config.yaw,pitch:0,roll:0});assert.equal(sim.onGround,true);assert.equal(mission.airElapsed,0);
 mission.board();stages.add(mission.stage);
 let maxAltitude=0,approachTime=0;
 for(let i=0;i<120*60&&!mission.outcome;i++){
  const keys=flightTestControls(sim,mission.stage,mission.target,FLIGHT_ARRIVAL);
  sim.step(new Set(keys),1/60,i*1000/60,(a,b)=>collision.sweep(a,b),extent);
  mission.step(sim,1/60,false,extent);stages.add(mission.stage);maxAltitude=Math.max(maxAltitude,sim.pose.y);
  if(mission.approached&&!approachTime){approachTime=mission.elapsed;assert.equal(mission.outcome,null,'NPC proximity is only an intermediate checkpoint');}
 }
 assert.equal(mission.outcome,'success',mission.reason);assert.deepEqual([...stages],['boarding','takeoff','approach','landing','complete']);
 assert.equal(sim.takeoffs,1);assert.equal(sim.landings,1);assert.equal(sim.crashes,0);assert.ok(maxAltitude>70);
 assert.equal(sim.groundRunwayId,FLIGHT_ARRIVAL.id);assert.ok(runwayContains(FLIGHT_ARRIVAL,sim.pose,7));
 assert.ok(sim.speed<=config.stopSpeed);assert.equal(sim.throttle,0);assert.ok(mission.elapsed>approachTime+10);
 assert.ok(sim.touchdown!.sinkSpeed<=4);assert.ok(mission.stoppedFor>=config.stopSeconds-1e-8);
});

test('boarding and genuine takeoff are required before a 3D NPC approach counts',()=>{
 const sim=aircraft(),mission=new NativeFlightMission();sim.pose={...mission.target,yaw:config.yaw,pitch:0,roll:0};
 mission.step(sim,0,false,extent);assert.equal(mission.stage,'boarding');
 mission.board();mission.step(sim,0,false,extent);assert.equal(mission.stage,'takeoff');
 sim.onGround=false;sim.takeoffs=1;
 sim.pose={...mission.target,y:mission.target.y+60.01,yaw:config.yaw,pitch:0,roll:0};
 mission.step(sim,0,false,extent);assert.equal(mission.stage,'approach');
 sim.pose.y=mission.target.y+60;mission.step(sim,0,false,extent);
 assert.equal(mission.stage,'landing');assert.equal(mission.approached,true);assert.equal(mission.outcome,null);
});

test('wrong runway, flyover, powered rollout and brief stops cannot finish the task',()=>{
 const sim=aircraft(),mission=new NativeFlightMission();mission.board();sim.onGround=false;sim.takeoffs=1;sim.pose={...mission.target,yaw:config.yaw,pitch:0,roll:0};mission.step(sim,0,false,extent);
 sim.pose={...runwayPoint(FLIGHT_ARRIVAL,0),y:FLIGHT_ARRIVAL.y+FLIGHT_GEAR_CLEARANCE,yaw:config.yaw,pitch:0,roll:0};
 sim.speed=0;sim.landings=1;
 for(let i=0;i<30;i++)mission.step(sim,.1,false,extent);assert.equal(mission.outcome,null,'airborne overlap cannot finish');
 sim.onGround=true;sim.groundRunwayId=FLIGHT_DEPARTURE.id;
 for(let i=0;i<30;i++)mission.step(sim,.1,false,extent);assert.equal(mission.outcome,null,'wrong runway');
 sim.groundRunwayId=FLIGHT_ARRIVAL.id;sim.throttle=.5;
 for(let i=0;i<30;i++)mission.step(sim,.1,false,extent);assert.equal(mission.stoppedFor,0);
 sim.throttle=0;for(let i=0;i<19;i++)mission.step(sim,.1,false,extent);assert.equal(mission.outcome,null);
 sim.speed=5;mission.step(sim,.1,false,extent);assert.equal(mission.stoppedFor,0);
 sim.speed=0;for(let i=0;i<20;i++)mission.step(sim,.1,false,extent);assert.equal(mission.outcome,'success');
});

test('pause freezes every mission stage and restart restores the full city departure',()=>{
 const sim=aircraft(),mission=new NativeFlightMission();mission.board();mission.step(sim,.1,false,extent);
 const before=JSON.stringify(mission);for(let i=0;i<10;i++)mission.step(sim,10,true,extent);assert.equal(JSON.stringify(mission),before);
 const restarted=new NativeFlightMission();assert.equal(restarted.stage,'boarding');assert.equal(restarted.elapsed,0);assert.equal(restarted.approached,false);assert.deepEqual(restarted.target,nativeFlightTarget(0));
});

test('crash and exiting before landing cannot be awarded success',()=>{
 for(const phase of ['exploding','idle'] as const){const sim=aircraft(),mission=new NativeFlightMission();mission.board();sim.phase=phase;assert.equal(mission.step(sim,.1,false,extent),'failure');}
});
