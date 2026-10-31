import assert from 'node:assert/strict';
import { ScoreEngine, STEP, clampVolume } from '../../src/lab/owned/music/engine.js';
import { BeatMusic } from '../../src/lab/owned/music/beat.js';
import { Music, PALETTE } from '../../src/lab/owned/music/glow.js';
import { FakeAudioContext, deferred } from './fake-audio.mjs';

const realInterval = globalThis.setInterval, realClear = globalThis.clearInterval;
const liveTimers = new Map(); let timerId = 0;
globalThis.setInterval = fn => { liveTimers.set(++timerId, fn); return timerId; };
globalThis.clearInterval = id => liveTimers.delete(id);
globalThis.AudioContext = FakeAudioContext;
let cases = 0;
const zero = engine => {
  const d = engine.diagnostics();
  for (const k of ['nodes', 'sources', 'voices', 'events', 'timers']) assert.equal(d[k], 0, k);
};
async function test(name, run) { await run(); cases++; console.log(`PASS ${name}`); }
try {
  await test('palette consumer shape and clamped volume', () => {
    assert.equal(PALETTE.length, 4); assert(Object.isFrozen(PALETTE));
    for (const scene of PALETTE) {
      assert.equal(scene.length, 3); assert(Object.isFrozen(scene));
      for (const c of scene) assert.match(c, /^#[0-9a-f]{6}$/i);
    }
    for (const [input, expected] of [[-1, 0], [2, 1], [.4, .4], [NaN, 0], [Infinity, 0]]) assert.equal(clampVolume(input), expected);
  });
  await test('six voices, envelopes, layered score, feedback and duck', () => {
    const ctx = new FakeAudioContext(), e = new ScoreEngine(ctx);
    e.start(.5, { manual: true, startAt: .05 }); e.scheduleUntil(STEP * 16 * 12);
    for (const [part, n] of Object.entries(e.counts)) assert(n > 0, part);
    assert.equal(e.feedback.gain.value, .31);
    assert(e.feedback.connections.has(e.delay)); assert(e.echoFilter.connections.has(e.feedback));
    const duck = e.duck.gain.events;
    assert(duck.some(x => x.type === 'linear' && x.value === .28));
    assert(duck.some(x => x.type === 'exp' && x.value === 1));
    const firstDip = duck.find(x => x.value === .28), firstRecover = duck.find(x => x.type === 'exp');
    assert(firstRecover.time - firstDip.time <= .24);
    const peakEvents = ctx.nodes.flatMap(n => n.gain.events).filter(x => x.type === 'linear');
    assert(peakEvents.some(x => x.value > .1));
    for (const n of ctx.nodes.filter(n => n.started !== undefined)) assert(n.stopped > n.started);
    const activeBefore = e.sources.size; ctx.advance(9); assert(e.sources.size < activeBefore);
    e.stop(); zero(e); assert(ctx.nodes.every(n => n.disconnected));
  });
  await test('pulse uses output delay and timestamp path without double subtract', () => {
    const ctx = new FakeAudioContext(), e = new ScoreEngine(ctx);
    e.start(.5, { manual: true, startAt: .1 }); e.scheduleUntil(.3);
    ctx.currentTime = .139; assert.equal(e.pulse(), null);
    ctx.currentTime = .14; assert(Math.abs(e.pulse().kick - 1) < .00001);
    ctx.currentTime = .18;
    ctx.getOutputTimestamp = () => ({ contextTime: .1, performanceTime: performance.now() });
    assert(e.pulse().kick > .99);
    e.setVolume(0); assert.equal(e.pulse(), null);
    e.stop(); zero(e);
  });
  await test('BeatMusic API, reuse, stop and dispose idempotence', async () => {
    const n = FakeAudioContext.instances.length, b = new BeatMusic();
    assert.deepEqual(b.pulse(), { beat: 0, chord: -1 }); assert.equal(b.timer, null);
    await b.start(); assert.equal(b.on, true); assert.equal(b.master.gain.value, .5);
    const ctx = b.ctx; b.setVolume(8); assert.equal(b.volume, 1);
    b.stop(); zero(b); assert.equal(b.on, false); assert.equal(b.timer, null);
    assert.deepEqual(b.pulse(), { beat: 0, chord: -1 });
    for (let i = 0; i < 40; i++) { await b.start(.2); assert.equal(liveTimers.size, 1); b.stop(); zero(b); }
    assert.equal(FakeAudioContext.instances.length, n + 1); assert.equal(b.ctx, ctx);
    b.dispose(); b.dispose(); assert.equal(ctx.closes, 1); await b.start(); assert.equal(b.on, false); zero(b);
  });
  await test('pending resume stop/start cancellation and last volume wins', async () => {
    const b = new BeatMusic();
    // Use injected existing context, the public no-argument constructor stays unchanged.
    const ctx = new FakeAudioContext({ state: 'suspended' }), gate = deferred(); b.ctx = ctx;
    ctx.resume = () => gate.promise.then(() => { ctx.state = 'running'; });
    const first = b.start(.3); b.stop(); const second = b.start(.7);
    gate.resolve(); await Promise.all([first, second]);
    assert.equal(b.on, true); assert.equal(b.master.gain.value, .7); assert.equal(liveTimers.size, 1);
    b.dispose(); zero(b);
  });
  await test('dispose during pending resume prevents graph and closes once', async () => {
    const b = new BeatMusic(), ctx = new FakeAudioContext({ state: 'suspended' }), gate = deferred(); b.ctx = ctx;
    ctx.resume = () => gate.promise; const pending = b.start(); b.dispose(); gate.resolve(); await pending;
    assert.equal(b.on, false); assert.equal(ctx.closes, 1); zero(b);
  });
  await test('resume rejection rolls state back and cleans resources', async () => {
    const b = new BeatMusic(), ctx = new FakeAudioContext({ state: 'suspended' }); b.ctx = ctx;
    ctx.resume = () => Promise.reject(Error('gesture denied'));
    await assert.rejects(b.start(), /gesture denied/); assert.equal(b.on, false); zero(b); assert.equal(ctx.closes, 0);
    ctx.resume = () => { ctx.state = 'running'; return Promise.resolve(); };
    await b.start(); assert.equal(b.on, true); assert.equal(b.ctx, ctx);
    b.dispose(); assert.equal(ctx.closes, 1);
    const shared = new FakeAudioContext({ state: 'suspended' }); shared.resume = () => Promise.reject(Error('denied'));
    const m = new Music({ ctx: shared, init() {} }); m.toggle(true); await m.pending?.catch(() => {});
    assert.equal(m.on, false); assert.equal(m.pulse(), null); assert.equal(shared.closes, 0); zero(m); m.dispose();
  });
  await test('shared Music lazy init, rapid toggle and dispose never closes sound context', async () => {
    let inits = 0; const sound = { ctx: null, init() { inits++; this.ctx ??= new FakeAudioContext(); } };
    const m = new Music(sound); assert.equal(inits, 0);
    assert.equal(m.toggle(true), true); await m.pending; assert.equal(inits, 1);
    assert(m.out && m.duck && m.dry && m.delay); assert.equal(m.toggle(false), false); zero(m);
    for (let i = 0; i < 30; i++) { assert(m.toggle(true)); assert.equal(m.toggle(), false); }
    await m.pending; assert.equal(m.on, false); zero(m); assert.equal(inits, 1);
    m.dispose(); assert.equal(sound.ctx.closes, 0); assert.equal(m.toggle(true), false);
  });
  await test('async sound initialization cancellation does not create a running graph', async () => {
    const gate = deferred(); const sound = { ctx: null, init() { return gate.promise.then(() => { this.ctx ??= new FakeAudioContext(); }); } };
    const m = new Music(sound); m.toggle(true); m.toggle(false); gate.resolve(); await m.pending;
    zero(m); assert.equal(m.on, false); m.dispose(); assert.equal(sound.ctx.closes, 0);
  });
  await test('async init coalesces rapid reopen into one context and one scheduler', async () => {
    const gate = deferred(); let inits = 0;
    const sound = { ctx: null, init() { inits++; return gate.promise.then(() => { this.ctx = new FakeAudioContext(); }); } };
    const m = new Music(sound); m.toggle(true); const first = m.pending; m.toggle(false); m.toggle(true); const second = m.pending;
    gate.resolve(); await Promise.all([first, second]);
    assert.equal(inits, 1); assert.equal(m.ctx, sound.ctx); assert.equal(liveTimers.size, 1); assert.equal(m.on, true);
    m.dispose(); zero(m); assert.equal(sound.ctx.closes, 0);
  });
  await test('synchronous init failure returns false and never starts light or timer', async () => {
    const m = new Music({ init() { throw Error('init denied'); } });
    assert.equal(m.toggle(true), false); await m.pending?.catch(() => {});
    assert.equal(m.pulse(), null); zero(m); m.dispose();
  });
  await test('pagehide disposes owned and shared instances and removes listeners', async () => {
    const add = globalThis.addEventListener, remove = globalThis.removeEventListener, listeners = new Set();
    globalThis.addEventListener = (name, fn) => { if (name === 'pagehide') listeners.add(fn); };
    globalThis.removeEventListener = (name, fn) => { if (name === 'pagehide') listeners.delete(fn); };
    try {
      const b = new BeatMusic(), sound = { ctx: new FakeAudioContext(), init() {} }, m = new Music(sound);
      await b.start(); m.toggle(true); await m.pending; assert.equal(listeners.size, 2);
      for (const listener of [...listeners]) listener();
      assert.equal(listeners.size, 0); assert.equal(b.disposed, true); assert.equal(m.disposed, true);
      assert.equal(b.ctx.closes, 1); assert.equal(sound.ctx.closes, 0); zero(b); zero(m);
    } finally { globalThis.addEventListener = add; globalThis.removeEventListener = remove; }
  });
  await test('suspension freezes lights; resume skips stale backlog with bounded history', () => {
    const ctx = new FakeAudioContext(), e = new ScoreEngine(ctx); e.start(.5);
    ctx.currentTime = .08; assert(e.pulse()); ctx.state = 'suspended'; assert.equal(e.pulse(), null);
    const n = e.counts.kick; e.tick(); assert.equal(e.counts.kick, n);
    ctx.state = 'running'; ctx.advance(100); e.tick(); assert(e.events.length < 4);
    for (let t = 100; t < 108; t += .025) { ctx.advance(t); e.tick(); }
    assert(e.events.length < 30); assert(e.nodes.size < 120); assert(e.sources.size < 30);
    e.stop(); zero(e);
    e.start(.5); ctx.state = 'closed'; e.tick(); zero(e);
  });
  assert.equal(liveTimers.size, 0);
  console.log(JSON.stringify({ result: 'PASS', cases, realBrowser: false, productionAcceptance: false }));
} finally {
  globalThis.setInterval = realInterval; globalThis.clearInterval = realClear;
  delete globalThis.AudioContext;
}
