import test from 'node:test';
import assert from 'node:assert/strict';
import {NodeIO} from '@gltf-transform/core';
import {ALL_EXTENSIONS} from '@gltf-transform/extensions';
import {MeshoptDecoder} from 'meshoptimizer';
import {isCandidateGroundSlab} from '../src/landmark-details.ts';

test('only the audited Coastal City decorative floor is removed, not the buildings',()=>{
 const manifest={landmarks:[]};
 assert(isCandidateGroundSlab('landmark_coastal_city_concrete',.721,manifest));
 for(const name of ['landmark_coastal_city_civicred','landmark_coastal_city_stone','landmark_houhai_concrete','block_-9_-2_concrete'])assert(!isCandidateGroundSlab(name,.721,manifest));
 assert(!isCandidateGroundSlab('landmark_coastal_city_concrete',5,manifest),'a changed asset must not silently delete taller architecture');
});
test('actual Coastal City GLB plinth crosses c01-n07 before bend four at 0.72m',async()=>{
 await MeshoptDecoder.ready;
 const doc=await new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({'meshopt.decoder':MeshoptDecoder}).read(new URL('../../city/landmark-candidates.glb',import.meta.url).pathname);
 const node=doc.getRoot().listNodes().find(n=>n.getName()==='landmark_coastal_city_concrete')!,m=node.getWorldMatrix(),p=node.getMesh()!.listPrimitives()[0],a=p.getAttribute('POSITION')!;
 const vertices=Array.from({length:a.getCount()},(_,i)=>{const v=a.getElement(i,[]);return [m[0]*v[0]+m[4]*v[1]+m[8]*v[2]+m[12],m[1]*v[0]+m[5]*v[1]+m[9]*v[2]+m[13],-(m[2]*v[0]+m[6]*v[1]+m[10]*v[2]+m[14])];});
 const min=vertices.reduce((a,v)=>Math.min(a,v[1]),Infinity),max=vertices.reduce((a,v)=>Math.max(a,v[1]),-Infinity);
 assert(max>.7&&max<.75);assert(isCandidateGroundSlab(node.getName(),max-min,{landmarks:[]}));
 const indices=p.getIndices()!.getArray()!,x=-5320.51,z=-1172.04;let roof=false;
 for(let i=0;i<indices.length;i+=3){const [p,q,r]=[vertices[indices[i]],vertices[indices[i+1]],vertices[indices[i+2]]],den=(q[2]-r[2])*(p[0]-r[0])+(r[0]-q[0])*(p[2]-r[2]);if(Math.abs(den)<1e-6)continue;const u=((q[2]-r[2])*(x-r[0])+(r[0]-q[0])*(z-r[2]))/den,v=((r[2]-p[2])*(x-r[0])+(p[0]-r[0])*(z-r[2]))/den;if(u>=0&&v>=0&&u+v<=1&&u*p[1]+v*q[1]+(1-u-v)*r[1]>.7)roof=true;}
 assert(roof,'regression point must reproduce a genuine triangle intersection, not just a bounding-box overlap');
});
