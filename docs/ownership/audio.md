# 自有音频资产契约

状态：Lead 已签字通过，授权隔离实现、生成、测试；不代表生产接入或人工试听通过。Reviewer 已通过契约的隔离开发审查。

## 范围与来源边界

本任务独立按物理声学设计六类声音：机械开关、玻璃撞击、金属撞击、木材撞击、短促爆燃、电动机运转。写入范围仅为 `tools/owned-audio/`、`public/owned-audio/` 与本文档。

允许阅读 `src/lab/audio.js` 的调用接口和 `src/lab/soundRecipes.js` 的自研声学原理；不导入这些模块作为生成器，不复制其配方参数。禁止读取、解码、试听、分析或计算 `public/audio/*.wav` 的波形、统计或哈希。禁止外部音频、下载、外部模型及模型服务。不得改动 `src/`、`public/audio/`、公共日志；不得 build、启动服务或 git commit。

生成器只使用 Node 标准库和数学信号合成。无网络访问、下载和第三方录音流程。六个资产为本项目新增的程序化设计，来源表述为“物理声学原理下的独立程序化设计”，不宣称录音真实性、听感等同或已获用户听感验收。不为用户选择开源许可证；CREDITS 的许可字段明确标为尚未指定。

## 交付物与可复建性

- `tools/owned-audio/generate.mjs`：命令行生成器，默认输出固定到 `public/owned-audio/`，不接受指向生产目录的覆盖参数。
- `tools/owned-audio/synthesis.mjs`：可导入的确定性合成函数、显式参数与固定整数 seed。
- `tools/owned-audio/analysis.mjs`：PCM16 WAV 解析、峰值/RMS/频谱/循环边界计算。
- `tools/owned-audio/audio.test.mjs`：Node 内置 test runner 的客观验收。
- `public/owned-audio/{click-switch,impact-glass,impact-metal,impact-wood,explosion,motor}.wav`：六份 44100 Hz、单声道、PCM16 小端 WAV。
- `public/owned-audio/CREDITS.json`：逐资产记录文件名、SHA-256、格式、帧数、时长、seed、完整生成参数、生成器相对路径/版本/源码 SHA-256、设计来源、第三方输入为空、许可未指定和测量结果。固定内容不加入当前时间，保证同一源码/参数重跑字节相同。
- `public/owned-audio/audition.html`：离线试听页，使用相对路径；六类独立播放、motor 连续循环、现有增益/速率响应示范。不会自动播放，不加载远程资源。
- `public/owned-audio/validation.json`：客观测量结果及门槛，不写入未完成的主观听感结论。

复建命令：`node tools/owned-audio/generate.mjs`。

测试命令：`node --test tools/owned-audio/*.test.mjs`。

生成器需检查目标目录是预期的 `public/owned-audio/`；测试使用内存波形或自身隔离产物，不读取生产录音。WAV、CREDITS 与验证结果从同一合成/测量代码生成；测试再独立核验文件头、PCM、哈希和契约阈值。

完整生成依赖闭包仅含 `tools/owned-audio/` 的自有源码/参数与 Node 标准库，不读取其他项目源码、旧录音、外站、缓存、第三方音频资产、环境中的媒体库或机器学习模型。独立性证据为可审阅的声学设计/完整源码/显式输入闭包/固定 seed 与 fresh 重建记录；改文件名或哈希不同均不单独构成独立性证明。

Lead 签字指定 fresh 验收临时目录为 `D:/deepseek-skill/physics-owned-audio-fresh-<unique>/`。将自有工具源码复制到该目录下的全新隔离工程结构，在禁网络、不携带项目源码及任何媒体输入的前提下运行同一生成命令。隔离工程仍只输出其自身 `public/owned-audio/`，比较六个 WAV 与 CREDITS 的逐字节结果和 SHA-256。复建记录留在本任务 scope，测试结束先验证绝对路径再清理自身创建的指定临时工程，不触碰其他目录。此临时目录是 Lead 明确授权的例外；持久产物仍仅在原 scope。fresh 未通过不覆生产，常规测试未通过亦不覆生产。

