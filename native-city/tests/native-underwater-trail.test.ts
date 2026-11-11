import test from 'node:test';import assert from 'node:assert/strict';
import {UnderwaterTrail} from '../src/native-underwater-trail.ts';
import {NativeSwimEffects} from '../src/native-swim-effects.ts';
import {NullEngine,Scene,FreeCamera,Vector3} from '@babylonjs/core';
test('underwater motion emits rising bubbles, pause freezes them and stopping fades them',()=>{
 const t=new UnderwaterTrail();for(let i=0;i<120;i++)t.step(0,-3,i/60,0,0,1/60);
 assert(t.particles.length>0);const p=t.particles[0],y=p.y;t.step(0,-3,2,0,0,1/60);assert(p.y>y);
 const frozen=JSON.stringify(t.particles);t.step(0,-3,2,0,0,0);assert.equal(JSON.stringify(t.particles),frozen);
 for(let i=0;i<240;i++)t.step(0,-3,2,0,0,1/60);assert.equal(t.particles.length,0);
});
test('surface and inactive actors do not emit underwater bubbles; rising bubbles vanish at surface',()=>{
 const t=new UnderwaterTrail();for(let i=0;i<120;i++)t.step(0,0,i/60,0,0,1/60);assert.equal(t.particles.length,0);
 for(let i=0;i<120;i++)t.step(0,-2,i/60,0,0,1/60,false);assert.equal(t.particles.length,0);
 t.particles.push({x:0,y:-.04,z:0,age:0,life:3,radius:.1,vx:0,vz:0,rise:1});t.step(0,0,0,0,0,.1,false);assert.equal(t.particles.length,0);
});
test('submarine turbulence comes from the stern only while moving and stays bounded',()=>{
 const t=new UnderwaterTrail(true);for(let i=0;i<3600;i++)t.step(0,-6,i*5/60,0,0,1/60);
 assert(t.particles.length>0&&t.particles.length<=96);assert(t.particles.every(p=>p.z<3600*5/60-2));
 t.step(1000,-6,1000,0,0,1/60);assert.equal(t.particles.length,0);t.reset();assert.equal(t.particles.length,0);
});
test('view uses bounded geometry, resets and disposes its meshes, materials and observer',()=>{
 const engine=new NullEngine(),scene=new Scene(engine);new FreeCamera('test',new Vector3(0,2,-6),scene);
 const meshes=scene.meshes.length,materials=scene.materials.length,observers=scene.onBeforeRenderObservable.observers.length;
 const v=new NativeSwimEffects(scene,0);for(let i=0;i<120;i++)v.update(0,i/60,2,0,1,1/60);
 scene.onBeforeRenderObservable.notifyObservers(scene);assert(v.bubbles.isEnabled());assert.equal(v.bubbles.getTotalVertices(),384);
 v.reset();assert(!v.bubbles.isEnabled());assert(!v.surface!.mesh.isEnabled());
 v.dispose();assert.equal(scene.meshes.length,meshes);assert.equal(scene.materials.length,materials);
 // Babylon marks observers for deferred removal; none of ours stays active.
 assert.equal(scene.onBeforeRenderObservable.observers.filter(o=>!o._willBeUnregistered).length,observers);scene.dispose();engine.dispose();
});
