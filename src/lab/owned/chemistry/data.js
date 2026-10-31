// Independently authored scientific data. No legacy chemistry implementation is imported.
// Amounts are mmol; colors are display RGB, not measured spectra.
const white = [0.96, 0.97, 0.98];
const species = {};
function S(k, formula, charge, label, color = white, solid = false, chunk = false) {
  species[k] = { formula, charge, label, color, solid, chunk };
}
S('H+', 'H', 1, '氢离子'); S('OH-', 'OH', -1, '氢氧根'); S('HCO3-','HCO3',-1,'碳酸氢根');
for (const [k, f, q, l] of [['Na+','Na',1,'钠离子'],['K+','K',1,'钾离子'],['Cl-','Cl',-1,'氯离子'],['SO4','SO4',-2,'硫酸根'],['NO3-','NO3',-1,'硝酸根'],['CO3','CO3',-2,'碳酸根'],['Al3+','Al',3,'铝离子'],['AlO2-','AlO2',-1,'偏铝酸根'],['Ag+','Ag',1,'银离子'],['Ba2+','Ba',2,'钡离子'],['Ca2+','Ca',2,'钙离子'],['Mg2+','Mg',2,'镁离子'],['Zn2+','Zn',2,'锌离子'],['SCN-','SCN',-1,'硫氰酸根'],['I-','I',-1,'碘离子'],['IO3-','IO3',-1,'碘酸根'],['HSO3-','HSO3',-1,'亚硫酸氢根']]) S(k,f,q,l);
S('Cu2+','Cu',2,'铜离子',[0.12,0.56,0.91]); S('Fe3+','Fe',3,'铁(III)离子',[0.9,0.65,0.17]); S('Fe2+','Fe',2,'铁(II)离子',[0.56,0.8,0.64]); S('Mn2+','Mn',2,'锰(II)离子',[0.95,0.84,0.9]);
S('FeSCN','FeSCN',2,'硫氰合铁(III)',[0.72,0.035,0.045]); S('MnO4-','MnO4',-1,'高锰酸根',[0.43,0.025,0.62]);
S('H2O2','H2O2',0,'过氧化氢'); S('I2','I2',0,'碘',[0.53,0.28,0.07]); S('starch','C6H10O5',0,'淀粉重复单元');
S('phph','C20H14O4',0,'酚酞'); S('litmus','C7H7NO4',0,'石蕊等效色团'); S('NO2aq','NO2',0,'溶解二氧化氮',[0.66,0.27,0.075]);
for (const [k,f,l,c] of [['AgCl','AgCl','氯化银',white],['BaSO4','BaSO4','硫酸钡',white],['BaCO3','BaCO3','碳酸钡',white],['CaCO3p','CaCO3','碳酸钙沉淀',white],['CuOH2','CuO2H2','氢氧化铜',[0.17,0.63,0.9]],['FeOH3','FeO3H3','氢氧化铁',[0.58,0.24,0.09]],['FeOH2','FeO2H2','氢氧化亚铁',[0.67,0.83,0.69]],['AlOH3','AlO3H3','氢氧化铝',white],['CuO','CuO','氧化铜',[0.07,0.07,0.08]],['MnO2','MnO2','二氧化锰',[0.13,0.1,0.1]],['MgO','MgO','氧化镁',white],['Al2O3','Al2O3','氧化铝',white],['Cr2O3','Cr2O3','氧化铬(III)',[0.18,0.4,0.19]],['C','C','炭',[0.045,0.045,0.045]],['HgS','HgS','硫化汞',[0.09,0.08,0.08]],['snakeAsh','C3N4','氮化碳多孔固体',[0.35,0.29,0.16]]]) S(k,f,0,l,c,true);
for (const [k,f,l,c] of [['Zn','Zn','锌',[0.62,0.66,0.7]],['Mg','Mg','镁',[0.81,0.83,0.86]],['Fe','Fe','铁',[0.37,0.4,0.44]],['Cu','Cu','铜',[0.76,0.34,0.16]],['Ag','Ag','银',[0.83,0.87,0.9]],['Na','Na','钠',[0.8,0.82,0.85]],['K','K','钾',[0.75,0.77,0.83]],['CaCO3','CaCO3','碳酸钙块',white],['salt','NaCl','氯化钠晶体',white],['thermite','Al2Fe2O3','铝/氧化铁配比混合物',[0.51,0.27,0.16]],['HgSCN2','HgS2C2N2','硫氰酸汞',[0.88,0.86,0.78]],['sucrose','C12H22O11','蔗糖',white],['dichromate','N2H8Cr2O7','重铬酸铵',[0.95,0.35,0.055]]]) S(k,f,0,l,c,true,true);
S('luminol','C8H7N3O2',0,'鲁米诺'); S('FeCN','FeC6N6',-3,'铁氰根',[0.92,0.65,0.16]); S('soap','C12H26O',0,'表面活性剂等效单元'); S('H2SO4c','H2SO4',0,'浓硫酸');
S('aminophthalate','C8H5NO4',-2,'氨基邻苯二甲酸根',[0.3,0.65,1]); S('CS2','CS2',0,'二硫化碳');
S('KClCrystal','KCl',0,'氯化钾晶体',white,true,true); S('CuSO4Crystal','CuSO4',0,'无水硫酸铜晶体',[0.79,0.89,0.96],true,true);
S('@water','H2O',0,'水'); S('@vapor','H2O',0,'水蒸气');
for (const [g,f] of [['H2','H2'],['O2','O2'],['CO2','CO2'],['NO2','NO2'],['NO','NO'],['N2','N2'],['SO2','SO2']]) S('@'+g,f,0,g);
export const SPECIES = Object.freeze(Object.fromEntries(Object.entries(species).map(([k,v])=>[k,Object.freeze(v)])));

