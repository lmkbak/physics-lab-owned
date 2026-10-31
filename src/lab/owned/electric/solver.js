// Independent teaching-circuit kernel. Derivation and API: docs/ownership/electric-kernel.md.
export const GMIN = 1e-12;
const VT = 0.02585;
const finite = Number.isFinite;
const voltage = (V, node) => node < 0 ? 0 : (V[node] ?? 0);
const drop = (V, a, b) => voltage(V, a) - voltage(V, b);
const positive = (x, name) => { if (!finite(x) || x <= 0) throw new RangeError(`${name} must be positive`); return x; };
const real = (x, name) => { if (!finite(x)) throw new RangeError(`${name} must be finite`); return x; };

// Complete pivoting after independent row equilibration. No caller storage is changed.
export function solveLinear(A, b) {
  const n = A.length;
  if (b.length !== n || A.some(row => row.length !== n)) throw new RangeError('square matrix required');
  if (!n) return [];
  if (b.some(x => !finite(x)) || A.some(row => Array.from(row).some(x => !finite(x)))) return null;
  const M = A.map((row, i) => {
    const s = Math.max(...Array.from(row, Math.abs));
    return [...Array.from(row, x => s ? x / s : x), s ? b[i] / s : b[i]];
  });
  const columnScale = Array.from({ length: n }, (_, j) => Math.max(...M.map(row => Math.abs(row[j]))));
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) if (columnScale[j]) M[i][j] /= columnScale[j];
  const perm = Array.from({ length: n }, (_, i) => i);
  const tolerance = 8 * Number.EPSILON * Math.max(1, n);
  let rank = n;
  for (let k = 0; k < n; k++) {
    let largest = 0, pr = k, pc = k;
    for (let i = k; i < n; i++) for (let j = k; j < n; j++) {
      if (Math.abs(M[i][j]) > largest) { largest = Math.abs(M[i][j]); pr = i; pc = j; }
    }
    if (largest <= tolerance) { rank = k; break; }
    [M[k], M[pr]] = [M[pr], M[k]];
    for (let i = 0; i < n; i++) [M[i][k], M[i][pc]] = [M[i][pc], M[i][k]];
    [perm[k], perm[pc]] = [perm[pc], perm[k]];
    for (let i = k + 1; i < n; i++) {
      const multiplier = M[i][k] / M[k][k]; M[i][k] = 0;
      for (let j = k + 1; j <= n; j++) M[i][j] -= multiplier * M[k][j];
    }
  }
  for (let i = rank; i < n; i++) {
    if (Math.abs(M[i][n]) > tolerance * Math.max(1, ...M.map(row => Math.abs(row[n])))) return null;
  }
  const y = Array(n).fill(0), x = Array(n).fill(0);
  for (let i = rank - 1; i >= 0; i--) {
    let r = M[i][n];
    for (let j = i + 1; j < rank; j++) r -= M[i][j] * y[j];
    y[i] = r / M[i][i];
  }
  for (let i = 0; i < n; i++) x[perm[i]] = columnScale[perm[i]] ? y[i] / columnScale[perm[i]] : 0;
  if (x.some(v => !finite(v))) return null;
  // Verify against the original equations, including rows classified as redundant.
  for (let i = 0; i < n; i++) {
    const residual = A[i].reduce((s, a, j) => s + a * x[j], -b[i]);
    const scale = Math.abs(b[i]) + A[i].reduce((s, a) => s + Math.abs(a), 0) * Math.max(...x.map(Math.abs));
    if (!finite(residual) || Math.abs(residual) > 1e-10 * Math.max(Number.MIN_VALUE, scale)) return null;
  }
  return x;
}

function element(kind, nodes, evaluate, currentSign = 1) {
  if (nodes.some(n => !Number.isInteger(n))) throw new RangeError('integer nodes required');
  return { kind, nodes, _evaluate: evaluate,
    current(V) { return currentSign * this._evaluate(V, this._lastContext ?? this._context?.(0) ?? { dt: 0 }).i; } };
}

