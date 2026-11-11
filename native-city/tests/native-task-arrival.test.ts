import test from 'node:test';
import assert from 'node:assert/strict';
import {nativeArrival} from '../src/native-task-arrival.ts';
const base={position:[0,100] as [number,number],previous:[0,95] as [number,number],goal:[0,100] as [number,number],radius:3,mode:'drive' as const,walking:false,grounded:true,heightValid:true,discontinuity:false};
test('arrival has no turn, route-distance, speed or action-ID prerequisite',()=>assert(nativeArrival(base)));
test('driving and walking require corresponding actor mode',()=>{
 assert(!nativeArrival({...base,walking:true}));assert(!nativeArrival({...base,mode:'walk'}));assert(nativeArrival({...base,mode:'walk',walking:true}));
});
test('high speed swept crossing succeeds even when both samples are outside',()=>assert(nativeArrival({...base,previous:[0,90],position:[0,110]})));
test('off-goal, wrong floor, mid-climb and discontinuities cannot finish',()=>{
 for(const change of [{position:[10,110] as [number,number],previous:[10,90] as [number,number]},{grounded:false},{heightValid:false},{discontinuity:true}])assert(!nativeArrival({...base,...change}));
});
const gate={forward:[0,1] as [number,number],halfWidth:5.2,halfDepth:1.5};
test('tunnel exit accepts both lanes, including a whole-region high speed crossing',()=>{
 for(const x of [-5,-3,0,3,5])assert(nativeArrival({...base,gate,previous:[x,96],position:[x,104]}));
 assert(nativeArrival({...base,gate,previous:[3,100],position:[3,100]}));
});
test('tunnel exit does not accept outside walls, distant approach or wrong actor state',()=>{
 for(const x of [-5.3,5.3,10])assert(!nativeArrival({...base,gate,previous:[x,96],position:[x,104]}));
 assert(!nativeArrival({...base,gate,previous:[0,90],position:[0,98]}));
 for(const change of [{walking:true},{heightValid:false},{grounded:false},{discontinuity:true}])assert(!nativeArrival({...base,gate,...change}));
});
test('tunnel exit rotates with route and placement, not world axes',()=>{
 const goal:[number,number]=[1000,-800],u=Math.SQRT1_2;
 const point=(along:number,side:number):[number,number]=>[goal[0]+along*u+side*u,goal[1]-along*u+side*u];
 for(const side of [-3,3])assert(nativeArrival({...base,goal,gate:{...gate,forward:[u,-u]},previous:point(-4,side),position:point(4,side)}));
 assert(!nativeArrival({...base,goal,gate:{...gate,forward:[u,-u]},previous:point(-4,6),position:point(4,6)}));
});
test('diagonal near-miss is not a crossing just because each axis overlaps separately',()=>{
 assert(!nativeArrival({...base,gate,previous:[0,90],position:[10,100]}));
 assert(!nativeArrival({...base,gate:{...gate,forward:[0,0]}}));
});
