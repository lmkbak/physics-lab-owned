import { SPECIES, REAGENTS, REAGENT_BY_ID, FLAME_COLORS } from './data.js';
import { TABLE, REACTIONS } from './reactions.js';
export { SPECIES, REAGENTS, REAGENT_BY_ID, FLAME_COLORS, REACTIONS };
const GAS=['H2','O2','CO2','NO2','NO'];
const FX=[...GAS,'boil','sodium','potassium','heat','steam','lum','foam','bread','snake','thermite','volcano'];
const WATER_PER_ML=55.508;
const zeros=keys=>Object.fromEntries(keys.map(k=>[k,0]));
const finite=n=>Number.isFinite(n)?Math.max(0,n):0;
const clone=x=>structuredClone(x);
export function createMixture(vol=0) {
  vol=finite(vol);
  return {vol,s:{},T:25,gas:zeros(GAS),fx:zeros(FX),seen:{},age:{FeOH2:0},ind:{phph:0,litmus:0},crystals:null,
    solvent:vol*WATER_PER_ML,otherGas:{N2:0,SO2:0},vapor:0,environment:{O2:0},energy:{reaction:0,input:0,loss:0,latent:0},extent:{},time:0,ignite:0,burning:false};
}
export const water=vol=>createMixture(vol);
export const isSolid=k=>!!SPECIES[k]?.solid;
export function fromReagent(id,vol=10) {
  const r=REAGENT_BY_ID[id]; if(!r) throw new RangeError(`Unknown reagent: ${id}`);
  const m=createMixture(r.solid?0:vol);
  if(r.solid) Object.assign(m.s,r.solid);
  else for(const [k,c] of Object.entries(r.conc)) m.s[k]=c*m.vol;
  indicators(m); return m;
}
function indicators(m) {m.ind.phph=m.s.phph||0;m.ind.litmus=m.s.litmus||0;}
export function heatCapacity(m) {return Math.max(1e-10,m.solvent*0.0753+Object.values(m.s).reduce((a,b)=>a+b,0)*0.06);}
export function thermalEnergy(m) {return heatCapacity(m)*(m.T-25);}
function get(m,k) {if(k==='@water') return m.solvent;if(k==='@vapor')return m.vapor;if(k[0]==='@') return m.gas[k.slice(1)]??m.otherGas[k.slice(1)]??0;return m.s[k]||0;}
function put(m,k,x) {
  if(k==='@water')m.solvent=x;else if(k==='@vapor')m.vapor=x;else if(k[0]==='@') {const g=k.slice(1);if(GAS.includes(g))m.gas[g]=x;else m.otherGas[g]=x;}
  else if(x>1e-12)m.s[k]=x;else delete m.s[k];
}
function limit(m,r,ignoreAir=false) {let e=Infinity;for(const [k,n] of Object.entries(r.stoich))if(n<0&&!(ignoreAir&&k==='@O2'))e=Math.min(e,get(m,k)/-n);return Number.isFinite(e)?Math.max(0,e):0;}
function execute(m,r,x,events=[],reverse=false) {
  if(!(x>1e-12))return 0;
  const stoich=reverse?Object.fromEntries(Object.entries(r.stoich).map(([k,n])=>[k,-n])):r.stoich;
  let extent=x;
  for(const [k,n] of Object.entries(stoich))if(n<0)extent=Math.min(extent,get(m,k)/-n);
  if(!(extent>1e-12))return 0;
  const oldEnergy=thermalEnergy(m);
  for(const [k,n] of Object.entries(stoich))put(m,k,Math.max(0,get(m,k)+n*extent));
  const heat=-r.dH*extent*(reverse?-1:1);
  m.energy.reaction+=heat;m.T=25+(oldEnergy+heat)/heatCapacity(m);
  m.extent[r.key]=(m.extent[r.key]||0)+extent*(reverse?-1:1);
  for(const g of GAS)if((stoich['@'+g]||0)>0)m.fx[g]=Math.min(4,m.fx[g]+extent*stoich['@'+g]);
  if(r.fx)m.fx[r.fx]=Math.min(5,m.fx[r.fx]+extent*(r.fx==='lum'?12:1));
  if(heat>0)m.fx.heat=Math.min(5,m.fx.heat+heat/500);
  if(r.key==='peroxide'&&(m.s.soap||0)>0)m.fx.foam=Math.min(8,m.fx.foam+extent*0.35);
  if(r.key==='bread'||r.key==='volcano')m.fx.steam=Math.min(5,m.fx.steam+extent);
  const key=(reverse?'reverse:':'')+r.key;
  if(!m.seen[key]) { events.push({key,...REACTIONS[r.key],extent,heatJ:heat});m.seen[key]=true; }
  return extent;
}
const byKey=Object.fromEntries(TABLE.map(r=>[r.key,r]));
function complex(m,events) {
  if(!(m.vol>0))return;
  const F=(m.s['Fe3+']||0)+(m.s.FeSCN||0),L=(m.s['SCN-']||0)+(m.s.FeSCN||0);
  if(!(F>0&&L>0))return;
  // Ideal concentration equilibrium K=140 L/mol (teaching single-ligand model).
  const K=140/m.vol; let lo=0,hi=Math.min(F,L);
  for(let i=0;i<60;i++){const x=(lo+hi)/2;if(x>K*(F-x)*(L-x))hi=x;else lo=x;}
  const target=(lo+hi)/2,delta=target-(m.s.FeSCN||0);
  execute(m,byKey.complex,Math.abs(delta),events,delta<0);
}
function crystals(m,events) {
  const pairs=[['crystalNa','Na+','Cl-','salt',6.1],['crystalK','K+','Cl-','KClCrystal',4.6],['crystalCu','Cu2+','SO4','CuSO4Crystal',1.3]];
  for(const [key,a,b,solid,solubility] of pairs) {
    const max=solubility*m.vol;
    const dissolved=Math.min(m.s[a]||0,m.s[b]||0);
    if(dissolved>max+1e-12)execute(m,byKey[key],dissolved-max,events);
    else if(dissolved<max&&(m.s[solid]||0)>0)execute(m,byKey[key],Math.min(max-dissolved,m.s[solid]),events,true);
  }
  m.crystals=(m.s.salt||m.s.KClCrystal||m.s.CuSO4Crystal)?(m.s.CuSO4Crystal?[0.6,0.82,0.98]:[0.96,0.97,0.98]):null;
}
export function equilibrate(m,events=[]) {
  if(!m||!(m.vol>=0))throw new TypeError('Mixture expected');
  // Acid/base is resolved before precipitation to avoid nonphysical dissolution cycles.
  for(let pass=0;pass<3;pass++)for(const r of TABLE)if(r.instant&&(!r.condition||r.condition(m)))execute(m,r,limit(m,r),events);
  complex(m,events);crystals(m,events);indicators(m);return events;
}
function injectAir(m,r,extent) {
  // Air crosses the boundary only in the amount actually consumed this substep.
  const need=extent*-(r.stoich['@O2']||0),missing=Math.max(0,need-get(m,'@O2'));
  if(missing>0){m.gas.O2+=missing;m.environment.O2+=missing;}
}
function cool(m,dt) {
  const initial=thermalEnergy(m);if(!(initial>0))return;
  const capacity=heatCapacity(m),ambient=298.15;
  // Implicit convection + Stefan–Boltzmann radiation; bounded without discarding heat.
  // Effective area scales with a dry sample's mmol rather than a beaker's area.
  // These geometry proxies are teaching parameters, not material calorimetry.
  const sample=Object.values(m.s).reduce((a,b)=>a+b,0);
  const area=m.vol>0?0.005:0.00001*Math.max(0.02,sample)**(2/3);
  const power=t=>8*area*(t-25)+0.8*5.670374419e-8*area*((t+273.15)**4-ambient**4);
  let lo=25,hi=m.T;for(let i=0;i<50;i++){const t=(lo+hi)/2;if(capacity*(t-25)+dt*power(t)>initial)hi=t;else lo=t;}
  const t=(lo+hi)/2,remaining=capacity*(t-25);m.energy.loss+=initial-remaining;m.T=t;
}
function addExternalHeat(m,j) {const e=thermalEnergy(m);m.energy.input+=j;m.T=25+(e+j)/heatCapacity(m);}
function evaporate(m,j) {
  if(!(m.vol>0&&m.solvent>0))return;
  const can=Math.min(m.vol,m.solvent/WATER_PER_ML),ml=Math.min(can,j/2257);
  if(!(ml>0))return;
  const e=thermalEnergy(m),n=ml*WATER_PER_ML;
  m.vol=Math.max(0,m.vol-ml);m.solvent-=n;m.vapor+=n;m.energy.latent+=ml*2257;
  m.T=25+(e-ml*2257)/heatCapacity(m);m.fx.boil=Math.min(4,m.fx.boil+ml);m.fx.steam=Math.min(5,m.fx.steam+ml);
}
export function step(m,dt,{heat=0,stir=0}={}) {
  if(!(Number.isFinite(dt)&&dt>0))return [];
  const events=[];const count=Math.ceil(dt/0.01),h=dt/count;
  for(let i=0;i<count;i++) {
    for(const key of FX)m.fx[key]*=Math.exp(-h*(key==='lum'?0.2:0.65));
    if(Number.isFinite(heat)&&heat>0)addExternalHeat(m,heat*h);
    equilibrate(m,events);
    // Every public time step uses the same bounded integration mesh, no discarded time.
    for(const r of TABLE) {
      if(!r.rate||(r.condition&&!r.condition(m)))continue;
      const available=limit(m,r,!!r.air),factor=1+Math.min(1,finite(stir))*0.25;
      const x=r.zeroOrder?Math.min(available,r.zeroOrder*factor*h):available*(-Math.expm1(-r.rate*factor*h));
      if(r.air)injectAir(m,r,x);
      execute(m,r,x,events);
    }
    equilibrate(m,events);
    if(m.T>100&&m.vol>0)evaporate(m,Math.max(0,(m.T-100)*heatCapacity(m)));
    cool(m,h);
    m.age.FeOH2+=(m.s.FeOH2||0)>0?h:0;m.time+=h;
  }
  return events;
}
export function pH(m) {
  if(!(m.vol>0))return 7;
  const V=m.vol,C=((m.s.CO3||0)+(m.s['HCO3-']||0))/V,B=(m.s['HSO3-']||0)/V,S=((m.s.SO4||0)+(m.s.H2SO4c||0))/V;
  const A=((m.s['H+']||0)-(m.s['OH-']||0)-2*(m.s.CO3||0)-(m.s['HCO3-']||0)-(m.s['HSO3-']||0)-2*(m.s.SO4||0))/V;
  function f(p){const H=10**(-p);const kc1=4.3e-7,kc2=4.7e-11,kb1=1.5e-2,kb2=6.3e-8,ks=0.012;
    const carbonate=(kc1*H+2*kc1*kc2)/(H*H+kc1*H+kc1*kc2);
    const sulfite=(kb1*H+2*kb1*kb2)/(H*H+kb1*H+kb1*kb2);
    return H-1e-14/H-A-C*carbonate-B*sulfite-S*(H+2*ks)/(H+ks);
  }
  let lo=-3,hi=17;for(let i=0;i<90;i++){const mid=(lo+hi)/2;if(f(mid)>0)lo=mid;else hi=mid;}return (lo+hi)/2;
}
export function flameIon(m) {return ['Na+','K+','Ca2+','Cu2+','Ba2+'].find(k=>(m.s[k]||0)>1e-10)||null;}
export function composition(m,n=5) {return Object.entries(m.s).filter(([,a])=>a>1e-10).sort((a,b)=>b[1]-a[1]).slice(0,Math.max(0,n)).map(([k,mmol])=>({k,label:SPECIES[k]?.label||k,mmol,solid:isSolid(k)}));}
export function appearance(m) {
  let absorption=[0,0,0],pptRGB=[0,0,0],pptAmount=0;const chunks={};
  for(const [k,a] of Object.entries(m.s)) {
    const s=SPECIES[k];if(!s||!(a>0))continue;
    if(s.solid){if(s.chunk)chunks[k]=a;else{pptAmount+=a;for(let j=0;j<3;j++)pptRGB[j]+=s.color[j]*a;}}
    else if(s.color!==undefined&&s.color.some(c=>c<0.7)&&!['phph','litmus','aminophthalate'].includes(k)) {
      const intensity=a/Math.max(m.vol,0.01)*(k==='MnO4-'?80:k==='FeSCN'?30:k==='I2'?20:3);
      for(let j=0;j<3;j++)absorption[j]+=(1-s.color[j])*intensity;
    }
  }
  const p=pH(m);
  if((m.s.phph||0)>0){const f=1/(1+10**(9.4-p));absorption[1]+=f*2.5;absorption[2]+=f*0.6;}
  if((m.s.litmus||0)>0){const c=p<5?[0.88,0.08,0.15]:p>8?[0.12,0.18,0.84]:[0.55,0.15,0.65];for(let j=0;j<3;j++)absorption[j]+=(1-c[j])*1.5;}
  const iodineBlue=(m.s.I2||0)>1e-6&&(m.s.starch||0)>1e-8;
  if(iodineBlue){absorption[0]+=4;absorption[1]+=3.8;absorption[2]+=0.6;}
  const colorRGB=absorption.map(a=>Math.exp(-a)),tint=1-Math.exp(-Math.max(...absorption));
  if(pptAmount>0)pptRGB=pptRGB.map(v=>v/pptAmount);else pptRGB=[0.97,0.97,0.98];
  return {colorRGB,color:colorRGB,tint,turbidity:1-Math.exp(-pptAmount/Math.max(m.vol*0.08,0.1)),pptRGB,ppt:pptRGB,pptAmount,chunks,glow:m.fx.lum||0,empty:m.vol<=0&&Object.keys(m.s).length===0,iodineBlue};
}
function scaleObject(o,f){return Object.fromEntries(Object.entries(o).map(([k,v])=>[k,v*f]));}
export function take(a,mL) {
  const amount=Math.min(finite(mL),a.vol),f=a.vol>0?amount/a.vol:0;const b=createMixture(amount);if(!(f>0))return b;
  b.T=a.T;b.s=scaleObject(a.s,f);b.solvent=a.solvent*f;b.vapor=a.vapor*f;
  for(const key of ['gas','otherGas','fx','ind','environment','energy','extent'])b[key]=scaleObject(a[key],f);
  b.seen=clone(a.seen);b.age=clone(a.age);b.crystals=a.crystals?clone(a.crystals):null;b.time=a.time;
  a.vol-=amount;a.solvent-=b.solvent;a.vapor-=b.vapor;
  for(const key of ['s','gas','otherGas','fx','ind','environment','energy','extent'])for(const k of Object.keys(a[key])){a[key][k]-=b[key][k]||0;if(key==='s'&&a[key][k]<=1e-12)delete a[key][k];}
  if(a.vol===0&&Object.keys(a.s).length===0){a.T=25;a.crystals=null;}
  return b;
}
export function merge(a,b,events=[]) {
  if(a===b)throw new TypeError('Cannot merge a mixture into itself');
  const energy=thermalEnergy(a)+thermalEnergy(b),total=a.vol+b.vol;
  for(const key of ['s','gas','otherGas','environment','energy','extent'])for(const [k,v]of Object.entries(b[key]))a[key][k]=(a[key][k]||0)+v;
  for(const k of FX)a.fx[k]+=b.fx[k]||0;
  a.solvent+=b.solvent;a.vapor+=b.vapor;a.vol=total;a.T=25+energy/heatCapacity(a);
  a.seen={...a.seen,...b.seen};a.age.FeOH2=Math.max(a.age.FeOH2,b.age.FeOH2);a.time=Math.max(a.time,b.time);
  equilibrate(a,events);return events;
}
export function clear(m) {for(const key of Object.keys(m))delete m[key];Object.assign(m,createMixture());}
// Diagnostic closed ledger: includes introduced atmospheric O2 separately in environment.
export function inventory(m) {return {...m.s,'@water':m.solvent,'@vapor':m.vapor,...Object.fromEntries(Object.entries(m.gas).map(([k,v])=>['@'+k,v])),...Object.fromEntries(Object.entries(m.otherGas).map(([k,v])=>['@'+k,v]))};}
