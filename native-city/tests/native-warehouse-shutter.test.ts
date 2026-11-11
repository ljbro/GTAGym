import test from 'node:test';import assert from 'node:assert/strict';
import {WarehouseShutter,WAREHOUSE_SHUTTER} from '../src/native-warehouse-shutter.ts';
const origin={x:100,y:.18,z:200};
const actor={active:true,x:108,z:206.44,feetY:.18,airborne:false,traversing:false};
test('warehouse gate starts closed and E works only close to the loaded gate on foot',()=>{
 const gate=new WarehouseShutter(origin);assert(!gate.open);assert(!gate.interact(actor));gate.ready=true;
 assert.equal(gate.prompt(actor),"press E Open the roller shutter");assert(!gate.interact({...actor,x:100}));assert(!gate.interact({...actor,active:false}));assert(!gate.interact({...actor,airborne:true}));assert(!gate.interact({...actor,feetY:3}));assert(gate.interact(actor));assert(!gate.interact(actor));
});
test('collision stays closed until the full animation ends; restart has a fresh closed gate',()=>{
 const gate=new WarehouseShutter(origin);gate.ready=true;gate.interact(actor);
 for(let i=0;i<25;i++)gate.step(.1);assert(!gate.open);assert.match(gate.prompt(actor),/Opening/i);
 gate.step(.1);gate.step(.01);assert(gate.open);assert.equal(gate.prompt(actor),'');assert(!new WarehouseShutter(origin).open);assert.equal(WAREHOUSE_SHUTTER.seconds,2.6);
});
