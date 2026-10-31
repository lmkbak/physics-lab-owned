import assert from 'node:assert/strict';
import { GMIN, solveLinear, Resistor, Source, Supply, Diode, Lamp, Capacitor, Motor, solveStep } from '../../src/lab/owned/electric/solver.js';

let count = 0;
const close = (actual, expected, abs = 1e-9, rel = 1e-7) => assert.ok(Number.isFinite(actual) && Math.abs(actual - expected) <= abs + rel * Math.abs(expected), `${actual} != ${expected}`);
const test = (name, fn) => { fn(); console.log(`PASS ${++count}: ${name}`); };
const solve = (n, els, opts = {}) => { const r = solveStep(n, els, opts); assert.ok(r.converged, `not converged: ${JSON.stringify(r)}`); assert.ok(r.V.every(Number.isFinite)); return r.V; };
const kcl = (els, V, node, tolerance = 1e-9) => {
  let sum = 0, total = 0;
  for (const el of els) {
    const i = el.current(V) * (['source', 'supply'].includes(el.kind) ? -1 : 1);
    if (el.nodes[0] === node) { sum += i; total += Math.abs(i); }
    if (el.nodes[1] === node) { sum -= i; total += Math.abs(i); }
  }
  assert.ok(Math.abs(sum) <= tolerance + total * 1e-7, `KCL ${sum}`);
};

