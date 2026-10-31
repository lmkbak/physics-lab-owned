import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { output, json } from './build-coverage.mjs';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const actual=JSON.parse(fs.readFileSync(path.join(root,'docs/ownership/cad-coverage.json'),'utf8'));
assert.deepEqual(actual,JSON.parse(json),'Saved coverage must equal independently rebuilt permitted-input ledger');
assert.equal(actual.chemistry.length,87);
assert.equal(actual.electrical.length,21);
assert.equal(actual.ownedInventory.length,68);
assert.equal(new Set(actual.chemistry.map(a=>a.asset)).size,87);
assert.equal(new Set(actual.electrical.map(a=>a.asset)).size,21);
assert.ok(['unsigned','development-authorized-production-unverified'].includes(actual.contractStatus));
assert.equal(actual.scope.geometryGenerated,4);
assert.equal(actual.scope.productionAssetChanges,0);
assert.equal(actual.scope.readyAssetCount,0);
for(let i=0;i<87;i++) assert.equal(actual.chemistry[i].number,`C${String(i+1).padStart(2,'0')}`);
const inventory=new Set(actual.ownedInventory.map(a=>a.name));
for(const c of actual.chemistry) {
 assert.equal(c.replacementReady,false);
 assert.equal(c.directUsableOwnedGLBs.length,0);
 assert.equal(c.needsNewBuild,true);
 assert.ok(c.independentRequirements.length>20);
 assert.ok(c.functionalGroups.length>0);
 assert.deepEqual(Object.keys(c.gaps).sort(),['functionalGroups','cavity','sockets','material','scales','movable','terminals'].sort());
 c.usableAsPrincipleCandidates.forEach(p=>{assert.ok(inventory.has(p.name),p.name); assert.ok(p.limitations);});
 c.runtimeItemContracts.forEach(d=>{
  assert.ok(d.groups.length>0);
  assert.ok(!d.axis||d.groups.includes(d.axis),`${d.itemKey}: axis not in groups`);
  Object.keys(d.roles).forEach(g=>assert.ok(d.groups.includes(g),`${d.itemKey}: missing role group`));
  (d.profileGroups??[]).forEach(g=>assert.ok(d.groups.includes(g),`${d.itemKey}: missing profile group`));
 });
 c.ownedAssemblyDependencies.forEach(n=>assert.ok(actual.chemistry.some(a=>a.number===n)));
}
const runtimeTypes=[...actual.electrical,...actual.supplementalElectrical];
assert.equal(runtimeTypes.length,22);
assert.equal(actual.supplementalElectrical[0].asset,'elcap');
assert.deepEqual(actual.proceduralChemistry.map(p=>p.itemKey),['splint','toolrack']);
for(const e of runtimeTypes) {
 assert.equal(e.replacementReady,false);
 assert.equal(e.directUsableOwnedGLBs.length,0);
 assert.ok(e.terminals.length>=2);
 assert.equal(new Set(e.terminals.map(t=>t.id)).size,e.terminals.length);
 for(const t of e.terminals){
  assert.equal(t.replacementReady,false);
  assert.ok(t.polarity===null||['+','-'].includes(t.polarity));
  assert.equal(t.worldPosition_mm,null);
  assert.ok(t.requiredFixtures.length>=5);
  if(t.localDirection) assert.ok(Math.abs(Math.hypot(...t.localDirection)-1)<1e-10);
 }
 e.dynamicGroups.forEach(d=>{assert.equal(d.pivot_mm.length,3);assert.ok(d.pivot_mm.every(Number.isFinite));});
 e.usableAsPrincipleCandidates.forEach(p=>assert.ok(inventory.has(p.name)));
}
const dcs=runtimeTypes.find(a=>a.asset==='dcsupply');
assert.deepEqual(dcs.dynamicGroups.map(d=>d.name),['knob','rocker','lamp']);
assert.equal(runtimeTypes.find(a=>a.asset==='dpdt').terminals.length,6);
assert.equal(runtimeTypes.find(a=>a.asset==='rheostat').terminals.length,4);
for(const key of ['ammeter','voltmeter'])assert.equal(runtimeTypes.find(a=>a.asset===key).terminals.length,3);
assert.deepEqual(runtimeTypes.find(a=>a.asset==='capacitor').terminals.find(t=>t.id==='B').dynamicOffset.range_mm,[0,64]);
for(const a of [...actual.chemistry,...runtimeTypes]) {
 const gates=a.acceptanceRequired;
 for(const gate of gates){
  assert.ok(a.gateApplicability[gate],`${a.asset}: missing applicability for ${gate}`);
  assert.ok(a.gateApplicability[gate].reason.length>5);
  assert.equal(a.gateApplicability[gate].waiverApproved,false);
 }
 assert.ok(gates.includes('MESH-PRECISION'));
 assert.ok(gates.includes('CROSS-COVERAGE'));
 if(actual.chemistry.includes(a))assert.ok(gates.includes('CONSERVATION'));
 if(a.dynamicGroups&&!a.dynamicGroups.length)assert.equal(a.gateApplicability.DYNAMICS.applicability,'proposed-not-applicable');
}
function assertNoReady(value){
 if(Array.isArray(value))value.forEach(assertNoReady);
 else if(value&&typeof value==='object')for(const [k,v]of Object.entries(value)){
  if(k==='replacementReady'||k==='directReplacementReady')assert.equal(v,false,`Premature ready flag: ${k}`);
  assertNoReady(v);
 }
}
assertNoReady(actual);
console.log(JSON.stringify({result:'PASS_REQUIREMENTS_LEDGER_ONLY',chemistry:87,electricalFileAssets:21,electricalRuntimeTypes:22,proceduralChemistry:2,ownedGLBs:68,allReplacementReady:false,terminalCoordinateContractsPending:output.unresolved.electricalTerminalCoordinates,geometryGenerated:actual.scope.geometryGenerated,productionChanges:0}));
