# C25–C74 独立化学器具候选契约

状态：task-10 已 get/claim；Reviewer 已明确 PASS 隔离生成，精度与 schema 阻断已关闭。Lead 已明确授权：Reviewer PASS 后立即生成，无需重复签字。所有资产 `ready=false`，本任务不作生产接入或整体不降级结论。

## 来源与输入闭包

写入仅 `tools/owned-cad-equipment/**`、本文档；临时产物仅 `D:/deepseek-skill/physics-owned-cad-equipment-<unique>/`。不改生产、public、公共日志，不 build、不启停服务、不 commit。

本轮已只读 `docs/ownership/cad-coverage.json` 功能需求，提取为 `tools/owned-cad-equipment/requirements.json`。原覆盖表内的旧资产局限性只作待补需求，未读取任何旧 gzip/GLB/贴图、_ref、缓存、原建模源码或外站。不读旧几何的 vertices/indices，不变形、换名或另存旧模型。无需第三方素材/模型服务。

生成输入闭包仅本目录自有 Python 源码与独立 JSON 规格，依赖本机 CadQuery 2.8、numpy/trimesh 及标准库。不在生成时读取覆盖表/其他项目源码/旧模型。`extract-requirements.mjs` 是一次性需求抽取工具，不属于几何生成运行闭包。源码与规格逐文件 SHA-256、输入路径、构建版本写入 manifest；尺寸是本任务新选设计值，公开功能尺寸可保留，但不得称为旧资产的精确复刻或实物校准。

cad-worker 确认负责 C01–C24、C75–C87，本目录负责 C25–C74，无几何写入重叠。

## 全量范围与优先级

精确资产名、catalog 功能组、runtime group/rotate/grip/role、空腔/材质/刻度事实以本目录 requirements.json 冻结快照为准。每个功能组均必须落实为独立可取/可动或一体玻璃边界，不能为达到数量用同一粗盒改名。

优先 runtime 引用：C26 燃烧匙（group spoon），C54 焰色丝（groups handle/loop，rotate x-down，gripY=130 mm）；C26 gripY=190 mm。local 坐标与运行时 axis/rotate 的转换在 manifest 显式记录，显示 exploded offset 不能写入实际几何坐标。

后续依复杂度分批但持续覆盖全部：

- C25 温度计/护套，C26 燃烧匙，C27 夹刷，C28 塞/直弯接头，C29 双长颈漏斗，C30 泥三角/软木环，C31 干燥器，C32 称量瓶/镊子，C33 抽滤，C34 气体注射器。
- C35 球干燥管，C36 螺旋止水夹，C37 电极，C38 盐桥，C39 电解槽，C40 比色管，C41 三口瓶，C42 燃气灯，C43 电子秤，C44 磁搅拌。
- C45 水浴，C46 碱式滴定管，C47 球冷凝管，C48 侧管蒸馏瓶，C49 铁架，C50 升降台，C51 双皿，C52 托盘天平，C53 砝码盒，C54 丝环。
- C55 电源九组，C56 导线夹头十组，C57 多用表七组，C58 pH 五组，C59 恒压漏斗，C60 防倒吸瓶，C61 T/Y头，C62 磨口转接，C63 启普，C64 气量管。
- C65 双滴定夹，C66 刺形柱，C67 尾气漏斗，C68 燃烧管/舟，C69 微型针筒，C70 渗析袋，C71 量热器，C72 电导装置，C73 层析缸，C74 丁达尔盒。

## 几何、装配与视觉接口

每资产输出 `tools/owned-cad-equipment/out/<asset>/scene.json`、`manifest.json`、`<asset>.glb`、每功能组 `<group>.step`。schema=`owned-cad-scene/1`，units=`mm`，up=`Z`。

scene meshes 每项含 name/group、posB64/idxB64（base64 little-endian Float32/Uint32，不放 JSON 数字数组）、color=[r,g,b]（各0..1，与Lead loader一致）、opacity、metal、glass、roughness、assemblyOffset_mm、role/marking（适用时）。BRep/mesh local 坐标为真实装配态；assemblyOffset_mm 仅为隔离展示平移。GLB 转换为米、Z-up到Y-up仅在导出节点转换处理，明确写入 manifest。

profile 每 group 使用 piecewise-linear-radius 的 inner=[[z,r],...] 或 analytic-radius-segments，必须表示真内腔；非轴对称腔不捏造径向函数，另给解析截面/体积 oracle。容量标注依独立内腔积分定位，mL 与 mm³ 转换 1mL=1000mm³；教学/标称非校准声明保留。

