import assert from 'node:assert/strict';
import * as C from '../../src/lab/owned/chemistry/chem.js';
import {close,sameTotals,totals} from './oracle.mjs';
const positive=(m,k)=>assert.ok((m.s[k]||0)>1e-6,`product ${k}`);
export const add=(m,id,v)=>{C.merge(m,C.fromReagent(id,v));return m;};
export const run=(m,seconds,dt=0.2,opts={})=>{const n=Math.round(seconds/dt);for(let i=0;i<n;i++)C.step(m,dt,opts);return m;};
export const DEMO_CASES=[
 {id:'thermite',make:()=>{const m=C.fromReagent('thermite');m.T=750;return m;},duration:12,check:m=>{positive(m,'Fe');positive(m,'Al2O3');close(m.s.Fe,2*m.s.Al2O3,'thermite ratio');assert.ok(m.fx.thermite>0&&m.energy.reaction>0);}},
 {id:'toothpaste',make:()=>add(add(C.fromReagent('H2O2c',10),'KI',1),'soap',2),duration:12,check:m=>{assert.ok(m.gas.O2>1&&m.fx.foam>0);close(m.s['I-'],1,'iodide catalyst');}},
 {id:'luminol',make:()=>add(add(C.fromReagent('luminol',10),'H2O2',2),'K3FeCN6',1),duration:10,check:m=>{positive(m,'aminophthalate');assert.ok(m.otherGas.N2>0&&m.fx.lum>0);close(m.s.FeCN,0.05,'ferricyanide catalyst');}},
 {id:'snake',make:()=>{const m=C.fromReagent('HgSCN2');m.T=250;return m;},duration:12,check:m=>{positive(m,'HgS');positive(m,'snakeAsh');assert.ok(m.fx.snake>0);}},
 {id:'bread',make:()=>add(C.fromReagent('sucrose'),'H2SO4c',2),duration:15,check:m=>{positive(m,'C');assert.ok(m.fx.bread>0&&m.solvent>2*55.508);close(m.s.C,12*m.extent.bread,'carbon');}},
 {id:'clock',make:()=>add(C.fromReagent('KIO3',10),'HSO3',10),duration:80,check:m=>{positive(m,'I2');assert.ok((m.s['HSO3-']||0)<1e-6);assert.ok(C.appearance(m).iodineBlue);}},
 {id:'volcano',make:()=>{const m=C.fromReagent('dichromate');m.T=250;return m;},duration:12,check:m=>{positive(m,'Cr2O3');close(m.s.Cr2O3,m.otherGas.N2,'volcano nitrogen');assert.ok(m.fx.volcano>0);}},
 {id:'k',make:()=>{const m=C.water(20);add(m,'K');return m;},duration:6,check:m=>{positive(m,'K+');positive(m,'OH-');assert.ok(m.gas.H2>0&&m.fx.potassium>0);close(m.s['K+'],2*m.gas.H2,'K water ratio');}},
 {id:'na',make:()=>{const m=C.water(20);add(m,'Na');return m;},duration:8,check:m=>{positive(m,'Na+');assert.ok(m.gas.H2>0&&m.fx.sodium>0);}},
 {id:'feoh2',make:()=>add(C.fromReagent('FeSO4',4),'NaOH',4),duration:20,check:m=>{positive(m,'FeOH2');positive(m,'FeOH3');assert.ok(m.environment.O2>0&&m.age.FeOH2>0);}},
 {id:'aloh3',make:()=>{const m=add(C.fromReagent('AlCl3',2),'NaOH',3);assert.ok(m.s.AlOH3>0.9);add(m,'NaOH',2);return m;},duration:1,check:m=>{positive(m,'AlO2-');assert.ok(!(m.s.AlOH3>1e-6));}},
 {id:'flame',make:()=>C.fromReagent('NaCl',2),duration:1,check:()=>{for(const[id,k]of [['NaCl','Na+'],['KCl','K+'],['CaCl2','Ca2+'],['CuSO4','Cu2+'],['BaCl2','Ba2+']]){assert.equal(C.flameIon(C.fromReagent(id,2)),k);assert.ok(C.FLAME_COLORS[k].color.every(Number.isFinite));}}},
 {id:'o2',make:()=>add(C.fromReagent('H2O2',10),'MnO2'),duration:12,check:m=>{assert.ok(m.gas.O2>1&&m.fx.O2>0);close(m.s.MnO2,1,'MnO2 catalyst');assert.ok(C.REACTIONS.relight.eq);}},
 {id:'h2',make:()=>add(C.fromReagent('HCl',10),'Zn'),duration:15,check:m=>{positive(m,'Zn2+');close(m.s['Zn2+'],m.gas.H2,'Zn H2');assert.ok(m.fx.H2>0&&C.REACTIONS.pop.eq);}},
 {id:'co2',make:()=>add(C.fromReagent('HCl',10),'CaCO3'),duration:12,check:m=>{positive(m,'Ca2+');close(m.s['Ca2+'],m.gas.CO2,'carbonate CO2');assert.ok(m.fx.CO2>0&&C.REACTIONS.douse.obs);}},
 {id:'fe3',make:()=>{const m=add(C.fromReagent('FeCl3',4),'KSCN',4);assert.ok(m.s.FeSCN>0.5);add(m,'Fe');return m;},duration:20,check:m=>{positive(m,'Fe2+');assert.ok((m.s.FeSCN||0)<0.1&&m.s['SCN-']>1);}},
 {id:'cuhno3',make:()=>add(C.fromReagent('HNO3c',10),'Cu'),duration:20,check:m=>{positive(m,'Cu2+');close(m.gas.NO2,2*m.s['Cu2+'],'NO2 ratio');assert.equal(m.gas.H2,0);}},
 {id:'agtree',make:()=>add(C.fromReagent('AgNO3',20),'Cu'),duration:20,check:m=>{positive(m,'Ag');close(m.s.Ag,2*m.s['Cu2+'],'Ag Cu ratio');}},
 {id:'mg',make:()=>{const m=C.fromReagent('Mg');m.T=550;return m;},duration:8,check:m=>{positive(m,'MgO');assert.ok(m.environment.O2>0&&m.energy.reaction>0);}},
 {id:'cuoh2',make:()=>{const m=add(C.fromReagent('CuSO4',4),'NaOH',4);assert.ok(m.s.CuOH2>1.9);m.T=80;return m;},duration:12,check:m=>{positive(m,'CuO');assert.ok((m.s.CuOH2||0)<0.01);}},
 {id:'evap',make:()=>C.fromReagent('NaCl',0.15),duration:20,options:{heat:180},check:m=>{positive(m,'salt');assert.ok(m.vol<0.15&&m.vapor>0&&m.crystals);}},
 {id:'starch',make:()=>add(C.fromReagent('I2',2),'starch',2),duration:1,check:m=>{close(m.s.I2,0.04,'iodine retained');close(m.s.starch,0.1,'starch retained');assert.ok(C.appearance(m).iodineBlue);}}
];
export function ledger(m){const t=totals(C.inventory(m));t.O-=2*m.environment.O2;return t;}
export function scenarioEvidence(dt=0.2){return DEMO_CASES.map(s=>{const m=s.make(),before=ledger(m),e0=C.thermalEnergy(m),q0={...m.energy};run(m,s.duration,dt,s.options);s.check(m);sameTotals(before,ledger(m),s.id);close(C.thermalEnergy(m)-e0,(m.energy.reaction-q0.reaction)+(m.energy.input-q0.input)-(m.energy.latent-q0.latent)-(m.energy.loss-q0.loss),s.id+' enthalpy',1e-7,1e-8);return {id:s.id,state:m,products:Object.fromEntries(Object.entries(m.s).filter(([k])=>!['H+','OH-','Na+','K+','Cl-','SO4','NO3-'].includes(k))),gas:m.gas,extent:m.extent,temperatureC:m.T};});}
