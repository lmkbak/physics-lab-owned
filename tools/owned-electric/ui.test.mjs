// Real-page acceptance against the existing server. Never imports legacy models.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { chromium } from 'file:///D:/deepseek-skill/icbu-agent/node_modules/playwright-core/index.mjs';
const BASE = (process.env.LAB_BASE_URL ?? 'http://127.0.0.1:5173').replace(/\/$/, '');
const OUTPUT = new URL('../../docs/ownership/electric-ui-results.json', import.meta.url);
const requirements = JSON.parse(await fs.readFile(new URL('../../docs/ownership/baseline.json', import.meta.url), 'utf8')).electric.types;
const previous = await fs.readFile(OUTPUT, 'utf8').then(JSON.parse).catch(() => null);
const hashes = {};
for (const path of ['src/lab/owned/electric/models.js', 'src/lab/owned/electric/simulation.js', 'src/lab/owned/electric/solver.js', 'src/lab/clbench/bench.js', 'src/lab/clbench/visuals.js', 'src/lab/owned/music/beat.js', 'src/lab/owned/music/engine.js']) hashes[path] = createHash('sha256').update(await fs.readFile(new URL(`../../${path}`, import.meta.url))).digest('hex');
const report = { schema: 'electric-page-acceptance/v1', sampledAt: new Date().toISOString(), head: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(), sourceHashes: hashes, supersededRuns: [...(previous?.supersededRuns ?? []), ...(previous ? [{ sampledAt: previous.sampledAt, head: previous.head ?? 'not recorded', failed: previous.failed, failures: previous.results.filter(r => !r.pass), pageErrors: previous.pageErrors, reason: 'Superseded by fresh run after runtime integration fixes and stricter step-result/signed/touch/audio tests.' }] : [])], base: BASE, target: `${BASE}/?m=circuit-bench-3d&cover=0`, scope: 'Actual production page with owned models, Simulation, solver and music; CAD integration only as observed, not a complete CAD acceptance claim.', touchSource: { decision: 'retain-project-owned', evidence: 'Lead provenance and touchControls.js header identify this as the project-added layer around the imported bench. No controller rewrite.' }, results: [], pageErrors: [], consoleErrors: [], moduleRequests: [], failed: 0 };
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--disable-gpu-sandbox'] });
let context;
async function persist() { report.failed = report.results.filter(r => !r.pass).length; await fs.writeFile(OUTPUT, JSON.stringify(report, null, 2) + '\n'); }
async function test(name, fn) { const start = Date.now(); try { const evidence = await fn(); report.results.push({ name, pass: true, ms: Date.now() - start, evidence }); console.log(`PASS ${name}`); } catch (error) { report.results.push({ name, pass: false, ms: Date.now() - start, error: error.stack ?? String(error) }); console.log(`FAIL ${name}: ${error.message}`); } await persist(); }
function attach(page) { page.on('pageerror', e => report.pageErrors.push(e.message)); page.on('console', msg => { if (msg.type() === 'error') report.consoleErrors.push(msg.text()); }); page.on('request', req => { const u = req.url(); if (u.includes('/owned/') && !report.moduleRequests.includes(u)) report.moduleRequests.push(u); }); }
async function open(page) { await page.goto(report.target, { waitUntil: 'domcontentloaded' }); await page.waitForFunction(() => window.__clbench?.model.parts.every(p => p.ready) && document.querySelector('#loading')?.hidden, null, { timeout: 90000 }); await page.evaluate(() => { window.__clbench.ui.running = false; }); }
async function blank(page) { await page.evaluate(async () => { const a = window.__clbench; await a.loadPreset('blank', false); a.ui.running = false; a.cancelInteraction(); }); }
async function fixture(page, spec) { await blank(page); await page.evaluate(async ({ parts, edges }) => { const a = window.__clbench; const ps = parts.map(p => a.addPart(p)); await Promise.all(ps.map(p => p.loading)); for (const [i, [from, to]] of edges.entries()) { const end = key => { const [p, t] = key.split(':'); return { p, t }; }; a.addWire(end(from), end(to), 'red', `w${i}`); } a.ui.running = false; a.sim.dirty = true; }, spec); }
async function advance(page, seconds = .1) { return page.evaluate(({ seconds }) => { const a = window.__clbench; a.ui.running = false; const steps = Math.max(1, Math.ceil(seconds * 240)); let result; for (let i = 0; i < steps; i++) { result = a.sim.step(a.model, seconds / steps, 1); if (result?.converged !== true) throw new Error(`advance rejected ${i}: ${result?.reason}`); } a.tick(.15); return { time: a.sim.time, converged: result.converged, parts: a.model.parts.map(p => ({ id: p.id, type: p.type, state: p.state, live: p.live })), warnings: a.sim.warnings }; }, { seconds }); }
try {
  context = await browser.newContext({ viewport: { width: 1440, height: 960 }, hasTouch: true, deviceScaleFactor: 1 });
  await context.addInitScript(() => { localStorage.removeItem('circuit-glow-bench-v1'); localStorage.setItem('clbench.inputMode', 'mouse'); });
  const page = await context.newPage(); attach(page); page.setDefaultTimeout(30000); await open(page);
  await test('runtime owned solver/music loaded and API available', async () => {
    const api = await page.evaluate(() => ({ keys: Object.keys(window.__clbench), presets: [...document.querySelectorAll('[data-preset]')].map(e => e.dataset.preset), sim: Object.keys(window.__clbench.sim), canvas: Boolean(document.querySelector('#canvas canvas')) }));
    assert.equal(api.presets.length, 12); for (const k of ['loadPreset', 'addPart', 'addWire', 'sim', 'screenOf', 'pickAt', 'isWiring', 'cancelWiring']) assert.ok(api.keys.includes(k)); assert.ok(report.moduleRequests.some(u => /owned\/electric\/solver/.test(u))); assert.ok(report.moduleRequests.some(u => /owned\/music/.test(u))); return api;
  });
  const presets = await page.locator('[data-preset]').evaluateAll(es => es.map(e => e.dataset.preset));
  for (const id of presets) for (const mode of ['default', 'closed-A', 'alternate-B', 'open-reset']) await test(`preset ${id} / ${mode}`, async () => {
    return await page.evaluate(async ({ id, mode }) => {
      const a = window.__clbench; await a.loadPreset(id, false); a.ui.running = false;
      for (const p of a.model.parts) {
        if (mode !== 'default') {
          if (p.type === 'switch') a.setParam(p, 'closed', mode !== 'open-reset');
          if (p.type === 'dpdt') a.setParam(p, 'pos', mode === 'closed-A' ? 'A' : mode === 'alternate-B' ? 'B' : 'off');
          if (p.type === 'rheostat') a.setParam(p, 's', mode === 'alternate-B' ? .5 : 1);
          if (p.type === 'motor') a.setParam(p, 'stalled', mode === 'alternate-B');
        }
      }
      a.ui.running = false;
      for (let i = 0; i < 48; i++) { const result = a.sim.step(a.model, 1 / 240, 1); if (result?.converged !== true) throw new Error(`nonconverged ${id}/${mode} step ${i}: ${result?.reason}`); }
      a.tick(.15);
      const nonfinite = (o, path) => { for (const [k, v] of Object.entries(o ?? {})) { if (typeof v === 'number' && !Number.isFinite(v)) throw new Error(`nonfinite ${path}.${k}`); if (v && typeof v === 'object') nonfinite(v, `${path}.${k}`); } };
      for (const p of a.model.parts) { if (!p.ready || !p.live?.rows?.length) throw new Error(`not ready/reported ${p.id}`); nonfinite(p.live, p.id); }
      for (const w of a.model.wires) if (!Number.isFinite(w.I) || !w.el) throw new Error(`wire has no accepted current ${w.id}`);
      // KCL uses the actual runtime's physical element currents, never a copied solver.
      const currents = Array(a.sim.V.length).fill(0), mags = currents.slice();
      const add = (i, j, I) => { if (i >= 0) { currents[i] += I; mags[i] += Math.abs(I); } if (j >= 0) { currents[j] -= I; mags[j] += Math.abs(I); } };
      for (const e of a.sim.elements) if (e._branches) for (const b of e._branches(a.sim.V)) add(b.a, b.b, b.i); else add(e.nodes[0], e.nodes[1], e.current(a.sim.V) * (['source', 'supply'].includes(e.kind) ? -1 : 1));
      const maxKcl = Math.max(0, ...currents.map(Math.abs));
      for (let i = 0; i < currents.length; i++) if (Math.abs(currents[i]) > 1e-9 + 1e-7 * mags[i]) throw new Error(`KCL residual node ${i}: ${currents[i]}`);
      const meters = a.model.parts.filter(p => p.live.reading !== undefined).map(p => ({ id: p.id, reading: p.live.reading, unit: p.live.unit, range: p.live.range }));
      for (const m of meters) if (!['A', 'V', 'μA'].includes(m.unit)) throw new Error(`meter unit ${m.unit}`);
      return { parts: a.model.parts.length, wires: a.model.wires.length, meters, maxKcl, warnings: a.sim.warnings, converged: true };
    }, { id, mode });
  });
  for (const type of requirements) await test(`insert/render/report ${type.id}`, async () => {
    await blank(page);
    const observed = await page.evaluate(async ({ type }) => { const a = window.__clbench, p = a.addPart({ id: 'X', type, x: 0, y: 0 }); await p.loading; a.ui.running = false; a.sim.step(a.model, .001, 1); a.select({ part: p }); a.tick(.2); return { ready: p.ready, obj: Boolean(p.obj), terms: Object.keys(p.term3d ?? {}), paramKeys: Object.keys(p.params), state: p.state, live: p.live, props: document.querySelector('#tab-props')?.innerText, selected: a.ui.sel?.part?.id }; }, { type: type.id });
    assert.equal(observed.ready, true); assert.equal(observed.obj, true); assert.deepEqual(observed.terms.sort(), Object.keys(type.terminals).sort()); assert.ok(observed.live.rows.length); assert.equal(observed.selected, 'X'); assert.ok(observed.props?.length); for (const c of type.controls) assert.ok(observed.paramKeys.includes(c.key) || ['replace', 'discharge'].includes(c.key)); return observed;
  });
  await test('actual ammeter 0.6/3 A and voltmeter 3/15 V signed readings/units', async () => {
    const evidence = [];
    for (const [type, terminal, fs, resistance] of [['ammeter', '0.6', .6, null], ['ammeter', '3', 3, null], ['voltmeter', '3', 3, 3000], ['voltmeter', '15', 15, 15000], ['galvanometer', 'A', 300, 100]]) for (const sign of [1, -1]) {
      await fixture(page, { parts: [{ id: 'S', type: 'battery', params: { E: sign * (type === 'galvanometer' ? .03 : 3), r: 1 }, x: -200 }, { id: 'M', type, x: 200 }], edges: [['S:+', `M:${terminal}`], [`M:${type === 'galvanometer' ? 'B' : '-'}`, 'S:-']] });
      const frame = await advance(page, .01); const L = frame.parts.find(p => p.id === 'M').live, source = frame.parts.find(p => p.id === 'S').live;
      const expected = type === 'ammeter' ? source.I : type === 'voltmeter' ? L.U : source.I * 1e6;
      assert.ok(Math.abs(L.reading - expected) <= 1e-8 + 1e-6 * Math.abs(expected)); assert.equal(L.range, fs); assert.equal(L.unit, type === 'ammeter' ? 'A' : type === 'voltmeter' ? 'V' : 'μA'); if (resistance) assert.ok(Math.abs(L.U / L.I - resistance) < 1e-3); assert.equal(Math.sign(L.reading), sign); if (sign < 0) assert.ok(L.warn.some(w => /反偏|反向/.test(w.text))); evidence.push({ type, terminal, sign, live: L });
    }
    return evidence;
  });
  for (const type of ['lamp', 'led', 'fuse']) await test(`real-page ${type} damage and replacement`, async () => {
    const polar = type === 'led';
    await fixture(page, { parts: [{ id: 'S', type: 'battery', params: { E: type === 'lamp' ? 12 : type === 'led' ? 5 : 3, r: .1 }, x: -200 }, { id: 'X', type, x: 200 }], edges: [['S:+', `X:${polar ? '+' : 'A'}`], [`X:${polar ? '-' : 'B'}`, 'S:-']] });
    const damaged = await advance(page, 2); const p = damaged.parts.find(p => p.id === 'X'); assert.equal(Boolean(p.state[type === 'fuse' ? 'blown' : 'burnt']), true); assert.ok(p.live.warn.length); assert.ok(Math.abs(p.live.I) < 1e-6);
    await page.evaluate(() => { const a = window.__clbench, p = a.byId('X'); a.select({ part: p }); a.tick(.2); });
    const replace = page.locator('#tab-props [data-act="replace"]'); await replace.click();
    await page.evaluate(() => { const a = window.__clbench; a.byId('S').params.E = 1; a.byId('S').params.r = 100; a.sim.dirty = true; a.ui.running = false; });
    const reset = await advance(page, .01); assert.equal(Boolean(reset.parts.find(p => p.id === 'X').state[type === 'fuse' ? 'blown' : 'burnt']), false); return { damaged: p, replacement: reset.parts.find(p => p.id === 'X') };
  });
  await test('real-page capacitor moving plate Q conservation and electrolytic polarity/16 V', async () => {
    await fixture(page, { parts: [{ id: 'C', type: 'capacitor', state: { v: 3 }, x: 0 }], edges: [] }); await advance(page, .01);
    const moved = await page.evaluate(() => { const a = window.__clbench, p = a.byId('C'); const before = { v: p.state.v, Q: p.live.Q }; a.setParam(p, 'd', 96); a.ui.running = false; a.sim.step(a.model, 1 / 240, 1); return { before, after: { v: p.state.v, Q: p.live.Q } }; }); assert.ok(Math.abs(moved.before.Q - moved.after.Q) < Math.abs(moved.before.Q) * 1e-7 + 1e-24); assert.ok(Math.abs(moved.after.v / moved.before.v - 3) < 1e-6);
    const polar = [];
    for (const v of [-1, 17]) { await fixture(page, { parts: [{ id: 'C', type: 'elcap', state: { v }, x: 0 }], edges: [] }); const f = await advance(page, .01); assert.ok(f.parts[0].live.warn.length); polar.push(f.parts[0]); }
    return { moved, polar };
  });
  await test('real-page motor rotor angle and stalled current/back EMF', async () => {
    await fixture(page, { parts: [{ id: 'S', type: 'battery', params: { E: 3, r: 1 }, x: -200 }, { id: 'M', type: 'motor', x: 200 }], edges: [['S:+', 'M:A'], ['M:B', 'S:-']] }); const running = await advance(page, .5), run = running.parts[1]; assert.ok(run.state.w > 0); assert.ok(run.state.angle > 0, 'actual page does not advance rotor state.angle');
    await page.evaluate(() => { window.__clbench.setParam(window.__clbench.byId('M'), 'stalled', true); window.__clbench.ui.running = false; }); const stalled = await advance(page, .1); assert.ok(Math.abs(stalled.parts[1].state.w) < 1e-9); assert.ok(stalled.parts[1].live.I > run.live.I); return { running: run, stalled: stalled.parts[1] };
  });
  await test('paused visual tick preserves physically integrated motor angle', async () => {
    await fixture(page, { parts: [{ id: 'S', type: 'battery', x: -200 }, { id: 'M', type: 'motor', x: 200 }], edges: [['S:+', 'M:A'], ['M:B', 'S:-']] }); await advance(page, .1);
    const e = await page.evaluate(() => { const a = window.__clbench, p = a.byId('M'); a.ui.running = false; const angle = p.state.angle, time = a.sim.time; a.tick(.1); return { before: angle, after: p.state.angle, timeBefore: time, timeAfter: a.sim.time }; }); assert.equal(e.timeAfter, e.timeBefore); assert.equal(e.after, e.before, 'render-only tick must not alter physical rotor angle'); return e;
  });
  await test('running visual tick does not add angle after accepted physics step', async () => {
    await fixture(page, { parts: [{ id: 'S', type: 'battery', x: -200 }, { id: 'M', type: 'motor', x: 200 }], edges: [['S:+', 'M:A'], ['M:B', 'S:-']] }); await advance(page, .1);
    const e = await page.evaluate(() => { const a = window.__clbench, p = a.byId('M'), original = a.sim.step, accepted = []; a.sim.step = function(...args) { const result = original.apply(this, args); accepted.push({ angle: p.state.angle, time: this.time, converged: result.converged }); return result; }; try { a.ui.running = true; a.tick(.01, .01); return { accepted, after: p.state.angle, time: a.sim.time }; } finally { a.sim.step = original; a.ui.running = false; } }); assert.ok(e.accepted.length > 0); assert.ok(e.accepted.every(s => s.converged)); assert.equal(e.after, e.accepted.at(-1).angle, 'visual animation added to physically accepted angle'); return e;
  });
  for (const type of ['lamp', 'led', 'fuse']) await test(`protection ${type} publishes consumer FX event`, async () => {
    await fixture(page, { parts: [{ id: 'S', type: 'battery', params: { E: type === 'lamp' ? 12 : type === 'led' ? 5 : 3, r: .1 }, x: -200 }, { id: 'X', type, x: 200 }], edges: [['S:+', `X:${type === 'led' ? '+' : 'A'}`], [`X:${type === 'led' ? '-' : 'B'}`, 'S:-']] });
    const e = await page.evaluate(() => { const a = window.__clbench, p = a.byId('X'), events = []; a.ui.running = false; for (let i = 0; i < 480; i++) { const r = a.sim.step(a.model, 1 / 240, 1); if (!r.converged) throw new Error(`rejected ${i}`); events.push(...p.events); p.events.length = 0; } return { state: p.state, events }; }); assert.ok(e.events.includes(type === 'fuse' ? 'blow' : 'burn'), 'missing p.events trigger consumed by bench FX'); return e;
  });
  await test('native music UI toggle and running AudioContext (not listening evidence)', async () => {
    await page.locator('#t-music').click(); await page.waitForFunction(() => window.__clbench.music.on && window.__clbench.music.ctx?.state === 'running'); await page.waitForTimeout(400); const playing = await page.evaluate(() => ({ on: window.__clbench.music.on, context: window.__clbench.music.ctx.state, diagnostics: window.__clbench.music.diagnostics(), pulse: window.__clbench.music.pulse() })); assert.ok(playing.diagnostics.events > 0); assert.ok(Number.isFinite(playing.pulse.beat)); await page.locator('#t-music').click(); await page.waitForFunction(() => window.__clbench.music.on === false); return playing;
  });
  for (const mode of ['reject', 'pending-stop', 'pending-leave']) await test(`injected music resume ${mode} lifecycle negative control`, async () => {
    const p = await context.newPage(); attach(p); await open(p);
    await p.evaluate(mode => {
      window.__musicControl = { mode, calls: 0 }; const Native = window.AudioContext;
      window.AudioContext = class extends Native {
        get state() { return window.__musicControl.forceSuspended === false ? super.state : 'suspended'; }
        resume() { const c = window.__musicControl; c.calls++; if (c.mode === 'reject') return Promise.reject(new Error('EXPECTED_UI_RESUME_REJECTION')); return new Promise(resolve => { c.settle = () => { c.forceSuspended = false; resolve(); }; }); }
      };
      window.__heldMusic = window.__clbench.music; window.__heldButton = document.querySelector('#t-music');
    }, mode);
    try {
      await p.locator('#t-music').click(); await p.waitForFunction(() => window.__musicControl.calls > 0);
      if (mode === 'reject') {
        await p.waitForFunction(() => !window.__heldMusic.on && !window.__heldMusic.pending);
        const e = await p.evaluate(() => ({ on: window.__heldMusic.on, buttonOn: window.__heldButton.classList.contains('on'), diagnostics: window.__heldMusic.diagnostics(), error: window.__heldMusic.lastError?.message })); assert.equal(e.on, false); assert.equal(e.buttonOn, false); assert.equal(e.diagnostics.timers, 0); assert.match(e.error, /EXPECTED_UI_RESUME_REJECTION/); return e;
      }
      if (mode === 'pending-stop') await p.locator('#t-music').click();
      else { await p.getByRole('button', { name: '← 返回目录' }).click(); await p.waitForFunction(() => window.__heldMusic.disposed); }
      await p.evaluate(() => window.__musicControl.settle()); await p.waitForTimeout(80);
      const e = await p.evaluate(() => ({ on: window.__heldMusic.on, disposed: window.__heldMusic.disposed, buttonOn: window.__heldButton.classList.contains('on'), pending: Boolean(window.__heldMusic.pending), diagnostics: window.__heldMusic.diagnostics() })); assert.equal(e.on, false); assert.equal(e.buttonOn, false); assert.equal(e.pending, false); assert.equal(e.diagnostics.timers, 0); assert.equal(e.diagnostics.nodes, 0); assert.equal(e.diagnostics.sources, 0); if (mode === 'pending-leave') assert.equal(e.disposed, true); return e;
    } finally { await p.close(); }
  });
  await test('real touch connection completed and cancel button clears active preview', async () => {
    await fixture(page, { parts: [{ id: 'S', type: 'battery', x: -220, y: 0 }, { id: 'R', type: 'resistor10', x: 220, y: 0 }], edges: [] });
    await page.getByRole('combobox', { name: '输入方式' }).selectOption('touch');
    await page.evaluate(() => { const a = window.__clbench; a.look([0, -300, 1400], [0, 0, 0]); window.__touchEvidence = []; const c = document.querySelector('#canvas canvas'); for (const name of ['pointerdown', 'pointerup', 'pointercancel']) window.addEventListener(name, e => window.__touchEvidence.push({ name, trusted: e.isTrusted, pointerType: e.pointerType, canvasTarget: e.target === c, x: e.clientX, y: e.clientY }), true); });
    await page.waitForTimeout(700);
    const cdp = await context.newCDPSession(page);
    const touch = (type, points) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: points });
    const tap = async ({ x, y }) => { await touch('touchStart', [{ x, y, id: 1 }]); await page.waitForTimeout(45); await touch('touchEnd', []); await page.waitForTimeout(550); };
    const target = async (p, t) => page.evaluate(({ p, t }) => { const a = window.__clbench, c = document.querySelector('#canvas canvas'), [x, y] = a.screenOf(p, t); for (const dy of [0, -3, 3, -6, 6]) for (const dx of [0, -3, 3, -6, 6]) { if (document.elementFromPoint(x + dx, y + dy) !== c) continue; const hit = a.pickAt({ clientX: x + dx, clientY: y + dy, target: c }); if (hit.term?.p === p && hit.term?.t === t) return { x: x + dx, y: y + dy, p, t }; } throw new Error(`terminal not exposed ${p}:${t} at ${x},${y}`); }, { p, t });
    const from = await target('S', '+'); await tap(from); assert.equal(await page.evaluate(() => window.__clbench.isWiring()), true, 'real first touch failed to start wire'); await page.locator('.touch-wirebar').waitFor({ state: 'visible' });
    const to = await target('R', 'A'); await tap(to); const completed = await page.evaluate(() => ({ wiring: window.__clbench.isWiring(), wires: window.__clbench.model.wires.map(w => ({ a: w.a, b: w.b })) })); assert.equal(completed.wiring, false); assert.equal(completed.wires.length, 1); assert.deepEqual(completed.wires[0], { a: { p: 'S', t: '+' }, b: { p: 'R', t: 'A' } });
    const cancelFrom = await target('S', '-'); await tap(cancelFrom); assert.equal(await page.evaluate(() => window.__clbench.isWiring()), true); const cancel = page.locator('.touch-wirebar button'); await cancel.waitFor({ state: 'visible' }); const box = await cancel.boundingBox(); assert.ok(box); await tap({ x: box.x + box.width / 2, y: box.y + box.height / 2 });
    const final = await page.evaluate(() => ({ wiring: window.__clbench.isWiring(), wires: window.__clbench.model.wires.length, enabled: window.__clbench.controls.enabled, events: window.__touchEvidence })); assert.equal(final.wiring, false); assert.equal(final.wires, 1); assert.equal(final.enabled, true); assert.ok(final.events.filter(e => e.name === 'pointerdown' && e.canvasTarget).length >= 3); assert.ok(final.events.filter(e => e.name === 'pointerup').length >= 4); assert.ok(final.events.every(e => e.trusted && e.pointerType === 'touch')); await cdp.detach(); return { from, to, cancelFrom, completed, final };
  });
  await test('page has no uncaught runtime errors', async () => { assert.deepEqual(report.pageErrors, []); return { pageErrors: report.pageErrors, consoleErrors: report.consoleErrors }; });
} catch (error) {
  report.results.push({ name: 'harness execution', pass: false, error: error.stack ?? String(error) });
} finally {
  if (context) await context.close(); await browser.close();
  report.finishedAt = new Date().toISOString(); report.headAtEnd = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  report.sourceChangedDuringRun = []; for (const [path, before] of Object.entries(hashes)) { const after = createHash('sha256').update(await fs.readFile(new URL(`../../${path}`, import.meta.url))).digest('hex'); if (before !== after) report.sourceChangedDuringRun.push({ path, before, after }); }
  report.limitations = ['No human listening verdict; native music evidence is running AudioContext and scheduled events.', 'CAD is checked for actual insertion/readiness/terminal presence, not geometric ownership or full moving clearances.', 'Earlier not-ready P occurred during integration/HMR; stable reruns did not reproduce it and do not establish its root cause.'];
  if (report.sourceChangedDuringRun.length || report.head !== report.headAtEnd) report.results.push({ name: 'runtime source stability', pass: false, error: 'Source or HEAD changed during acceptance run', evidence: report.sourceChangedDuringRun });
  await persist();
  console.log(`${report.results.length - report.failed}/${report.results.length} real-page groups passed; ${report.failed} failed`);
  process.exitCode = report.failed || report.pageErrors.length ? 1 : 0;
}
