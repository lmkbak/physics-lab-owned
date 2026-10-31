import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { TYPES, METER, EPS0, ntcR, ldrR, plateC, LAMP_RATINGS, LED_COLORS, shortValue } from '../../src/lab/owned/electric/models.js';
import { Simulation } from '../../src/lab/owned/electric/simulation.js';
import { Capacitor } from '../../src/lab/owned/electric/solver.js';
let groups = 0;
const near = (actual, expected, abs = 1e-9, rel = 1e-7) => assert.ok(Number.isFinite(actual) && Math.abs(actual - expected) <= abs + rel * Math.abs(expected), `${actual} != ${expected}`);
const part = (id, type, params = {}, state = {}) => ({ id, type, label: id, params: { ...structuredClone(TYPES[type].params), ...params }, state: { ...structuredClone(TYPES[type].state), ...state } });
const wire = (a, b, i = 0) => { const end = key => { const [p, t] = key.split(':'); return { p, t }; }; return { id: `w${i}`, a: end(a), b: end(b) }; };
const model = (parts, edges = []) => ({ parts, wires: edges.map(([a, b], i) => wire(a, b, i)) });
const solve = (m, dt = 0, substeps = 1, s = new Simulation()) => { const r = s.step(m, dt, substeps); assert.equal(r.converged, true, r.reason); return s; };
function checkKCL(s) {
  const sum = Array(s.nodes.size).fill(0), mag = sum.slice();
  const add = (a, b, I) => { sum[a] += I; sum[b] -= I; mag[a] += Math.abs(I); mag[b] += Math.abs(I); };
  for (const el of s.elements) {
    if (el._branches) for (const br of el._branches(s.V)) add(br.a, br.b, br.i);
    else add(el.nodes[0], el.nodes[1], el.current(s.V) * (['source', 'supply'].includes(el.kind) ? -1 : 1));
  }
  for (let i = 0; i < sum.length; i++) near(sum[i], 0, 1e-9 + 1e-7 * mag[i], 0);
}
async function test(name, fn) { await fn(); groups++; console.log(`PASS ${name}`); }
const loop = (type, params = {}, supply = { E: 3, r: 1 }, state = {}) => model([part('S', 'battery', supply), part('X', type, params, state)], [['S:+', `X:${['led', 'diode', 'elcap'].includes(type) ? '+' : 'A'}`], [`X:${['led', 'diode', 'elcap'].includes(type) ? '-' : 'B'}`, 'S:-']]);
await test('exact 22-type public requirement metadata', async () => {
  const requirements = JSON.parse(await readFile(new URL('../../docs/ownership/baseline.json', import.meta.url), 'utf8')).electric.types;
  assert.equal(requirements.length, 22); assert.deepEqual(Object.keys(TYPES).sort(), requirements.map(r => r.id).sort());
  for (const r of requirements) {
    const d = TYPES[r.id]; assert.equal(d.id, r.id); assert.deepEqual(d.params, r.defaults); assert.deepEqual(d.state, r.initialState);
    assert.deepEqual(Object.keys(d.terms).sort(), Object.keys(r.terminals).sort());
    for (const [key, t] of Object.entries(r.terminals)) assert.equal(d.terms[key].pol, t.pol);
    assert.equal(d.thumb ?? null, r.thumbnail); assert.equal(d.procedural, r.procedural);
    for (const c of r.controls) { const p = d.props.find(p => p.key === c.key); assert.ok(p); assert.equal(p.type, c.type); for (const key of ['min', 'max', 'step', 'unit']) if (key in c) assert.equal(p[key], c[key]); if (c.options) assert.deepEqual(p.options.map(v => v[0]), c.options.map(v => v[0])); }
    assert.equal(d.props.length, r.controls.length); for (const key of ['name', 'prefix', 'cat', 'note']) assert.ok(d[key]); assert.equal(typeof d.build, 'function'); assert.equal(typeof d.report, 'function');
    const p = part('X', r.id); const m = model([p]); const s = solve(m, .001); assert.ok(p.live.rows.length); assert.equal(typeof shortValue(p), 'string'); for (const [k, v] of Object.entries(p.live)) if (typeof v === 'number') assert.ok(Number.isFinite(v), `${r.id}.${k}`); checkKCL(s);
  }
  for (const id of ['ammeter', 'voltmeter', 'galvanometer']) assert.equal(TYPES[id].meter, true);
  assert.deepEqual(Object.keys(LAMP_RATINGS), ['2.5V 0.3A', '3.8V 0.3A', '6.3V 0.15A']);
  for (const c of Object.values(LED_COLORS)) { assert.equal(typeof c.name, 'string'); assert.equal(typeof c.color, 'string'); assert.ok(c.Vf > 0); }
});
await test('known resistor loops, serial/parallel and wire currents', () => {
  for (const R of [10, 20, 50]) { const m = loop(`resistor${R}`); const s = solve(m); const I = 3 / (R + 1 + .02); near(m.parts[1].live.I, I); near(m.parts[1].live.U, I * R); near(m.parts[0].live.I, I); for (const w of m.wires) near(Math.abs(w.I), I); near(s.potential('S:-'), 0); checkKCL(s); }
  const m = model([part('S', 'battery'), part('A', 'resistor10'), part('B', 'resistor20')], [['S:+', 'A:A'], ['A:B', 'B:A'], ['B:B', 'S:-']]); const s = solve(m); near(m.parts[0].live.I, 3 / 31.03); checkKCL(s);
  const p = model([part('S', 'battery'), part('A', 'resistor10'), part('B', 'resistor20')], [['S:+', 'A:A'], ['A:B', 'S:-'], ['S:+', 'B:A'], ['B:B', 'S:-']]); const sp = solve(p); const R = 1 / (1 / 10.02 + 1 / 20.02), U = 3 * R / (1 + R); near(p.parts[1].live.I, U / 10.02); near(p.parts[2].live.I, U / 20.02); checkKCL(sp);
});
await test('bridge network, multiple sources, independent component references', () => {
  const ps = [part('S', 'battery', { E: 6, r: 1 }), ...['A', 'B', 'C', 'D', 'G'].map(id => part(id, 'resistor10'))];
  const m = model(ps, [['S:+', 'A:A'], ['S:+', 'C:A'], ['A:B', 'B:A'], ['C:B', 'D:A'], ['B:B', 'S:-'], ['D:B', 'S:-'], ['A:B', 'G:A'], ['G:B', 'C:B']]); const s = solve(m); near(ps[5].live.I, 0); near(ps[0].live.I, 6 / (1 + 10.015)); checkKCL(s);
  const multi = model([part('S', 'battery'), part('T', 'battery', { E: 2, r: 1 })], [['S:-', 'T:+'], ['T:-', 'S:+']]); const sm = solve(multi); near(multi.parts[0].live.I, 5 / 2.02); near(sm.potential('S:-'), 0); assert.ok(Math.abs(sm.potential('T:-')) > .1); checkKCL(sm);
  const islands = model([part('S', 'battery'), part('R', 'resistor10'), part('T', 'battery', { E: 2, r: 2 }), part('Q', 'resistor20'), part('F', 'switch')], [['S:+', 'R:A'], ['R:B', 'S:-'], ['T:+', 'Q:A'], ['Q:B', 'T:-']]); const si = solve(islands); near(si.potential('S:-'), 0); near(si.potential('T:-'), 0); near(islands.parts[3].live.I, 2 / 22.02); checkKCL(si);
});
await test('two ammeter scales from head-current equations and signed warnings', () => {
  near(METER.Rg, 100); near(METER.Ig, .001);
  for (const scale of [.6, 3]) {
    const p = part('A', 'ammeter'), m = model([part('S', 'battery', { E: 1, r: 1 }), p], [['S:+', `A:${scale}`], ['A:-', 'S:-']]); const s = solve(m);
    const head = p.els[0].current(s.V); near(p.live.reading, m.parts[0].live.I); near(head / .001, p.live.reading / scale); assert.equal(p.live.range, scale); assert.match(p.live.rows[0][1], /^\d+\.\d{2} A$/); checkKCL(s);
    m.wires = [wire('S:+', 'A:-'), wire(`A:${scale}`, 'S:-', 1)]; s.dirty = true; solve(m, 0, 1, s); assert.ok(p.live.reading < 0); assert.ok(p.live.warn.some(w => /反偏/.test(w.text)));
  }
  const m = model([part('S', 'battery', { E: 3, r: .1 }), part('A', 'ammeter')], [['S:+', 'A:0.6'], ['A:-', 'S:-'], ['A:3', 'S:+']]); solve(m); assert.ok(m.parts[1].live.warn.some(w => /同时/.test(w.text))); assert.ok(m.parts[1].live.warn.some(w => /满量程/.test(w.text)));
});
await test('voltmeter 3/15 V resistance and galvanometer microampere precision', () => {
  for (const scale of [3, 15]) {
    const m = model([part('S', 'battery', { E: scale, r: 1 }), part('V', 'voltmeter')], [['S:+', `V:${scale}`], ['V:-', 'S:-']]); const s = solve(m); const p = m.parts[1]; near(p.live.reading, p.live.U); near(p.live.I, scale / (scale / .001 + 1.02)); near(p.live.U / p.live.I, scale / .001); assert.match(p.live.rows[0][1], scale === 3 ? /^\d+\.\d{2} V$/ : /^\d+\.\d V$/); checkKCL(s);
  }
  const m = loop('galvanometer', {}, { E: .030306, r: 1 }); const s = solve(m); near(m.parts[1].live.reading, 300); assert.equal(m.parts[1].live.unit, 'μA'); assert.match(m.parts[1].live.rows[0][1], /^300 μA$/); checkKCL(s);
});
await test('switch open/closed and DPDT A/off/B independent poles', () => {
  const m = loop('switch'); const s = solve(m); near(m.parts[1].live.I, 0); m.parts[1].params.closed = true; s.dirty = true; solve(m, 0, 1, s); near(m.parts[1].live.I, 3 / 1.03);
  for (const pos of ['A', 'B', 'off']) {
    const m = model([part('S', 'battery'), part('K', 'dpdt', { pos }), part('R', 'resistor10')], [['S:+', 'K:C1'], ['S:-', 'K:C2'], ['K:A1', 'R:A'], ['K:A2', 'R:B'], ['K:B1', 'R:B'], ['K:B2', 'R:A']]); const s = solve(m); const I = m.parts[2].live.I; if (pos === 'off') near(I, 0); else near(I, (pos === 'A' ? 1 : -1) * 3 / 11.06); checkKCL(s);
  }
});
await test('resbox digits, NTC B3950, LDR curve and rheostat endpoints/ratings', () => {
  near(ntcR(25), 100); near(ntcR(0), 100 * Math.exp(3950 * (1 / 273.15 - 1 / 298.15))); assert.ok(ntcR(100) < ntcR(25)); near(ldrR(0), 10000); near(ldrR(100), 10000 / 11); assert.ok(ldrR(1000) < ldrR(100)); near(EPS0, 8.8541878128e-12, 0, 1e-12);
  for (const [type, params, R] of [['resbox', { d: [1, 2, 3, 4] }, 1234], ['resbox', { d: [0, 0, 0, 0] }, .01], ['ntc', { T: 25 }, 100], ['ldr', { E: 100 }, 10000 / 11]]) { const m = loop(type, params); const s = solve(m); near(m.parts[1].live.I, 3 / (R + 1.02)); checkKCL(s); }
  for (const sPos of [0, .25, 1]) { const m = model([part('S', 'battery'), part('R', 'rheostat', { s: sPos, Rmax: 20 })], [['S:+', 'R:A'], ['R:C', 'S:-']]); const s = solve(m); near(m.parts[1].live.iAP, 3 / (1.03 + Math.max(.01, 20 * sPos))); near(m.parts[1].live.iPB, 0); checkKCL(s); }
  for (const Rmax of [20, 50, 200]) { const m = model([part('S', 'battery', { E: 3, r: .1 }), part('R', 'rheostat', { Rmax, s: 0 })], [['S:+', 'R:A'], ['R:D', 'S:-']]); solve(m); assert.ok(m.parts[1].live.warn.length > 0); }
});
await test('supply physical CV/CC/off and reverse-feed absorption', () => {
  for (const [R, limit] of [[10, 2], [.01, .5]]) {
    const m = model([part('P', 'dcsupply', { V: 3, Ilim: limit }), part('R', 'resbox', { d: R === 10 ? [0, 0, 1, 0] : [0, 0, 0, 0] })], [['P:+', 'R:A'], ['R:B', 'P:-']]); const s = solve(m); near(m.parts[0].live.I, Math.min(limit, 3 / (R + .04))); assert.equal(m.parts[0].live.mode, R === 10 ? 'CV' : 'CC'); near(m.parts[1].live.I, m.parts[0].live.I); checkKCL(s);
    m.parts[0].params.on = false; s.dirty = true; solve(m, 0, 1, s); near(m.parts[0].live.I, 0); near(m.parts[1].live.I, 0);
  }
  const m = model([part('P', 'dcsupply'), part('S', 'battery', { E: 6, r: 1 })], [['P:+', 'S:+'], ['P:-', 'S:-']]); const s = solve(m); near(m.parts[0].live.I, -3 / 1.04); assert.ok(m.parts[0].live.warn.some(w => /反向/.test(w.text))); checkKCL(s);
});
await test('silicon diode polarity and all five LED calibrated colors', () => {
  for (const type of ['diode', 'led']) for (const color of type === 'led' ? Object.keys(LED_COLORS) : ['red']) {
    const m = model([part('S', 'battery', { E: 5, r: 100 }), part('D', type, { color })], [['S:+', 'D:+'], ['D:-', 'S:-']]); const s = solve(m); const L = m.parts[1].live; assert.ok(L.I > .001); const spec = type === 'led' ? { Vf: LED_COLORS[color].Vf, Rs: 2 } : { Vf: .7, Rs: 1 }; const Is = .02 / Math.expm1((spec.Vf - .02 * spec.Rs) / (.02585 * 2)); near(L.U, .02585 * 2 * Math.log1p(L.I / Is) + spec.Rs * L.I); checkKCL(s);
    m.parts[0].params.E = 3; m.wires = [wire('S:+', 'D:-'), wire('D:+', 'S:-', 1)]; s.dirty = true; solve(m, 0, 1, s); assert.ok(Math.abs(m.parts[1].live.I) < 1e-6); assert.equal(m.parts[1].live.brightness, 0); checkKCL(s);
  }
});
await test('all lamp ratings nominal power and protection/replacement', () => {
  for (const [rating, [Vr, Ir]] of Object.entries(LAMP_RATINGS)) { const m = loop('lamp', { rating }, { E: Vr + Ir * 1.02, r: 1 }); const s = solve(m); near(m.parts[1].live.I, Ir); near(m.parts[1].live.ratio, 1); checkKCL(s); }
  const m = loop('lamp', {}, { E: 12, r: .1 }); const s = solve(m, .36); assert.equal(m.parts[1].state.burnt, true); near(m.parts[1].live.I, 0); assert.ok(m.parts[1].live.warn.length); near(s.time, .36); checkKCL(s);
  Object.assign(m.parts[1].state, { burnt: false, over: 0 }); m.parts[0].params.E = 2; s.dirty = true; solve(m, .01, 1, s); assert.ok(m.parts[1].live.I > 0); assert.equal(m.parts[1].state.burnt, false);
});
await test('LED overcurrent damage, reverse breakdown and replace', () => {
  const m = loop('led', {}, { E: 4, r: .1 }); const s = solve(m, .16); assert.equal(m.parts[1].state.burnt, true); near(m.parts[1].live.I, 0); checkKCL(s);
  Object.assign(m.parts[1].state, { burnt: false, over: 0 }); m.parts[0].params.r = 200; s.dirty = true; solve(m, .01, 1, s); assert.ok(m.parts[1].live.brightness > 0);
  m.parts[0].params.E = 9; m.wires = [wire('S:+', 'X:-'), wire('X:+', 'S:-', 1)]; s.dirty = true; solve(m, .16, 1, s); assert.equal(m.parts[1].state.burnt, true); near(m.parts[1].live.I, 0);
});
await test('fuse I-squared heat trigger, cooling and replacement', () => {
  const m = loop('fuse', { rating: 1 }, { E: 3, r: 1 }); const s = solve(m); const I = 3 / 1.07, t = 1 / (I * I - 1); const h = 1 / 240; solve(m, t - h, 1, s); assert.equal(m.parts[1].state.blown, false); solve(m, 2 * h, 1, s); assert.equal(m.parts[1].state.blown, true); near(m.parts[1].live.I, 0); checkKCL(s);
  Object.assign(m.parts[1].state, { blown: false, heat: .5 }); m.parts[0].params.E = .1; s.dirty = true; solve(m, .2, 1, s); near(m.parts[1].state.heat, .4); assert.ok(m.parts[1].live.I > 0);
});
await test('RC backward Euler recurrence and dirty-state history persistence', () => {
  const m = loop('elcap', { C: 1000 }, { E: 5, r: 100 }, { v: 1.25 }); const s = new Simulation(), dt = 1 / 240, C = .001, R = 100.02; let v = 1.25;
  for (let i = 0; i < 50; i++) { if (i % 3 === 0) s.dirty = true; solve(m, dt, 1, s); v = (v + dt * 5 / (R * C)) / (1 + dt / (R * C)); near(m.parts[1].state.v, v); checkKCL(s); }
  const state = m.parts[1].state; s.dirty = true; solve(m, 0, 1, s); assert.equal(m.parts[1].state, state); near(state.v, v);
});
await test('pF isolation, moving plates/dielectric Q conservation and caller rescaling', () => {
  const p = part('C', 'capacitor', {}, { v: 3 }); const m = model([p]), s = solve(m, .01); const q = p.el.C * p.state.v;
  for (let i = 0; i < 100; i++) solve(m, .01, 1, s); near(p.state.v, 3, 1e-10, 0); near(p.live.I, 0, 1e-22, 0);
  p.params.d = 96; s.dirty = true; solve(m, 0, 1, s); near(p.state.v, 9, 1e-10, 0); near(p.live.Q, q, 1e-24, 1e-10);
  const oldC = plateC(p.params.d, p.params.dielectric); p.params.dielectric = true; p.state.v *= oldC / plateC(p.params.d, true); s.dirty = true; solve(m, 0, 1, s); near(p.state.v, 2.25, 1e-10, 0); near(p.live.Q, q, 1e-24, 1e-10); near(p.live.E, p.state.v / .096);
  p.state.v = 0; s.dirty = true; solve(m, 0, 1, s); near(p.state.v, 0); near(p.live.Q, 0, 1e-24, 0);
  const ec = part('C', 'elcap', {}, { v: 4 }), em = model([ec]), es = solve(em, .001); ec.params.C = 2000; es.dirty = true; solve(em, 0, 1, es); near(ec.state.v, 2);
});
await test('electrolytic polarity, exact 16 V boundary and overvoltage', () => {
  for (const [v, dangerous] of [[-.6, true], [-.4, false], [16, false], [16.1, true]]) { const p = part('C', 'elcap', {}, { v }), m = model([p]); solve(m); assert.equal(p.live.warn.length > 0, dangerous); }
});
await test('motor angle/startup/continuous ODE/back EMF/reverse and stall', () => {
  const m = loop('motor', {}, { E: 3, r: .1 }); const s = solve(m, .1); const p = m.parts[1]; assert.ok(p.state.w > 0); assert.ok(p.state.angle > 0); assert.ok(p.live.E > 0);
  const R = 3.12, J = 2e-5, k = .01, damp = 2e-6, Tf = .002, a = (k * k / R + damp) / J, wInf = (k * 3 / R - Tf) / (k * k / R + damp); const exact = wInf * (1 - Math.exp(-a * .1)); assert.ok(Math.abs(p.state.w - exact) / exact < .01);
  const angle = p.state.angle, w = p.state.w; s.dirty = true; solve(m, 0, 1, s); near(p.state.angle, angle); near(p.state.w, w);
  p.params.stalled = true; s.dirty = true; solve(m, .01, 1, s); near(p.state.w, 0); near(p.state.angle, angle); near(p.live.I, 3 / 3.12); assert.ok(p.live.warn.length); checkKCL(s);
  const rev = loop('motor', {}, { E: -3, r: .1 }); solve(rev, .1); near(rev.parts[1].state.w, -w); assert.ok(rev.parts[1].state.angle < 0);
});
await test('solenoid signed field and air/core multiplier', () => {
  const m = loop('solenoid', { core: false }); const s = solve(m); const p = m.parts[1], air = p.live.B; near(air, 4 * Math.PI * 1e-7 * 500 / .12 * 3 / 9.02); p.params.core = true; s.dirty = true; solve(m, 0, 1, s); near(p.live.B, air * 80); m.parts[0].params.E = -3; s.dirty = true; solve(m, 0, 1, s); near(p.live.B, -air * 80); checkKCL(s);
});
await test('second-substep rejection restores full frame identities, keys and contexts', () => {
  const m = loop('motor'), s = solve(m, .01); const p = m.parts[1], state = p.state, savedState = structuredClone(state), live = p.live, V = s.V, warnings = s.warnings, nodes = s.nodes, caps = s._caps, elements = s.elements, time = s.time, iterations = s.lastIterations, wires = m.wires.map(w => ({ el: w.el, I: w.I })), oldEls = p.els;
  const contexts = elements.map(e => e._lastContext); s.dirty = true; let calls = 0; const real = s._solve;
  s._solve = (...args) => { const r = real(...args); if (++calls === 2) { state.injected = 99; return { ...r, converged: false }; } return r; };
  const result = s.step(m, .01, 4); assert.equal(result.converged, false); assert.equal(calls, 2); assert.equal(p.state, state); assert.deepEqual(state, savedState); assert.equal(p.live, live); assert.equal(p.els, oldEls); assert.equal(p.el, oldEls[0]); assert.equal(s.V, V); assert.equal(s.warnings, warnings); assert.equal(s.nodes, nodes); assert.equal(s._caps, caps); assert.equal(s.elements, elements); assert.equal(s.dirty, true); assert.equal(s.time, time); assert.equal(s.lastIterations, iterations); for (let i = 0; i < elements.length; i++) assert.equal(elements[i]._lastContext, contexts[i]); m.wires.forEach((w, i) => { assert.equal(w.el, wires[i].el); assert.equal(w.I, wires[i].I); });
});
await test('real-kernel incompatible frozen capacitors rollback; thrown build rollback', () => {
  const m = model([part('A', 'elcap', {}, { v: 1 }), part('B', 'elcap', {}, { v: 2 })]); const s = solve(m); const oldV = s.V, oldNodes = s.nodes, oldLive = m.parts[0].live;
  // Invoke the real kernel on two contradictory frozen voltage constraints.
  const real = s._solve; s._solve = () => real(2, [Capacitor(0, 1, .001, m.parts[0].state), Capacitor(0, 1, .001, m.parts[1].state)], { dt: 0, refs: [0], V: [0, -1] });
  assert.equal(s.step(m, 0).converged, false); assert.equal(s.V, oldV); assert.equal(s.nodes, oldNodes); assert.equal(m.parts[0].live, oldLive); near(m.parts[0].state.v, 1); near(m.parts[1].state.v, 2);
  s._solve = real; s.dirty = true; m.wires.push(wire('A:+', 'missing:A')); const keys = Reflect.ownKeys(m.parts[0]); assert.throws(() => s.step(m, .01), /terminal/); assert.equal(s.nodes, oldNodes); assert.equal(s.V, oldV); assert.deepEqual(Reflect.ownKeys(m.parts[0]), keys); assert.equal(s.dirty, true);
});
await test('exact full-scale meter points and reverse/overload warnings', () => {
  const reqLow = 100 * (METER.ammeter.R1 + METER.ammeter.R2) / (100 + METER.ammeter.R1 + METER.ammeter.R2);
  const reqHigh = METER.ammeter.R2 * (100 + METER.ammeter.R1) / (METER.ammeter.R2 + 100 + METER.ammeter.R1);
  for (const [terminal, fs, inputR] of [['0.6', .6, reqLow], ['3', 3, reqHigh]]) {
    const m = model([part('S', 'battery', { E: fs * (inputR + 1.02), r: 1 }), part('M', 'ammeter')], [['S:+', `M:${terminal}`], ['M:-', 'S:-']]); const s = solve(m); near(m.parts[1].live.reading, fs); near(m.parts[1].el.current(s.V), .001, 1e-10); near(m.parts[1].live.frac, 1); checkKCL(s);
  }
  for (const terminal of ['3', '15']) {
    const fs = +terminal, m = model([part('S', 'battery', { E: fs + .00102, r: 1 }), part('M', 'voltmeter')], [['S:+', `M:${terminal}`], ['M:-', 'S:-']]); const s = solve(m); near(m.parts[1].live.reading, fs); near(m.parts[1].live.frac, 1); m.parts[0].params.E *= -2; s.dirty = true; solve(m, 0, 1, s); assert.ok(m.parts[1].live.warn.some(w => /反偏/.test(w.text))); assert.ok(m.parts[1].live.warn.some(w => /满量程/.test(w.text))); checkKCL(s);
  }
  const g = loop('galvanometer', {}, { E: -.1, r: 1 }); solve(g); assert.ok(g.parts[1].live.reading < -300); assert.ok(g.parts[1].live.warn.some(w => /满量程/.test(w.text)));
});
await test('protection exposure time quantization and ordinary warnings', () => {
  for (const [type, threshold] of [['lamp', .35], ['led', .15]]) {
    const m = loop(type, {}, { E: type === 'lamp' ? 12 : 4, r: .1 }); const s = solve(m, threshold - 1 / 240); assert.equal(m.parts[1].state.burnt, false); near(m.parts[1].state.over, threshold - 1 / 240, 1e-12); solve(m, 1 / 240, 1, s); assert.equal(m.parts[1].state.burnt, true); near(m.parts[1].live.I, 0); checkKCL(s);
  }
  const r = loop('resistor10', {}, { E: 12, r: .1 }); solve(r); assert.ok(r.parts[1].live.warn.some(w => /2 W/.test(w.text)));
  const b = loop('switch', { closed: true }, { E: 3, r: 1 }); solve(b); assert.ok(b.parts[0].live.warn.some(w => /短路/.test(w.text))); assert.ok(b.parts[0].live.warn.some(w => /1 A/.test(w.text)));
});
await test('minimal model defaults, preserved unrelated state, failed refresh and recovery', () => {
  const m = model([{ id: 'M', type: 'motor', params: {}, state: { extra: { retained: 1 } } }]); const s = solve(m, .001); assert.deepEqual(m.parts[0].state.extra, { retained: 1 }); assert.equal(m.parts[0].params.stalled, false);
  const f = loop('fuse', {}, { E: 3, r: 1 }); const fs = solve(f); const state = f.parts[1].state, saved = structuredClone(state), oldLive = f.parts[1].live, V = fs.V, time = fs.time, warnings = fs.warnings, el = f.parts[1].el, oldContext = el._lastContext;
  const real = fs._solve; fs._solve = (n, els, opts) => { const r = real(n, els, opts); return opts.dt === 0 ? { ...r, converged: false } : r; };
  assert.equal(fs.step(f, .3).converged, false); assert.equal(fs.dirty, false); assert.equal(fs.V, V); assert.equal(fs.time, time); assert.equal(fs.warnings, warnings); assert.equal(f.parts[1].live, oldLive); assert.equal(f.parts[1].el, el); assert.equal(el._lastContext, oldContext); assert.deepEqual(state, saved);
  fs._solve = real; solve(f, .01, 1, fs); assert.ok(f.parts[1].state.heat > 0); assert.equal(f.parts[1].state.blown, false);
  const before = fs.V, nodeMap = fs.nodes; f.parts[1].params.rating = NaN; fs.dirty = true; // report failure after successful electrical work
  state.nested = { retained: 7, deleted: 8 }; const nested = state.nested;
  const report = TYPES.fuse.report; TYPES.fuse.report = () => { state.injected = 4; delete state.heat; state.nested.retained = -1; state.nested.added = 9; delete state.nested.deleted; throw new Error('report rejected'); };
  try { assert.throws(() => fs.step(f, .01), /report rejected/); } finally { TYPES.fuse.report = report; }
  assert.equal(fs.V, before); assert.equal(fs.nodes, nodeMap); assert.ok(Object.hasOwn(state, 'heat')); assert.equal(Object.hasOwn(state, 'injected'), false); assert.equal(state.nested, nested); assert.deepEqual(nested, { retained: 7, deleted: 8 });
});
console.log(`${groups} independent model/simulation groups passed`);
