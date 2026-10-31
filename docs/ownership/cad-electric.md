# 电学独立 CAD：task-9

状态：独立开发；22 runtime types（21文件器材 + supplemental elcap）。全部 replacementReady=false。运行时接入、视觉与生产性能仍待验收。

来源闭包：tools/owned-cad-electric/build.py、design-specs.json、requirements.json、contract.json。requirements 仅读取 coverage 的 electrical/supplementalElectrical 与 baseline electric.types 功能事实。没有读取旧 gzip、GLB、图片、_ref、原建模实现或其他 worker 建模代码。依赖为 Python 3.13/CadQuery 2.8.0/trimesh 4.12.2/numpy 2.4.6，具体版本与SHA256随每件manifest输出。

## 2026-10-31 Lead 运行预算修订

Lead 明确要求单型≤60k三角形、22型场景传输合计≤20MB、运行时仅读scene且GLB为可选预览。scene.schema 保持 owned-cad-scene/1，encoding.version=typed-arrays/1。posB64 为IEEE754 Float32小端xyz，idxB64 为Uint32小端三角索引。每mesh附 positionCount/triangleCount/posByteLength/idxByteLength 和原始typed-array SHA256。解码必须复核字节长度、有限值、索引范围与hash。分报传输、decoded原始数组与含法线GPU估算；base64并不减少三角形计数。

| 特征 | 精确 BRep | 运行时几何 | 偏差/验收 |
|---|---|---|---|
| 铜柱轴孔/横孔/压帽槽 | 真切削实体，独立绝缘环 | 原BRep tessellation | 0.02mm/0.08rad；孔壁槽实测采样；端子位置≤0.05mm、方向≤0.1° |
| 薄壁壳、玻璃、极板 | 独立内外壁实体 | 原BRep tessellation | 一般≤0.03mm，关键≤0.02mm；局部壁厚及板面积/间距测试 |
| 绕组/弹簧/灯头螺纹 | 每匝真实扫掠，精确轴向/匝数/螺距/外径；尾部非整数匝保留 | 连续封闭解析螺旋网格，12段/匝、8边线材截面 | Lead授权运行近似，不能沿用全面0.02mm/0.08rad旧PASS；上界=(R+r)(1−cosπ/12)+r(1−cosπ/8)，manifest逐件报毫米值；匝数/轴/螺距不变 |
| 电表刻度与数字 | 自绘矢量线段挤出 | 同源实体网格 | 三表量程/30分度/双表尺保留；无字体/图片 |
| pivot和端子 | construction坐标新设计 | 动组pivot局部网格 | mm→m、Z→Y及37/90°旋转平移、动态端/中点验证；plateB端子每帧随当前transform更新 |

运行时低面螺旋截面不承担电线接触或器材孔道定位。其真实BRep保留供设计制造细节审核；运行误差单列，不把mesh体积误差与BRep oracle合并为同一精度声明。未知旧geometry不能用来声称完整未降级。

## 输出与验证

每件 out/<type> 包含 scene.json、manifest.json、预览GLB、装配group.step、parts/*.step、groups/*.step、file-hashes.json 和 verification.json。动态mesh是pivot相对坐标，assemblyOffset_mm仅用于展示；manifest端子p/d是construction坐标，运动时先绕pivot旋转或平移后再做instance世界变换。

验证应真实重读STEP、scene typed arrays和GLB；检查closed shell、正体积、watertight/winding、解析体积oracle、局部尺寸、孔槽真实空腔、端子变换、各动态组、量程与极性、来源闭包/hash和预算。Reviewer补充门槛最终复验：22/22 PASS_LOCAL_GEOMETRY_ONLY，9,930条检查，0失败，完整build+verify --write退出0。ownership-reviewer随后独立只读全跑verify.py，退出0，确认22/22、9,930检查与源hash闭包，结论为PASS隔离局部几何/来源/预算候选。794个非螺旋部件的真实STEP Face边界距离采样通过；关键件采样最大0.011292mm（灯玻壳，门槛0.02mm），一般件最大0.009370mm（电表镜面弧，门槛0.03mm），全部内移负控通过。此为sampled-only局部候选验收，不代表连续Hausdorff/全局精度证书。总646,594三角形，单型最大52,612（rheostat）；scene传输15,923,136B，decoded数组11,681,700B，GPU position+normal+index估算15,604,272B。独立螺旋连续参数双向离散采样与真实STEP局部占据采样均通过，但偏差公式仍标estimate，未声称连续Hausdorff保证。非螺旋精确tessellation最大网格体积相对差约0.1152%（NTC球），螺旋低面截面约13.53–13.94%差单列；不将该误差套成精密网格声明。每件verification与总verification-summary为本次新网格证据，不能沿用旧verification。

补充验收将关键孔/槽/薄壁标为0.02mm、一般非螺旋0.03mm；每part从真实网格三角中心与边中点取样，对重读STEP的Face compound计算最小距离，使用OCP BRepExtrema，避免Solid.distance内部点返回0的语义错误。加入0.06mm内移负控。此项为sampled-only，不能当连续Hausdorff证明。世界端子夹具准确称为adapter数学fixture，实际runtime mesh/anchor变换仍待接入验收。verify.py默认只读stdout，只有--write才写verification文件。

跨模块需Lead协调：CAD遵循coverage要求的90×100mm极板（9000mm²）和40匝螺线管；Reviewer反馈求解模型原有14400mm²/500匝，不能在未统一前声称几何与计算参数一致。

最终完整生成命令实跑退出0；最终含Face边界采样、0.2%非螺旋体积阈值、full-22预算退出门禁的验证命令实跑退出0。没有生产/public/服务/git修改，没有生成外部临时几何或残留自启动服务。软件预览联系表contact-sheet.png仅供原创外观检查（透明件在该简单预览里略去），不是浏览器视觉验收。
