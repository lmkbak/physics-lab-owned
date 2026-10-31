# 独立化学世界与音效运行时契约

状态：reviewer 最终 world/sound 隔离候选 PASS；完整源码/fake7独立复跑及真实浏览器报告/亮态与夜态pulse截图复核均通过。参照物为自有测试圆柱，非整套新CAD或生产主场景；真实器材/触控/人耳/生产仍待验收。

## 范围与输入事实

独占写范围：src/lab/owned/chemistry/world.js、sound.js；tools/owned-chemistry/world-sound.test.mjs；本文。音乐已有 PASS，不再修改。无生产 imports/build/服务/git 操作，无旧音效/外部 asset。

合法输入：Lead 提供的任务要求；src/lab/glowbench/bench.js 中 buildWorld/BENCH_Y/SHELF、Sound 的消费调用；items.js:122/:208 的 env 消费；StudioBench.jsx/GlowBench.jsx 已知消费包装；Three.js 公开文档（https://threejs.org/docs/）、Web Audio 标准（https://www.w3.org/TR/webaudio/）。场景设计尺寸自选，消费端硬编码摆放区域只作为接口必须容纳的范围。

观察披露：首次 grep 误将 studio/world.js 当消费端，看到 export/buildStudioWorld 签名及少量 apply/palette/pulse 行；未全文读取。之后广域 grep 误命中旧 music.js 两行 sound.noise 消费。均已告知 Lead；Lead 明确准许继续独立 Three 设计、不采用旧坐标/结构。后续所有搜索限定确切允许文件，不再读取旧 world.js/fx.js/studio world 实现。上述片段不作为算法/造型输入，不能声称严格零观察。

## 消费端接口快照

- bench.js:10/:123：buildWorld(renderer, scene)；另 studio 目前 buildStudioWorld(renderer,scene)。自有 world.js 导出 buildWorld 与 buildStudioWorld（后一导出使用同一新场景的 studio variant）。导出 BENCH_Y、SHELF。
- :126、items.js:122/:208：env 必须是可传 MeshStandardMaterial.envMap 的 Three Texture，且可 dispose；不返回伪对象。
- bench.js:220：SHELF.z、SHELF.tiers 两层高度；:675 另用 SHELF.depth。每层必须容纳15个瓶位，消费 x 从 -.567 至 .567。
- :173/:188/:226/:575/:661：BENCH_Y 为台面实际顶高，场景台面不得与标量不一致。器材 spawn 自 bench 负责，world 不伪造器材。
- :227/:475/:736：surfaces 是可追加的 Mesh 数组；ray.intersectObjects(surfaces,false) 不递归。各可放置表面 userData.surface 为 'bench'/'shelf'，surface mesh 必须直接可 raycast。
- :425–426：key 为带 shadow.mapSize.set/x、shadow.map.dispose 的 DirectionalLight，阴影控制兼容。
- :394：setLight(number)，用户开/关传1/.12；值 clamp [0,1]。
- :1410：update(dt,pulse,palette)，pulse 为 null 或 {kick,snare,hat,bar,level}；palette 为4x3颜色字符串。null 时当帧恢复无节拍基线，不能自主时钟继续闪烁。
- :1730：dispose 可选，新增实现幂等，跟踪自有全部 geometry/material/texture/light shadow 与 env，且不销毁调用者后来加到 surfaces 的 riser。
- 玩家移动由 bench.js:1324–1325 自行 clamp；现消费者无 world.colliders/spawn 使用。自有实现额外提供 colliders:Box3[]、spawn:Vector3（初始站位）、bounds:Box3，便于后续接入，不宣称原调用者已使用碰撞。
- Sound：new Sound() 不创建 AudioContext；init() 被手势同步调用并同步创建 ctx，Music.init 共享此 ctx；init 可返回 ctx，resume 拒绝内部捕获并记录状态，不产生 unhandled rejection。
- set(name,amount)：持续声 pour/fizz/boil/hiss/flame，每帧可能调用，amount clamp[0,1]；未 init 时必须不自动创建 ctx、记录目标但不发声。
- burst(name)：click/clink/drip/whoosh/match/flash/pop（本快照实际7种；若后续合法消费发现新名补契约）。未知名字明确返回 false，不随意借用音色。
- ctx/master/loops/noise：ctx 唯一 context；master GainNode；loops[name] 至少 {g:GainNode,f:BiquadFilterNode} 兼容旧卸载；noise 为本地 PRNG 生成 AudioBuffer。循环与瞬态所有 source/node 都有登记，不只暴露g/f。
- bench.js:1705 重置把各 loop set0；:1716–1719 当前手工 disconnect/close；新增 Sound.dispose() 应由 Lead 后续替换手工清理，先 music.dispose 后 sound.dispose，防共享 ctx 误关闭。