## 各声音的独立设计

所有瞬态包含接触激励、多个非简谐模态和按材质塑形的确定性随机噪声。禁止用单个正弦波代表任一完整音效。采用平滑极短起振和收尾，控制 DC 与硬切边界。

| 文件 | 时长目标（允许区间） | 物理构成与区分目标 |
| --- | --- | --- |
| click-switch.wav | 0.18 s（0.10–0.30 s） | 过中心机构的主扣合与间隔数毫秒的次接触；短促壳体与簧片模态、带通接触噪声、低频闩体，具有双机械瞬态 |
| impact-glass.wav | 1.05 s（0.60–1.50 s） | 薄壁刚性物体的高频非简谐共振、多模态不同衰减、高通短接触噪声，避免碎裂录音联想作为验收条件 |
| impact-metal.wav | 1.25 s（0.70–1.80 s） | 金属薄件的中高频非简谐振铃、多个持久模态、少量接触/擦动噪声，衰减慢于木材 |
| impact-wood.wav | 0.42 s（0.20–0.65 s） | 高阻尼木材的低中频短模态、柔和宽带接触、短低频箱体响应，频谱重心低于金属与玻璃 |
| explosion.wav | 0.95 s（0.60–1.40 s） | 热机做功冲程的快速压力上升、衰减低频腔体/压力脉冲、随时间下移的噪声截止频率与尾部湍流；不是纯低频音 |
| motor.wav | 1.20 s（1.00–2.00 s） | 600 rpm 基准下 10 Hz 机械旋转周期、换向/槽通过谐波、电磁啸声、周期负载调幅与较弱轴承风噪；稳态无全段淡入淡出，适合 loop=true |

随机噪声须通过正确的一阶或二阶滤波器塑形；带通不能用仅去低频冒充。爆燃截止频率随时间变化，发动机压力包络明确记录。motor 使用整数周期谐波和确定性周期噪声，采用重叠片段 crossfade（互补平滑窗）构造周期噪声；必要的短接缝 C1 平滑仅局限接点附近，不给整段增加会反复抽吸的淡入淡出。

## 保留既有调用语义

此阶段不接入生产；下表是后续由 Lead 接入时保持的契约。文件名保持不变，不新增调用参数，不修改现有 gain/playbackRate/rpm 公式。

| 调用 | 既有响应（来自 audio.js，只读） | 资产设计约束 |
| --- | --- | --- |
| click(strength) | strength 限制为 0..1；gain = 0.18 + 0.45s；rate = 0.92 + 0.18s | 轻重变化仍通过响度和播放速率，完整短促机械声音 |
| impact(energy,mass,material) | gain = min(0.62,0.1+0.3√energy)；rate 按质量公式限制 0.7..1.25 | 三材料使用相同幅度标尺，音色差异来自模态与阻尼；本交付不改变 ceramic 的既有分支 |
| explosion(strength) | gain = 0.25 + 0.55s；rate = 0.95 + 0.1s | 保持热机做功冲程触发与强度响应 |
| motorSpin(rpm,{duration}) | rate = clamp(rpm/600,0.55,1.8)；loop=true；gain 从 0.16 按 duration 降到 0.0001 | 600 rpm 基准音在速率变化时谐波整体移动，循环点稳定；既有播放端控制启动、时长与停止 |

增益、速率和 rpm 关系使用只读 API 证据与离线试听控制示范；不通过改写运行时代码验证。不能将资产峰值不削波误写成任意混音叠加不削波。

## 客观验收门槛

所有测试针对新生成的 PCM16 数据。NaN/Infinity 必须在量化之前拒绝，不得静默写成 0。

