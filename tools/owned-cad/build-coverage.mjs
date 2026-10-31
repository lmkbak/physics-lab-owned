import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { chemistrySpecs, electricalSpecs, supplementalElectrical, ownedLimitations, assemblyDependencies } from './coverage-specs.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const allowed = new Set(['public/labs/glowbench/catalog.json','public/parts/parts.json','src/lab/glowbench/items.js','src/lab/clbench/parts.js','src/lab/clbench/visuals.js','tools/cad/build_parts.py']);
const text = rel => {
  if (!allowed.has(rel)) throw Error(`Not an approved specification input: ${rel}`);
  return fs.readFileSync(path.join(root, rel), 'utf8');
};
const sha256 = str => crypto.createHash('sha256').update(str).digest('hex');
const catalog = JSON.parse(text('public/labs/glowbench/catalog.json'));
const owned = JSON.parse(text('public/parts/parts.json'));
const items = text('src/lab/glowbench/items.js');
// Only the declarative DEFS literal is evaluated. Runtime/module code is never executed.
const defsLiteral = items.match(/export const DEFS = (\{[\s\S]*?\n\});/)[1];
const defs = vm.runInNewContext(`(${defsLiteral})`, Object.create(null), { timeout: 1000, contextCodeGeneration: { strings: false, wasm: false } });
const ownByName = new Map(owned.map(p => [p.name, p]));
const useCounts = new Map();
const chemistryRows = chemistrySpecs.map(([number,candidateNames,family,irreducible]) => {
  const c = catalog.find(c => c.number === number);
  if (!c) throw Error(`Missing catalog number ${number}`);
  const candidates = candidateNames ? candidateNames.split(',') : [];
  candidates.forEach(n => useCounts.set(n, (useCounts.get(n) || 0) + 1));
  const contracts = Object.entries(defs).filter(([,d]) => d.spec && `${d.spec.asset}_cadquery` === c.asset).map(([key,d]) => ({
    itemKey:key, name:d.name, kind:d.kind, groups:d.spec.groups,
    axis:d.spec.axis ?? null, axisRule:d.spec.axis ? 'Use named group as geometric origin reference' : 'No explicit axis: preserve loader default origin rule',
    rotate:d.spec.rotate ?? null, roles:d.spec.roles ?? {}, profileGroups:d.profileGroups ?? null,
    profileRule:d.kind==='vessel' ? (d.profileGroups ? 'Scan only listed glass body groups; exclude stopper/scale/label geometry' : 'Scan eligible glass body groups; exclude markings and accessories') : 'Not a liquid vessel item',
    sockets:d.sockets ?? [], gripY_m:d.gripY ?? null, flow:d.flow ?? null,
    heat:d.heat ?? false, fill:d.kind==='vessel' ? (d.fill ?? 0.9) : null,
  }));
  const groups = c.groups.map(([label],i) => ({
    label, ordinal:i+1,
    catalogFunctionalGroupKey:null,
    groupKeyStatus:'Catalog exposes display labels; internal group keys must be assigned by independent design, except exact runtime group names below',
    ownedComponentReady:false,
    disposition:'new-independent-brep-group-required',
    gap:`为「${label}」独立定义BRep实体、材质与装配锚点；候选整件GLB尚不能证明该组可复用`,
  }));
  const groupDescription = c.groups.map(g => g.join(' ')).join(' ');
  const transparent = /玻璃|透明|半透明/.test(groupDescription);
  const materialTypes = [];
  for (const [pattern,kind] of [[/玻璃/,'glass'],[/棕色/,'amber-glass'],[/塑料/,'polymer'],[/橡胶|柔性|软质/,'elastomer'],[/瓷|陶瓷/,'ceramic'],[/金属|铁|铜|钢|锌/,'metal'],[/石墨/,'graphite'],[/木质|木夹/,'wood'],[/软木/,'cork'],[/纸/,'paper'],[/灯芯|棉/,'cotton']]) if (pattern.test(groupDescription)) materialTypes.push(kind);
  const roles = contracts.flatMap(c => Object.entries(c.roles).map(([group,role])=>({itemKey:c.itemKey,group,role})));
  const moving = roles.length || /活塞|旋塞|独立|可取|可拆|移开|游码|指针/.test(groupDescription);
  const cavityLabels = c.groups.filter(g => /中空|内腔|空腔|通孔|贯通|相通|孔道|球腔|薄壁|凹|敞口/.test(g.join(' '))).map(g=>g[0]);
  const connectorLabels = c.groups.filter(g => /通孔|接口|瓶口|接管|导管|锥|接线|插孔|夹口|螺孔|阀|喷|气道/.test(g.join(' '))).map(g=>g[0]);
  const markingFacts = [...new Set([c.dimension,...c.tags,...c.groups.map(g=>g[1])].filter(s=>/刻度|分度|标线|环线|标示|标识|mL|°C|g教学/.test(s)))];
  const electrical = /电极|接线端|接线柱|插孔|输出|表笔|导体/.test(groupDescription);
  return {
    number,asset:c.asset,id:c.id,name:c.name,category:c.category,
    specificationEvidence:{catalogNumber:number,dimension:c.dimension,tags:c.tags,source:'public/labs/glowbench/catalog.json',method:'Functional/dimensional facts only; no mesh, image or original CAD script inspected'},
    independentFamily:family, independentRequirements:irreducible,
    coverageStatus:candidates.length ? 'partial-owned-principle-candidates-only' : 'new-independent-design-required',
    directUsableOwnedGLBs:[],
    usableAsPrincipleCandidates:candidates.map(name => ({name,path:`public/parts/${name}.glb`,size_mm:ownByName.get(name)?.size_mm,usableFor:'自有原理/制造特征参考；直接GLB替换未验收',limitations:ownedLimitations[name] ?? '未验证目标装配尺寸、分组、内腔或材质；需独立BRep复核'})),
    needsNewBuild:true,functionalGroups:groups,runtimeItemContracts:contracts,
    gaps:{
      functionalGroups:{status:'unverified',required:groups.map(g=>g.label),detail:'所有catalog功能组均需保留；玻璃整体不按壁面拆散，附件不得焊入主体'},
      cavity:{status:'unverified',candidateGroups:cavityLabels,detail:cavityLabels.length ? '按独立解析内轮廓/通道拓扑验证这些器形；内外表面、底厚、开口与隔离通路不能由包围盒或透明实心替代' : '依各功能组真实孔/凹槽定义；未声明盛液功能不得捏造容积',gateIds:['CAVITY-ORACLE','CHANNELS']},
      sockets:{status:'unverified',catalogConnectorGroups:connectorLabels,runtimeSockets:contracts.flatMap(c=>c.sockets.map(s=>({itemKey:c.itemKey,...s}))),detail:connectorLabels.length ? '新建真实孔/锥面/接管或电接触接口，尺寸与装配净空须逐接口记录，不能以贴图洞替代' : '无公开装配接口数值；只保留确有的支承/接触特征，不虚构连接功能'},
      material:{status:'unverified',requiredClasses:materialTypes,transparencyRequired:transparent,detail:'材质按独立功能件分开；透明/棕玻璃、陶瓷/绝缘、导电金属与软材不可统一灰模；所有标注自绘'},
      scales:{status:'unverified',hasPublicMarkingFacts:markingFacts.length>0,dimensionFact:c.dimension,tags:c.tags.filter(t=>/分度|刻度|标|环线/.test(t)),detail:markingFacts.length ? '按公开容量/分度/方向独立生成刻线、数字、单位；单标器不得变多标；估读与标称不冒充实物校准' : '未声明计量刻度；不得添加虚假读数或准确度等级'},
      movable:{status:'unverified',independentGroupsRequired:!!moving,runtimeRoles:roles,runtimeRotations:contracts.filter(c=>c.rotate).map(c=>({itemKey:c.itemKey,rotate:c.rotate})),detail:'区分可独立拆取与已有运行时运动；保持roles/axis与一体玻璃边界，静态器具不捏造已支持动力学'},
      terminals:{status:electrical?'missing-contract':'not-an-electrical-terminal-contract',required:electrical,detail:electrical?'按接线端/电极/输出功能逐个定义导电体、绝缘座、孔槽、局部锚点与方向；catalog无数值端子表，需补独立接口设计并签约':'本项不增加虚构电端子；机械插口在sockets内验收'},
    },
    ownedAssemblyDependencies:assemblyDependencies[number] ?? [],
    acceptanceRequired:['PROVENANCE','DIMENSION','GROUPS','MATERIALS','MARKINGS','CAVITY-ORACLE','CHANNELS','MESH-PRECISION','INTERACTION','CONSERVATION','CROSS-COVERAGE','PERFORMANCE','REVIEW'],
    gateApplicability:Object.fromEntries(['PROVENANCE','DIMENSION','GROUPS','MATERIALS','MARKINGS','CAVITY-ORACLE','CHANNELS','MESH-PRECISION','INTERACTION','CONSERVATION','CROSS-COVERAGE','PERFORMANCE','REVIEW'].map(id=>{
      const vesselOrFluid = cavityLabels.length>0 || contracts.some(c=>c.kind==='vessel');
      const candidateNA = (['CAVITY-ORACLE','CONSERVATION'].includes(id) && !vesselOrFluid) || (id==='MARKINGS' && !markingFacts.length);
      return [id,{applicability:candidateNA?'proposed-not-applicable':'required',reason:candidateNA?(id==='MARKINGS'?'公开规格未声明计量标线；仍需审校器材识别符号与功能标签':'公开功能组未声明液体容腔/转移；需审校确认无通路/盛液行为被遗漏'):'本项有对应功能或为所有资产共有的来源/精度/接口/审查门禁',reviewStatus:'pending',waiverApproved:false}];
    })),
    replacementReady:false,acceptanceEvidence:[],
  };
});

