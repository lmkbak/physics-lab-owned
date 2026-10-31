import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { TYPES } from '../../src/lab/clbench/parts.js';
import { PRESETS } from '../../src/lab/clbench/presets.js';
import { DEFS } from '../../src/lab/glowbench/items.js';
import { REAGENTS, SPECIES } from '../../src/lab/glowbench/chem.js';
import { DEMOS } from '../../src/lab/glowbench/demo.js';

// A requirements inventory, never an assertion that baseline source/assets are owned.
// Does not decode third-party meshes, inspect texture pixels or copy implementation.
const root = fileURLToPath(new URL('../../', import.meta.url));
const readJson = (p) => JSON.parse(fs.readFileSync(path.join(root, p), 'utf8'));
const catalog = readJson('public/labs/glowbench/catalog.json');
const ownParts = readJson('public/parts/parts.json');
const files = [];
for (const dir of ['src/lab/clbench', 'src/lab/glowbench']) {
  for (const entry of fs.readdirSync(path.join(root, dir), { recursive: true }).sort()) {
    const rel = `${dir}/${entry}`.replaceAll('\\', '/');
    const absolute = path.join(root, rel);
    if (!fs.statSync(absolute).isFile() || !/\.(?:js|jsx|css|html)$/.test(rel)) continue;
    const buf = fs.readFileSync(absolute);
    const text = buf.toString('utf8');
    const exports = [...text.matchAll(/export\s+(?:default\s+)?(?:async\s+)?(?:function|class|const|let)\s+(\w+)/g)].map(m => m[1]);
    for (const block of text.matchAll(/export\s*\{([^}]+)\}/g)) for (const name of block[1].split(',')) exports.push(name.trim().split(/\s+as\s+/).at(-1));
    files.push({ file: rel, bytes: buf.length, sha256: createHash('sha256').update(buf).digest('hex'), exportedNames: exports, ownership: 'unresolved-until-reviewed', replacement: null, verified: false });
  }
}
const groups = (spec) => spec ? { asset: spec.asset, groups: spec.groups, axis: spec.axis ?? spec.groups?.[0], roles: spec.roles ?? {}, rotate: spec.rotate ?? null, zFrom: spec.zFrom ?? null } : null;
const report = {
  schema: 'owned-content-baseline/v1',
  status: 'requirements-only-no-replacement-approved',
  rules: ['Preserve every ID and its user-visible function', 'Preserve terminals, ranges, moving groups, hollow volumes and liquid conservation', 'No production replacement before reviewer pass', 'Hashes identify baseline versions, never prove originality'],
  electric: {
    types: Object.entries(TYPES).map(([id, d]) => ({ id, name: d.name, terminals: d.terms, defaults: d.params, initialState: d.state ?? {}, procedural: !!d.procedural, thumbnail: d.thumb, controls: (d.props ?? []).map(p => ({ key: p.key, type: p.type, min: p.min, max: p.max, step: p.step, unit: p.unit, options: p.options })), verified: false })),
    presets: PRESETS.map(p => ({ id: p.id, title: p.title, tag: p.tag, description: p.desc, parts: p.parts, wires: p.wires, teachingRequirements: p.tips, verified: false }))
  },
  chemistry: {
    equipment: Object.entries(DEFS).map(([id, d]) => ({ id, name: d.name, kind: d.kind, geometry: groups(d.spec), profileGroups: d.profileGroups ?? null, sockets: d.sockets ?? [], flow: d.flow ?? null, heat: !!d.heat, fill: d.fill ?? null, tool: d.tool ?? null, isTube: !!d.isTube, gripY: d.gripY ?? null, procedural: !d.spec, verified: false })),
    reagents: REAGENTS.map(r => ({ id: r.id, name: r.name, formula: r.formula, note: r.note, bottle: r.bottle, amber: !!r.amber, solid: r.solid ?? null, concentration: r.conc ?? null, portion: r.portion ?? null, tint: r.tint ?? null, fun: !!r.fun, verified: false })),
    demos: DEMOS.map(d => ({ id: d.id, title: d.title, description: d.desc, position: d.pos, fun: !!d.fun, observedLiteralDependencies: [...new Set([...String(d.run).matchAll(/['\"]([A-Za-z][A-Za-z0-9_-]+)['\"]/g)].map(m => m[1]).filter(id => id in DEFS || REAGENTS.some(r => r.id === id)))], expectedProducts: null, completionAssertion: null, abortRestorationVerified: false, verified: false })),
    speciesIds: Object.keys(SPECIES),
    catalogType: Array.isArray(catalog) ? 'array' : typeof catalog,
    catalogTopKeys: Array.isArray(catalog) ? null : Object.keys(catalog),
  },
  existingIndependentPartCandidates: ownParts.map(p => ({ ...p, asset: `public/parts/${p.name}.glb`, generatorCandidate: 'tools/cad/build_parts.py', generationChainVerified: false, semanticGroupsVerified: false, cavityOracleVerified: false, independentlyVerifiedForReplacement: false })),
  modules: files,
  interactionGates: ['mouse orbit/zoom/pan', '390x844 and 844x390 true touch rotate/pinch/pan', 'terminal wire start/end/cancel must execute, no skip', 'rheostat drag and switch interaction', 'stopper and pouring', 'all demos completion', 'music pulse drives lighting with music toggle/volume/duck', '10 route cycles+reset+dispose, no monotonic GPU/audio/RAF/listener growth'],
};
report.counts = { electricTypes: report.electric.types.length, electricPresets: report.electric.presets.length, chemistryEquipmentDefs: report.chemistry.equipment.length, reagents: report.chemistry.reagents.length, demos: report.chemistry.demos.length, ownPartCandidates: ownParts.length, sourceModules: files.length };
const target = path.join(root, 'docs/ownership/baseline.json');
fs.mkdirSync(path.dirname(target), { recursive: true });
fs.writeFileSync(target, JSON.stringify(report, null, 2) + '\n', 'utf8');
console.log(JSON.stringify({ target: 'docs/ownership/baseline.json', counts: report.counts }));
