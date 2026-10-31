# 拾光 · 自研内核（独立发布子集）

这是「拾光物理/化学实验室」中**全部自行实现**的部分：电路求解与器材模型、化学反应引擎、音乐与音效合成、自建 CAD 参数化模型，以及容器剖面、液体几何和场景加载器。它不包含任何第三方模型、贴图或录音。

## 内容

| 目录 | 说明 |
| --- | --- |
| `src/lab/owned/electric/` | 电路求解内核（MNA、阻尼 Newton、CV/CC、二极管、电容、电机）、22 类器材模型与仿真编排 |
| `src/lab/owned/chemistry/` | 反应引擎（配平方程表、计量、酸碱、热量）、场景世界与 WebAudio 音效 |
| `src/lab/owned/music/` | 两套原创音乐合成，含节拍包络与灯光节拍接口 |
| `src/lab/owned/cad/` | 容器剖面（解析体积与液面反解）、GLB/typed-array 场景加载、液体网格 |
| `tools/owned-*` | 各模块的生成器、验收脚本与测试 |
| `docs/ownership/` | 每项的设计依据、精度门槛、验收记录与已知限制 |

## 运行测试

```powershell
node tools/owned-electric/kernel.test.mjs
node tools/owned-electric/stress.test.mjs
node tools/owned-electric/models.test.mjs
node tools/owned-chemistry/test.mjs
node tools/owned-music/test.mjs
node tools/owned-profile/test.mjs
node tools/owned-profile/liquid.test.mjs
```

## 重新生成资产

CAD 的 `.glb/.step/.wav` 产物未入库，均可由源码重生成：

```powershell
python tools/owned-cad/build_first_batch.py
python tools/owned-cad/build_second_batch.py
python tools/owned-cad-electric/build.py --all
node tools/owned-audio/generate.mjs
```

几何使用 CadQuery，运行需要 `cadquery`、`trimesh`、`numpy`。

## 未包含

- 实验台页面本体、第三方器材模型与贴图、参考实现移植代码。
- 因此在独立使用时，需要自带宿主页面，或只把这里的模块当作库调用。

## 许可

代码以 MIT 许可发布，见 `LICENSE`。自建 CAD 的几何与原创刻度由同一作者生成，随本仓库一并授权。
