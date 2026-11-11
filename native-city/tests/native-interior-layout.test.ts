import test from 'node:test';import assert from 'node:assert/strict';
import {NATIVE_INTERIORS,interiorSolids,insideSolid,interiorFloorPoints,interiorGeometryPoints,interiorRibbon,findInteriorPlacement,interiorVehicleOverlap,interiorVehicleSweepClear} from '../src/native-interior-layout.ts';
import {inRing} from '../src/driving.ts';
import original from '../src/native-interior-tasks.json' with {type:'json'};
test('eleven entries preserve source provenance including two authored layouts',()=>{
 assert.equal(NATIVE_INTERIORS.length,11);assert.equal(new Set(NATIVE_INTERIORS.map(t=>t.id)).size,11);
 assert.equal(NATIVE_INTERIORS.filter(t=>t.mode==='walk').length,8);
 for(const t of NATIVE_INTERIORS){assert.match(t.source.sha256,/^[a-f0-9]{64}$/);if(t.source.video)assert(t.source.end>t.source.start);else assert(t.id.startsWith('c09-'));assert(t.points.length>=2);const length=t.points.slice(1).reduce((sum,p,i)=>sum+Math.hypot(p[0]-t.points[i][0],p[1]-t.points[i][1]),0);assert(Math.abs(length-t.length)<1e-6);}
});
test('bank routes are not relabelled as measured and garage extension is disclosed',()=>{
 for(const t of NATIVE_INTERIORS.filter(t=>t.theme==='bank'))assert.equal(t.source.metricStatus,'not-measured');
 const garage=NATIVE_INTERIORS.find(t=>t.theme==='garage')!;assert(garage.length>65&&garage.length<75);assert.match(garage.source.note,/Franklin/);assert.match(garage.source.note,/2.1/);assert.match(garage.source.note,/Not Measured from Video/i);
 assert.equal(original.find(t=>t.id==='c01-n02')!.length,15.5);
});
test('garage starts facing away, retains the wide-door goal and physically divides the approach lanes',()=>{
 const t=NATIVE_INTERIORS.find(t=>t.id==='c01-n02')!,[a,b]=t.points,g=t.points.at(-1)!;
 assert((b[0]-a[0])*(g[0]-a[0])+(b[1]-a[1])*(g[1]-a[1])<0);
 assert.deepEqual(g,[-1.5,-1.925]);assert(t.points.some(p=>p[0]===-6.22&&p[1]===-1.925));
 const solids=interiorSolids(t);assert(solids.some(s=>insideSolid(s,-20,2.6)));assert(solids.some(s=>insideSolid(s,-41.5,9)));
});
test('room solids leave each route clear at 10cm spacing',()=>{
 for(const t of NATIVE_INTERIORS.filter(t=>t.theme!=='reference')){const solids=interiorSolids(t);for(let i=1;i<t.points.length;i++){const a=t.points[i-1],b=t.points[i],n=Math.ceil(Math.hypot(b[0]-a[0],b[1]-a[1])/.1);for(let j=0;j<=n;j++)assert(!solids.some(s=>insideSolid(s,a[0]+(b[0]-a[0])*j/n,a[1]+(b[1]-a[1])*j/n)),t.id);}}
});
test('long floors extend beyond route ends and do not alter scoring route',()=>{
 for(const t of NATIVE_INTERIORS.filter(t=>['parking','tunnel'].includes(t.theme))){const original=JSON.stringify(t.points),p=interiorFloorPoints(t.points),dense=interiorGeometryPoints(p),strip=interiorRibbon(dense,10);assert.equal(p.length,t.points.length+2);for(const endpoint of [t.points[0],t.points.at(-1)!])assert(inRing(endpoint[0],endpoint[1],strip.ring));assert.equal(JSON.stringify(t.points),original);for(let i=1;i<dense.length;i++)assert(Math.hypot(dense[i][0]-dense[i-1][0],dense[i][1]-dense[i-1][1])<=2.000001);}
});
test('placement rejects water, occupied ground and excessive grade',()=>{
 const spec=NATIVE_INTERIORS[0];assert.throws(()=>findInteriorPlacement(spec,{height:()=>0,blocked:()=>false,land:()=>false}));assert.throws(()=>findInteriorPlacement(spec,{height:()=>0,blocked:()=>true,land:()=>true}));assert.throws(()=>findInteriorPlacement(spec,{height:(x,z)=>x+z,blocked:()=>false,land:()=>true}));const p=findInteriorPlacement(spec,{height:()=>3,blocked:()=>false,land:()=>true});assert.equal(p.y,3.18);
});
test('indoor sites reject existing roads and pavement, and floors clear native road height',()=>{
 const env={height:()=>0,blocked:()=>false,land:()=>true};
 assert.throws(()=>findInteriorPlacement(NATIVE_INTERIORS[0],{...env,roadAt:()=>({d:3,road:{width:8}})}));
 const placement=findInteriorPlacement(NATIVE_INTERIORS[0],{...env,roadAt:()=>({d:80,road:{width:8}})});assert(placement.y>.105);
});
test('exact oriented vehicle footprint catches thin walls, rear corners and parked cars',()=>{
 const wall={name:'wall',x:0,z:.6,w:5,d:.05,h:3};
 assert(interiorVehicleOverlap(wall,0,0,0,2.2,5));
 assert(!interiorVehicleOverlap(wall,0,-3,0,2.2,5));
 const parked={name:'parked',x:2,z:2.8,w:2,d:4.7,h:1.5,yaw:.6};
 assert(interiorVehicleOverlap(parked,0,0,Math.PI/4,2.2,5));
 assert(!interiorVehicleOverlap(parked,-8,-8,0,2.2,5));
});
test('swept body cannot tunnel through a thin wall even when both endpoints are clear',()=>{
 const wall={name:'thin-wall',x:0,z:0,w:30,d:.05,h:3};
 const blocked=(x:number,z:number,yaw:number,w:number,l:number)=>interiorVehicleOverlap(wall,x,z,yaw,w,l);
 assert(!interiorVehicleSweepClear({x:0,z:-4,yaw:0},{x:0,z:4,yaw:0},2.2,5,blocked));
 assert(interiorVehicleSweepClear({x:0,z:-8,yaw:0},{x:0,z:-4,yaw:0},2.2,5,blocked));
 assert(!interiorVehicleSweepClear({x:0,z:4,yaw:Math.PI},{x:0,z:-4,yaw:Math.PI},2.2,5,blocked));
});