const reagents=[];
function R(id,name,formula,conc,opts={}) { const note=opts.solid?'固体物质量按独立教学份量登记':Object.entries(conc||{}).map(([k,c])=>`${k} ${c} mol/L`).join('；');reagents.push({id,name,formula,note,bottle:opts.solid?'wide':(opts.bottle||'narrow'),amber:!!opts.amber,conc:conc||undefined,...opts}); }
R('HCl','盐酸','HCl',{'H+':1,'Cl-':1}); R('H2SO4','稀硫酸','H₂SO₄',{'H+':1,SO4:0.5});
R('HNO3c','浓硝酸','HNO₃',{'H+':14,'NO3-':14},{amber:true}); R('HNO3d','稀硝酸','HNO₃',{'H+':2,'NO3-':2});
R('NaOH','氢氧化钠溶液','NaOH',{'Na+':1,'OH-':1}); R('CuSO4','硫酸铜溶液','CuSO₄',{'Cu2+':0.5,SO4:0.5});
R('FeCl3','氯化铁溶液','FeCl₃',{'Fe3+':0.5,'Cl-':1.5}); R('FeSO4','硫酸亚铁溶液','FeSO₄',{'Fe2+':0.5,SO4:0.5});
R('AlCl3','氯化铝溶液','AlCl₃',{'Al3+':0.5,'Cl-':1.5}); R('AgNO3','硝酸银溶液','AgNO₃',{'Ag+':0.1,'NO3-':0.1},{amber:true});
R('BaCl2','氯化钡溶液','BaCl₂',{'Ba2+':0.5,'Cl-':1}); R('Na2CO3','碳酸钠溶液','Na₂CO₃',{'Na+':1,CO3:0.5});
R('Na2SO4','硫酸钠溶液','Na₂SO₄',{'Na+':1,SO4:0.5}); R('KSCN','硫氰酸钾溶液','KSCN',{'K+':0.5,'SCN-':0.5});
R('NaCl','氯化钠溶液','NaCl',{'Na+':1,'Cl-':1}); R('KCl','氯化钾溶液','KCl',{'K+':1,'Cl-':1}); R('CaCl2','氯化钙溶液','CaCl₂',{'Ca2+':0.5,'Cl-':1});
R('H2O2','过氧化氢溶液','H₂O₂',{H2O2:1.5},{amber:true}); R('KMnO4','高锰酸钾溶液','KMnO₄',{'K+':0.02,'MnO4-':0.02},{amber:true});
R('I2','碘溶液','I₂',{I2:0.02},{amber:true}); R('starch','淀粉分散液','(C₆H₁₀O₅)ₙ',{starch:0.05});
R('phph','酚酞指示液','酚酞',{phph:0.05},{bottle:'drop'}); R('litmus','石蕊指示液','石蕊',{litmus:0.05},{bottle:'drop',amber:true});
for (const [id,name,formula,portion,amber,fun] of [['Zn','锌粒','Zn',4,false,false],['Mg','镁条','Mg',4,false,false],['Fe','铁片','Fe',4,false,false],['Cu','铜片','Cu',4,false,false],['CaCO3','碳酸钙块','CaCO₃',5,false,false],['MnO2','二氧化锰','MnO₂',1,true,false],['Na','金属钠','Na',3,true,false],['K','金属钾','K',2,true,true],['thermite','铝热混合物','2Al+Fe₂O₃',4,false,true],['HgSCN2','硫氰酸汞','Hg(SCN)₂',3,true,true],['sucrose','蔗糖','C₁₂H₂₂O₁₁',6,false,true],['dichromate','重铬酸铵','(NH₄)₂Cr₂O₇',4,false,true]]) R(id,name,formula,null,{solid:{[id]:portion},portion,amber,fun});
R('luminol','碱性鲁米诺液','鲁米诺',{luminol:0.01,'Na+':0.1,'OH-':0.1},{fun:true});
R('K3FeCN6','铁氰化钾溶液','K₃[Fe(CN)₆]',{'K+':0.15,FeCN:0.05},{fun:true}); R('H2O2c','浓过氧化氢','30% H₂O₂',{H2O2:9.8},{amber:true,fun:true});
R('KI','碘化钾溶液','KI',{'K+':1,'I-':1},{fun:true}); R('soap','表面活性剂','洗洁精',{soap:1},{fun:true});
R('H2SO4c','浓硫酸','98% H₂SO₄',{H2SO4c:18},{fun:true}); R('KIO3','碘酸钾溶液','KIO₃',{'K+':0.02,'IO3-':0.02},{fun:true}); R('HSO3','亚硫酸氢钠/淀粉液','NaHSO₃+淀粉',{'Na+':0.02,'HSO3-':0.02,starch:0.05},{fun:true});
export const REAGENTS=Object.freeze(reagents.map(Object.freeze));
export const REAGENT_BY_ID=Object.freeze(Object.fromEntries(REAGENTS.map(r=>[r.id,r])));
export const FLAME_COLORS=Object.freeze({
  'Na+':{color:[1,0.75,0.08],name:'金黄色',ion:'Na⁺'}, 'K+':{color:[0.72,0.38,1],name:'浅紫色',ion:'K⁺'},
  'Ca2+':{color:[1,0.32,0.13],name:'砖红色',ion:'Ca²⁺'}, 'Cu2+':{color:[0.08,0.85,0.56],name:'蓝绿色',ion:'Cu²⁺'}, 'Ba2+':{color:[0.61,0.89,0.2],name:'黄绿色',ion:'Ba²⁺'}
});
