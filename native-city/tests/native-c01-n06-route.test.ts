import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {RoadGraph} from '../src/navigation.ts';
import {CityCollision} from '../src/driving.ts';
import {MinimapNavigation} from '../src/minimap-navigation.ts';
import {m03n02TurnaroundRoute,M03_N02_UTURN_NODES,M03_N02_ROUTE_NODES} from '../src/native-c01-n06-route.ts';

const graph=new RoadGraph([],JSON.parse(fs.readFileSync(new URL('../../city/navigation.json',import.meta.url),'utf8')));
const originalIds=[39545,39544,8258,39543,39542,39541,39540,39539,39538,39537,39536,2756,36064,42282,42281,2596,2597,20034,20033,20032,20031,39536,39537,39538,39539,39540,39541,39542,39543,8258,39544,39545,8250,39546,39547,39548,39549,39550,39551,39552,39553,2779,21349,21350,21351,21352,2801,2802,2803,2804,2805,2806,2807,2808,2809,2792,2791,36151,27,28,29,30,31,32,42043,42044,42045,42046,27,36151,2791];
const source=originalIds.map(id=>graph.nodes[id]);
test('c01-n06 starts forward, retains the turnaround and source data, moves only the adapted goal',()=>{
 const before=JSON.stringify(source),r=m03n02TurnaroundRoute(graph,source);
 assert.deepEqual(r.points[0],source[0]);assert.deepEqual(r.points.at(-1),[2401.446,2385.294]);
 assert(Math.hypot(r.points.at(-1)![0]-source.at(-1)![0],r.points.at(-1)![1]-source.at(-1)![1])>300);
 assert.equal(JSON.stringify(source),before);
 assert.equal(new Set(r.points.map(p=>p.join(','))).size,r.points.length,'no node is visited twice');
 assert.equal(r.points.length,54);assert(Math.abs(r.length-2499.8037929854163)<1e-6);
 assert.equal(r.turnDirections.length,14,'retain a multi-turn route, not a straight shortcut');
 assert(r.points[1][0]>r.points[0][0]+100,'no immediate backwards route at spawn');
 const i=M03_N02_UTURN_NODES.indexOf(2814),entry=r.points[i-1],turn=r.points[i],exit=r.points[i+1],after=r.points[i+2];
 const inbound=[turn[0]-entry[0],turn[1]-entry[1]],outbound=[after[0]-exit[0],after[1]-exit[1]];
 assert(inbound[0]*outbound[0]+inbound[1]*outbound[1]<0,'turnaround must reverse travel direction');
 assert(Math.hypot(exit[0]-turn[0],exit[1]-turn[1])>10,'opposite carriageways are separate');
 const collision=new CityCollision(JSON.parse(fs.readFileSync(new URL('../../city/city.json',import.meta.url),'utf8')));
 let distance=0;
 for(let j=1;j<M03_N02_ROUTE_NODES.length;j++){
  const a=r.points[j-1],b=r.points[j],steps=Math.ceil(Math.hypot(b[0]-a[0],b[1]-a[1])/2);
  assert(graph.edges[M03_N02_ROUTE_NODES[j-1]].has(M03_N02_ROUTE_NODES[j]));
  for(let k=0;k<=steps;k++){
   const x=a[0]+(b[0]-a[0])*k/steps,z=a[1]+(b[1]-a[1])*k/steps,road=collision.nearest(x,z);
   assert(!collision.blocked(x,z),'turnaround must not cross a building');
   assert(road&&road.d<road.road.width/2,'turnaround stays on rendered native roads');
   // The final 40m includes the small terminal junction and its 24m arrival zone.
   if(distance+Math.hypot(b[0]-a[0],b[1]-a[1])*k/steps<r.length-40)
    assert(Math.hypot(x-r.points.at(-1)![0],z-r.points.at(-1)![1])>24,'no early approach to goal');
  }
  distance+=Math.hypot(b[0]-a[0],b[1]-a[1]);
 }
});
test('c01-n06 arrival disk cannot be reached from a neighbouring non-terminal road',()=>{
 const goal=m03n02TurnaroundRoute(graph,source).points.at(-1)!;
 for(let a=0;a<graph.nodes.length;a++)for(const b of graph.edges[a].keys()){
  if(b<=a||a===17106&&b===17113)continue;
  const p=graph.nodes[a],q=graph.nodes[b],dx=q[0]-p[0],dz=q[1]-p[1],t=Math.max(0,Math.min(1,((goal[0]-p[0])*dx+(goal[1]-p[1])*dz)/(dx*dx+dz*dz||1)));
  assert(Math.hypot(goal[0]-p[0]-dx*t,goal[1]-p[1]-dz*t)>30,'24m goal radius plus road/vehicle margin');
 }
});
test('c01-n06 minimap progresses continuously over the full route including the turnaround',()=>{
 const r=m03n02TurnaroundRoute(graph,source),nav=new MinimapNavigation();let expected=0;
 assert.equal(nav.update(r.points,r.points[0]).along,0);
 for(let i=1;i<r.points.length;i++){
  const a=r.points[i-1],b=r.points[i],d=Math.hypot(b[0]-a[0],b[1]-a[1]),steps=Math.ceil(d/3);
  for(let k=1;k<=steps;k++){
   const p:[number,number]=[a[0]+(b[0]-a[0])*k/steps,a[1]+(b[1]-a[1])*k/steps],n=nav.update(r.points,p);
   assert(Math.abs(n.along-(expected+d*k/steps))<.01,'overlap must not skip upcoming turnaround or jump back');assert.deepEqual(n.points[0],p);
  }
  expected+=d;
 }
});
test('c01-n06 removes repeated edges and never returns to the spawn neighbourhood',()=>{
 const r=m03n02TurnaroundRoute(graph,source),edges=new Set<string>();
 for(let i=1;i<r.points.length;i++){
  const key=[r.points[i-1].join(','),r.points[i].join(',')].sort().join('|');
  assert(!edges.has(key),'do not traverse an edge in either direction twice');edges.add(key);
 }
 // After the turnaround, even the nearest point on any later segment remains
 // clear of the spawn: no back-facing green route hidden behind the player.
 const p=r.points[0];
 for(let i=M03_N02_UTURN_NODES.indexOf(2815)+1;i<r.points.length;i++){
  const a=r.points[i-1],b=r.points[i],dx=b[0]-a[0],dz=b[1]-a[1],t=Math.max(0,Math.min(1,((p[0]-a[0])*dx+(p[1]-a[1])*dz)/(dx*dx+dz*dz)));
  assert(Math.hypot(p[0]-a[0]-t*dx,p[1]-a[1]-t*dz)>350);
 }
});
test('c01-n06 refuses missing native edges or changed source endpoints',()=>{
 assert.throws(()=>m03n02TurnaroundRoute(graph,[]),/endpoints changed/);
 assert.throws(()=>m03n02TurnaroundRoute(graph,[...source.slice(0,-1),[0,0]]),/endpoints changed/);
 const a=31724,b=31725,cost=graph.edges[a].get(b)!;
 graph.edges[a].delete(b);
 try{assert.throws(()=>m03n02TurnaroundRoute(graph,source),/disconnected/);}finally{graph.edges[a].set(b,cost);}
});
