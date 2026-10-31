import assert from 'node:assert/strict';
import { createCavityProfile } from '../../src/lab/owned/cad/profile.js';
const near = (actual, expected, abs = 1e-10) => assert.ok(Math.abs(actual - expected) <= abs + Math.abs(expected) * 1e-10, `${actual} != ${expected}`);
let checks = 0;
function sweep(profile, bottom, top, volumeOracle) {
  for (let i = 0; i <= 100; i++) {
    const z = bottom + (top - bottom) * i / 100;
    const expected = volumeOracle(z);
    near(profile.volumeAt(z / 1000), expected);
    near(profile.levelFor(expected), z / 1000, 1e-9);
    checks++;
  }
}
const cylinder = createCavityProfile({ type: 'piecewise-linear-radius', inner: [[3, 25], [75, 25]], nominalMl: 100 });
sweep(cylinder, 3, 75, z => Math.PI * 25 * 25 * (z - 3) / 1000);
near(cylinder.levelFor(100), (3 + 100000 / (Math.PI * 625)) / 1000);
near(cylinder.radiusAt(.05), .025);
near(cylinder.capacity, cylinder.fullCapacity * .9);
assert.notEqual(cylinder.capacity, cylinder.nominalMl);
const cone = createCavityProfile({ type: 'piecewise-linear-radius', inner: [[2, 5], [102, 35]] }, { fill: 1 });
sweep(cone, 2, 102, z => { const h = z - 2, r = 5 + .3 * h; return Math.PI * h * (25 + 5 * r + r * r) / 3000; });
const radius = 6.8;
const tube = createCavityProfile({ type: 'analytic-radius-segments', segments: [
  { kind: 'sphere', z0: 1.2, z1: 8, centerZ: 8, radius },
  { kind: 'linear', z0: 8, z1: 150, r0: radius, r1: radius },
] });
sweep(tube, 1.2, 150, z => {
  if (z <= 8) { const h = z - 1.2; return Math.PI * h * h * (radius - h / 3) / 1000; }
  return (2 / 3 * Math.PI * radius ** 3 + Math.PI * radius ** 2 * (z - 8)) / 1000;
});
for (let i = 1; i < tube.pts.length && tube.pts[i][0] <= .008; i++) {
  const a = tube.pts[i - 1], b = tube.pts[i];
  const midZ = (a[0] + b[0]) * 500, midR = (a[1] + b[1]) * 500;
  const distance = Math.hypot(midZ - 8, midR);
  assert.ok(radius - distance <= .02000001, 'sphere display chord error exceeds 0.02mm');
}
const mixed = createCavityProfile({ type: 'piecewise-linear-radius', inner: [[3, 25], [60, 25], [82, 9], [103, 9]] });
for (const point of mixed.pts) near(mixed.levelFor(mixed.volumeAt(point[0])), point[0], 1e-9);
assert.equal(cylinder.levelFor(-1), cylinder.bottom);
assert.equal(cylinder.levelFor(1e9), cylinder.rim);
for (const invalid of [NaN, Infinity, -Infinity]) {
  assert.throws(() => cylinder.levelFor(invalid));
  assert.throws(() => cylinder.volumeAt(invalid));
  assert.throws(() => cylinder.radiusAt(invalid));
}
for (const inner of [[], [[1, 1]], [[2, 5], [1, 4]], [[0, -1], [1, 1]], [[0, 0], [1, 0]], [[0, NaN], [1, 1]]]) assert.throws(() => createCavityProfile({ type: 'piecewise-linear-radius', inner }));
assert.throws(() => createCavityProfile({ type: 'piecewise-linear-radius', inner: [[0, 1], [1, 1]], nominalMl: 100 }));
assert.throws(() => createCavityProfile({ type: 'analytic-radius-segments', segments: [
  { kind: 'linear', z0: 0, z1: 1, r0: 1, r1: 1 },
  { kind: 'linear', z0: 2, z1: 3, r0: 1, r1: 1 },
] }));
assert.throws(() => createCavityProfile({ type: 'piecewise-linear-radius', inner: [[0, 1], [1, 0], [2, 0], [3, 1]] }));
assert.throws(() => createCavityProfile({ type: 'piecewise-linear-radius', inner: [[0, 1], [1, 0], [2, 1]] }));
for (const h of [0.001, 0.000001]) {
  const z0 = -1000, z1 = z0 + h, actualH = z1 - z0;
  const pole = createCavityProfile({ type: 'analytic-radius-segments', segments: [{ kind: 'sphere', z0, z1, centerZ: 0, radius: 1000 }] });
  near(pole.fullCapacity, Math.PI * actualH * actualH * (1000 - actualH / 3) / 1000, 1e-18);
  assert.ok(pole.radiusAt(pole.rim) > 0);
  near(pole.levelFor(pole.fullCapacity / 2), pole.bottom + actualH / 1000 / Math.sqrt(2), 1e-9);
}
for (const [z0, z1] of [[-5, 5], [0, 10], [-10, 0]]) {
  const sphere = createCavityProfile({ type: 'analytic-radius-segments', segments: [{ kind: 'sphere', z0, z1, centerZ: 0, radius: 10 }] });
  sweep(sphere, z0, z1, z => Math.PI * (100 * (z - z0) - (z ** 3 - z0 ** 3) / 3) / 1000);
}
const spoutSpec = { type: 'piecewise-linear-radius', inner: [[3, 25], [66, 25], [75, 25]], nominalMl: 100, analytic: { type: 'cylinder-with-polar-spout', radius_mm: 25, bottom_mm: 3, spoutStart_mm: 66, rim_mm: 75, reach_mm: 7, halfAngle_rad: 24 * Math.PI / 180 } };
const spout = createCavityProfile(spoutSpec);
// Independent midpoint angular integration of actual polar section, then Simpson in height.
const section = z => { const n = 4096, da = 2 * Math.PI / n; let sum = 0; for (let i = 0; i < n; i++) { const theta = -Math.PI + (i + .5) * da; const r = spout.radiusAt(z / 1000, theta) * 1000; sum += .5 * r * r * da; } return sum; };
for (let i = 0; i <= 20; i++) {
  const z = 66 + 9 * i / 20, h = z - 66;
  const extra = h / 6 * (section(66) + 4 * section(66 + h / 2) + section(z));
  near(spout.volumeAt(z / 1000), (Math.PI * 625 * 63 + extra) / 1000, 1e-8);
  near(spout.levelFor(spout.volumeAt(z / 1000)), z / 1000, 1e-9);
}
near(spout.radiusAt(.075, 0), .032);
near(spout.radiusAt(.075, Math.PI), .025);
assert.ok(spout.fullCapacity > cylinder.fullCapacity);
console.log(JSON.stringify({ pass: true, analyticHeightCases: checks, cylinder100MlHeightM: cylinder.levelFor(100), tubeFullCapacityMl: tube.fullCapacity, source: 'independent analytic cylinder/frustum/spherical-cap oracles', productionIntegrated: false }));
