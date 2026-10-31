// Signed stoichiometry: negative reactants, positive products. @ denotes solvent/gas ledger.
// dH is kJ/mol of written reaction (= J/mmol extent). Zero means unspecified teaching heat.
export const TABLE=[];
const add=(key,stoich,title,eq,obs,options={})=>TABLE.push({key,stoich,title,eq,obs,color:'#9edbe5',dH:0,...options});
add('neutralize',{'H+':-1,'OH-':-1,'@water':1},'酸碱中和','H⁺ + OH⁻ → H₂O','酸碱当量相消，溶液放热。',{instant:true,dH:-57.3});
add('sulfuricDilution',{H2SO4c:-1,'H+':2,SO4:1},'浓硫酸稀释电离','H₂SO₄ → 2H⁺ + SO₄²⁻','在稀释模型中登记酸当量。',{instant:true,condition:m=>m.vol>0&&(m.s.H2SO4c||0)/m.vol<4});
add('sulfuricBase',{H2SO4c:-1,'OH-':-2,SO4:1,'@water':2},'硫酸与碱','H₂SO₄ + 2OH⁻ → SO₄²⁻ + 2H₂O','酸当量消耗并放热。',{instant:true,dH:-114.6});
add('carbonateFirst',{CO3:-1,'H+':-1,'HCO3-':1},'碳酸根第一步质子化','CO₃²⁻ + H⁺ → HCO₃⁻','先形成碳酸氢根缓冲体系。',{instant:true});
add('carbonateAcid',{'HCO3-':-1,'H+':-1,'@CO2':1,'@water':1},'碳酸氢根遇酸','HCO₃⁻ + H⁺ → CO₂ + H₂O','进一步加酸后产生二氧化碳。',{instant:true});
add('bicarbonateBase',{'HCO3-':-1,'OH-':-1,CO3:1,'@water':1},'碳酸氢根与碱','HCO₃⁻ + OH⁻ → CO₃²⁻ + H₂O','碱将碳酸氢根转为碳酸根。',{instant:true});
for(const k of ['CaCO3','CaCO3p','BaCO3']) { const ion=k==='BaCO3'?'Ba2+':'Ca2+'; add('acid'+k,{[k]:-1,'H+':-2,[ion]:1,'@CO2':1,'@water':1},'碳酸盐溶解',`${k} + 2H⁺ → ${ion} + CO₂ + H₂O`,'固体减少并有气泡。',{rate:0.75}); }
for(const [metal,ion,rate,dH] of [['Mg','Mg2+',1.1,-467],['Zn','Zn2+',0.48,-154],['Fe','Fe2+',0.21,-89]]) {
 add('acid'+metal,{[metal]:-1,'H+':-2,[ion]:1,'@H2':1},'活泼金属与酸',`${metal} + 2H⁺ → ${ion} + H₂`,'金属逐渐溶解，放出氢气。',{rate,dH,condition:m=>!(m.s['NO3-']>1e-9)});
 add('displaceCu'+metal,{[metal]:-1,'Cu2+':-1,[ion]:1,Cu:1},'置换铜',`${metal} + Cu²⁺ → ${ion} + Cu`,'金属表面出现红色铜层。',{rate:0.38});
 add('reduceFe'+metal,{[metal]:-1,'Fe3+':-2,...(ion==='Fe2+'?{'Fe2+':3}:{[ion]:1,'Fe2+':2})},'还原铁(III)',`${metal} + 2Fe³⁺ → ${ion} + 2Fe²⁺`,'铁(III)被还原，黄色减淡。',{rate:0.65});
}
add('silverTree',{Cu:-1,'Ag+':-2,'Cu2+':1,Ag:2},'铜置换银','Cu + 2Ag⁺ → Cu²⁺ + 2Ag','铜片上生长银色沉积。',{rate:0.23});
add('reduceFeCu',{Cu:-1,'Fe3+':-2,'Cu2+':1,'Fe2+':2},'铜还原铁(III)','Cu + 2Fe³⁺ → Cu²⁺ + 2Fe²⁺','铁(III)颜色减淡。',{rate:0.24});
add('reduceComplex',{Fe:-1,FeSCN:-2,'Fe2+':3,'SCN-':2},'还原铁硫氰络合物','Fe + 2[FeSCN]²⁺ → 3Fe²⁺ + 2SCN⁻','红色络合物被还原并释放配体。',{rate:0.65});
const precip=[['AgCl','Ag+',1,'Cl-',1],['BaSO4','Ba2+',1,'SO4',1],['BaCO3','Ba2+',1,'CO3',1],['CaCO3p','Ca2+',1,'CO3',1],['CuOH2','Cu2+',1,'OH-',2],['FeOH3','Fe3+',1,'OH-',3],['FeOH2','Fe2+',1,'OH-',2],['AlOH3','Al3+',1,'OH-',3]];
for(const [p,a,na,b,nb] of precip) add('ppt'+p,{[a]:-na,[b]:-nb,[p]:1},'沉淀生成',`${a} + ${nb} ${b} → ${p}`,'出现难溶固体。',{instant:true});
for(const [p,ion,n] of [['CuOH2','Cu2+',2],['FeOH3','Fe3+',3],['FeOH2','Fe2+',2],['AlOH3','Al3+',3],['CuO','Cu2+',2],['MgO','Mg2+',2]]) add('dissolve'+p,{[p]:-1,'H+':-n,[ion]:1,'@water':p==='CuO'||p==='MgO'?1:n},'氧化物/氢氧化物溶于酸',`${p} + ${n}H⁺ → ${ion} + ${p==='CuO'||p==='MgO'?1:n}H₂O`,'固体在酸中减少。',{instant:true});
add('aluminate',{AlOH3:-1,'OH-':-1,'AlO2-':1,'@water':2},'两性氢氧化物溶于碱','Al(OH)₃ + OH⁻ → AlO₂⁻ + 2H₂O','过量碱使白色沉淀消失。',{instant:true});
add('aluminateAcid',{'AlO2-':-1,'H+':-1,'@water':-1,AlOH3:1},'铝酸根酸化','AlO₂⁻ + H⁺ + H₂O → Al(OH)₃','酸化重新得到白色固体。',{instant:true});
add('complex',{'Fe3+':-1,'SCN-':-1,FeSCN:1},'铁硫氰配位','Fe³⁺ + SCN⁻ ⇌ [FeSCN]²⁺','形成红色配合物。',{manual:true});
add('peroxide',{H2O2:-2,'@water':2,'@O2':1},'催化分解过氧化氢','2H₂O₂ → 2H₂O + O₂','催化剂保持不变，氧气持续析出。',{rate:0.2,dH:-196,condition:m=>(m.s.MnO2||0)>1e-12||(m.s['I-']||0)>1e-12||m.T>=70});
add('permanganatePeroxide',{'MnO4-':-2,H2O2:-5,'H+':-6,'Mn2+':2,'@O2':5,'@water':8},'酸性高锰酸根氧化','2MnO₄⁻ + 5H₂O₂ + 6H⁺ → 2Mn²⁺ + 5O₂ + 8H₂O','紫色减淡并放出氧气。',{rate:0.85});
add('permanganateFe',{'MnO4-':-1,'Fe2+':-5,'H+':-8,'Mn2+':1,'Fe3+':5,'@water':4},'高锰酸根氧化亚铁','MnO₄⁻ + 5Fe²⁺ + 8H⁺ → Mn²⁺ + 5Fe³⁺ + 4H₂O','高锰酸根褪色。',{rate:1.2});
for(const [metal,ion,flag] of [['Na','Na+','sodium'],['K','K+','potassium']]) add('water'+metal,{[metal]:-2,'@water':-2,[ion]:2,'OH-':2,'@H2':1},'碱金属与水',`2${metal} + 2H₂O → 2${ion} + 2OH⁻ + H₂`,'金属迅速反应并生成碱和氢气。',{rate:metal==='K'?2.4:1.4,dH:metal==='K'?-392:-368,fx:flag,condition:m=>m.vol>0});
add('nitricConcentrated',{Cu:-1,'H+':-4,'NO3-':-2,'Cu2+':1,'@NO2':2,'@water':2},'铜与浓硝酸','Cu + 4H⁺ + 2NO₃⁻ → Cu²⁺ + 2NO₂ + 2H₂O','产生棕色气体，溶液变蓝。',{rate:0.5,condition:m=>m.vol>0&&(m.s['NO3-']||0)/m.vol>=4});
add('nitricDilute',{Cu:-3,'H+':-8,'NO3-':-2,'Cu2+':3,'@NO':2,'@water':4},'铜与稀硝酸','3Cu + 8H⁺ + 2NO₃⁻ → 3Cu²⁺ + 2NO + 4H₂O','首先产生无色一氧化氮。',{rate:0.22,condition:m=>m.vol>0&&(m.s['NO3-']||0)/m.vol<4});
add('copperHeat',{CuOH2:-1,CuO:1,'@water':1},'氢氧化铜受热','Cu(OH)₂ → CuO + H₂O','蓝色固体转为黑色。',{rate:0.8,condition:m=>m.T>=65});
add('ironAir',{FeOH2:-4,'@O2':-1,'@water':-2,FeOH3:4},'氢氧化亚铁空气氧化','4Fe(OH)₂ + O₂ + 2H₂O → 4Fe(OH)₃','浅色沉淀逐渐变为棕色。',{rate:0.025,air:true});
add('MgBurn',{Mg:-2,'@O2':-1,MgO:2},'镁在氧气中燃烧','2Mg + O₂ → 2MgO','发出亮光并留下白色氧化物。',{rate:1.1,air:true,dH:-1203.2,fx:'heat',condition:m=>m.T>=450});
add('thermite',{thermite:-1,Fe:2,Al2O3:1},'铝热还原','2Al + Fe₂O₃ → Al₂O₃ + 2Fe','生成铁和氧化铝，强烈放热。',{rate:0.65,dH:-851.5,fx:'thermite',condition:m=>m.T>=700});
add('luminol',{luminol:-1,H2O2:-2,'OH-':-2,aminophthalate:1,'@N2':1,'@water':4},'鲁米诺氧化发光','C₈H₇N₃O₂ + 2H₂O₂ + 2OH⁻ → C₈H₅NO₄²⁻ + N₂ + 4H₂O','氧化产物释放蓝色冷光。',{rate:0.38,fx:'lum',condition:m=>(m.s.FeCN||0)>0||(m.s['Cu2+']||0)>0||(m.s['Fe3+']||0)>0});
add('clockReduction',{'IO3-':-1,'HSO3-':-3,'I-':1,SO4:3,'H+':3},'碘钟还原阶段','IO₃⁻ + 3HSO₃⁻ → I⁻ + 3SO₄²⁻ + 3H⁺','还原剂先被逐步消耗。',{rate:0.065});
add('clockIodine',{'IO3-':-1,'I-':-5,'H+':-6,I2:3,'@water':3},'碘钟显色阶段','IO₃⁻ + 5I⁻ + 6H⁺ → 3I₂ + 3H₂O','还原剂耗尽后游离碘累积。',{rate:3});
add('iodineScavenge',{I2:-1,'HSO3-':-1,'@water':-1,'I-':2,SO4:1,'H+':3},'碘被亚硫酸氢根消耗','I₂ + HSO₃⁻ + H₂O → 2I⁻ + SO₄²⁻ + 3H⁺','游离碘暂时不能积累。',{instant:true});
add('bread',{sucrose:-1,C:12,'@water':11},'蔗糖脱水','C₁₂H₂₂O₁₁ → 12C + 11H₂O','多孔炭柱形成；浓酸作为脱水介质。',{rate:0.42,fx:'bread',condition:m=>(m.s.H2SO4c||0)>0});
add('snake',{HgSCN2:-2,HgS:2,snakeAsh:1,CS2:1},'硫氰酸汞热分解（总括）','2Hg(SCN)₂ → 2HgS + C₃N₄ + CS₂','形成疏松膨胀固体；副产物显式保留。',{rate:0.35,zeroOrder:0.2,fx:'snake',condition:m=>m.T>=180});
add('snakeOxidation',{CS2:-1,'@O2':-3,'@CO2':1,'@SO2':2},'二硫化碳氧化','CS₂ + 3O₂ → CO₂ + 2SO₂','挥发性副产物在空气中氧化。',{rate:0.7,air:true,dH:-1076,condition:m=>m.T>=180});
add('volcano',{dichromate:-1,Cr2O3:1,'@N2':1,'@water':4},'重铬酸铵热分解','(NH₄)₂Cr₂O₇ → Cr₂O₃ + N₂ + 4H₂O','绿色氧化物随气体膨胀。',{rate:0.48,zeroOrder:0.7,dH:-429,fx:'volcano',condition:m=>m.T>=170});
add('crystalNa',{'Na+':-1,'Cl-':-1,salt:1},'氯化钠结晶','Na⁺ + Cl⁻ ⇌ NaCl(s)','水减少后析出氯化钠晶体。',{manual:true});
add('crystalK',{'K+':-1,'Cl-':-1,KClCrystal:1},'氯化钾结晶','K⁺ + Cl⁻ ⇌ KCl(s)','蒸发使氯化钾析晶。',{manual:true});
add('crystalCu',{'Cu2+':-1,SO4:-1,CuSO4Crystal:1},'硫酸铜结晶（无水等效）','Cu²⁺ + SO₄²⁻ ⇌ CuSO₄(s)','记录无水等效晶体；水合细节不纳入本模型。',{manual:true});
export const REACTIONS=Object.freeze(Object.fromEntries(TABLE.map(r=>[r.key,{title:r.title,eq:r.eq,obs:r.obs,color:r.color}]).concat([
 ['flame',{title:'焰色观察',eq:'M* → M + hν',obs:'受激原子发出特征颜色。',color:'#ffce71'}],
 ['NaBurn',{title:'钠的燃烧',eq:'2Na + O₂ → Na₂O₂',obs:'空气中可能形成氧化物和过氧化物混合物。',color:'#ffd15b'}],
 ['relight',{title:'氧气检验',eq:'C + O₂ → CO₂',obs:'氧气支持带火星木条复燃。',color:'#ffd795'}],
 ['pop',{title:'氢气检验',eq:'2H₂ + O₂ → 2H₂O',obs:'氢气与氧气点燃发生爆鸣。',color:'#f5dc9d'}],
 ['douse',{title:'二氧化碳检验',eq:'CO₂ 不支持普通木条燃烧',obs:'燃烧木条在二氧化碳中熄灭。',color:'#a1d8dd'}]
])));