## 原创设计契约 v1

世界：新选 BENCH_Y=.82m；桌面2.50m宽、1.00m深，中心z=-.02；SHELF z=-.37/depth=.20，tiers=[1.08,1.36]。取值根据消费摆位覆盖及成人实验台人体工学重新选择，不来自旧 world。新场景采用黑紫封闭围护、分段斜支撑桌架、三条原创角折霓虹灯带、两层悬臂架、哑光防滑地面；studio variant 共享自有几何，改变明暗对比/材质粗糙度，禁旧纹理/旧坐标。无外部文字贴图、模型、HDRI；用本地解析色场生成 equirectangular DataTexture，真实 renderer 可 PMREM 转换（中间 target/PMREM generator 必须释放），Node 无 GPU 测试使用可合法envMap的原始 Texture。定向主光1、半球光1、彩色补光3；仅主光投影。预算 <=100 draw objects / <=25k triangles（不含调用者器材），update 不新建 geometry/material/texture，不含 RAF/interval。

灯光：room base 由 setLight 控制；pulse/palette 只作为输入反应，不另起节拍；kick/snare/hat 分别调三灯与灯带强度，数值有限并 clamp，bar 选择四色组；pulse=null 当帧回基线。dispose 恢复仅本模块安装且尚未被调用者替换的 scene.background/fog/environment，移除自有root，释放自有资源一次；不触碰调用者mesh/材质/renderer。

音效：纯 Oscillator/BufferSource/Biquad/Gain 本地合成。五持续声：pour 带通噪声+低频滴流调制，fizz 高通细噪，boil 低通噪+慢调制，hiss 高通宽带，flame 低通噪+缓速调制；每类独立循环音源，set 通过 audio currentTime target 平滑增益，无JS timer。七瞬态自选参数：click短双脉冲、clink多正弦衰减模态、drip正弦下滑、whoosh带通扫频、match短刮擦噪、flash高频短闪音、pop低频正弦跌落+短噪。并发burst上限24，超限释放最旧voice；停止/自然onended均释放全部voice节点。持续声loop buffer用周期构造，首尾连续。master保守固定增益，输出全有限，禁止网络/外部样本。共享Music可正常 start/toggle，不由Music close ctx；Sound作为所有者dispose close一次且幂等，dispose后 init/set/burst不可重建；pagehide dispose并移除监听。

## 验证与阈值

命令 node tools/owned-chemistry/world-sound.test.mjs，不写报告，reviewer可只读复跑。

1. 实际Three Scene无GPU建图：surfaces完整，台/两架水平顶面射线误差<=1e-6m；消费15瓶位/层全部落在架面；BENCH_Y与桌面一致；key.shadow可写；env.isTexture为true；colliders/spawn/bounds均有限。pulse/null和setLight边界有限，null恢复基线，更新10000次资源计数不增；dispose两次自有几何/材质/texture各dispose一次且外来surfaces保持。
2. fake AudioContext：懒init，唯一context，同Music共ctx，resume拒绝无未处理Promise；五loop重复set1000次不增node/source，无JS timer；七burst有不同参数/包络，24并发上限；自然结束释放；gain clamp；Sound.dispose全部node/source/listener归0且close一次；Music仍遵守借用ctx不close。
3. 真实浏览器候选验证：使用已有服务器或临时about:blank/data模块，临时产物仅D:/deepseek-skill。WebGL截图检查台架地面/黑紫霓虹及lights开关/三个pulse颜色；真实OfflineAudioContext每声部非静音/有限值，peak .001–.98、每声部RMS .0001–.3，瞬态末100ms peak<1e-5；持续声set0后尾部静音。共享Music+Sound真context开关与dispose计数。
4. 未获真实浏览器证据不声称生产验收；人耳听感、实际主页面集成、播放器物理延迟不由数值测试代替。