器形要求逐项来自冻结需求：开放薄壁、底厚、孔、肩、锥口、封接、双腔、长入短出、侧管、细孔/隔离水腔、柔性管通路、焰色丝环、螺旋螺纹、支承与轴孔等必须是真 BRep。玻璃壁、连接颈和封接作为一体玻璃 group；附件/可取塞/横轴阀/独立电极/端子分组，不把透明实心代替容器或把复杂器具降为粗盒。

玻璃/棕玻璃、陶瓷、绝缘软材、导电金属、纸/膜独立配色与 opacity/roughness。刻度为自有线段/数字几何（自绘七段或矢量）与单位，禁止贴图/字体媒体下载。所有动件有显式 pivot/axis/限位或静态关闭声明；展示可拆与运行时已有运动分开，不虚构实时传感读数、动力学或固定电极极性。

## 独立验收门槛

验证脚本必须重新读取落盘 STEP 和 scene/GLB，不能仅信 manifest 自证。任何失败继续修模型，不把 ready 改为 true。

1. 覆盖：C25–C74 精确 50 个资产；功能组 100% 映射，runtime 精确组名/方向/grip保留。首批先验证 C26/C54，随后每批都有独立验证记录。
2. BRep：每组 STEP 回读成功、非空、全部实体 isValid，正体积；无零厚度假壁。复建源/规格 hash 一致。
3. 尺寸：回读 BRep bounds 与新规格 oracle 主要尺寸允许差≤0.1mm，关键孔/壁厚/接触与配合≤0.05mm；公开原值更严从严。不得从实际模型反填 expected。
4. 内腔/孔：按 JSON 独立测试点集合对回读 STEP `isInside`/截面验证，开口/管路中心为空，壁/底正样本为实体；每条连续通路至少 9 采样点，关键汇合/弯曲/阀口加密，隔离腔各有连通与不串通的实体隔墙证据。带孔板/塞每孔验证中心空与邻壁实体。双腔冷凝/恒压/启普必须分别记录通路端点与隔离关系。
5. 体积：解析圆筒/锥台/球/薄壳或预注册复合积分 oracle，STEP 对理论体积误差 ≤1%；有异形倒嘴/槽切时分解记录；mesh 与回读STEP体积误差 ≤0.2%。可动/薄线件允许更高三角预算，不可粗糙近似洗过误差。
6. Mesh：每组 positions/indices 有限、index合法、三角非退化、watertight、正体积；按 Lead 新硬约束单件/mesh 三角≤60000、复合资产总三角≤120000、单个 scene.json≤3000000 bytes；超过即构建/验证失败。刻度/网丝采用满足局部弦差的低面数近似，不靠蛮堆面数。网格 bounds 与STEP主要尺寸≤0.1mm、关键孔壁接触≤0.05mm；一般弦差≤0.03mm、关键曲面≤0.02mm、角度偏差≤0.08rad。除体积外独立测量局部半径、孔径、壁厚和弯曲截面；不得用全局 volume 代替局部精度。
7. 装配：孔轴/阀轴/夹口/套管内径和通道坐标独立规格校核，刚性分组非预期相交体积≤0.1mm³（设计过盈/封接必须标注）；可动 pivot 重建转换后锚点误差≤0.05mm。
8. 刻度：容量线以独立内腔公式定位（误差≤max(0.05mL,0.2%标称容量)）；profile 扫描误差≤max(0.1mL,0.2%V)，单标器不得多标；温标/上零下增/单位方向与功能需求匹配；数字无旧贴图输入。
9. fresh：仅复制自有源码/JSON到指定唯一临时树，用同一Python依赖离线重建批次；比较 canonical scene/manifest 几何统计与精确源码/规格 hash，GLB/STEP即便库写入非确定header也需几何hash/截面一致，不以header差异冒充几何差异。先验证绝对路径父目录/前缀再清理。
10. 候选状态：每组的来源/几何测试可通过，仍统一 ready=false；应用集成、倾倒流体守恒、全交互、截图听审/性能和生产审查均pending。不把本轮候选数量写成108套覆盖或生产不降级结论。

## 复建与审查顺序

使用 `C:/Users/Administrator/AppData/Local/Programs/Python/Python313/python.exe`（本机CadQuery2.8）。实现后把本目录实际生成/验证命令写入报告；测试需真实运行并给结果。

当前只提交契约与需求快照，未生成几何。Reviewer PASS 即按Lead现有授权开始，runtime优先、分批实际产物回交Reviewer，完成全部50项前不把task-10标完成。若某器形未达到门槛，明确列未过条目并继续补齐，不删掉难项凑数。
