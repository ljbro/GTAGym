import test from 'node:test';import assert from 'node:assert/strict';
import {nativeDriveFootprintClear,NATIVE_DRIVE_ASSIGNMENTS,NATIVE_TARGET_VEHICLES,NATIVE_DRIVE_VEHICLES} from '../src/native-drive-vehicle-spec.ts';
test('c01-n07 rides the motorcycle, not the default sports car',()=>{
 assert.deepEqual(NATIVE_DRIVE_ASSIGNMENTS['c01-n07'],{kind:'motorcycle'});
});
test('SUV and van full footprint rejects rear/side obstacles that the old nose point misses',()=>{
 for(const kind of ['baller','van','pickup','convertible'] as const){assert(nativeDriveFootprintClear(0,0,0,kind,()=>false));assert(!nativeDriveFootprintClear(0,0,0,kind,(x,z)=>x>1&&z< -2));assert(!nativeDriveFootprintClear(0,0,Math.PI/2,kind,(x,z)=>x< -2&&z< -1));}
});
test('vehicle escape requirements retain actual van/SUV, on-foot swap and night lighting',()=>{
 assert.deepEqual(Object.fromEntries(['c05-n06','c05-n07','c05-n08'].map(id=>[id,NATIVE_DRIVE_ASSIGNMENTS[id]])),{'c05-n06':{kind:'baller',startOnFoot:true},'c05-n07':{kind:'van'},'c05-n08':{kind:'baller',night:true}});
});
test('pickup pursuits use the requested player vehicle, not the old hero sports car',()=>{
 for(const id of ['c04-n08','c04-n09'])assert.equal(NATIVE_DRIVE_ASSIGNMENTS[id].kind,'pickup');
});
test('all four Speedo mission stages bind an actual van, including the chase',()=>{
 for(const id of ['c01-n13','c04-n03','c01-n14','c01-n15'])assert.equal(NATIVE_DRIVE_ASSIGNMENTS[id].kind,'van');
 for(const id of ['c04-n01','c04-n03'])assert.equal(NATIVE_TARGET_VEHICLES[id],'motorcycle');
});
test('yellow SUV delivery and showroom stages share the same SUV geometry and yellow finish',()=>{
 for(const id of ['c01-n09','c01-n10'])assert.equal(NATIVE_DRIVE_ASSIGNMENTS[id].kind,'baller-yellow');
 const yellow=NATIVE_DRIVE_VEHICLES['baller-yellow'],base=NATIVE_DRIVE_VEHICLES.baller;
 for(const key of ['file','length','width','height','heading','wheelRadius','seat'] as const)assert.deepEqual(yellow[key],base[key]);
});
