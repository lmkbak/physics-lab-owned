import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { solveStep } from '../../src/lab/owned/electric/solver.js';

// Read only the public construction/report module. Replace its one import in memory.
// No legacy solver is loaded, parsed, evaluated, or read. Production files stay untouched.
const path = resolve('src/lab/clbench/parts.js');
const source = await readFile(path, 'utf8');
const expected = "import { Resistor, Source, Supply, Diode, Lamp, Capacitor, Motor } from './solver.js';";
assert.equal(source.split(expected).length, 2, 'public import must be uniquely recognizable');
const ownedImport = pathToFileURL(resolve('src/lab/owned/electric/solver.js')).href;
const isolated = source.replace(expected, `import { Resistor, Source, Supply, Diode, Lamp, Capacitor, Motor } from '${ownedImport}';`);
const { TYPES } = await import(`data:text/javascript;base64,${Buffer.from(isolated).toString('base64')}`);
const { PRESETS } = await import('../../src/lab/clbench/presets.js');
const clone = object => structuredClone(object);
let runs = 0, reports = 0;

function run(data, variant = 'default', steps = 1) {
  const parts = data.parts.map(p => ({ ...clone(p), label: p.id, params: { ...clone(TYPES[p.type].params ?? {}), ...clone(p.params ?? {}) }, state: clone(TYPES[p.type].state ?? {}), events: [] }));
  if (variant !== 'default') for (const p of parts) {
    if (p.type === 'switch') p.params.closed = true;
    if (p.type === 'dpdt') p.params.pos = variant;
  }
  const parent = new Map(), used = new Set();
  const find = key => { if (!parent.has(key)) parent.set(key, key); if (parent.get(key) !== key) parent.set(key, find(parent.get(key))); return parent.get(key); };
  for (const p of parts) for (const term of Object.keys(TYPES[p.type].terms)) find(`${p.id}:${term}`);
  for (const wire of data.wires) { parent.set(find(wire.a), find(wire.b)); used.add(wire.a); used.add(wire.b); }
  const ids = new Map();
  const node = key => { const root = find(key); if (!ids.has(root)) ids.set(root, ids.size); return ids.get(root); };
  for (const key of parent.keys()) node(key);
  const baseNodes = ids.size;
  let V = [];
  for (let step = 0; step < steps; step++) {
    let n = baseNodes; const elements = [], nets = new Map();
    for (const p of parts) {
      const net = {
        t: term => node(`${p.id}:${term}`), inner: () => n++, add: el => { elements.push(el); return el; },
        used: term => used.has(`${p.id}:${term}`),
        u: (a, b) => (V[node(`${p.id}:${a}`)] ?? 0) - (V[node(`${p.id}:${b}`)] ?? 0),
        get V() { return V; },
      };
      nets.set(p, net); TYPES[p.type].build(net, p);
    }
    const result = solveStep(n, elements, { dt: 1 / 120, V });
    assert.ok(result.converged, `${data.id}/${variant}/step${step}: ${JSON.stringify(result)}; devices=${JSON.stringify(elements.map(el => ({ kind: el.kind, nodes: el.nodes, branches: el._branches?.(result.V) })))}`); V = result.V;
    assert.ok(V.every(Number.isFinite));
    for (const p of parts) {
      const report = TYPES[p.type].report(p, nets.get(p), 1 / 120);
      for (const [key, value] of Object.entries(report)) if (typeof value === 'number') assert.ok(Number.isFinite(value), `${p.type}.${key}`);
      reports++;
    }
    const residual = Array(n).fill(0), magnitude = Array(n).fill(0);
    for (const el of elements) {
      const branches = el._branches ? el._branches(V) : [{ a: el.nodes[0], b: el.nodes[1], i: el.current(V) * (['source', 'supply'].includes(el.kind) ? -1 : 1) }];
      for (const { a, b, i } of branches) {
        assert.ok(Number.isFinite(i));
        if (a >= 0) { residual[a] += i; magnitude[a] += Math.abs(i); }
        if (b >= 0) { residual[b] -= i; magnitude[b] += Math.abs(i); }
      }
    }
    residual.forEach((r, i) => assert.ok(Math.abs(r) <= 1e-9 + 1e-7 * magnitude[i], `${data.id}/${variant}/KCL node${i}=${r}`));
  }
  runs++;
}
for (const type of Object.keys(TYPES)) run({ id: type, parts: [{ id: 'X', type }], wires: [] });
console.log(`PASS all ${Object.keys(TYPES).length} public part types construct, solve, and report in isolation`);
for (const preset of PRESETS) for (const variant of ['default', 'A', 'B', 'off']) run(preset, variant, ['rc', 'motor', 'plate'].includes(preset.id) ? 120 : 3);
console.log(`PASS all ${PRESETS.length} actual presets across default/A/B/off switch variants`);
console.log(`Owned parts compatibility: ${runs} fixture runs, ${reports} fresh-build part reports passed.`);