1. 格式：RIFF/WAVE，PCM format 1，44100 Hz，1 channel，16 bits，blockAlign=2，byteRate=88200，data 长度与帧数一致。
2. 数值：Float PCM 全部有限；PCM16 解码峰值 ≤0.89；RMS >0.005；非零样本比例 >0.25；无满量程削波；绝对 DC 均值 <0.01。各资产目标峰值在 0.45..0.86，量化保留余量。
3. 时长：符合上表允许区间，且符合配置帧数。瞬态头尾幅度 ≤2/32768，尾端最后 20 ms 的 RMS 低于该资产总体 RMS 的 20%；motor 不用这一尾音门槛。
4. 材料：使用相同分段 Hann 窗功率谱口径（频率、FFT 长度、窗口起止与累计方法写入 validation）。wood 的频谱重心 <1200 Hz；metal >1200 Hz；glass >2400 Hz；严格满足 wood < metal < glass，相邻差分别 ≥500 Hz、≥400 Hz。三材料的低频(<800 Hz)、中频(800..2400 Hz)、高频(≥2400 Hz)归一化能量向量，两两 L1 距离 ≥0.20。每材料至少三个显著局部频谱峰（功率距其最大峰不低于 25 dB），证明不是单音替代。
5. motor 循环：PCM16 归一化边界 valueJump=abs(x[0]-x[N-1]) ≤2/32768；slopeJump=abs((x[1]-x[0])-(x[N-1]-x[N-2])) ≤4/32768。报告两个数的幅度单位与 LSB 单位。必要时将接缝投影为共同驻点并平滑邻域；严禁通过长静音满足指标。首/尾各 20 ms 的 RMS 均须 ≥整体 RMS 的 0.45，连续拼接 5 次不能出现独立边界脉冲。报告接缝附近最大一阶差分及其与内部差分 P99 的比值（≤1.5）。
6. motor 层次：低、中、高至少三个频带存在能量；不同 rpm 的有效时长和主频按 playbackRate 比例变化；周期基频、换向谐波和噪声部分都可从源码追溯。基准与 rate 0.55/1/1.8 的循环拼接结果均满足边界约束（速率改变不改写源 PCM，报告重采样测量口径）。
7. 可复现：同一 seed 两次合成并编码逐字节一致，磁盘产物 SHA-256 与 CREDITS 一致；改变有噪声配方的 seed 必须改变资产哈希。生成过程无 fetch/http/https/子进程下载；参数明确写入源码及 CREDITS。

如果客观门槛未过，调整物理建模参数后重测，不降低门槛。验收结果只反映这些数值条件，不能证明听感等同真实录音。

## 试听与签字顺序

1. 契约已由 Reviewer 只读审查通过并获 Lead 明确签字，授权隔离实现；不授权生产接入。
2. 已在限定目录实现并复建六资产，运行本目录测试；真实测量结果如下。
3. 提供六资产、motor 循环及参数响应的离线试听页；记录“待人工试听”，不可替用户写“试听通过”。
4. 将产物与客观证据回交 Lead。生产路径替换、入口修改及最终听感是否接受由 Lead 后续处理；本任务只产出候选自有资产。

## 隔离实现实测

`node tools/owned-audio/generate.mjs` 成功；`node --test tools/owned-audio/*.test.mjs` 首轮 12/12 通过，退出码 0。Reviewer 已独立复跑 12/12 并给出客观候选 PASS；其发现试听页引用累计建议后，已修复 stop/ended/error/motor 超时的媒体卸载及节点断开、pagehide 关闭 context、异步 resume 点击竞态。新增 VM 运行内联脚本、自然结束与连续 12 次 start/stop 释放回归；Reviewer 追加的 resume 拒绝提示和 pagehide/BFCache 后 context 重建亦已修复，并在 VM 中分别注入拒绝及恢复重建断言，最终 13/13 通过，退出码 0；六 WAV 哈希保持不变，重新生成 CREDITS/试听页和 fresh 记录。源码闭包为 `synthesis.mjs`、`analysis.mjs`、`audition.mjs`、`generate.mjs`，只依赖 Node 标准库；测试另外使用内置 test/assert、受控 fresh 子进程及目录清理。生成器读取仅用于这四份自有源码的哈希，无任何媒体输入读取。测试另行遍历 PCM 字节计算峰值/RMS/DC，另行直接 DFT 检验至少三个材料模态与 motor 换向主频移动，避免只复用生成器的验收结果。

