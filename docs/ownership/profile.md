# 独立容器剖面运行时契约

状态：候选开发，不接生产。输入只为独立设计的内腔尺寸/分段圆弧与公开兼容API，不读取旧网格或原射线采样实现。文件 `src/lab/owned/cad/profile.js`；测试 `tools/owned-profile/test.mjs`。

- 输入单位mm，局部Z向上。独立CAD生成器声明内腔剖面；运行时转为m、Y向上。线段字段z0/z1/r0/r1；球段z0/z1/centerZ/radius，r(z)=sqrt(R²−(z−centerZ)²)，z严格升序，半径非负，球极r=0合法，拒绝零厚段/断层/重叠。连接点只计一次体积。
- 支持分段线性半径剖面（圆柱/截锥）和球面截段。每段用解析积分，体积不从显示网格近似。
- API保留 `pts/cum/bottom/rim/capacity/rimR/levelFor(volumeMl)/radiusAt(heightM)`，增加 `volumeAt(heightM)` 和 `fullCapacity`。`capacity=fullCapacity*fill`，填充比例须0..1；标称量另存，不混淆满口和额定标线。
- 数值反解采用有界二分，101层+段连接处验证，圆柱/截锥/球冠独立oracle误差<=1e-10mL+1e-10·|V|，h↔V误差<=1e-9m；单位严格，负体积clamp0、超满口clamp口沿，NaN/Inf拒绝，不静默生成假内腔。
- 显示轮廓按弦差<=0.02mm细分球面，线性段可附加采样；数据体积仍使用解析公式。液体几何由自有剖面生成，保持底面与自由液面、独立网格，可变液面由调用者控制，不把空腔改实心。
- 至少测试圆柱100mL标线、截锥、半球底试管、混合分段、零体积与边界、错误规格、相邻段不连续/重叠拒绝。不得被需求观察器或旧资产输入污染生成链。
- 来源是数学旋转体积分与Three.js公开LatheGeometry API。仅候选，生产材质、盛液/倾倒/瓶塞和全部器材接入另验。
