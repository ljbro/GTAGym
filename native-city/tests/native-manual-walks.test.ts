import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {annotationTurns,bendDegrees} from '../src/native-annotation-route.ts';
const root=new URL('../',import.meta.url),read=(p:string)=>readFileSync(new URL(p,root),'utf8');
const specs=JSON.parse(read('src/native-manual-walks.json'));
test('walking templates preserve vehicle landmarks and traversal requirements',()=>{
 assert.equal(new Set(specs.map((s:any)=>s.id)).size,specs.length);
 const byId=(id:string)=>specs.find((s:any)=>s.id===id);
 assert.equal(byId('c02-n12').requirements.startVehicle,'green-motorcycle');assert.equal(byId('c02-n08').requirements.endVehicle,'white-car');assert.equal(byId('c02-n09').requirements.endVehicle,'red-car');
 assert.equal(byId('c07-n04').path.roof.at,'end');assert.equal(byId('c07-n05').path.roof.at,'start');assert(byId('c02-n14').requirements.vault);
 for(const id of ['c02-n09','c02-n12','c02-n14'])assert.match(byId(id).path.building.name,/(Residence|Apartments|Garden|Residential Community|[0-9] ?Block)/i);
});
