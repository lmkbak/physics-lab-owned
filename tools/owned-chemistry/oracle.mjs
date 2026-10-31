// Independently enumerated chemical oracle, deliberately separate from runtime metadata.
import assert from 'node:assert/strict';
export const FORMULAS={
 'H+':['H',1],'OH-':['OH',-1],'HCO3-':['HCO3',-1],'Na+':['Na',1],'K+':['K',1],'Cl-':['Cl',-1],SO4:['SO4',-2],'NO3-':['NO3',-1],CO3:['CO3',-2],
 'Cu2+':['Cu',2],'Fe3+':['Fe',3],'Fe2+':['Fe',2],'Al3+':['Al',3],'AlO2-':['AlO2',-1],'Ag+':['Ag',1],'Ba2+':['Ba',2],'Ca2+':['Ca',2],'Mg2+':['Mg',2],'Zn2+':['Zn',2],'Mn2+':['Mn',2],
 'SCN-':['SCN',-1],FeSCN:['FeSCN',2],'MnO4-':['MnO4',-1],H2O2:['H2O2',0],I2:['I2',0],starch:['C6H10O5',0],phph:['C20H14O4',0],litmus:['C7H7NO4',0],NO2aq:['NO2',0],
 AgCl:['AgCl',0],BaSO4:['BaSO4',0],BaCO3:['BaCO3',0],CaCO3p:['CaCO3',0],CuOH2:['CuO2H2',0],FeOH3:['FeO3H3',0],FeOH2:['FeO2H2',0],AlOH3:['AlO3H3',0],CuO:['CuO',0],MnO2:['MnO2',0],Ag:['Ag',0],salt:['NaCl',0],
 Zn:['Zn',0],Mg:['Mg',0],Fe:['Fe',0],Cu:['Cu',0],CaCO3:['CaCO3',0],Na:['Na',0],MgO:['MgO',0],K:['K',0],'I-':['I',-1],'IO3-':['IO3',-1],'HSO3-':['HSO3',-1],
 luminol:['C8H7N3O2',0],FeCN:['FeC6N6',-3],soap:['C12H26O',0],H2SO4c:['H2SO4',0],thermite:['Al2Fe2O3',0],Al2O3:['Al2O3',0],HgSCN2:['HgS2C2N2',0],snakeAsh:['C3N4',0],sucrose:['C12H22O11',0],C:['C',0],dichromate:['N2H8Cr2O7',0],Cr2O3:['Cr2O3',0],
 aminophthalate:['C8H5NO4',-2],CS2:['CS2',0],HgS:['HgS',0],KClCrystal:['KCl',0],CuSO4Crystal:['CuSO4',0],
 '@water':['H2O',0],'@vapor':['H2O',0],'@H2':['H2',0],'@O2':['O2',0],'@CO2':['CO2',0],'@NO2':['NO2',0],'@NO':['NO',0],'@N2':['N2',0],'@SO2':['SO2',0]
};
export function parse(formula){const a={};for(const [,el,n]of formula.matchAll(/([A-Z][a-z]?)(\d*)/g))a[el]=(a[el]||0)+(Number(n)||1);return a;}
export function totals(inv){const out={charge:0};for(const [k,n]of Object.entries(inv)){assert.ok(FORMULAS[k],`oracle species missing ${k}`);const [f,q]=FORMULAS[k];out.charge+=q*n;for(const[e,c]of Object.entries(parse(f)))out[e]=(out[e]||0)+c*n;}return out;}
export function close(a,b,msg='',abs=1e-9,rel=1e-8){assert.ok(Number.isFinite(a)&&Number.isFinite(b),`${msg}: finite ${a}, ${b}`);assert.ok(Math.abs(a-b)<=abs+rel*Math.max(Math.abs(a),Math.abs(b)),`${msg}: ${a} != ${b}`);}
export function sameTotals(a,b,msg=''){for(const k of new Set([...Object.keys(a),...Object.keys(b)]))close(a[k]||0,b[k]||0,msg+' '+k);}
export function balance(r){const t=totals(r.stoich);for(const[k,n]of Object.entries(t))assert.equal(n,0,`${r.key}: unbalanced ${k}`);}
export function strongPH(acid,base,vol){const c=(acid-base)/vol;const H=(c+Math.sqrt(c*c+4e-14))/2;return -Math.log10(c>=0?H:2e-14/(Math.sqrt(c*c+4e-14)-c));}
export function carbonBufferPH(C,alkalinity){
 // Independent Newton solve in hydrogen concentration using numerical derivative.
 let p=8.3;const residual=p=>{const h=10**(-p),den=h*h+4.3e-7*h+4.3e-7*4.7e-11;return alkalinity+h-1e-14/h-C*(4.3e-7*h+2*4.3e-7*4.7e-11)/den;};
 for(let i=0;i<100;i++){const f=residual(p),d=(residual(p+1e-4)-residual(p-1e-4))/2e-4;const step=Math.max(-0.5,Math.min(0.5,f/d));p-=step;if(Math.abs(step)<1e-12)break;}return p;
}
export function carbonatePH(C){ // independent bisection over [OH-], from carbonate mass/charge balance.
 let lo=1e-14,hi=1;for(let i=0;i<150;i++){const oh=(lo+hi)/2,h=1e-14/oh,a=4.3e-7,b=4.7e-11,den=h*h+a*h+a*b;const charge=C*(a*h+2*a*b)/den; if(2*C+h>oh+charge)lo=oh;else hi=oh;}return 14+Math.log10((lo+hi)/2);
}
