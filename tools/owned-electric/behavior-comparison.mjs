// Observational comparison only: never imports or reads the legacy solver.
// This script is not a formula-generation or parameter-fitting input.
import { readFile, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { Lamp, Motor, Source, solveStep } from '../../src/lab/owned/electric/solver.js';
const baseline = JSON.parse(await readFile(new URL('../../docs/ownership/electric-behavior-baseline.json', import.meta.url), 'utf8'));
const percent = (value, old) => old ? 100 * (value / old - 1) : null;
const lamp = baseline.lamp.map(row => {
  const I = Lamp(0, -1, row.Vr, row.Ir, .18).current([row.U]);
  assert.ok(Math.abs(I - row.I) <= 1e-12 + 1e-10 * Math.abs(row.I), `lead lamp compatibility at ${row.factor} Vr`);
  return { Vr: row.Vr, Ir: row.Ir, factor: row.factor, baselineI: row.I, ownedI: I, differencePct: percent(I, row.I) };
});
const motor = [];
for (const dt of [...new Set(baseline.motor.map(row => row.dt))]) {
  const state = { w: 0, angle: 0, stalled: false }, m = Motor(0, -1, {}, state), s = Source(0, -1, 3, .02);
  let V = [];
  for (let step = 1; step <= 300; step++) {
    const result = solveStep(1, [m, s], { dt, V });
    if (!result.converged) throw Error('owned solve failed'); V = result.V;
    const row = baseline.motor.find(row => row.dt === dt && row.step === step);
    if (row) motor.push({ dt, step, baselineW: row.state.w, ownedW: state.w, speedDifferencePct: percent(state.w, row.state.w), baselineI: row.I, ownedI: m.current(V), currentDifferencePct: percent(m.current(V), row.I), baselineU: row.U, ownedU: V[0], ownedAngle: state.angle });
  }
}
const result = { purpose: 'observation-only-not-algorithm-generation', lamp, motor };
await writeFile(new URL('./behavior-comparison.json', import.meta.url), JSON.stringify(result, null, 2) + '\n');
console.log('Lamp (Vr=2.5V Ir=.3A), normalized current and percent difference:');
for (const row of lamp.filter(row => row.Vr === 2.5)) console.log(`${row.factor}\t${(row.baselineI / .3).toFixed(9)}\t${(row.ownedI / .3).toFixed(9)}\t${row.differencePct?.toFixed(3) ?? 'n/a'}%`);
console.log('Motor dt/step: oldW/ownedW/difference, oldI/ownedI:');
for (const row of motor) console.log(`${row.dt.toFixed(6)}/${row.step}\t${row.baselineW.toFixed(6)}/${row.ownedW.toFixed(6)}/${row.speedDifferencePct.toFixed(3)}%\t${row.baselineI.toFixed(6)}/${row.ownedI.toFixed(6)}`);
