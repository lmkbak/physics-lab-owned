// Electrical IDs, parameter overrides and connections are compatibility facts
// from ownership/baseline.json. Arrangement and lesson wording are authored here.
const part = (id, type, x, y, params) => ({ id, type, x, y, ...(params ? { params } : {}) });
const links = tuples => tuples.map(([a, b, color]) => ({ a, b, color }));
const lesson = (id, title, tag, desc, parts, wires, tips) => ({ id, title, tag, desc, parts, wires: links(wires), tips });
export const PRESETS = [
  lesson('blank', '从零连接一个回路', '自主实验', '先选器材，再把独立端子连接成可测量的网络。', [], [], [
    '在器材柜选中器材后，点击台面确定位置。',
    '可依次点击两个接线柱，也可从一个接线柱拖到另一个接线柱来布线。',
    'R 用于转向，Delete 移除选中对象，Ctrl+Z 撤销刚才的改动。',
  ]),
  lesson('ohm', '用电压与电流求阻值', '伏安法 · 电流表外接', '扫描串联变阻器，同时读取电阻两端电压与总电流。', [
    part('E', 'battery', -540, 190), part('S', 'switch', -270, 190), part('Rp', 'rheostat', 0, 190, { s: 0 }),
    part('R', 'resistor10', 360, 100), part('A', 'ammeter', 180, -160), part('V', 'voltmeter', 440, -160),
  ], [
    ['E:+', 'S:A', 'red'], ['S:B', 'Rp:C', 'red'], ['Rp:B', 'A:0.6', 'red'], ['A:-', 'R:A', 'yellow'],
    ['R:B', 'E:-', 'black'], ['R:A', 'V:3', 'red'], ['R:B', 'V:-', 'black'],
  ], ['通电前把串联段调到最大阻值；本接线中滑片靠 A 端。', '改变滑片，至少采集 3 组 U、I，并用记录功能比较 U/I。', '电压表另有分流，因此外接法的 U/I 小于待测电阻；待测阻值越小，相对分流影响越小。']),
  lesson('lamp-iu', '追踪灯丝的电流曲线', '分压扫描', '从接近零的灯端电压起步，观察热灯丝偏离欧姆直线。', [
    part('P', 'dcsupply', -540, 170, { V: 4 }), part('S', 'switch', -270, 170), part('Rp', 'rheostat', 0, 220, { s: 0, Rmax: 20 }),
    part('L', 'lamp', 390, 120), part('A', 'ammeter', 160, -180), part('V', 'voltmeter', 450, -180),
  ], [
    ['P:+', 'S:A', 'red'], ['S:B', 'Rp:B', 'red'], ['Rp:A', 'P:-', 'black'], ['Rp:C', 'A:0.6', 'red'],
    ['A:-', 'L:A', 'yellow'], ['L:B', 'Rp:A', 'black'], ['L:A', 'V:3', 'red'], ['L:B', 'V:-', 'black'],
  ], ['分压器滑片先靠 A 端，使灯泡电压从 0 V 附近起升。', '灯端电压每增加约 0.2 V 记录一次，在数据窗口查看 I–U 散点。', '电压升高时灯丝温度与静态电阻一起上升，I–U 曲线向电压轴偏弯。']),
  lesson('emf', '从负载曲线读出电池参数', '截距 E · 斜率 −r', '保持电池不变，用不同负载找到路端电压与输出电流的关系。', [
    part('E', 'battery', -480, 180, { E: 2.95, r: 1.6 }), part('S', 'switch', -200, 180), part('Rp', 'rheostat', 160, 180, { Rmax: 20, s: 1 }),
    part('A', 'ammeter', 340, -140), part('V', 'voltmeter', -360, -150),
  ], [
    ['E:+', 'S:A', 'red'], ['S:B', 'Rp:C', 'red'], ['Rp:A', 'A:0.6', 'yellow'], ['A:-', 'E:-', 'black'], ['S:B', 'V:3', 'red'], ['E:-', 'V:-', 'black'],
  ], ['这里选用较大的电池内阻，便于分辨负载改变引起的电压降。', '取不少于 5 组数据拟合 U=E−Ir：U 轴截距给出 E，斜率的绝对值给出 r。', '限制放电电流与连续通电时间，避免把强烈极化或过热当成稳定特性。']),
  lesson('parallel', '增加一条支路会怎样', '并联与电源压降', '先让一灯工作，再投入第二条支路，比较总电流与原灯功率。', [
    part('E', 'battery', -500, 170, { r: 1 }), part('S1', 'switch', -230, 220), part('L1', 'lamp', 180, 220),
    part('S2', 'switch', -40, -40), part('L2', 'lamp', 250, -40), part('A', 'ammeter', -280, -200),
  ], [
    ['E:+', 'S1:A', 'red'], ['S1:B', 'L1:A', 'red'], ['S1:B', 'S2:A', 'red'], ['S2:B', 'L2:A', 'yellow'],
    ['L1:B', 'A:3', 'blue'], ['L2:B', 'A:3', 'blue'], ['A:-', 'E:-', 'black'],
  ], ['先合 S1，再合 S2；投入第二支路后检查电流表的总电流。', '电源内阻不为零时，总电流上升会降低端电压，原来的 L1 会略暗。', '将 r 改为 0.1 Ω 重做，对照内阻大小与现象的关系。']),
  lesson('led', '用换向开关检验单向导电', '正偏与反偏', '保留限流电阻，翻转换向开关观察 LED 与电流表的响应。', [
    part('P', 'dcsupply', -520, 180, { V: 3 }), part('K', 'dpdt', -220, 140, { pos: 'A' }), part('R', 'resistor50', 130, 220),
    part('D', 'led', 390, 100), part('A', 'ammeter', 150, -190),
  ], [
    ['P:+', 'K:C1', 'red'], ['P:-', 'K:C2', 'black'], ['K:A1', 'K:B2', 'yellow'], ['K:A2', 'K:B1', 'blue'],
    ['K:A1', 'R:A', 'red'], ['R:B', 'D:+', 'red'], ['D:-', 'A:0.6', 'green'], ['A:-', 'K:A2', 'black'],
  ], ['选择 A 侧时 LED 正向导通；改选 B 侧后反向电流极小，指针近似回零。', '50 Ω 电阻负责限流；移除它直接接电源可能使 LED 过流损坏。', '逐一更换发光颜色，比较可见导通时的压降。']),
  lesson('motor', '观察旋转带来的反电动势', '启动 · 运转 · 堵转', '同一台电机在刚启动与被卡住时，所需电流并不相同。', [
    part('P', 'dcsupply', -520, 200, { V: 3 }), part('S', 'switch', -250, 200), part('M', 'motor', 300, 130),
    part('A', 'ammeter', -20, -170), part('V', 'voltmeter', 410, -170),
  ], [
    ['P:+', 'S:A', 'red'], ['S:B', 'A:3', 'red'], ['A:-', 'M:A', 'yellow'], ['M:B', 'P:-', 'black'], ['M:A', 'V:3', 'red'], ['M:B', 'V:-', 'black'],
  ], ['闭合开关后连续看表：启动电流较大，随着反电动势建立而减小。', '使用卡住转子控制做堵转比较；此时反电动势为零，电流接近 U/R，线圈更容易发热。', '运转时输入 UI 大于铜耗 I²R，差额对应机械转换功率。']),
  lesson('rc', '在充电与放电间切换', '电荷与时间常数', '用双刀开关选择电源支路或 LED 放电支路，跟踪电容电压。', [
    part('P', 'dcsupply', -550, 210, { V: 6 }), part('Rb', 'resbox', -270, 240, { d: [0, 5, 0, 0] }), part('K', 'dpdt', -150, -20, { pos: 'off' }),
    part('C', 'elcap', 150, 40, { C: 4700 }), part('R', 'resistor50', 150, 260), part('D', 'led', 450, 240, { color: 'green' }), part('V', 'voltmeter', 370, -190),
  ], [
    ['P:+', 'Rb:A', 'red'], ['Rb:B', 'K:A1', 'red'], ['K:C1', 'C:+', 'yellow'], ['C:-', 'P:-', 'black'], ['K:B1', 'R:A', 'blue'],
    ['R:B', 'D:+', 'blue'], ['D:-', 'C:-', 'black'], ['C:+', 'V:15', 'red'], ['C:-', 'V:-', 'black'],
  ], ['选 A 侧，经 500 Ω 给 4700 μF 电容充电；名义 τ=RC=2.35 s，约为 2.4 s，电压先快后慢上升。', '选 B 侧，电容经 50 Ω 与 LED 放电，发光逐渐减弱。', '使用 ×0.25 慢放，更容易跟上电压与亮度的同步变化。']),
  lesson('sensor', '让温度和光照控制电流', '两类电阻传感器', '并排比较 NTC–灯泡与 LDR–LED 支路，把环境量变化变成电学读数。', [
    part('P', 'dcsupply', -520, 160, { V: 3 }), part('Rt', 'ntc', -130, 230), part('L', 'lamp', 210, 230),
    part('Rg', 'ldr', -130, -30, { E: 300 }), part('D', 'led', 210, -30), part('A', 'ammeter', -330, -220),
  ], [
    ['P:+', 'Rt:A', 'red'], ['Rt:B', 'L:A', 'red'], ['L:B', 'A:0.6', 'yellow'], ['P:+', 'Rg:A', 'red'], ['Rg:B', 'D:+', 'red'], ['D:-', 'P:-', 'black'], ['A:-', 'P:-', 'black'],
  ], ['提高 NTC 温度，其阻值下降，串联灯泡得到更大电流而变亮。', '降低 LDR 照度，其阻值上升，LED 电流随之下降。', '这两种变化分别构成温控与光控的电阻式传感基础。']),
  lesson('fuse', '用短路支路触发保护', '电流与熔断热量', '正常负载与旁路短接之间切换，观察保护元件如何打开回路。', [
    part('P', 'dcsupply', -520, 170, { V: 3, Ilim: 2 }), part('S1', 'switch', -260, 220), part('F', 'fuse', 0, 220, { rating: 1 }),
    part('L', 'lamp', 350, 120), part('S2', 'switch', 320, -100), part('A', 'ammeter', -120, -220),
  ], [
    ['P:+', 'S1:A', 'red'], ['S1:B', 'F:A', 'red'], ['F:B', 'L:A', 'red'], ['L:B', 'A:3', 'yellow'], ['A:-', 'P:-', 'black'], ['F:B', 'S2:A', 'blue'], ['S2:B', 'L:B', 'blue'],
  ], ['只闭合 S1，让电流先经过灯泡形成正常负载。', '再闭合 S2，它将灯泡旁路短接；大电流使保险丝积热并熔断。', '通过更换保险丝恢复回路，再选 2 A 规格比较保护动作。']),
  lesson('solenoid', '用电流方向判断磁极', '线圈与铁芯', '把换向开关与调流电阻接在线圈回路中，对照电流和磁场。', [
    part('P', 'dcsupply', -520, 190, { V: 3 }), part('K', 'dpdt', -230, 100, { pos: 'A' }), part('Rp', 'rheostat', 80, 250, { s: .4, Rmax: 20 }),
    part('Lx', 'solenoid', 350, 40), part('A', 'ammeter', 20, -220),
  ], [
    ['P:+', 'K:C1', 'red'], ['P:-', 'K:C2', 'black'], ['K:A1', 'K:B2', 'yellow'], ['K:A2', 'K:B1', 'blue'], ['K:A1', 'Rp:A', 'red'], ['Rp:C', 'Lx:A', 'red'], ['Lx:B', 'A:3', 'green'], ['A:-', 'K:A2', 'black'],
  ], ['选择 A 侧，电流从线圈 A 端进入；按右手螺旋定则，此接线的 B 端为 N 极。', '换成 B 侧，电流改向，N、S 两端交换。', '拔去铁芯或增大串联电阻减小电流，比较磁场显示强弱。']),
  lesson('plate', '保持电荷，改变极板结构', 'Q=CU · C=εS/d', '先充电，再区分保持接电与断开电源两种实验条件。', [
    part('P', 'dcsupply', -420, 180, { V: 10 }), part('S', 'switch', -100, 180), part('C', 'capacitor', 270, 100),
  ], [['P:+', 'S:A', 'red'], ['S:B', 'C:A', 'red'], ['C:B', 'P:-', 'black']],
  ['闭合开关给极板充电，查看电荷分布与板间电场。', '先断开再拉开极板；孤立时 Q 保持，C 减小，所以 U=Q/C 升高。', '插入介质使 C 增大；只有断开条件下才能用恒定 Q 比较电压变化。']),
];
