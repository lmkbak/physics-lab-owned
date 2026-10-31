# 独立音乐模块所有权与契约

状态：reviewer 最终 PASS 独立音乐核心候选；三模块完整源码审查及 fake13 独立复跑通过，v2 observer/负控/cancel settle 补丁审查通过。worker 真实 Web Audio 证据通过；生产集成、主页面灯光、人耳听感仍 pending。

## 输入闭包

唯一实现输入：用户提供的两个 API 签名、资源/同步/原创性约束；仓库 package.json 的 ESM 声明；AGENTS.md 的作用域约定；Web Audio 公开标准的 AudioContext.currentTime、AudioScheduledSourceNode、AudioParam 自动化、GainNode/BiquadFilterNode/DelayNode 语义（https://www.w3.org/TR/webaudio/）。不读取 clbench/music.js、glowbench/music.js、任何 _ref 实现/编排；不借用原曲和弦或鼓律。无外部音频、样本、网络依赖。

## 隔离实现契约 v1

写入范围：src/lab/owned/music/{engine,beat,glow}.js、tools/owned-music/*、本文件。共享引擎独立合成 kick/snare/hat/bass/pad/pluck 六声部；原创新序列 108 BPM、16 个十六分步/小节、4 小节和声轮换。bass/pad/pluck 使用自产音高集合与分层进入/抽离。snare/hat 的噪声由本地确定性 PRNG 填充 AudioBuffer。反馈 DelayNode 带低通及受限 feedback Gain；音乐总线经侧链 Gain 再到用户音量及静音出口。鼓单独进干声总线，kick 自动化旋律总线 duck。

BeatMusic：export class BeatMusic；公开 ctx,on,timer,master；start(volume=.5) 返回 Promise；stop()；setVolume(v) clamp 到 [0,1]（非有限值按 0）；pulse() 恒返回 {beat:0..1,chord:-1|0..3}，关闭/未开声/未到首拍/已 dispose 时 {beat:0,chord:-1}；dispose() 幂等。自建一个 AudioContext，停止可复用，dispose 关闭且不可重新启动。

Music：export class Music；constructor(sound) 通过 sound.init() 建立/取得 sound.ctx，不创建第二个 context；公开 on,timer,out,duck,dry,delay。toggle(force?) 同步返回目标 bool；开启以 Promise 初始化/恢复，失败回到 off；关闭立即静音、清空拍点并撤销待完成开启。pulse() 关闭为 null，开启为 {kick,snare,hat:0..1,bar,level}；dispose() 幂等且不可再开启。借用 sound.ctx 的实例不 close 共享 context。

PALETTE：原创黑紫霓虹四套配色，冻结 4x3 #RRGGBB 字符串数组。消费端使用 palette[bar % palette.length][0/1/2] 传给 Three.Color；此接口元数据由 reviewer 提供（world.js:131–141、studio/world.js:225–233），worker 不读取这些调用方文件。测试断言消费形状及合法颜色。

时序：25ms 调度器、约 120ms lookahead；所有音源 start/stop/包络基于 AudioContext.currentTime。pulse 只查询已调度事件，在 getOutputTimestamp 可用时映射到当前可听时刻；否则 currentTime - baseLatency - outputLatency；不以 Date.now 生成节拍。排程历史有界；暂停/时钟停滞不追补巨量历史音符。stop 清 timer、停止/断开所有活跃 source、清自动化并归零 out，销毁整个运行图及回声，立即停止灯光。每次 start 用 generation token 取消 pending resume/init 竞态；最多一个 timer/运行图；所有 node/source 均登记，onended 释放节点。dispose 移除 pagehide 监听并清资源。

生命周期：实例注册 pagehide → dispose；引擎不暂停/关闭借用 context；start 在 audio resume 失败时 reject（BeatMusic）或恢复 off（Music）；dispose 中等待中的独占 context 被安全关闭。保持 stop/start 无节点/音源/interval 累积。

## 验证契约

1. Node fake AudioContext：公共 API、默认/边界音量、六声部排程与包络、delay feedback、duck、audio clock pulse/输出延迟、stop/dispose、开启 Promise 取消、快速 toggle、共享 context 不关闭、暂停恢复、资源计数归零。
2. 另交浏览器可运行 OfflineAudioContext 渲染脚本：真实引擎离线渲染、非静音/有限值/peak/RMS/尾部静音统计、WAV 可下载；真实 AudioContext 手动开启并记录 pulse 与 getOutputTimestamp 的独立证据页，关闭后 pulse 零值/资源零值。
3. 数值阈值：pulse 在确定性映射下事件 onset 误差 <= 1ms；浏览器采样容限 <= 1帧（20ms）+输出映射误差（20ms），报告最大采样偏差。离线渲染全样本有限、peak > .02 且 <= .98、RMS .005–.35、计划终点后末 .1s peak < 1e-5；duck 最低 .28 且在 .24s 内回 1；stop/dispose 后 nodes/sources/events/timers 全为 0。启动失败回滚 on=false、timer=null、图及音源为 0；保留唯一自建 context 供下一次用户手势重试，dispose 时关闭；共享 context 不关闭。
4. 测试命令：node tools/owned-music/test.mjs；浏览器打开 tools/owned-music/evidence.html（沿用户已有服务器），点 Offline render 与 Real-time pulse。无既有可用服务器时交可运行脚本并明确浏览器未验证。
5. 未取得真实浏览器运行结果前，只声明 fake 测试结果；不得声称生产验收或听感保真。无生产 imports 变更，无公共日志、build、服务、git 操作。

## 实现与实测（2026-10-31）

- engine.js：所有音源/节点登记；onended 释放 voice 图；stop 立即静音并断开整个反馈环、清 interval/事件/音源；pagehide dispose；ScoreEngine 对外 diagnostics 便于隔离审计。
- beat.js / glow.js：共享 generation-token transport，异步 init 合并一个 Promise；首手势有同步 ctx 时当场调用 resume；stop/dispose 使待完成开启失效。Music.toggle 同步返回请求态（true），异步 resume 拒绝后 on=false；同步 init 抛错立即返回 false。自建 context 唯一且拒绝恢复后可重试，dispose 只 close 一次；sound.ctx 从不被音乐 close。
- 开关 off 灯光返回零值/null；音量为 0、context suspend、首个可听事件之前也零值/null；fallback 输出延迟减一次 baseLatency+outputLatency；getOutputTimestamp 路径不再减这两个值。
- 输入闭包追加仅包含 reviewer 提供的 PALETTE 消费形状、Lead 提供的 sound.init/ctx 同步约定及 toggle 请求态许可；未读取其原实现。

Node：node tools/owned-music/test.mjs，13 项（最终结果以运行输出为准），不写报告。包含 40 次启停、30 次快速 toggle、异步 init 复用、resume 拒绝后重试、dispose during resume、pagehide、挂起恢复跳过旧音符、资源归零。

真实浏览器：沿已有 http://127.0.0.1:5173/tools/owned-music/evidence.html，TANKBrowser Chrome 150，未启动服务。OfflineAudioContext 两声道 48kHz、12小节/30.667s，peak .204291、RMS .0173866、所有样本有限、末100ms静音=0；六分轨 peak .02797–.17619 均有输出，销毁后资源全0。Beat/Glow 真实 AudioContext v2 各6秒/300采样，独立 observer 直接 getOutputTimestamp 映射，实际 pulse > .2 才认定 onset，最大采样偏差25.510ms/13.353ms（20ms轮询测量）；关闭后 Beat={beat:0,chord:-1}、Glow=null，node/source/voice/event/timer全部0。负控注入 pulse=null 后1秒/50采样明确失败；cancel 两次×5轮均 settle 且资源0。旧 v1 的19.017ms/19.874ms复用了 candidate audibleTime，已在报告 historicalRealtimeV1 标明废弃证明口径，不作为独立拍点通过证据。详细数值见 tools/owned-music/browser-results.json。

复现：打开证据页后依次 Offline render + stems、Beat real-time pulse、Glow real-time pulse。node tools/owned-music/package-evidence.mjs 将同一自有模块打包成 D:/deepseek-skill/owned-music-evidence.html，双击可在浏览器独立运行，无服务。WAV 由证据页下载生成，临时输出位于 D:/deepseek-skill。

限制：以上 onset 是音频时钟到轮询可视信号的误差，不是扬声器/麦克风物理回环延迟；听感评价、生产页面灯光接线、生产 import/构建/集成仍未验收。离线尾静音来自明确排定的最终输出 fade；运行时停止依靠即时清图及资源检测。

## 给 Lead 的生产切换清单（本 worker 未改生产）

经 Lead 明确提供调用者路径授权后，仅检查 src/lab/clbench/bench.js 与 src/lab/glowbench/bench.js 的 music 调用元数据。src/lab/studio/bench.js 不存在；限定 src/lab 内 bench.js 的 music import 搜索仅找到上述两处。真实 studio 入口为 src/lab/glowbench/studio/StudioBench.jsx:2–4，只封装 ../GlowBench.jsx 并传 visual="studio"；GlowBench.jsx:3/:28 共用 ./bench.js 的 createGlowBench，:30 卸载已调用 bench.dispose。故修改 glowbench/bench.js 的 music import 与 dispose 会同时覆盖 studio，无独立 music import。未读任何旧 music.js / _ref。

1. clbench/bench.js:20：import { BeatMusic } from '../owned/music/beat.js'。:79 无参构造兼容；:97 pulse 的 beat/chord、:98 on 兼容；:122 用户关闭仍 stop；:123 start(.5) Promise 兼容。:1129 页面卸载由 music.stop() 改 music.dispose()，释放 pagehide listener 并关闭独占 context。
2. clbench/bench.js:123：Promise 完成回调需要确认 !disposed && music.on 后再亮按钮。start 等待期间 stop/离页会取消声音，但原调用者的 then 仍可能把按钮标为开启；可由调用者 token 或 on/disposed 判断阻止陈旧回调。
3. clbench/bench.js:95–118：off pulse 零值保证无新节拍，但 groove.k 仍以 dt 淡出，:110–113 performance.now 的装饰波在淡出期继续。若要求关闭当帧灯光静止/全恢复，Lead 在调用者 off 分支重置 groove.k/--beat/STRIP 与 BASE 外观（候选不改该生产动画）。主页面须验收此点，不能仅凭核心 pulse 零值宣称灯光已停。
4. glowbench/bench.js:18：import { Music, PALETTE } from '../owned/music/glow.js'。:135 new Music(sound) 懒初始化兼容；:397 toggle() bool兼容；:1410 timer gate 与 pulse()/PALETTE 四套三色兼容。异步 resume 拒绝会让 on=false，但原按钮 class 没有异步反向订阅；Lead 可在 promise settle 后以 on 更新 class，或采用错误回调接口另议。
5. glowbench/bench.js:1715–1716：用 music.dispose() 取代 music.on=false / clearInterval(music.timer) / music.timer=null 与四个 music 节点手工 disconnect。候选 timer/out/duck/dry/delay 为只读 getter，旧 timer=null 会在模块严格模式抛 TypeError，因此不能只改 import。保留 sound.master 自身断开、:1717 sound.loops 清理、:1718–1719 由 sound 所有者 close 共享 context。music.dispose 不 close 它。
6. glowbench/bench.js:1721：sound.init/set/burst 防陈旧 debug 句柄逻辑可由原 sound 生命周期保留；music.dispose 已阻止所有重新开启，music.toggle=()=>false 的旧兜底非必需但可保留。不得用赋值 on=false 替代 dispose。

集成检查：冷挂载0context/0音乐timer；首次手势可听；启停/快速启停/等待resume时离页；同页重复挂载无AudioContext/interval/pagehide listener累积；恢复/静音音量/共享sound仍可工作；两页灯光off与按钮请求态/错误态一致。真实主页面与听感由 Lead 后续执行，此清单不是验收结果。

