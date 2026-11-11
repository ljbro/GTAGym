import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {FOLLOW_CHARACTER,targetRiderOptions,FOLLOW_CHARACTER_BASE} from '../src/native-npc-character.ts';
import {PLAYER_CHARACTER} from '../src/city-player-character.ts';
test('c03-n06 target rider uses Michael without changing other tasks or player defaults',()=>{
 assert.deepEqual(targetRiderOptions('c03-n06'),{character:FOLLOW_CHARACTER,assetBase:FOLLOW_CHARACTER_BASE});
 for(const id of ['', 'c01-n07','c01-n03'])assert.deepEqual(targetRiderOptions(id),{});
 assert.equal(PLAYER_CHARACTER.id,'franklin');
});
test('follow character is a self-contained OffMapBench Michael asset with independent clips',()=>{
 const bytes=fs.readFileSync(new URL('../../characters/offmapbench/michael.glb',import.meta.url));
 const provenance=JSON.parse(fs.readFileSync(new URL('../../characters/offmapbench/michael.provenance.json',import.meta.url),'utf8'));
 assert.equal(createHash('sha256').update(bytes).digest('hex'),provenance.sha256);
 assert.notEqual(FOLLOW_CHARACTER.file,PLAYER_CHARACTER.file);assert.equal(bytes.length,FOLLOW_CHARACTER.bytes);
 const gltf=JSON.parse(bytes.subarray(20,20+bytes.readUInt32LE(12)).toString());
 assert(gltf.skins[0].joints.length>20);
 for(const name of ['idle','walk','run'])assert(gltf.animations.some((a:any)=>a.name===name));
 assert(gltf.images.every((i:any)=>i.bufferView!==undefined));
 assert(gltf.buffers.every((b:any)=>!b.uri));
});
