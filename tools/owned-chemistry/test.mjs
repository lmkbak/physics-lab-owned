import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as C from '../../src/lab/owned/chemistry/chem.js';
import {TABLE} from '../../src/lab/owned/chemistry/reactions.js';
import {FORMULAS,balance,close,sameTotals,totals,strongPH,carbonatePH,carbonBufferPH} from './oracle.mjs';
import {DEMO_CASES,scenarioEvidence,add,run,ledger} from './scenarios.mjs';
import {actualDemoEvidence} from './bench-contract.mjs';
const checks=[];const test=(name,fn)=>{fn();checks.push(name);};
const baseline=JSON.parse(fs.readFileSync(new URL('../../docs/ownership/baseline.json',import.meta.url),'utf8')).chemistry;
function allFinite(m){for(const [k,v]of Object.entries(C.inventory(m))){assert.ok(Number.isFinite(v)&&v>=-1e-12,`${k} nonnegative finite`);}assert.ok(Number.isFinite(C.pH(m)));for(const a of [C.appearance(m).colorRGB,C.appearance(m).pptRGB])assert.ok(a.every(Number.isFinite));}
test('43 exact reagent IDs and baseline species metadata',()=>{
 assert.equal(C.REAGENTS.length,43);assert.deepEqual(C.REAGENTS.map(r=>r.id).sort(),baseline.reagents.map(r=>r.id).sort());
 for(const k of baseline.speciesIds){assert.ok(C.SPECIES[k],k);assert.ok(FORMULAS[k],k);assert.equal(C.SPECIES[k].formula,FORMULAS[k][0],k+' independent formula');assert.equal(C.SPECIES[k].charge,FORMULAS[k][1],k+' independent charge');assert.equal(typeof C.SPECIES[k].solid,'boolean');assert.equal(typeof C.SPECIES[k].chunk,'boolean');}
 for(const r of C.REAGENTS){const m=C.fromReagent(r.id);allFinite(m);assert.ok(Object.keys(m.s).length>0);assert.equal(m.vol,r.solid?0:10);if(r.conc)for(const[k,c]of Object.entries(r.conc))close(m.s[k],10*c,r.id+k);const requirement=baseline.reagents.find(b=>b.id===r.id);if(requirement.solid&&typeof requirement.solid==='object')assert.deepEqual(m.s,requirement.solid);}
});
test('every independently declared reaction balances atoms and charge exactly',()=>{for(const r of TABLE)balance(r);});
test('neutralization limiting reactant, charge, solvent and enthalpy oracle',()=>{
 const m=C.fromReagent('HCl',10),b=C.fromReagent('NaOH',4),before=totals({...C.inventory(m)}),beforeB=totals(C.inventory(b));for(const[k,v]of Object.entries(beforeB))before[k]=(before[k]||0)+v;
 const solvent=m.solvent+b.solvent,ev=C.merge(m,b);close(m.s['H+'],6);assert.equal(m.s['OH-'],undefined);close(m.solvent,solvent+4);close(m.energy.reaction,4*57.3);
 const expected=25+4*57.3/(m.solvent*0.0753+Object.values(m.s).reduce((a,b)=>a+b,0)*0.06);close(m.T,expected,'delta T',1e-6,0);sameTotals(before,totals(C.inventory(m)));assert.ok(ev.some(e=>e.key==='neutralize'&&e.extent===4));
});
test('acid/base independent analytic oracle',()=>{
 for(const[a,b,v]of [[0,0,20],[1,0,100],[0,1,100],[1,0.9,100],[0.9,1,100],[1e-5,0,100]]){const m=C.water(v);if(a)m.s['H+']=a;if(b)m.s['OH-']=b;close(C.pH(m),strongPH(a,b,v),'strong pH',1e-4,0);}
 const carbonate=C.fromReagent('Na2CO3',10);close(C.pH(carbonate),carbonatePH(0.5),'carbonate pH',1e-4,0);
 const dilute=C.fromReagent('HCl',1);C.merge(dilute,C.water(99));close(C.pH(dilute),2,'dilution',1e-4,0);
});
test('carbonate 0/0.5/1/1.5/2 acid equivalents conserve carbon and match open-headspace pH',()=>{
 for(const eq of [0,0.5,1,1.5,2]){const m=C.fromReagent('Na2CO3',2),before=ledger(m),acid=C.fromReagent('HCl',eq);const b=ledger(acid);for(const[k,v]of Object.entries(b))before[k]=(before[k]||0)+v;C.merge(m,acid);sameTotals(before,ledger(m));
 const expectedGas=Math.max(0,eq-1);close(m.gas.CO2,expectedGas,'carbonate gas upper extent');const carbon=(m.s.CO3||0)+(m.s['HCO3-']||0);close(carbon,1-expectedGas,'remaining dissolved carbon');
 const expected=carbon?carbonBufferPH(carbon/m.vol,(2-eq)/m.vol):7;close(C.pH(m),expected,'titration pH '+eq,1e-4,0);if(eq===1){close(m.s['HCO3-'],1);assert.ok(C.pH(m)>8.2&&C.pH(m)<8.5);}
 }
});
test('100 take/merge cycles conserve suspended precipitate, gas, volume and energy',()=>{
 const m=add(C.fromReagent('CuSO4',10),'NaOH',10);m.gas.H2=0.2;m.fx.H2=0.3;m.T=42;m.energy.input=13;m.vapor=1;m.environment.O2=0.3;
 const before=C.inventory(m),vol=m.vol,energy=C.thermalEnergy(m),ledgers=structuredClone({environment:m.environment,energy:m.energy});
 for(let i=0;i<100;i++){const p=C.take(m,3.125);assert.ok(p.s.CuOH2>0);C.merge(m,p);}
 for(const[k,v]of Object.entries(before))close(C.inventory(m)[k]||0,v,k);close(m.vol,vol,'mL',1e-8,1e-9);close(C.thermalEnergy(m),energy,'thermal energy');assert.deepEqual(m.energy,ledgers.energy);close(m.environment.O2,ledgers.environment.O2);
 const all=C.take(m,m.vol);assert.equal(m.vol,0);assert.equal(Object.keys(m.s).length,0);close(all.s.CuOH2,5,'full precipitate transfer');C.clear(all);assert.deepEqual(all,C.createMixture());
});
test('dry solid/zero volume/zero dt/reset state boundaries',()=>{
 const m=C.fromReagent('thermite');assert.equal(C.take(m,5).vol,0);assert.equal(m.s.thermite,4);
 for(const dt of [0,-1,NaN,Infinity]){const before=JSON.stringify(m);assert.deepEqual(C.step(m,dt,{heat:5}),[]);assert.equal(JSON.stringify(m),before);}
 for(const r of C.REAGENTS){const z=C.fromReagent(r.id,0);run(z,0.2);allFinite(z);C.clear(z);assert.deepEqual(z,C.createMixture());}
 const m2=C.createMixture();m2.s.CuOH2=2;m2.fx.foam=4;m2.ind.litmus=1;m2.seen.x=true;m2.age.FeOH2=12;m2.crystals=[1,1,1];C.clear(m2);assert.deepEqual(m2,C.createMixture());
});
test('precipitation classes and acid dissolution',()=>{
 for(const[a,av,b,bv,p,n]of [['AgNO3',10,'HCl',1,'AgCl',1],['BaCl2',2,'Na2SO4',2,'BaSO4',1],['BaCl2',2,'Na2CO3',2,'BaCO3',1],['CaCl2',2,'Na2CO3',2,'CaCO3p',1],['CuSO4',2,'NaOH',2,'CuOH2',1],['FeCl3',2,'NaOH',3,'FeOH3',1],['FeSO4',2,'NaOH',2,'FeOH2',1],['AlCl3',2,'NaOH',3,'AlOH3',1]]){const m=add(C.fromReagent(a,av),b,bv);close(m.s[p],n,p);allFinite(m);if(p.endsWith('OH2')||p.endsWith('OH3')){add(m,'HCl',10);assert.ok(!(m.s[p]>1e-9),p+' acid dissolve');}}
});
test('metal displacement, Fe reduction, permanganate and nitric dilute controls',()=>{
 for(const metal of ['Mg','Zn','Fe']){const m=add(C.fromReagent('CuSO4',5),metal);const before=ledger(m);run(m,30);assert.ok(m.s.Cu>0.1);sameTotals(before,ledger(m));}
 const p=add(add(C.fromReagent('KMnO4',10),'HCl',2),'H2O2',1);const before=ledger(p);run(p,20);assert.ok(p.s['Mn2+']>0.19&&p.gas.O2>0.49);sameTotals(before,ledger(p));
 const q=add(add(C.fromReagent('KMnO4',10),'HCl',3),'FeSO4',4);run(q,20);assert.ok(q.s['Mn2+']>0.19&&q.s['Fe3+']>0.99);
 const m=add(C.fromReagent('HNO3d',10),'Cu');run(m,30);assert.ok(m.gas.NO>1);assert.equal(m.gas.NO2,0);assert.equal(m.gas.H2,0);close(m.gas.NO*1.5,m.s['Cu2+'],'dilute Cu NO');
});
test('indicator and starch optics require their actual input',()=>{
 const acid=add(C.fromReagent('HCl',2),'phph',0.1),base=add(C.fromReagent('NaOH',2),'phph',0.1);assert.ok(C.appearance(base).tint>C.appearance(acid).tint+0.5);
 const a=add(C.fromReagent('HCl',2),'litmus',0.1),b=add(C.fromReagent('NaOH',2),'litmus',0.1);assert.ok(C.appearance(a).colorRGB[0]>C.appearance(b).colorRGB[0]);assert.ok(C.appearance(b).colorRGB[2]>C.appearance(a).colorRGB[2]);
 assert.equal(C.appearance(C.fromReagent('I2',1)).iodineBlue,false);assert.equal(C.appearance(C.fromReagent('starch',1)).iodineBlue,false);
});
test('precipitate wash/transfer and crystal redissolution preserve the inventory',()=>{
 const m=add(C.fromReagent('AgNO3',10),'HCl',1),before=ledger(m),p=C.take(m,5.5);assert.ok(p.s.AgCl>0);C.merge(m,p);sameTotals(before,ledger(m));
 const prior=m.s.AgCl;C.merge(m,C.water(40));close(m.s.AgCl,prior,'AgCl survives washing');const transferred=C.take(m,m.vol);close(transferred.s.AgCl,prior,'washed precipitate transfer');C.clear(m);assert.deepEqual(m,C.createMixture());
 const salt=C.createMixture();salt.s.salt=2;C.merge(salt,C.water(5));assert.ok(!salt.s.salt);close(salt.s['Na+'],2);close(salt.s['Cl-'],2);
});
test('external heat, cooling and latent heat close the independent energy ledger',()=>{
 for(const make of [()=>C.water(2),()=>{const m=C.fromReagent('Zn');m.T=500;return m;}]){const m=make(),before=C.thermalEnergy(m),e=structuredClone(m.energy);run(m,3,0.2,{heat:90});close(C.thermalEnergy(m)-before,(m.energy.input-e.input)+(m.energy.reaction-e.reaction)-(m.energy.loss-e.loss)-(m.energy.latent-e.latent),'heating/cooling',1e-7);assert.ok(m.energy.input===270||Math.abs(m.energy.input-270)<1e-9);assert.ok(m.energy.loss>0);}
 const a=C.fromReagent('HCl',5),b=C.water(5);a.T=60;b.T=15;const expected=C.thermalEnergy(a)+C.thermalEnergy(b);C.merge(a,b);close(C.thermalEnergy(a),expected,'nonreactive mixing enthalpy');
});
test('missing catalysts and missing heat do not invent fun-reaction products',()=>{
 const lum=add(C.fromReagent('luminol',10),'H2O2',1);run(lum,2);assert.ok(!lum.s.aminophthalate&&lum.fx.lum===0);
 for(const id of ['thermite','HgSCN2','dichromate','Mg']){const m=C.fromReagent(id);run(m,2);close(m.s[id],C.REAGENT_BY_ID[id].solid[id]);assert.equal(Object.keys(m.extent).length,0);}
 const peroxide=C.fromReagent('H2O2',10);run(peroxide,2);close(peroxide.s.H2O2,15);assert.equal(peroxide.gas.O2,0);
 const carbon=C.fromReagent('sucrose');run(carbon,2);assert.ok(!carbon.s.C);
});
test('iodine clock induction and depletion are time observables',()=>{
 const m=add(C.fromReagent('KIO3',10),'HSO3',10);assert.equal(C.appearance(m).iodineBlue,false);run(m,2);assert.equal(C.appearance(m).iodineBlue,false);assert.ok(m.s['HSO3-']>0.01);run(m,78);assert.ok(C.appearance(m).iodineBlue);assert.ok((m.s['HSO3-']||0)<1e-6);
});
let scenarios;
test('22 baseline experiments with independent product/gas/thermal ledger evidence',()=>{
 assert.deepEqual(DEMO_CASES.map(s=>s.id).sort(),baseline.demos.map(s=>s.id).sort());scenarios=scenarioEvidence(0.2);
});
test('dt 0.2 / 0.02 convergence <=1% species/gas/energy and identical completion state',()=>{
 const fine=scenarioEvidence(0.02);
 for(let i=0;i<scenarios.length;i++){const a=scenarios[i].state,b=fine[i].state;for(const k of new Set([...Object.keys(C.inventory(a)),...Object.keys(C.inventory(b))]))close(C.inventory(a)[k]||0,C.inventory(b)[k]||0,scenarios[i].id+' '+k,1e-9,0.01);close(a.energy.reaction,b.energy.reaction,scenarios[i].id+' heat',1e-9,0.01);close(a.T,b.T,scenarios[i].id+' temperature',1e-7,0.01);for(const k of Object.keys(a.fx))close(a.fx[k],b.fx[k],scenarios[i].id+' fx '+k,1e-8,0.01);}
});
test('kinetic extents match independent analytic first-order and solid-front solutions',()=>{
 for(const dt of [0.2,0.02,0.037]){const p=add(C.fromReagent('H2O2',10),'MnO2');const seconds=4,n=Math.ceil(seconds/dt);for(let i=0;i<n;i++)C.step(p,Math.min(dt,seconds-i*dt));close(p.s.H2O2,15*Math.exp(-0.2*seconds),'first-order peroxide',1e-9,1e-8);close(p.gas.O2,7.5*(1-Math.exp(-0.2*seconds)),'analytic O2',1e-9,1e-8);}
 const m=C.fromReagent('HgSCN2');m.T=500;run(m,1,0.2,{heat:230});close(m.s.HgSCN2,3-2*0.2,'solid reaction front',1e-9,1e-8);
});
const actualDemos=await actualDemoEvidence();checks.push('all 22 existing DEMOS executed with actual doses, acceleration and until predicates');
const report={schema:'owned-chemistry-evidence/v1',status:'pass',checks:checks.map(name=>({name,status:'pass'})),reactionRows:TABLE.length,reagentCount:C.REAGENTS.length,speciesCount:Object.keys(C.SPECIES).length,actualDemos,scenarios:scenarios.map(({state,...e})=>e)};
if(process.argv.includes('--write-report'))fs.writeFileSync(new URL('./evidence.json',import.meta.url),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report,null,2));