test('linear known, immutable, empty and singular', () => {
  const A = [[2, 1], [1, 3]], b = [5, 5], before = JSON.stringify([A, b]);
  const x = solveLinear(A, b); close(x[0], 2); close(x[1], 1); assert.equal(JSON.stringify([A, b]), before);
  assert.deepEqual(solveLinear([], []), []);
  const y = solveLinear([[1, 1], [2, 2]], [1, 2]); close(y[0] + y[1], 1); assert.ok(y.includes(0));
  assert.equal(solveLinear([[1, 1], [2, 2]], [1, 3]), null);
  assert.equal(solveLinear([[0]], [1]), null);
  assert.equal(solveLinear([[1, 0], [0, 0]], [1, 1e-20]), null);
  assert.equal(solveLinear([[NaN]], [1]), null);
});
test('linear row scaling and permutation', () => {
  const A = [[1e-20, 2e-20], [3e20, -4e20]], expected = [1.25, -.75], b = A.map(row => row.reduce((s, v, j) => s + v * expected[j], 0));
  solveLinear(A, b).forEach((v, i) => close(v, expected[i], 1e-12));
  const mixed = solveLinear([[1, -1e-20], [0, 1e-20]], [1, 1e-20]); close(mixed[0], 1); close(mixed[1], 1);
  assert.ok(GMIN > 0 && GMIN < 1e-8);
});
test('DC source/load and reverse source current', () => {
  const s = Source(0, -1, 3, 1), r = Resistor(0, -1, 10), els = [s, r], V = solve(1, els);
  close(V[0], 30 / 11); close(s.current(V), 3 / 11); kcl(els, V, 0);
  assert.ok(s.current([4]) < 0);
});
test('floating, disconnected, self-connected, unused nodes', () => {
  const els = [Source(0, 1, 3, 1), Resistor(0, 1, 10), Source(2, 3, -2, .5), Resistor(2, 3, 4), Resistor(4, 4, 1)];
  const V = solve(6, els, { refs: [1, 3] }); close(V[0] - V[1], 30 / 11); close(V[2] - V[3], -16 / 9); close(V[5], 0);
});
test('supply CV/CC sweep and real short current KCL', () => {
  for (const R of [.001, .5, 2.98 * .5, 2.98 * .99, 2.98 * 1.01, 2.98 * 2, 100]) {
    const s = Supply(0, -1, 3, 1), r = Resistor(0, -1, R), els = [s, r], V = solve(1, els);
    const I = Math.min(3 / (R + .02), 1); close(r.current(V), I); close(V[0], R * I); close(s.current(V), I); kcl(els, V, 0);
    assert.equal(s.mode, I === 1 ? 'CC' : 'CV');
  }
  const off = Supply(0, -1, 3, 0); close(solve(1, [off, Resistor(0, -1, 10)])[0], 0);
});
test('supply absorbs overvoltage on CV line', () => {
  const s = Supply(0, -1, 3, 1); close(s.current([3.1]), -5); close(s.current([6]), -150);
  const other = Source(0, -1, 6, .1), els = [s, other], V = solve(1, els);
  close(V[0], 3.5); close(s.current(V), -25); kcl(els, V, 0); assert.equal(s.mode, 'CV');
});
test('lamp exact curve, nominal, cold slope and symmetry', () => {
  const Vr = 2.5, Ir = .3, c = .18, Rr = Vr / Ir, lamp = Lamp(0, -1, Vr, Ir, c);
  let prior = 0;
  for (const f of [-2, -1, -.5, -.01, 0, .01, .5, 1, 2]) {
    const u = f * Vr, i = lamp.current([u]); close(Rr * (c + (1 - c) * Math.sqrt(Math.abs(u) / Vr)) * i, u);
    close(i, Ir * f / (c + (1 - c) * Math.sqrt(Math.abs(f))));
    const h = 1e-6 * Vr, derivative = (lamp.current([u + h]) - lamp.current([u - h])) / (2 * h);
    if (f !== 0) close(lamp._evaluate([u]).g, derivative, 1e-9, 1e-5);
    close(lamp.current([-u]), -i);
    if (f > 0) { const resistance = u / i; assert.ok(resistance > prior); prior = resistance; }
  }
  close(lamp.current([Vr]), Ir); close(1e-14 / lamp.current([1e-14]), c * Rr, 1e-6);
  close(lamp.current([.01 * Vr]) / Ir, .03816793893129771, 1e-12);
  close(lamp.current([.5 * Vr]) / Ir, .6580440430759857, 1e-12);
  close(lamp._evaluate([0]).g, 1 / (c * Rr), 1e-12);
  const s = Source(0, -1, 3, 1), els = [s, lamp], V = solve(1, els); kcl(els, V, 0);
});
test('diode forward nominal and voltage/current scan', () => {
  for (const params of [{ Vf: .72, If: .2, n: 1.8, Rs: .05 }, { Vf: 1.9, If: .02, n: 2, Rs: 8 }]) {
    const { Vf, If, n, Rs } = params, Is = If / Math.expm1((Vf - If * Rs) / (n * .02585));
    let last = -Infinity;
    for (const E of [-12, -3, -1, 0, .1, .3, .5, Vf, Vf + .1, Vf + 1, 6]) {
      const d = Diode(0, -1, 1, params), s = Source(0, -1, E, .02), els = [s, d], V = solve(2, els);
      const i = d.current(V), junctionI = Is * Math.expm1(V[1] / (n * .02585));
      close(i, junctionI, 1e-10); close(V[0], V[1] + i * Rs); kcl(els, V, 0);
      assert.ok(i >= last - 1e-10); last = i;
      if (E < 0) { assert.ok(i < 0); close(i, -Is, 1e-10, 0); assert.ok(Math.abs(i) <= Math.max(1e-8, 1.01 * Is)); assert.ok(Math.abs(i) < 1e-6); }
    }
    const d = Diode(0, -1, 1, params); const V = solve(2, [d, Source(0, -1, Vf + .02 * If, .02)]); close(d.current(V), If, 1e-10);
    for (const R of [1, 10, 1000]) {
      const d = Diode(1, -1, 2, params), s = Source(0, -1, 5, .02), r = Resistor(0, 1, R), els = [s, r, d], V = solve(3, els);
      kcl(els, V, 0); kcl(els, V, 1); close(d.current(V), r.current(V), 1e-10);
    }
  }
});
test('diode avalanche finite and monotone', () => {
  let last = 0;
  for (const E of [-1, -2, -2.2, -3, -5]) {
    const d = Diode(0, -1, 1, { Vf: .7, If: .01, Bv: 2, Rs: 1 }), s = Source(0, -1, E, 10), V = solve(2, [s, d]);
    assert.ok(d.current(V) <= last + 1e-10); last = d.current(V);
  }
});
test('RC discrete history, postcommit current and discharge', () => {
  const state = { v: 1.25 }, C = .001, R = 100, dt = .01, cap = Capacitor(0, -1, C, state);
  let expected = state.v;
  for (const E of [5, 5, 5, 0, 0, 0]) {
    const old = state.v, s = Source(1, -1, E, 1), r = Resistor(1, 0, R - 1), els = [cap, s, r];
    expected = (expected + dt * E / (R * C)) / (1 + dt / (R * C));
    const V = solve(2, els, { dt, V: [999, -999] }); close(state.v, expected); close(cap.current(V), C / dt * (expected - old), 1e-11); kcl(els, V, 0);
  }
});
test('RC analytic time constant and first-order dt convergence', () => {
  const errors = [];
  for (const steps of [10, 20, 40]) {
    const state = { v: 1.25 }, cap = Capacitor(0, -1, .001, state), els = [cap, Resistor(0, 1, 99), Source(1, -1, 5, 1)];
    let V = [];
    for (let i = 0; i < steps; i++) V = solve(2, els, { dt: .1 / steps, V });
    errors.push(Math.abs(state.v - (5 + (1.25 - 5) / Math.E)));
  }
  for (let i = 0; i < 2; i++) assert.ok(errors[i] / errors[i + 1] > 1.7 && errors[i] / errors[i + 1] < 2.3);
});
test('pF isolated hold, floating gauge, changing C charge boundary', () => {
  for (const grounded of [true, false]) {
    const state = { v: 3.25 }, C = 2.49e-12, cap = Capacitor(0, grounded ? -1 : 1, C, state), n = grounded ? 1 : 2;
    for (let step = 0; step < 100; step++) {
      const V = solve(n, [cap], { dt: 1 / 60, V: [-99, 99] }); close(state.v, 3.25, 1e-10, 0); close(cap.current(V), 0, 1e-22, 0);
    }
    const Q = C * state.v; state.v *= C / (C / 2);
    solve(n, [Capacitor(0, grounded ? -1 : 1, C / 2, state)]); close(C / 2 * state.v, Q, 1e-22, 0);
  }
});
test('dt=0 capacitor exact hold and constraint current', () => {
  const state = { v: 2 }, cap = Capacitor(0, -1, .001, state), V = solve(1, [cap, Resistor(0, -1, 10)], { dt: 0 });
  close(V[0], 2); close(cap.current(V), -.2); close(state.v, 2);
  close(solve(1, [Capacitor(0, -1, .001, { v: 3 })], { dt: 0 })[0], 3);
});
test('inconsistent frozen caps fail finite and no dynamic commit', () => {
  const a = { v: 1 }, b = { v: 2 }, m = { w: 4, angle: 7 }, before = JSON.stringify([a, b, m]);
  const r = solveStep(1, [Capacitor(0, -1, 1e-3, a), Capacitor(0, -1, 1e-3, b), Motor(0, -1, {}, m)], { dt: 0 });
  assert.equal(r.converged, false); assert.ok(r.V.every(Number.isFinite)); assert.equal(JSON.stringify([a, b, m]), before);
});
test('motor first implicit step, polarity, angle and breakaway', () => {
  for (const E of [3, -3, .3, -.3]) {
    const state = { w: 0, angle: .5 }, dt = .01, motor = Motor(0, -1, {}, state), s = Source(0, -1, E, .02), V = solve(1, [motor, s], { dt });
    const drive = .01 * V[0] / 3;
    const expected = Math.sign(drive) * Math.max(0, Math.abs(drive) - .002) / (2e-5 / dt + 2e-6 + .01 ** 2 / 3);
    close(state.w, expected); close(state.angle, .5 + dt * expected); close(motor.current(V), (V[0] - .01 * expected) / 3);
  }
});
test('motor steady forward/reverse, stalled current and braking', () => {
  for (const E of [3, -3]) {
    const state = { w: 0, angle: 0 }, motor = Motor(0, -1, {}, state), s = Source(0, -1, E, .02), els = [motor, s];
    let V = [];
    for (let j = 0; j < 2000; j++) V = solve(1, els, { dt: .01, V });
    const expectedW = (.01 * E - Math.sign(E) * .002 * 3.02) / (.01 ** 2 + 2e-6 * 3.02);
    close(state.w, expectedW, 1e-7); close(.01 * motor.current(V), 2e-6 * state.w + .002 * Math.sign(state.w));
    state.stalled = true; V = solve(1, els, { dt: .01, V }); close(state.w, 0); close(motor.current(V), V[0] / 3); close(.01 * motor.current(V), .01 * E / 3.02);
    state.stalled = false; state.w = Math.sign(E) * 100; const before = Math.abs(state.w);
    solve(1, [motor, Resistor(0, -1, .1)], { dt: .01 }); assert.ok(Math.abs(state.w) < before);
  }
});
test('positive-time Newton failure does not commit capacitor or motor', () => {
  const state = { v: 2 }, rotor = { w: 12, angle: .3 }, cap = Capacitor(0, -1, .001, state), motor = Motor(0, -1, {}, rotor);
  const invalidFixture = { nodes: [0, -1], kind: 'test-contradiction', _evaluate: () => ({ i: NaN, g: NaN }) };
  const before = JSON.stringify([state, rotor]);
  const result = solveStep(1, [cap, motor, invalidFixture], { dt: .01 });
  assert.equal(result.converged, false); assert.ok(result.V.every(Number.isFinite)); assert.equal(JSON.stringify([state, rotor]), before);
});
test('motor changes direction after reversed drive and frozen step stays finite', () => {
  const state = { w: 100, angle: 2 }, motor = Motor(0, -1, {}, state), s = Source(0, -1, -3, .02);
  const before = { ...state }; const frozenV = solve(1, [motor, s], { dt: 0 });
  assert.deepEqual(state, before); close(motor.current(frozenV), (frozenV[0] - .01 * 100) / 3);
  let V = frozenV;
  for (let i = 0; i < 1000; i++) V = solve(1, [motor, s], { dt: .01, V });
  assert.ok(state.w < -100); assert.ok(motor.current(V) < 0);
});
test('synthetic net.add retains device for report and initial V stays immutable', () => {
  const net = { elements: [], add(el) { this.elements.push(el); return el; } };
  const p = { el: net.add(Resistor(0, -1, 10)) }; net.add(Source(0, -1, 3, 1));
  const initial = [99]; net.V = solve(1, net.elements, { V: initial }); close(p.el.current(net.V), 3 / 11); assert.deepEqual(initial, [99]);
});
console.log(`Owned electric kernel: ${count} independent test groups passed.`);
