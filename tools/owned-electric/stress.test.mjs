import assert from 'node:assert/strict';
import { Resistor, Source, Supply, Diode, Capacitor, Motor, solveStep } from '../../src/lab/owned/electric/solver.js';
let seed = 719003, cases = 0;
const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 2 ** 32; };
const near = (a, b, abs = 1e-8) => assert.ok(Number.isFinite(a) && Math.abs(a - b) <= abs + 1e-6 * Math.abs(b), `${a} != ${b}`);
const solve = (n, els, opts = {}) => { const r = solveStep(n, els, opts); assert.ok(r.converged, JSON.stringify(r)); cases++; return r.V; };

// Manufacture sources from planted node voltages, using Ohm's law only.
// The oracle never calls solveLinear or a hidden implementation.
for (let trial = 0; trial < 60; trial++) {
  const count = 3 + Math.floor(random() * 10), target = Array.from({ length: count }, () => 8 * random() - 4);
  const specifications = [], leaving = Array(count).fill(0);
  const add = (a, b, R) => {
    specifications.push([a, b, R]); const i = (target[a] - (b < 0 ? 0 : target[b])) / R;
    leaving[a] += i; if (b >= 0) leaving[b] -= i;
  };
  for (let a = 0; a < count; a++) {
    add(a, -1, 10 ** (-3 + 12 * random()));
    if (a > 0) add(a, a - 1, 10 ** (-3 + 12 * random()));
    if (a > 1) add(a, Math.floor(random() * (a - 1)), 10 ** (-3 + 12 * random()));
  }
  const els = specifications.map(args => Resistor(...args));
  for (let a = 0; a < count; a++) els.push(Source(a, -1, target[a] + 10 * leaving[a], 10));
  const V = solve(count, els, { V: Array(count).fill(trial % 2 ? 100 : -100) });
  V.forEach((v, i) => near(v, target[i]));
  for (let a = 0; a < count; a++) {
    let sum = 0, magnitude = 0;
    for (const el of els) {
      const i = el.current(V) * (el.kind === 'source' ? -1 : 1);
      if (el.nodes[0] === a) { sum += i; magnitude += Math.abs(i); }
      if (el.nodes[1] === a) { sum -= i; magnitude += Math.abs(i); }
    }
    assert.ok(Math.abs(sum) <= 1e-9 + 1e-7 * magnitude);
  }
}
console.log('PASS 60 deterministic planted-voltage random resistor/source networks with KCL');

for (let trial = 0; trial < 30; trial++) {
  const n = 3 + Math.floor(random() * 7), target = Array.from({ length: n }, () => 6 * random() - 3), specs = [], leaving = Array(n).fill(0);
  for (let a = 1; a < n; a++) {
    const b = Math.floor(random() * a), R = 10 ** (-2 + 7 * random());
    specs.push([a, b, R]); const i = (target[a] - target[b]) / R; leaving[a] += i; leaving[b] -= i;
  }
  const create = () => {
    const els = specs.map(args => Resistor(...args));
    for (let a = 1; a < n; a++) els.push(Source(a, 0, target[a] - target[0] + 5 * leaving[a], 5));
    return els;
  };
  const A = solve(n, create(), { refs: [0] }), B = solve(n, create(), { refs: [n - 1] });
  for (let a = 0; a < n; a++) { near(A[a] - A[0], target[a] - target[0]); near(B[a] - B[0], A[a] - A[0]); }
}
console.log('PASS 30 random floating networks solved at two gauges');

for (const R of [1e-9, 1e-6, .001, 1, 1e6, 1e9, 1e12]) {
  const V = solve(1, [Source(0, -1, 2, R), Resistor(0, -1, R)]); near(V[0], 1, 1e-10);
}
for (const guess of [-1e4, -100, 0, 100, 1e4]) {
  const V = solve(2, [Source(0, -1, 3, 1), Diode(0, -1, 1, { Vf: .72, If: .2, n: 1.8, Rs: .05 })], { V: [guess, guess] });
  near(V[0], .92276413232153, 1e-9);
}
near(solve(1, [Supply(0, -1, 3, 1)])[0], 3);
console.log('PASS 18-order conductance and semiconductor initial-guess stress; open-circuit supply');

// Recreate devices every accepted step; retain only public dynamic state and V.
for (const recreate of [false, true]) {
  const capState = { v: .25 }, motorState = { w: 0, angle: 0 };
  let V = [], expected = .25, cap, motor;
  for (let step = 0; step < 200; step++) {
    if (recreate || !cap) { cap = Capacitor(0, -1, .001, capState); motor = Motor(2, -1, {}, motorState); }
    const els = [cap, Resistor(0, 1, 99), Source(1, -1, 5, 1), motor, Source(2, -1, -3, .02)];
    const old = capState.v;
    V = solve(3, els, { dt: .005, V });
    expected = (expected + .005 * 5 / .1) / (1 + .005 / .1);
    near(capState.v, expected, 1e-11); near(cap.current(V), .001 / .005 * (expected - old), 1e-11);
    assert.ok(motorState.w < 0 && motorState.angle < 0);
  }
}
// Minimal extracted topology from RC preset with an open DPDT switch.
// The resistor/diode anode branch is dangling: its exact zero-current voltage
// equals the cathode. A false finite near-open answer must fail this oracle.
{
  const capState = { v: 0 }, diode = Diode(4, 1, 6, { Vf: 2.1, If: .02, n: 2, Rs: 8 });
  const els = [Supply(0, 1, 6, 2), Resistor(0, 2, 500), Capacitor(3, 1, .0047, capState), Resistor(5, 4, 50), diode, Resistor(3, 1, 15000)];
  for (const guess of [undefined, 0, 100, -100]) {
    const V = solve(7, els, { dt: 1 / 120, ...(guess === undefined ? {} : { V: Array(7).fill(guess) }) });
    near(V[0] - V[1], 6, 1e-10); near(V[3] - V[1], 0, 1e-10);
    near(V[4] - V[1], 0, 1e-10); near(V[5] - V[1], 0, 1e-10); near(V[6] - V[1], 0, 1e-10);
    near(diode.current(V), 0, 1e-20);
    for (const branch of diode._branches(V)) near(branch.i, 0, 1e-20);
  }
}
console.log('PASS extracted open-RC dangling diode voltage, internal junction and zero-current oracle');
console.log(`Owned electric stress: ${cases} solves passed; dynamic fresh construction and persistent instances agree.`);
