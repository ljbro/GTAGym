import {test} from 'node:test';
import assert from 'node:assert/strict';
import {NativeCarWater,NativeCarWaterSurface,CAR_SINK_SECONDS} from '../src/native-car-water.ts';
import {CityCollision} from '../src/driving.ts';
import type {CityData} from '../src/city-types.ts';

const data:CityData={meta:{counts:{},extent:[-100,-100,100,100],horizontalScale:1},land:[[[[-100,-100],[0,-100],[0,100],[-100,100]]]],coast:[],roads:[],buildings:[],green:[],water:[],landmarks:[],spawn:{x:-10,z:0,yaw:0,road:''}};
test('continuous bank permits shallow water, open water is deep, bridge and task floor stay dry',()=>{
 let bridge=false,task=false;
 const surface=new NativeCarWaterSurface(data,-.25,()=>0,()=>bridge?{d:0,road:{width:8}}:null,()=>task?3:null);
 assert.equal(surface.at(-1,0).wet,false);
 assert.equal(surface.at(2,0).depth,.25);
 assert.equal(surface.at(6,0).depth,1.25);
 assert.equal(surface.at(1000,0).depth,8);
 assert(Math.abs(surface.at(.001,0).floor-surface.at(-.001,0).floor)<.001);
 bridge=true;assert.equal(surface.at(6,0).wet,false);
 bridge=false;task=true;assert.equal(surface.at(6,0).wet,false);
});
test('mapped inland lakes and islands are respected; submerged road is not a bridge',()=>{
 const city={...data,land:[[[[-100,-100],[100,-100],[100,100],[-100,100]]]],water:[{name:'pond',rings:[[[-30,-30],[30,-30],[30,30],[-30,30]],[[-3,-3],[3,-3],[3,3],[-3,3]]]}]} as CityData;
 const surface=new NativeCarWaterSurface(city,0,()=>-.1,()=>({d:0,road:{width:8}}));
 assert.equal(surface.at(0,0).wet,false);
 assert.equal(surface.at(15,0).wet,true);
 assert(surface.at(15,0).depth>1);
 assert.equal(surface.at(60,0).wet,false);
});
test('only water barrier can be bypassed, not buildings; NPC/default collision unchanged',()=>{
 const c=new CityCollision({...data,buildings:[{rings:[[[10,-5],[20,-5],[20,5],[10,5]]],height:5,style:'x'}]});
 assert.equal(c.blocked(6,0),true);assert.equal(c.blocked(6,0,true),false);
 assert.equal(c.blocked(15,0,true),true);
});
test('shallow supports driving indefinitely, even stopped',()=>{
 const s=new NativeCarWater(),sample={wet:true,depth:.4,floor:-.65,waterY:-.25};
 for(let i=0;i<10000;i++)s.step(sample,1.45,1/60);
 assert.equal(s.phase,'shallow');assert.equal(s.baseY,-.65);assert(s.drag>0);assert.equal(s.elapsed,0);
});
test('deep water latches; pause freezes; depth recovery never cancels failure; reset clears',()=>{
 const s=new NativeCarWater(),dry={wet:false,depth:0,floor:0,waterY:-.25},deep={wet:true,depth:8,floor:-8.25,waterY:-.25};
 s.step(dry,1.45,1/60);s.step(deep,1.45,1/60);
 assert.equal(s.phase,'sinking');const before={...s};
 s.step(deep,1.45,0);assert.deepEqual({...s},before);
 let previous=s.baseY!;
 for(let i=1;i<CAR_SINK_SECONDS*60;i++){s.step(dry,1.45,1/60);assert(s.baseY!<=previous);previous=s.baseY!;}
 assert.equal(s.phase,'failed');assert(s.baseY!+1.45<deep.waterY);
 s.reset();assert.equal(s.phase,'dry');assert.equal(s.elapsed,0);assert.equal(s.baseY,null);
});
test('critical depth varies with model height, including motorcycles',()=>{
 const sample={wet:true,depth:.85,floor:-1.1,waterY:-.25},low=new NativeCarWater(),suv=new NativeCarWater();
 low.step(sample,1.3,.1);suv.step(sample,1.87,.1);
 assert(low.sinking);assert.equal(suv.phase,'shallow');
});