| 资产 | 时长 s | 解码峰值 | RMS | 功率谱重心 Hz |
| --- | ---: | ---: | ---: | ---: |
| click-switch | 0.18 | 0.659973 | 0.053208 | 1465.26 |
| impact-glass | 1.05 | 0.759979 | 0.077461 | 3717.66 |
| impact-metal | 1.25 | 0.759979 | 0.085061 | 1964.20 |
| impact-wood | 0.42 | 0.759979 | 0.083667 | 232.15 |
| explosion | 0.95 | 0.839966 | 0.097996 | 828.23 |
| motor | 1.20 | 0.579987 | 0.264464 | 107.46 |

三材料低/中/高频带能量向量的两两 L1 距离分别为 wood/metal=1.992094、metal/glass=1.740693、wood/glass=1.999931，均超过 0.20 门槛。各材料至少三个显著谱峰并经独立 DFT 复核。

motor 基准为 10 Hz 旋转/50 Hz 换向及多谐波，噪声用 40 ms 互补 smoothstep overlap crossfade。最终波形在接点附近 2 ms 作 C1 时间映射，接点两侧各 4 帧共同驻点；无整段淡入淡出，无长静音。下表按 PCM16 归一化样本计算；倍速采用一个周期拟合 round(N/rate) 帧的线性周期插值，不重复端点。逐次拼接五圈的四个接点另有自动断言。

| rate | value LSB | slope LSB | 首20ms/整体RMS | 尾20ms/整体RMS | 接缝差分/内部P99 |
| --- | ---: | ---: | ---: | ---: | ---: |
| 0.55 | 0 | 0 | 1.0742 | 1.0692 | 1.0759 |
| 1.00 | 0 | 0 | 1.0374 | 1.0361 | 1.0833 |
| 1.80 | 0 | 0 | 1.0012 | 1.0000 | 0.9452 |

fresh 首轮实跑目录为 `D:/deepseek-skill/physics-owned-audio-fresh-eieRAJ/`，试听释放修复后复跑目录为 `D:/deepseek-skill/physics-owned-audio-fresh-cvGbWm/`，启动失败/恢复兜底后的最终复跑目录为 `D:/deepseek-skill/physics-owned-audio-fresh-DHxG7I/`；均验证路径后清理。仅复制上述四份自有源码与测试生成的网络拒绝 guard；Node 22 `--permission` 仅允许读写 fresh 树，不允许子进程/worker；禁用 fetch 并拒绝加载网络模块。六 WAV、CREDITS、validation、audition 共 9 个输出逐字节一致。清理前经 realpath 验证父目录和指定唯一前缀，随后清理完成，结果留在 `public/owned-audio/fresh-validation.json`。

SHA-256、完整 seed/生成参数、四份生成源码哈希、WAV 格式和详细测量由 `public/owned-audio/CREDITS.json` 记录，门槛和 Welch 频谱口径由 `public/owned-audio/validation.json` 记录。未设置开源许可，状态为 `not specified by user`。

试听入口为 `public/owned-audio/audition.html`，支持各音效原始播放、motor 长循环、gain/playbackRate/rpm 示例。示例独立于应用 API，并自动测试负输入和上限夹取；原生产模块未改动。播放端混音、释放、应用交互和其他音乐/灯光联动属于 Lead 后续集成验收。当前明确标识为**待人工试听**；未声称听感等同录音或不降级已获主观验收。