function electricalRow(e, supplemental=false) {
  e.candidates.forEach(n => useCounts.set(n, (useCounts.get(n) || 0) + 1));
  const meter = ['ammeter','voltmeter','galvanometer'].includes(e.asset);
  const terms=e.terms.map(([id,polarity])=>({
    id,polarity,
    localPosition_mm:e.knownTermPositions?.[id]?.p ?? (meter ? [null,-63.8,66.9] : null),
    localDirection:e.knownTermPositions?.[id]?.d ?? (meter ? [0,-Math.sqrt(3)/2,0.5] : null),
    coordinateEvidence:e.knownTermPositions ? 'Public procedural terminal return contract in visuals.js' : meter ? 'Public meter correction fixes y/z/d; x is not present in permitted inputs' : 'Unavailable in permitted source interface; do not read gzip geometry to fill it',
    dynamicOffset:e.asset==='capacitor' && id==='B' ? {axis:'x',source:'current animated plateB.position.x',range_mm:[0,64]} : null,
    worldTransformRule:'worldPosition = instance.matrixWorld * (localPosition + current dynamicOffset); worldDirection = normalize(instance normal/rotation transform of localDirection); compare with post groove mouth center',
    worldPosition_mm:null,worldDirection:null,
    requiredFixtures:['identity','translation(137,-83,12)mm','rotationZ(90deg)+translation','rotationZ(37deg)+translation','component motion endpoints and midpoint'],
    acceptanceStatus:'pending-real-fixture-tests',replacementReady:false,
  }));
  return {
    asset:e.asset,name:e.name,supplementalProcedural:supplemental,
    source:'src/lab/clbench/parts.js + visuals.js public structural/terminal/motion contracts only',
    independentFamily:e.asset==='dcsupply'?'linear-supply':meter?'moving-coil-meter':e.asset,
    directUsableOwnedGLBs:[],usableAsPrincipleCandidates:e.candidates.map(name=>({name,path:`public/parts/${name}.glb`,size_mm:ownByName.get(name)?.size_mm,limitations:ownedLimitations[name]})),
    coverageStatus:e.candidates.length?'partial-owned-principle-candidates-only':'new-independent-design-required',needsNewBuild:true,
    requiredFunctionalGroups:[...new Set(['body','insulators','conductors','markings',...e.dyn])],
    dynamicGroups:e.dyn.map(name=>({name,pivot_mm:e.pivots[name] ?? [0,0,0],pivotEvidence:e.pivots[name]?'explicit public visual contract':'No declared pivot: existing adapter uses component origin',control:e.controls[name] ?? null})),
    interactionRequirements:e.motion,terminals:terms,
    gaps:{functionalGroups:e.gaps,cavity:'壳腔/薄玻璃/接线孔与横孔按独立BRep定义；对透明件检查内外壁，导电体不能与绝缘体合并',sockets:'端子压帽/轴孔/横孔/凹槽真实建模，与接线锚点相交；动端子必须跟随部件动画',material:'金属铜柱/导体、绝缘底座、透明玻壳和功能件分别材质；变化状态绑定正确dyn组',scales:e.motion,movable:e.dyn.length?`需保留命名动态组：${e.dyn.join(', ')}，各自pivot/控制/现象断言`:'无公开机械运动组；保留独立材质和可拆结构，不能凭空增加运动',terminals:terms.some(t=>!t.localPosition_mm||t.localPosition_mm.some(v=>v===null))?'至少一个局部锚点未从许可资料取得；未知不能签为兼容，必须补独立设计接口并由运行时适配方签约':'局部端子公开数值已记录；仍未证明真实铜柱凹槽吻合及变换后接线'},
    acceptanceRequired:['PROVENANCE','DIMENSION','GROUPS','MATERIALS','MARKINGS','CHANNELS','MESH-PRECISION','TERMINALS','DYNAMICS','CIRCUIT','CROSS-COVERAGE','PERFORMANCE','REVIEW'],
    gateApplicability:Object.fromEntries(['PROVENANCE','DIMENSION','GROUPS','MATERIALS','MARKINGS','CHANNELS','MESH-PRECISION','TERMINALS','DYNAMICS','CIRCUIT','CROSS-COVERAGE','PERFORMANCE','REVIEW'].map(id=>[id,{applicability:id==='DYNAMICS'&&!e.dyn.length?'proposed-not-applicable':'required',reason:id==='DYNAMICS'&&!e.dyn.length?'公开visuals未声明动态mesh组；静态件仍需材质/极性/电学/端子审校，不生成假动态组':'存在对应动态组、接口功能或全部资产共有门禁',reviewStatus:'pending',waiverApproved:false}])),
    replacementReady:false,acceptanceEvidence:[],
  };
}
const electricalRows=electricalSpecs.map(e=>electricalRow(e));
const supplement=electricalRow(supplementalElectrical,true);
const registered=text('tools/cad/build_parts.py').match(/PARTS = \{([\s\S]*?)\n\}/)[1];
const registeredNames=[...registered.matchAll(/"([^"]+)":/g)].map(m=>m[1]);
const catalogShapeFacts=catalog.map(c=>({number:c.number,asset:c.asset,id:c.id,name:c.name,dimension:c.dimension,groups:c.groups,tags:c.tags}));
const output={
 schemaVersion:'owned-cad-coverage/1.0.0',phase:'isolated-development-authorized-production-unverified',contractStatus:'development-authorized-production-unverified',
 scope:{chemistryCatalogAssets:87,electricalFileAssets:21,electricalRuntimeTypes:22,ownedInventoryGLBs:68,readyAssetCount:0,productionAssetChanges:0,geometryGenerated:4},
 isolatedDevelopment:{authorization:'Lead and ownership-reviewer explicitly allowed isolated first batch with registered new design dimensions',assets:['C01','C02','C04','C22'],source:'tools/owned-cad/build_first_batch.py',parameters:'tools/owned-cad/first-batch-specs.json',output:'tools/owned-cad/out',verification:'tools/owned-cad/out/verification.json',result:'PASS_LOCAL_BREP_SECTIONS_AND_ORACLE_SELFCHECK_ONLY',replacementReady:false,pending:['runtime integration','tilted-volume and transfer conservation','materials and markings screenshots','performance','production review']}, 
 policy:{replacementReadyDefault:false,allRequirementsMustPass:true,signoffBeforeGeometryGeneration:true,neverCountInventoryAsCoverage:true,permittedInputs:[...allowed],forbiddenInputs:['third-party scene.json.gz vertices/indices','third-party clbench gzip geometry payloads','third-party png/webp textures','third-party original modeling scripts','_ref/network/browser caches','existing GLB deformation or relabeling as new work'],onlyOwnedGeneratorClosure:true},
 inputEvidence:{catalogFunctionalFactsSha256:sha256(JSON.stringify(catalogShapeFacts)),ownedManifestSha256:sha256(text('public/parts/parts.json')),itemsPublicDefsSha256:sha256(defsLiteral),electricalSpecKeys:electricalRows.map(e=>e.asset),cadqueryProbe:'python -B import cadquery required; find_spec already found local module; do not run build_parts.py'},
 ownedInventory:owned.map(p=>({name:p.name,path:`public/parts/${p.name}.glb`,size_mm:p.size_mm,faces:p.faces,reportedMeshVolumeError_pct:p.volume_error_pct,metadataEvidenceOnly:true,generatorRegistered:registeredNames.includes(p.name),mappingCandidateUses:useCounts.get(p.name)??0,directReplacementReady:false,limitations:ownedLimitations[p.name]??'未作为本轮108套候选；清单存在/网格体积误差不证明功能覆盖'})),
 chemistry:chemistryRows,electrical:electricalRows,supplementalElectrical:[supplement],
 proceduralChemistry:Object.entries(defs).filter(([,d])=>d.procedural).map(([itemKey,d])=>({itemKey,procedural:d.procedural,kind:d.kind,sockets:d.sockets??[],gripY_m:d.gripY??null,replacementReady:false,requirement:'保留现有自主程序化物理尺寸、拾取和socket/工具行为；不是87个catalog资产之一，不可漏掉也不可充数'})),
 unresolved:{catalogGroupInternalIds:'除items.spec引用外，catalog只有显示组名，不能伪称所有内部组key已确认；独立生成器需提交稳定ID映射',electricalTerminalCoordinates:electricalRows.filter(e=>e.terminals.some(t=>!t.localPosition_mm||t.localPosition_mm.some(v=>v===null))).map(e=>e.asset),manifestWithoutRegisteredBuilder:owned.filter(p=>!registeredNames.includes(p.name)).map(p=>p.name),reagentsAndDemos:'43试剂/22演示逐ID行为覆盖由Lead总台账关联；108资产表不能替代该验收',baselineVisualPrecision:'未读取受限参考网格/贴图；外观和既有精度不能宣称已对比通过，需合法规格/人工验收依据'},
 replacementReady:false,
};
const json=JSON.stringify(output,null,2)+'\n';
if(process.argv.includes('--write')) {
 const dest=path.join(root,'docs/ownership/cad-coverage.json');
 fs.mkdirSync(path.dirname(dest),{recursive:true}); fs.writeFileSync(dest,json,'utf8');
 console.log(JSON.stringify({written:'docs/ownership/cad-coverage.json',chemistry:chemistryRows.length,electrical:electricalRows.length,supplemental:1,owned:owned.length,ready:0}));
} else {
 console.log(JSON.stringify({chemistry:chemistryRows.length,electrical:electricalRows.length,supplemental:1,owned:owned.length,ready:0,mode:'read-only-preview'}));
}
export { output, json };
