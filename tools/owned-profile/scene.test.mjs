import assert from 'node:assert/strict';
import fs from 'node:fs';
import { buildOwnedScene, loadOwnedScene } from '../../src/lab/owned/cad/scene.js';
import { Vector3, BufferGeometry, Material } from 'three';
const assets = ['chem_beakers_owned','chem_test_tubes_owned','chem_graduated_cylinders_owned','chem_reagent_bottles_owned'];
let meshCount = 0, profileCount = 0, vertices = 0;
for (const asset of assets) {
  const data = JSON.parse(fs.readFileSync(new URL(`../owned-cad/out/${asset}/scene.json`, import.meta.url)));
  const candidate = buildOwnedScene(data, { assembly: false });
  assert.equal(candidate.meshes.size, data.meshes.length);
  for (const input of data.meshes) {
    const mesh = candidate.meshes.get(input.name), pos = mesh.geometry.getAttribute('position');
    near(pos.getX(0), input.positions[0] * .001);
    near(pos.getY(0), input.positions[2] * .001);
    near(pos.getZ(0), -input.positions[1] * .001);
    near(mesh.position.length(), 0);
    assert.equal(pos.count, input.positions.length / 3);
    assert(mesh.geometry.boundingSphere.radius > 0);
    vertices += pos.count; meshCount++;
  }
  for (const [name, profile] of candidate.profiles) {
    const input = data.profiles[name];
    assert(profile.fullCapacity > 0); assert(profile.capacity < profile.fullCapacity);
    for (let i=0;i<=100;i++) {
      const h=profile.bottom+(profile.rim-profile.bottom)*i/100;
      near(profile.levelFor(profile.volumeAt(h)),h,1e-9);
      if (i) assert(profile.volumeAt(h)>profile.volumeAt(h-(profile.rim-profile.bottom)/200));
    }
    if (input.nominalMl) near(profile.volumeAt(profile.levelFor(input.nominalMl)),input.nominalMl,1e-9);
    profileCount++;
  }
  let geometryDisposals=0, materialDisposals=0;
  for(const mesh of candidate.meshes.values()) {
    mesh.geometry.addEventListener('dispose',()=>geometryDisposals++);
    mesh.material.addEventListener('dispose',()=>materialDisposals++);
  }
  candidate.dispose(); candidate.dispose();
  assert.equal(candidate.root.children.length,0);
  assert.equal(geometryDisposals,data.meshes.length); assert.equal(materialDisposals,data.meshes.length);
  const assembly=buildOwnedScene(data,{assembly:true});
  for(const input of data.meshes) { const o=input.assemblyOffset_mm ?? [0,0,0]; near(assembly.meshes.get(input.name).position.distanceTo(new Vector3(o[0],o[2],-o[1]).multiplyScalar(.001)),0); }
  assembly.dispose();
  assert.throws(()=>buildOwnedScene(data,{groups:['missing-required-group']}));
}
assert.throws(()=>buildOwnedScene({schema:'unknown',meshes:[]}));
const fixture=JSON.parse(fs.readFileSync(new URL('../owned-cad/out/chem_beakers_owned/scene.json',import.meta.url)));
for(const change of [{name:''},{group:null},{opacity:NaN},{roughness:2},{positions:[1e308,0,0,1,0,0,0,1,0],indices:[0,1,2]}])assert.throws(()=>buildOwnedScene({...fixture,meshes:[{...fixture.meshes[0],...change}]}));
const gd=BufferGeometry.prototype.dispose,md=Material.prototype.dispose;let gdCalls=0,mdCalls=0;
BufferGeometry.prototype.dispose=function(){gdCalls++;return gd.call(this)};Material.prototype.dispose=function(){mdCalls++;return md.call(this)};
try{assert.throws(()=>buildOwnedScene({...fixture,meshes:[fixture.meshes[0],{...fixture.meshes[1],opacity:2}]}));assert.equal(gdCalls,1);assert.equal(mdCalls,1);}finally{BufferGeometry.prototype.dispose=gd;Material.prototype.dispose=md;}
const nativeFetch=globalThis.fetch;
try{
 globalThis.location={href:'http://localhost/test',origin:'http://localhost'};
 await assert.rejects(()=>loadOwnedScene('http://external.invalid/asset'),/same-origin/);
 globalThis.fetch=async()=>({ok:false,status:404});await assert.rejects(()=>loadOwnedScene('/missing'),/404/);
 const aborter=new AbortController();aborter.abort();globalThis.fetch=async()=>({ok:true,json:async()=>fixture});await assert.rejects(()=>loadOwnedScene('/asset',{signal:aborter.signal}),{name:'AbortError'});
 globalThis.fetch=async()=>({ok:true,json:async()=>fixture});const loaded=await loadOwnedScene('/asset');assert.equal(loaded.meshes.size,5);loaded.dispose();
}finally{globalThis.fetch=nativeFetch;delete globalThis.location;}
{ // base64 typed-array payload must decode identically to the JSON-array form
  const base=JSON.parse(JSON.stringify(fixture));const mesh=base.meshes[0];
  const pos=new Float32Array(mesh.positions),idx=new Uint32Array(mesh.indices);
  mesh.posB64=Buffer.from(pos.buffer,pos.byteOffset,pos.byteLength).toString('base64');
  mesh.idxB64=Buffer.from(idx.buffer,idx.byteOffset,idx.byteLength).toString('base64');
  delete mesh.positions;delete mesh.indices;
  const a=buildOwnedScene(base).meshes.get(fixture.meshes[0].name).geometry.getAttribute('position');
  const b=buildOwnedScene(fixture).meshes.get(fixture.meshes[0].name).geometry.getAttribute('position');
  assert.equal(a.count,b.count);for(let i=0;i<a.count*3;i++)assert.ok(Math.abs(a.array[i]-b.array[i])<=1e-9+Math.abs(b.array[i])*3e-7,`vertex ${i} differs beyond float32 rounding`);
}
console.log(JSON.stringify({pass:true,assets:assets.length,meshes:meshCount,profiles:profileCount,vertices,tests:['units-and-local-origin','display-only-offset','profile-inverse-101-levels','nominal-marks','idempotent-resources-dispose','invalid-contract-reject'],productionIntegrated:false}));
function near(a,b,abs=1e-8){assert.ok(Math.abs(a-b)<=abs,`${a} != ${b}`);}