## 实现与实测（2026-10-31）

- world.js：buildWorld/buildStudioWorld 两variant，同新设计几何。环境为128×64解析DataTexture；工作照明主光5.5/半球2.8（studio6/3.2）、中明度台面，room=.12独立夜态。三路pulse直接clamp，NaN/Infinity/负bar安全；null即时基线。45个mesh几何/8材质/1texture，51 root节点；不含renderer/RAF/timer。
- sound.js：唯一懒context、master=.09、五持续source与五LFO；本地96整数频率Fourier模式循环buffer，保留解析首尾边界证据。七类瞬态、24voice限额。setTarget时间常数.025，所有节点/音源登记；dispose关闭owner ctx并提供closed Promise，pagehide立即释放节点/音源并移除监听；待处理 resume 在浏览器后续 resolve/reject 后不重建资源。Sound 不主动取消 resume Promise，不保证永不 settle 的浏览器 Promise 及时结束。
- node tools/owned-chemistry/world-sound.test.mjs：7/7 PASS；reviewer已独立只读复跑通过。包括两variant、30架位raycast顶高1e-6m、10k更新不增资源、只释放自有资源/保留外部surface、5loop/1000set、七burst/24voice、pending resume离页和共享Music context。
- node tools/owned-chemistry/world-sound.test.mjs --browser：最终轮exit0；沿已有5173，通过自有私有测试文档无HMR，无新服务。安装Chrome headless；真实WebGL55 draw/828tri含测试用独立开口玻璃/白刻度/白试片参照。setLight(1)亮态、setLight(.12)+pulse帧、同夜态null帧分别截图，报告绑定顺序/采集时间。
- 真实OfflineAudioContext 48kHz：五持续声/七瞬态共12项，peak .002468–.029529，RMS .0001226–.0015947，所有样本有限、末100ms peak=0。五持续声通过Offline.suspend(1.2)实际调用sound.set(name,0)再resume。循环解析value(0)-value(1)<1e-8、slope差<1e-5、实际最后/下一采样与独立解析值误差<1e-6，同时记录原始adjacent与正常最大斜率，不把正常高频斜率冒称零接缝。
- 最坏已测24个同步pop+5loop全开+Music(.5)：peak .70973879/RMS .03998788 < .98硬门槛。第一轮master=.15时peak1.16385失败，已压master重测，未放宽阈值；combined尾部仍有明确持续声/音乐，故不适用末尾静音门槛，不宣称已停止。
- 原生共享context：Music.ctx===Sound.ctx；Music.dispose后ctx仍running；Sound.dispose等待closed后ctx=closed且node/source/voice/loop/timer全部0；所有单声部销毁资源0。
- 临时证据：D:/deepseek-skill/owned-world-sound/report.json、room.png、room-pulse.png、room-dark.png。可用同--browser命令复现；测试浏览器finally关闭，无独立服务残留。可视截图证明仅本自有场景候选，非生产器材/主页面集成或人耳听感验收。

## 给 Lead 的最小接入元数据（本 worker 不改生产）

1. glowbench/bench.js world import改../owned/chemistry/world.js，把buildStudioWorld一起从此模块导入，移除./studio/world.js import；BENCH_Y/SHELF与新几何同一来源，避免器材悬空。studio共用bench，自动覆盖。
2. Sound改独立import { Sound } from '../owned/chemistry/sound.js'；旧fx import只保留其它已授权粒子/Stream符号，不能重复导入Sound。新Sound仍供已PASS Music共享init/ctx。
3. 页面卸载先music.dispose()，随后sound.dispose()替代sound.master/loops手动断开与手动ctx.close。sound.closed仅供需await闭合的异步验收，不要求生产dispose同步等待。不要只断g/f遗漏source/LFO。
4. 移除外部releaseTexture(world.env)，该texture由world.dispose独占。world.dispose应在releaseTree(scene)之前调用并移除自有root（否则外部遍历先dispose世界几何/材质会重复释放）；后续外部releaseTree(scene)继续释放器材。调用者追加riser仍由外部负责。
5. 现world.colliders/spawn/bounds为新可用元数据；现玩家仍由bench自身clamp，未改接入不声称玩家已用world碰撞。surfaces为可追加Mesh数组，保持调用者push(riser)/raycast(false)。

