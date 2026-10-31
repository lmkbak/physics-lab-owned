// Independent teaching models. Physical assumptions and derivations: electric-models.md.
import { Resistor, Source, Supply, Lamp, Diode, Capacitor, Motor } from './solver.js';
export const EPS0 = 8.8541878128e-12;
export const ntcR = T => 100 * Math.exp(3950 * (1 / (T + 273.15) - 1 / 298.15));
export const ldrR = E => 10000 / (1 + Math.max(0, E) / 10);
export const plateC = (d, dielectric = false) => EPS0 * .0144 * (dielectric ? 4 : 1) / (d / 1000);
export const LAMP_RATINGS = { '2.5V 0.3A': [2.5, .3], '3.8V 0.3A': [3.8, .3], '6.3V 0.15A': [6.3, .15] };
export const LED_COLORS = {
  red: { name: '红', Vf: 1.9, color: '#ff3333' }, yellow: { name: '黄', Vf: 2, color: '#ffda25' },
  green: { name: '绿', Vf: 2.1, color: '#39ed70' }, blue: { name: '蓝', Vf: 3, color: '#438aff' },
  white: { name: '白', Vf: 3, color: '#f0f6ff' },
};
const Rg = 100, Ig = .001, shunt = Ig * Rg / (.6 - Ig), R2 = Ig * (Rg + shunt) / 3;
export const METER = { Rg, Ig, ammeter: { R1: shunt - R2, R2 }, voltmeter: { R1: 3 / Ig - Rg, R2: (15 - 3) / Ig }, galvanometer: { Rg: 100, Ig: .0003 } };
const f = (x, n = 2) => (Math.abs(x) < .5 * 10 ** -n ? 0 : x).toFixed(n);
const term = (label, pol) => pol ? { label, pol } : { label };
const pair = () => ({ A: term('A'), B: term('B') });
const polar = () => ({ '+': term('正端 +', '+'), '-': term('负端 −', '-') });
const range = (key, label, min, max, step, unit = '') => ({ key, label, type: 'range', min, max, step, unit });
const select = (key, label, values) => ({ key, label, type: 'select', options: values.map(v => Array.isArray(v) ? v : [v, String(v)]) });
const toggle = (key, label) => ({ key, label, type: 'toggle' });
const button = (key, label) => ({ key, label, type: 'button' });
const alert = (level, text) => ({ level, text });
function ends(p) { return ['dcsupply', 'battery', 'led', 'diode', 'elcap'].includes(p.type) ? ['+', '-'] : ['A', 'B']; }
function basic(p, net, names = ends(p)) {
  if (!Array.isArray(names)) names = ends(p);
  const U = net.voltage(`${p.id}:${names[0]}`, `${p.id}:${names[1]}`), I = p.el?.current(net.V) ?? 0;
  return { U, I, P: U * I, rows: [['电压', `${f(U)} V`], ['电流', `${f(I, 3)} A`]], warn: [] };
}
function resistorBuild(R) { return (p, n) => { p.el = n.add(Resistor(n.node(`${p.id}:A`), n.node(`${p.id}:B`), typeof R === 'function' ? R(p) : R)); p.els = [p.el]; }; }
function resistReport(p, n) {
  const L = basic(p, n); L.R = Math.abs(L.I) > 1e-30 ? L.U / L.I : resistance(p);
  L.rows.push(['电阻', `${f(L.R)} Ω`], ['功率', `${f(L.P, 3)} W`]);
  if (/^resistor/.test(p.type) && L.P > 2) L.warn.push(alert('danger', '电阻功耗超过 2 W 教学额定值。'));
  return L;
}
function resistance(p) {
  if (/^resistor/.test(p.type)) return +p.type.slice(8);
  if (p.type === 'resbox') return Math.max(.01, p.params.d.reduce((s, d, i) => s + d * 10 ** (3 - i), 0));
  if (p.type === 'ntc') return ntcR(p.params.T);
  if (p.type === 'ldr') return ldrR(p.params.E);
  return 0;
}
export const TYPES = {};
function define(id, name, prefix, cat, terms, params, state, props, build, report, note, thumb, extra = {}) {
  TYPES[id] = { id, name, prefix, cat, terms, params, state, props, build, report, note, thumb, procedural: false, ...extra };
}
function sourceReport(p, n) {
  const L = basic(p, n); L.short = Math.abs(L.U) < .2 && Math.abs(L.I) > .3;
  L.rows.push(['输出功率', `${f(L.P, 3)} W`]);
  if (p.type === 'dcsupply') { L.mode = p.el?.mode ?? 'CV'; L.rows.push(['调节状态', p.params.on ? L.mode : '关']); if (p.params.on && L.mode === 'CC') L.warn.push(alert('warn', '负载电流已到设定上限，电源正在恒流输出。')); }
  else if (Math.abs(L.I) > 1) L.warn.push(alert('danger', '电池电流超过 1 A，注意内阻发热。'));
  if (L.short) L.warn.push(alert('danger', '输出端接近短路，检查回路电阻。'));
  if (L.I < -1e-6) L.warn.push(alert('danger', '外部电源向此电源反向送电。'));
  return L;
}
define('dcsupply', '可调直流电源', 'P', '电源', polar(), { V: 3, Ilim: 2, on: true }, {}, [toggle('on', '输出开关'), range('V', '设定电压', 0, 12, .1, 'V'), select('Ilim', '电流上限', [[.5, '.5 A'], [1, '1 A'], [2, '2 A']])], (p, n) => { p.el = p.params.on ? n.add(Supply(n.node(`${p.id}:+`), n.node(`${p.id}:-`), p.params.V, p.params.Ilim)) : null; p.els = p.el ? [p.el] : []; }, sourceReport, '电压旋钮给出目标值；负载增大到电流上限时，端电压随之降低。', 'dc_supply_cadquery');
define('battery', '串联电池组', 'E', '电源', polar(), { E: 3, r: 1 }, {}, [range('E', '电动势', 2.4, 3.2, .05, 'V'), range('r', '内阻', .1, 5, .1, 'Ω')], (p, n) => { p.el = n.add(Source(n.node(`${p.id}:+`), n.node(`${p.id}:-`), p.params.E, p.params.r)); p.els = [p.el]; }, sourceReport, '由电动势和内阻组成的电池模型，可用输出曲线测量内阻。', 'battery_holder_cadquery');
define('switch', '单刀开关', 'S', '开关', pair(), { closed: false }, {}, [toggle('closed', '接通')], (p, n) => { p.el = p.params.closed ? n.add(Resistor(n.node(`${p.id}:A`), n.node(`${p.id}:B`), .01)) : null; p.els = p.el ? [p.el] : []; }, basic, '接通时接点电阻为 10 mΩ，断开时回路中移除此支路。', 'knife_switch_cadquery');
define('dpdt', '双刀换向开关', 'K', '开关', Object.fromEntries(['A1', 'C1', 'B1', 'A2', 'C2', 'B2'].map(t => [t, term(t)])), { pos: 'off' }, {}, [select('pos', '刀片位置', [['A', 'A 侧'], ['off', '断开'], ['B', 'B 侧']])], (p, n) => { p.els = ['A', 'B'].includes(p.params.pos) ? [1, 2].map(i => n.add(Resistor(n.node(`${p.id}:C${i}`), n.node(`${p.id}:${p.params.pos}${i}`), .01))) : []; p.el = p.els[0] ?? null; }, (p, n) => basic(p, n, ['C1', `${p.params.pos === 'B' ? 'B' : 'A'}1`]), '两个公共触点同步选择 A 或 B 侧，可搭建极性换向回路。', 'dpdt_switch_cadquery');
define('lamp', '灯座与白炽灯', 'L', '用电器', pair(), { rating: '2.5V 0.3A' }, { burnt: false, over: 0 }, [select('rating', '灯泡规格', Object.keys(LAMP_RATINGS)), button('replace', '装入新灯泡')], (p, n) => { const [Vr, Ir] = LAMP_RATINGS[p.params.rating]; p.el = p.state.burnt ? null : n.add(Lamp(n.node(`${p.id}:A`), n.node(`${p.id}:B`), Vr, Ir)); p.els = p.el ? [p.el] : []; }, (p, n, dt = 0) => {
  const L = basic(p, n), [Vr, Ir] = LAMP_RATINGS[p.params.rating]; L.ratio = Math.abs(L.P) / (Vr * Ir); L.brightness = Math.min(1, Math.max(0, L.ratio));
  if (dt > 0 && !p.state.burnt) { p.state.over = L.ratio > 1.5 ? (p.state.over ?? 0) + dt : 0; if (p.state.over >= .35 - 1e-12) { p.state.burnt = true; (p.events ??= []).push('burn'); n.invalidate(); } }
  if (p.state.burnt) L.warn.push(alert('danger', '灯丝已断，装入新灯泡后可继续。')); else if (L.ratio > 1.5) L.warn.push(alert('danger', '灯泡功率过高，灯丝正在受损。'));
  L.rows.push(['额定功率比', f(L.ratio)], ['灯丝', p.state.burnt ? '断开' : '完好']); return L;
}, '灯丝模型具有正温度特性，电流增大时静态电阻上升。', 'lamp_holder_cadquery');
function semiconductorBuild(p, n) {
  const led = p.type === 'led', spec = led ? { Vf: LED_COLORS[p.params.color].Vf, If: .02, Rs: 2, Bv: 5 } : { Vf: .7, If: .02, Rs: 1, Bv: 50 };
  p.el = led && p.state.burnt ? null : n.add(Diode(n.node(`${p.id}:+`), n.node(`${p.id}:-`), n.internal(p.id, 'junction'), spec)); p.els = p.el ? [p.el] : [];
}
function semiconductorReport(p, n, dt = 0) {
  const L = basic(p, n); L.brightness = p.type === 'led' && !p.state.burnt ? Math.max(0, Math.min(1, L.I / .02)) : 0; L.ratio = L.brightness;
  if (p.type === 'led') {
    const over = Math.abs(L.I) > .03 || L.U < -5;
    if (dt > 0 && !p.state.burnt) { p.state.over = over ? (p.state.over ?? 0) + dt : 0; if (p.state.over >= .15 - 1e-12) { p.state.burnt = true; (p.events ??= []).push('burn'); n.invalidate(); } }
    if (p.state.burnt) L.warn.push(alert('danger', 'LED 已损坏，需更换。')); else if (over) L.warn.push(alert('danger', 'LED 处于过流或反向击穿区。'));
  }
  L.rows.push(['方向', L.I > 1e-6 ? '正向导通' : L.U < 0 ? '反向偏置' : '低电流']); return L;
}
define('led', '发光二极管', 'D', '半导体与电容', polar(), { color: 'red' }, { burnt: false, over: 0 }, [select('color', '发光颜色', Object.entries(LED_COLORS).map(([k, v]) => [k, `${v.name} · ${v.Vf} V`])), button('replace', '更换 LED')], semiconductorBuild, semiconductorReport, '正向连接并串联限流电阻；不同发光颜色采用不同标称压降。', 'led_cadquery', { procedural: true });
define('diode', '硅整流二极管', 'D', '半导体与电容', polar(), {}, {}, [], semiconductorBuild, semiconductorReport, '阳极电位高于阴极时出现正向电流，色环表示阴极端。', 'rectifier_diode_cadquery', { procedural: true });
for (const R of [10, 20, 50]) define(`resistor${R}`, `${R} Ω 电阻`, 'R', '电阻', pair(), {}, {}, [], resistorBuild(R), resistReport, '线性电阻用于验证电压、电流与阻值的关系。', 'fixed_resistors_cadquery');
define('rheostat', '四接线柱滑动变阻器', 'Rp', '电阻', { A: term('线圈 A'), B: term('线圈 B'), C: term('滑片 C'), D: term('滑片 D') }, { Rmax: 50, s: 1 }, {}, [range('s', '滑片位置', 0, 1, .01), select('Rmax', '线圈规格', [[20, '20 Ω / 2 A'], [50, '50 Ω / 1.5 A'], [200, '200 Ω / 1 A']])], (p, n) => {
  const a = n.node(`${p.id}:A`), b = n.node(`${p.id}:B`), m = n.internal(p.id, 'slider'), s = Math.max(0, Math.min(1, p.params.s));
  p.els = [n.add(Resistor(a, m, Math.max(.01, p.params.Rmax * s))), n.add(Resistor(m, b, Math.max(.01, p.params.Rmax * (1 - s)))), ...['C', 'D'].map(t => n.add(Resistor(m, n.node(`${p.id}:${t}`), .01)))]; p.el = p.els[0];
}, (p, n) => { const L = basic(p, n); L.iAP = p.els[0].current(n.V); L.iPB = p.els[1].current(n.V); const limit = p.params.Rmax === 20 ? 2 : p.params.Rmax === 50 ? 1.5 : 1; if (Math.max(Math.abs(L.iAP), Math.abs(L.iPB)) > limit) L.warn.push(alert('danger', '线圈电流超过所选规格的允许值。')); L.rows.push(['A—滑片电流', `${f(L.iAP, 3)} A`], ['滑片—B 电流', `${f(L.iPB, 3)} A`]); return L; }, 'A、B 是线圈两端，C、D 经金属滑杆连接同一个滑片。', 'rheostat_cadquery');
define('resbox', '十进电阻箱', 'Rb', '电阻', pair(), { d: [0, 0, 1, 0] }, {}, [{ key: 'd', type: 'digits', label: '各位数字' }], resistorBuild(resistance), resistReport, '四位拨盘分别控制千、百、十、个位阻值。', 'resistance_box_cadquery', { value: p => Math.max(.01, (p.params.d || [0, 0, 0, 0]).reduce((s, d, i) => s + d * 10 ** (3 - i), 0)) });
define('ntc', '负温度系数热敏电阻', 'Rt', '电阻', pair(), { T: 25 }, {}, [range('T', '温度', 0, 100, 1, '°C')], resistorBuild(resistance), resistReport, '教学参数 R25=100 Ω、B=3950 K，升温使电阻降低。', 'sensor_resistors_cadquery');
define('ldr', '光敏电阻', 'Rg', '电阻', pair(), { E: 100 }, {}, [range('E', '照度', 0, 1000, 5, 'lx')], resistorBuild(resistance), resistReport, '采用 R=10000/(1+E/10) Ω 的公开教学曲线，便于比较光照响应。', 'sensor_resistors_cadquery');
function meterBuild(p, n) {
  const k = t => n.node(`${p.id}:${t}`);
  if (p.type === 'galvanometer') p.els = [n.add(Resistor(k('A'), k('B'), METER.galvanometer.Rg))];
  else if (p.type === 'ammeter') p.els = [n.add(Resistor(k('0.6'), k('-'), Rg)), n.add(Resistor(k('0.6'), k('3'), METER.ammeter.R1)), n.add(Resistor(k('3'), k('-'), METER.ammeter.R2))];
  else { const m = n.internal(p.id, 'head'); p.els = [n.add(Resistor(m, k('-'), Rg)), n.add(Resistor(k('3'), m, METER.voltmeter.R1)), n.add(Resistor(k('15'), k('3'), METER.voltmeter.R2))]; }
  p.el = p.els[0];
}
function meterReport(p, n) {
  const gal = p.type === 'galvanometer', amp = p.type === 'ammeter', low = amp ? '0.6' : '3', high = amp ? '3' : '15';
  const selected = !gal && n.used(p.id, high) ? high : low, limit = gal ? METER.galvanometer.Ig : Ig;
  const L = basic(p, n, gal ? ['A', 'B'] : [selected, '-']);
  L.range = gal ? 300 : Number(selected); L.unit = gal ? 'μA' : amp ? 'A' : 'V'; L.frac = L.I / limit; L.reading = L.frac * L.range;
  if (!gal && n.used(p.id, low) && n.used(p.id, high)) L.warn.push(alert('danger', '两个正量程接线柱同时接线，请检查接法。'));
  if (L.frac < -1e-6) L.warn.push(alert('warn', '指针反偏，交换仪表两端连接。'));
  if (Math.abs(L.frac) > 1 + 1e-7) L.warn.push(alert('danger', '读数超过仪表满量程。'));
  L.rows = [['示值', `${f(L.reading, gal ? 0 : L.range >= 15 ? 1 : 2)} ${L.unit}`], ['量程', `${gal ? '±' : ''}${L.range} ${L.unit}`], ['端电压', `${f(L.U)} V`]]; return L;
}
define('ammeter', '双量程电流表', 'A', '电表', { '3': term('3 A', '+'), '-': term('公共端 −', '-'), '0.6': term('0.6 A', '+') }, {}, {}, [], meterBuild, meterReport, '内部采用通用分流结构，接线柱决定实际量程。', 'ammeter_cadquery', { meter: true });
define('voltmeter', '双量程电压表', 'V', '电表', { '3': term('3 V', '+'), '15': term('15 V', '+'), '-': term('公共端 −', '-') }, {}, {}, [], meterBuild, meterReport, '倍压电阻依次串联，选择不同接线柱可切换输入电阻。', 'voltmeter_cadquery', { meter: true });
define('galvanometer', '中心零位检流计', 'G', '电表', pair(), {}, {}, [], meterBuild, meterReport, '以正负微安示值观察小电流方向，满偏为 ±300 μA。', 'galvanometer_cadquery', { meter: true });
define('fuse', '可更换熔断器', 'F', '用电器', pair(), { rating: 1 }, { heat: 0, blown: false }, [select('rating', '额定电流', [[.5, '.5 A'], [1, '1 A'], [2, '2 A']]), button('replace', '安装新熔丝')], (p, n) => { p.el = p.state.blown ? null : n.add(Resistor(n.node(`${p.id}:A`), n.node(`${p.id}:B`), .05)); p.els = p.el ? [p.el] : []; }, (p, n, dt = 0) => {
  const L = basic(p, n), ratio = Math.abs(L.I) / p.params.rating;
  if (dt > 0 && !p.state.blown) { p.state.heat = Math.max(0, (p.state.heat ?? 0) + dt * (ratio > 1 ? ratio * ratio - 1 : -.5)); if (p.state.heat >= 1 - 1e-12) { p.state.blown = true; (p.events ??= []).push('blow'); n.invalidate(); } }
  if (p.state.blown) L.warn.push(alert('danger', '熔丝已熔断，检查回路后更换。')); else if (ratio > 1) L.warn.push(alert('danger', '熔丝过流，热量正在积累。'));
  L.rows.push(['熔丝', p.state.blown ? '已熔断' : '接通'], ['热积累', f(p.state.heat, 3)]); return L;
}, '按电流平方累积热量，降至额定电流以下时逐步冷却。', 'fuse_holder_cadquery');
function capBuild(p, n) {
  const plate = p.type === 'capacitor', C = plate ? plateC(p.params.d, p.params.dielectric) : p.params.C * 1e-6;
  n.conserve(p, C); const [a, b] = ends(p); p.el = n.add(Capacitor(n.node(`${p.id}:${a}`), n.node(`${p.id}:${b}`), C, p.state)); p.els = [p.el];
}
function capReport(p, n) {
  const L = basic(p, n); L.C = p.el.C; L.Q = L.C * p.state.v; L.energy = .5 * L.C * p.state.v ** 2; L.E = p.type === 'capacitor' ? L.U / (p.params.d / 1000) : 0;
  if (p.type === 'elcap') { if (L.U < -.5) L.warn.push(alert('danger', '电解电容出现反向电压，请核对正负端。')); if (L.U > 16) L.warn.push(alert('danger', '电解电容端电压超过 16 V。')); }
  L.rows.push(['电容', `${f(L.C * (p.type === 'capacitor' ? 1e12 : 1e6), 2)} ${p.type === 'capacitor' ? 'pF' : 'μF'}`], ['电荷', `${L.Q.toExponential(3)} C`]); return L;
}
define('capacitor', '动板平行板电容器', 'C', '半导体与电容', pair(), { d: 32, dielectric: false }, { v: 0 }, [range('d', '板间距离', 32, 96, 1, 'mm'), toggle('dielectric', '插入电介质')], capBuild, capReport, '板面积取 0.0144 m²，插入介质时相对介电常数取 4。隔离移动时保持电荷。', 'capacitor_cadquery');
define('elcap', '极性电解电容', 'C', '半导体与电容', polar(), { C: 1000 }, { v: 0 }, [select('C', '容量', [470, 1000, 2200, 4700].map(v => [v, `${v} μF`])), button('discharge', '将电压归零')], capBuild, capReport, '微法级储能元件，观察充放电并检查极性和 16 V 耐压。', null, { procedural: true });
define('motor', '直流电动机', 'M', '用电器', pair(), { stalled: false }, { w: 0, stalled: false, angle: 0 }, [toggle('stalled', '锁住转子')], (p, n) => { p.state.stalled = !!p.params.stalled; p.el = n.add(Motor(n.node(`${p.id}:A`), n.node(`${p.id}:B`), {}, p.state)); p.els = [p.el]; }, (p, n) => { const L = basic(p, n); L.w = p.state.w; L.angle = p.state.angle; L.rpm = L.w * 60 / (2 * Math.PI); L.E = .01 * L.w; L.torque = .01 * L.I; L.copper = 3 * L.I ** 2; L.mechanical = L.E * L.I; if (p.params.stalled && Math.abs(L.I) > .01) L.warn.push(alert('danger', '转子已锁住，电能主要转为线圈热量。')); L.rows.push(['转速', `${f(L.rpm, 0)} rpm`], ['反电动势', `${f(L.E)} V`]); return L; }, '电枢电阻、反电动势和转动惯量共同决定启动过程。', 'dc_motor_cadquery');
define('solenoid', '螺线管线圈', 'L', '用电器', pair(), { core: true }, {}, [toggle('core', '插入铁芯')], resistorBuild(8), (p, n) => { const L = basic(p, n); L.B = 4 * Math.PI * 1e-7 * (p.params.core ? 80 : 1) * 500 / .12 * L.I; L.rows.push(['轴向磁场', `${f(L.B * 1000, 3)} mT`], ['方向', L.B >= 0 ? 'A → B' : 'B → A']); return L; }, '取 500 匝、长 0.12 m 的教学线圈，铁芯相对磁导率按 80 计算。', 'solenoid_cadquery');
export function shortValue(p) {
  const q = p.params;
  switch (p.type) {
    case 'dcsupply': return q.on ? `${f(q.V, 1)} V · ${q.Ilim} A` : '输出关闭';
    case 'battery': return `${f(q.E)} V / ${f(q.r, 1)} Ω`;
    case 'switch': return q.closed ? '接通' : '断开';
    case 'dpdt': return q.pos === 'off' ? '断开' : `${q.pos} 侧`;
    case 'lamp': return p.state.burnt ? '灯丝断开' : q.rating;
    case 'led': return p.state.burnt ? '已损坏' : `${LED_COLORS[q.color].name}光 LED`;
    case 'rheostat': return `${q.Rmax} Ω / ${f(q.s * 100, 0)}%`;
    case 'resbox': return `${resistance(p)} Ω`;
    case 'ntc': return `${q.T} °C · ${f(ntcR(q.T), 1)} Ω`;
    case 'ldr': return `${q.E} lx · ${f(ldrR(q.E), 1)} Ω`;
    case 'capacitor': return `${f(plateC(q.d, q.dielectric) * 1e12, 2)} pF`;
    case 'elcap': return `${q.C} μF / 16 V`;
    case 'fuse': return p.state.blown ? '已熔断' : `${q.rating} A`;
    case 'motor': return q.stalled ? '转子锁定' : '转子自由';
    case 'solenoid': return q.core ? '有铁芯' : '空心';
    default: return p.type.startsWith('resistor') ? `${resistance(p)} Ω` : TYPES[p.type].name;
  }
}