export function Resistor(a, b, R) {
  positive(R, 'R');
  return element('resistor', [a, b], V => ({ i: drop(V, a, b) / R, g: 1 / R }));
}
export function Source(p, n, E, r) {
  real(E, 'E'); positive(r, 'r');
  const el = element('source', [p, n], V => ({ i: (drop(V, p, n) - E) / r, g: 1 / r }), -1);
  el._initialEdges = () => [[p, n, E]];
  return el;
}
export function Supply(p, n, Vset, Ilim, r = .02) {
  real(Vset, 'Vset'); positive(r, 'r');
  if (!finite(Ilim) || Ilim < 0) throw new RangeError('Ilim must be nonnegative');
  const el = element('supply', [p, n], V => {
    const demand = (Vset - drop(V, p, n)) / r;
    return { i: -Math.min(demand, Ilim), g: demand >= Ilim ? 0 : 1 / r };
  }, -1);
  el._initialEdges = () => [[p, n, Vset]];
  el.mode = 'CV';
  el._seed = (V, pinned) => {
    if ((Vset - drop(V, p, n)) / r >= Ilim) {
      if (p >= 0 && !pinned.has(p)) V[p] = voltage(V, n) + Vset;
      else if (n >= 0 && !pinned.has(n)) V[n] = voltage(V, p) - Vset;
    }
  };
  el._accept = V => { el.mode = (Vset - drop(V, p, n)) / r >= Ilim - 1e-10 ? 'CC' : 'CV'; };
  return el;
}

// Continuous exponential tail: exact Shockley relation throughout the physical range.
function expTail(x) {
  if (x <= 60) { const e = Math.exp(x); return [e, e]; }
  const e = Math.exp(60); return [e * (1 + x - 60), e];
}
export function Diode(a, k, m, { Vf, If, n = 2, Rs = 1, Bv = 1e9 }) {
  positive(Vf, 'Vf'); positive(If, 'If'); positive(n, 'n'); positive(Rs, 'Rs'); positive(Bv, 'Bv');
  const nv = n * VT, uj = Vf - If * Rs;
  positive(uj, 'Vf-If*Rs');
  const Is = If / Math.expm1(uj / nv);
  const junction = u => {
    const [ef, df] = expTail(u / nv);
    // Reverse avalanche offset keeps the reverse law exactly zero at u=0.
    const base = Math.exp(-Bv / nv);
    const [er, dr] = expTail((-u - Bv) / nv);
    return { i: Is * (ef - 1) - If * (er - base), g: (Is * df + If * dr) / nv };
  };
  const el = element('diode', [a, k, m], V => ({ i: drop(V, a, m) / Rs, g: 1 / Rs }));
  // Junction evaluation retains sub-ulp reverse leakage that terminal subtraction loses.
  el.current = V => junction(drop(V, m, k)).i;
  // Only initialize the internal junction guess; accepted voltages remain unconstrained.
  el._seed = V => { if (m >= 0 && m !== a && m !== k) V[m] = voltage(V, k) + Math.max(-Bv, Math.min(uj + 4 * nv, drop(V, m, k))); };
  el._branches = V => [
    { a, b: m, i: drop(V, a, m) / Rs, g: 1 / Rs },
    { a: m, b: k, ...junction(drop(V, m, k)) },
  ];
  return el;
}
export function Lamp(a, b, Vr, Ir, c = .18) {
  positive(Vr, 'Vr'); positive(Ir, 'Ir');
  if (!finite(c) || c <= 0 || c > 1) throw new RangeError('c must be in (0,1]');
  const Rr = Vr / Ir;
  // Lead-specified teaching characteristic from public API observations.
  // For t=sqrt(|u|/Vr), d[u/(c+(1-c)t)]/du=(c+(1-c)t/2)/(c+(1-c)t)^2.
  return element('lamp', [a, b], V => {
    const u = drop(V, a, b), t = Math.sqrt(Math.abs(u) / Vr);
    const denominator = c + (1 - c) * t;
    return { i: u / (Rr * denominator), g: (c + .5 * (1 - c) * t) / (Rr * denominator * denominator) };
  });
}
export function Capacitor(a, b, C, state = { v: 0 }) {
  positive(C, 'C'); real(state.v ?? 0, 'state.v');
  const el = element('capacitor', [a, b], (V, ctx) => {
    if (ctx.dt > 0) return { i: C / ctx.dt * (drop(V, a, b) - ctx.history), g: C / ctx.dt };
    return { i: ctx.current ?? 0, g: 0 };
  });
  el.state = state; el.C = C;
  el._initialEdges = () => [[a, b, state.v ?? 0]];
  el._context = dt => ({ dt, history: state.v ?? 0 });
  el._accept = (V, ctx) => { if (ctx.dt > 0) state.v = drop(V, a, b); };
  return el;
}
const soft = (x, threshold) => Math.sign(x) * Math.max(0, Math.abs(x) - threshold);
export function Motor(a, b, { Ra = 3, k = .01, J = 2e-5, damp = 2e-6, Tf = .002 } = {}, state = { w: 0, stalled: false, angle: 0 }) {
  positive(Ra, 'Ra'); positive(J, 'J'); real(k, 'k');
  if (![damp, Tf].every(x => finite(x) && x >= 0)) throw new RangeError('nonnegative friction required');
  const mechanics = (u, ctx) => {
    if (ctx.stalled) return { w: 0, dw: 0 };
    if (ctx.dt <= 0) return { w: ctx.history, dw: 0 };
    const den = J / ctx.dt + damp + k * k / Ra;
    const drive = J / ctx.dt * ctx.history + k * u / Ra;
    return { w: soft(drive, Tf) / den, dw: Math.abs(drive) > Tf ? k / Ra / den : 0 };
  };
  const el = element('motor', [a, b], (V, ctx) => {
    const u = drop(V, a, b), { w, dw } = mechanics(u, ctx);
    return { i: (u - k * w) / Ra, g: (1 - k * dw) / Ra };
  });
  el.state = state;
  el._context = dt => ({ dt, history: finite(state.w) ? state.w : 0, stalled: !!state.stalled });
  el._accept = (V, ctx) => {
    if (ctx.dt > 0) {
      state.w = mechanics(drop(V, a, b), ctx).w;
      state.angle = (finite(state.angle) ? state.angle : 0) + ctx.dt * state.w;
    }
  };
  // Reporting uses the same accepted implicit-speed evaluation, even after state commit.
  return el;
}

