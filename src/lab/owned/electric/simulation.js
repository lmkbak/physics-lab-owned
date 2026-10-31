// Independent network assembly and atomic frame publication; no UI dependencies.
import { Resistor, solveStep } from './solver.js';
import { TYPES } from './models.js';
const clone = value => structuredClone(value);
const restoreKeys = (object, saved) => {
  for (const key of Reflect.ownKeys(object)) if (!Object.hasOwn(saved, key)) delete object[key];
  Object.defineProperties(object, saved);
};
function frameSnapshot(sim, model) {
  const entries = [], seen = new Set();
  const save = object => { if (!object || seen.has(object)) return; seen.add(object); entries.push([object, Object.getOwnPropertyDescriptors(object)]); };
  const state = object => { if (!object || typeof object !== 'object' || seen.has(object)) return; save(object); for (const v of Object.values(object)) state(v); };
  save(sim);
  for (const p of model.parts) { save(p); state(p.state); state(p.params); for (const el of p.els ?? []) save(el); if (p.el) save(p.el); }
  for (const w of model.wires) { save(w); if (w.el) save(w.el); }
  for (const el of sim.elements ?? []) save(el);
  return () => { for (let i = entries.length - 1; i >= 0; i--) restoreKeys(...entries[i]); };
}
export class Simulation {
  constructor() {
    this.dirty = true; this.V = []; this.time = 0; this.warnings = []; this.lastIterations = 0;
    this.nodes = new Map(); this.elements = []; this.refs = []; this._caps = new Map(); this._model = null;
    this._solve = solveStep;
  }
  node(key) {
    if (!this.nodes.has(key)) this.nodes.set(key, this.nodes.size);
    return this.nodes.get(key);
  }
  internal(id, name) { return this.node(`@${id}:${name}`); }
  add(element) { this.elements.push(element); return element; }
  used(id, terminal) { return this._used.has(`${id}:${terminal}`); }
  potential(key) { return this.V[this.nodes.get(key)] ?? 0; }
  voltage(a, b) { return this.potential(a) - this.potential(b); }
  invalidate() { this.dirty = true; }
  conserve(p, C) {
    const old = this._caps.get(p.id);
    // An explicit user edit of history voltage (including bench's own Q/C update)
    // takes precedence. Only an untouched accepted voltage is rescaled here.
    if (old && old.state === p.state && C !== old.C && p.state.v === old.v) p.state.v *= old.C / C;
  }
  _rememberCaps(model) {
    this._caps = new Map(model.parts.filter(p => p.type === 'capacitor' || p.type === 'elcap').map(p => [p.id, { C: p.el.C, v: p.state.v, state: p.state }]));
  }
  build(model) {
    const undo = frameSnapshot(this, model);
    try { this._build(model); return this; } catch (error) { undo(); throw error; }
  }
  _build(model) {
    const previous = new Map([...this.nodes].map(([key, i]) => [key, this.V[i]]));
    const hadFrame = this._model !== null;
    this.nodes = new Map(); this.elements = []; this.refs = []; this._used = new Set(); this._model = model;
    const ids = new Set();
    for (const p of model.parts) {
      if (!TYPES[p.type]) throw new RangeError(`Unknown electric type: ${p.type}`);
      if (typeof p.id !== 'string' || ids.has(p.id)) throw new RangeError('Part IDs must be unique strings');
      ids.add(p.id); const def = TYPES[p.type];
      p.params ??= clone(def.params); p.state ??= clone(def.state);
      for (const [key, value] of Object.entries(def.params)) if (!Object.hasOwn(p.params, key)) p.params[key] = clone(value);
      for (const [key, value] of Object.entries(def.state)) if (!Object.hasOwn(p.state, key)) p.state[key] = clone(value);
      for (const key of Object.keys(def.terms)) this.node(`${p.id}:${key}`);
    }
    for (const w of model.wires) for (const end of [w.a, w.b]) {
      if (!ids.has(end.p) || !TYPES[model.parts.find(p => p.id === end.p).type].terms[end.t]) throw new RangeError('Wire terminal does not exist');
      this._used.add(`${end.p}:${end.t}`);
    }
    for (const p of model.parts) TYPES[p.type].build(p, this);
    for (const w of model.wires) w.el = this.add(Resistor(this.node(`${w.a.p}:${w.a.t}`), this.node(`${w.b.p}:${w.b.t}`), .01));
    const parent = Array.from({ length: this.nodes.size }, (_, i) => i);
    const root = i => { while (parent[i] !== i) i = parent[i]; return i; };
    for (const el of this.elements) for (const b of el.nodes.slice(1)) parent[root(b)] = root(el.nodes[0]);
    const chosen = new Map();
    for (const p of model.parts) if (p.type === 'battery' || p.type === 'dcsupply') {
      const minus = this.nodes.get(`${p.id}:-`), r = root(minus); if (!chosen.has(r)) chosen.set(r, minus);
    }
    for (let i = 0; i < parent.length; i++) if (!chosen.has(root(i))) chosen.set(root(i), i);
    this.refs = [...chosen.values()];
    this.V = hadFrame ? [...this.nodes.keys()].map(key => previous.get(key) ?? 0) : [];
    this.dirty = false;
  }
  report(model, dt = 0) {
    const warnings = [];
    for (const p of model.parts) {
      p.live = TYPES[p.type].report(p, this, dt);
      for (const warning of p.live.warn) warnings.push({ ...warning, part: p.id });
    }
    for (const w of model.wires) w.I = w.el.current(this.V);
    this.warnings = warnings;
    return warnings;
  }
  step(model, dt, substeps = 4) {
    if (!Number.isFinite(dt) || dt < 0 || !Number.isInteger(substeps) || substeps < 1) throw new RangeError('Invalid simulation interval');
    const undo = frameSnapshot(this, model);
    let iterations = 0;
    try {
      if (this.dirty || this._model !== model) this._build(model);
      // Bound dynamic integration error while honoring requests for finer stepping.
      const count = dt === 0 ? 1 : Math.max(substeps, Math.ceil(dt * 240));
      const h = dt / count;
      for (let i = 0; i < count; i++) {
        const result = this._solve(this.nodes.size, this.elements, { dt: h, V: this.V, refs: this.refs });
        iterations += result.iterations;
        if (!result.converged || result.V.some(v => !Number.isFinite(v))) { undo(); return { converged: false, iterations, reason: 'solve-rejected' }; }
        this.V = result.V; this.report(model, h);
        if (this.dirty) {
          // A blown fuse or burnt emitter must publish its open-circuit current now.
          this._build(model);
          const refresh = this._solve(this.nodes.size, this.elements, { dt: 0, V: this.V, refs: this.refs });
          iterations += refresh.iterations;
          if (!refresh.converged || refresh.V.some(v => !Number.isFinite(v))) { undo(); return { converged: false, iterations, reason: 'protection-refresh-rejected' }; }
          this.V = refresh.V; this.report(model, 0);
        }
        this._rememberCaps(model);
      }
      this.time += dt; this.lastIterations = iterations;
      return { converged: true, iterations, V: this.V };
    } catch (error) { undo(); throw error; }
  }
}