export function solveStep(n, elements, { dt = 1 / 60, V: initial = [], refs = [], debug = false } = {}) {
  if (!Number.isInteger(n) || n < 0 || !finite(dt) || dt < 0) throw new RangeError('invalid network size or dt');
  const V = Array.from({ length: n }, (_, i) => finite(initial[i]) ? initial[i] : 0);
  const parent = Array.from({ length: n + 1 }, (_, i) => i), ground = n;
  const find = a => { while (parent[a] !== a) { parent[a] = parent[parent[a]]; a = parent[a]; } return a; };
  const join = (a, b) => { parent[find(a)] = find(b); };
  const idx = a => a < 0 ? ground : a;
  for (const el of elements) {
    if (el.nodes.some(a => a >= n)) throw new RangeError('node out of range');
    for (let i = 1; i < el.nodes.length; i++) join(idx(el.nodes[0]), idx(el.nodes[i]));
  }
  const pinned = new Set(refs.filter(a => a >= 0 && a < n));
  const seen = new Set([find(ground)]);
  for (const a of pinned) seen.add(find(a));
  for (let a = 0; a < n; a++) if (!seen.has(find(a))) { pinned.add(a); seen.add(find(a)); }
  for (const a of pinned) V[a] = 0;
  if (!Array.from(initial).some(finite)) {
    // Establish common-mode guesses along a spanning tree before nonlinear work.
    // Voltage sources/history get priority; passive edges carry a zero-drop guess.
    const fixed = new Set([...pinned, ground]);
    const preferred = elements.flatMap(el => el._initialEdges?.() ?? []).map(([a, b, u]) => [idx(a), idx(b), u]);
    const passive = elements.filter(el => !el._initialEdges).flatMap(el => el.nodes.slice(1).map(b => [idx(el.nodes[0]), idx(b), 0]));
    const seedEdge = ([a, b, u]) => {
      if (fixed.has(a) && !fixed.has(b)) { if (b !== ground) V[b] = (a === ground ? 0 : V[a]) - u; fixed.add(b); return true; }
      if (fixed.has(b) && !fixed.has(a)) { if (a !== ground) V[a] = (b === ground ? 0 : V[b]) + u; fixed.add(a); return true; }
      return false;
    };
    for (let pass = 0; pass <= n; pass++) {
      let progress = false;
      for (const edge of preferred) progress = seedEdge(edge) || progress;
      for (const edge of passive) progress = seedEdge(edge) || progress;
      if (!progress) break;
    }
  }
  for (const el of elements) el._seed?.(V, pinned);
  // A passive leaf tree has exactly zero branch current by KCL. Seed its
  // voltages by back-substitution from the attached network, even with a stale
  // caller guess. This preserves a unique zero-current junction equilibrium
  // whose tiny reverse derivative would otherwise be numerically rank deficient.
  const topology = elements.flatMap(el => el.kind === 'diode'
    ? [[el.nodes[0], el.nodes[2], true], [el.nodes[2], el.nodes[1], true]]
    : [[el.nodes[0], el.nodes[1], ['resistor', 'lamp'].includes(el.kind)]]);
  const incident = Array.from({ length: n + 1 }, () => new Set());
  topology.forEach(([a, b], edge) => { if (idx(a) !== idx(b)) { incident[idx(a)].add(edge); incident[idx(b)].add(edge); } });
  const leaves = [], queue = Array.from({ length: n }, (_, i) => i).filter(a => !pinned.has(a) && incident[a].size === 1);
  for (let q = 0; q < queue.length; q++) {
    const a = queue[q];
    if (incident[a].size !== 1) continue;
    const edge = [...incident[a]][0], [ea, eb, passive] = topology[edge];
    if (!passive) continue;
    const b = idx(ea) === a ? idx(eb) : idx(ea);
    leaves.push([a, b]); incident[a].delete(edge); incident[b].delete(edge);
    if (b !== ground && !pinned.has(b) && incident[b].size === 1) queue.push(b);
  }
  for (let i = leaves.length - 1; i >= 0; i--) { const [a, b] = leaves[i]; V[a] = b === ground ? 0 : V[b]; }
  const eliminated = new Set(leaves.map(([a]) => a));
  const nodes = Array.from({ length: n }, (_, i) => i).filter(i => !pinned.has(i) && !eliminated.has(i));
  const position = new Map(nodes.map((a, i) => [a, i]));
  const contexts = elements.map(el => el._context ? el._context(dt) : { dt });
  const frozen = elements.map((el, i) => el.kind === 'capacitor' && dt === 0 ? i : -1).filter(i => i >= 0);
  const size = nodes.length + frozen.length;
  let x = [...nodes.map(a => V[a]), ...frozen.map(() => 0)];
  const frozenIndex = new Map(frozen.map((e, i) => [e, nodes.length + i]));
  function assemble(candidate) {
    const values = V.slice(); nodes.forEach((a, i) => { values[a] = candidate[i]; });
    for (let i = leaves.length - 1; i >= 0; i--) { const [a, b] = leaves[i]; values[a] = b === ground ? 0 : values[b]; }
    const F = Array(size).fill(0), Jm = Array.from({ length: size }, () => Array(size).fill(0));
    const magnitude = Array(size).fill(0), slopes = Array(size).fill(0), constraintScale = new Map();
    const add = (a, b, i, g) => {
      if (eliminated.has(a) || eliminated.has(b)) return; // eliminated zero-current tree edge
      const pa = position.get(a), pb = position.get(b);
      for (const [p, sign, other] of [[pa, 1, pb], [pb, -1, pa]]) if (p !== undefined) {
        F[p] += sign * i; magnitude[p] += Math.abs(i); slopes[p] += Math.abs(g);
        Jm[p][p] += g;
        if (other !== undefined) Jm[p][other] -= g;
      }
    };
    elements.forEach((el, e) => {
      const z = frozenIndex.get(e), [a, b] = el.nodes;
      if (z !== undefined) {
        add(a, b, candidate[z], 0);
        const pa = position.get(a), pb = position.get(b);
        if (pa !== undefined) { Jm[pa][z] += 1; Jm[z][pa] += 1; }
        if (pb !== undefined) { Jm[pb][z] -= 1; Jm[z][pb] -= 1; }
        F[z] = drop(values, a, b) - contexts[e].history;
        constraintScale.set(z, 1e-10 + 1e-8 * Math.max(Math.abs(voltage(values, a)), Math.abs(voltage(values, b)), Math.abs(contexts[e].history)));
      } else if (el._branches) for (const branch of el._branches(values)) add(branch.a, branch.b, branch.i, branch.g);
      else { const result = el._evaluate(values, contexts[e]); add(a, b, result.i, result.g); }
    });
    const scales = F.map((_, i) => constraintScale.get(i) ?? (Math.min(1e-9, Math.max(1e-30, 1e-10 * slopes[i])) + 1e-7 * magnitude[i]));
    const score = Math.max(0, ...F.map((f, i) => Math.abs(f) / scales[i]));
    return { values, F, J: Jm, score, scales };
  }
  let result = assemble(x), converged = false, iterations = 0;
  for (; iterations < 120; iterations++) {
    if (result.F.every(f => f === 0)) { converged = true; break; }
    let delta = solveLinear(result.J, result.F.map(f => -f));
    if (!delta) {
      const regular = result.J.map((row, i) => row.map((v, j) => v + (i === j && i < nodes.length ? GMIN : 0)));
      delta = solveLinear(regular, result.F.map(f => -f));
    }
    if (!delta) break;
    const smallVoltageCorrection = delta.slice(0, nodes.length).every((d, i) => Math.abs(d) <= 1e-9 + 1e-8 * Math.max(Math.abs(x[i]), Math.abs(x[i] + d)));
    if (finite(result.score) && result.score <= .01 && smallVoltageCorrection) { converged = true; break; }
    const maxVoltageStep = Math.max(0, ...delta.slice(0, nodes.length).map(Math.abs));
    const stepLimit = Math.max(10, ...x.slice(0, nodes.length).map(Math.abs));
    let alpha = maxVoltageStep > stepLimit ? stepLimit / maxVoltageStep : 1;
    let accepted = null;
    // Freeze scales during line search; rescaling a falling exponential current
    // at every trial would hide progress on a dangling diode branch.
    const trialScore = assembled => Math.max(0, ...assembled.F.map((f, i) => Math.abs(f) / result.scales[i]));
    for (let back = 0; back < 45; back++, alpha *= .5) {
      const trial = x.map((v, i) => v + alpha * delta[i]), assembled = assemble(trial);
      if (finite(assembled.score) && (trialScore(assembled) < result.score * (1 - 1e-4 * alpha) || assembled.score <= .01)) {
        accepted = { trial, assembled }; break;
      }
    }
    if (!accepted) {
      // A temporary correction regularizer never changes physical residual acceptance.
      const regular = result.J.map((row, i) => row.map((v, j) => v + (i === j && i < nodes.length ? GMIN : 0)));
      delta = solveLinear(regular, result.F.map(f => -f));
      if (!delta) break;
      for (let back = 0, a = 1; back < 45; back++, a *= .5) {
        const trial = x.map((v, i) => v + a * delta[i]), assembled = assemble(trial);
        if (finite(assembled.score) && trialScore(assembled) < result.score) { accepted = { trial, assembled }; break; }
      }
    }
    if (!accepted) break;
    x = accepted.trial; result = accepted.assembled;
  }
  if (converged) elements.forEach((el, i) => {
    const z = frozenIndex.get(i);
    if (z !== undefined) contexts[i].current = x[z];
    el._lastContext = contexts[i];
    el._accept?.(result.values, contexts[i]);
  });
  void debug;
  return { V: result.values.map(v => finite(v) ? v : 0), iterations, converged };
}
