import assert from 'node:assert/strict';
import * as THREE from 'three';
import { buildWorld, buildStudioWorld, BENCH_Y, SHELF } from '../../src/lab/owned/chemistry/world.js';
import { Sound } from '../../src/lab/owned/chemistry/sound.js';
import { Music, PALETTE } from '../../src/lab/owned/music/glow.js';
import { FakeAudioContext, deferred } from '../owned-music/fake-audio.mjs';
let cases = 0;
const test = async (name, fn) => { await fn(); console.log('PASS', name); cases++; };
await test('independent room exposes exact consumer API and valid reflection texture', () => {
  for (const create of [buildWorld, buildStudioWorld]) {
    const scene = new THREE.Scene(), original = new THREE.Color('red'); scene.background = original;
    const world = create(null, scene); assert(world.env.isTexture); assert(world.key.isDirectionalLight); assert(world.key.castShadow);
    world.key.shadow.mapSize.set(2048, 2048); assert.equal(world.key.shadow.mapSize.x, 2048);
    scene.updateMatrixWorld(true);
    const ray = new THREE.Raycaster(new THREE.Vector3(.9, 2, .1), new THREE.Vector3(0, -1, 0));
    const hit = ray.intersectObjects(world.surfaces, false)[0]; assert(Math.abs(hit.point.y - BENCH_Y) < 1e-6); assert.equal(hit.object.userData.surface, 'bench');
    for (const height of SHELF.tiers) for (let k = 0; k < 15; k++) {
      const x = -.567 + k * .081; ray.set(new THREE.Vector3(x, height + .05, SHELF.z), new THREE.Vector3(0, -1, 0));
      const h = ray.intersectObjects(world.surfaces, false)[0]; assert.equal(h.object.userData.surface, 'shelf'); assert(Math.abs(h.point.y - height) < 1e-6);
    }
    assert(world.colliders.every(b => !b.isEmpty())); assert(world.bounds.containsPoint(world.spawn));
    let triangles = 0, meshes = 0; world.root.traverse(o => { if (o.isMesh) { meshes++; triangles += o.geometry.index.count / 3; } });
    assert(meshes <= 100 && triangles <= 25000);
    world.dispose(); assert.equal(scene.background, original);
  }
});
await test('palette pulse clamping, immediate null baseline, bounded update resources', () => {
  const world = buildWorld(null, new THREE.Scene()), baseline = world.lights.map(l => l.intensity), d = world.diagnostics();
  world.update(1 / 60, { kick: 1, snare: .7, hat: .4, bar: 1, level: .9 }, PALETTE);
  assert(world.lights[0].intensity > baseline[0]); assert.equal(world.lights[0].color.getHexString(), PALETTE[1][0].slice(1));
  world.update(.1, null, PALETTE); assert.deepEqual(world.lights.map(l => l.intensity), baseline);
  for (let i = 0; i < 10000; i++) world.update(NaN, { bar: i % 2 ? NaN : -Infinity, kick: NaN, snare: Infinity, hat: -.1 }, [['bad']]);
  assert.deepEqual(world.diagnostics(), d); assert(world.lights.every(l => Number.isFinite(l.intensity)));
  world.setLight(NaN); assert.equal(world.key.intensity, 0); world.setLight(9); assert(world.key.intensity > 0); world.dispose();
});
await test('world disposes exactly owned resources once and preserves consumer surfaces/state', () => {
  const scene = new THREE.Scene(), world = buildWorld(null, scene), resources = new Set([world.env]);
  world.root.traverse(o => { if (o.geometry) resources.add(o.geometry); if (o.material) resources.add(o.material); });
  const counts = new Map(); for (const resource of resources) { counts.set(resource, 0); resource.addEventListener('dispose', () => counts.set(resource, counts.get(resource) + 1)); }
  const external = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial()); scene.add(external); world.surfaces.push(external);
  const newer = new THREE.Color('blue'); scene.background = newer;
  world.dispose(); world.dispose(); assert([...counts.values()].every(n => n === 1)); assert.equal(scene.background, newer);
  assert.equal(external.parent, scene); assert.deepEqual(world.surfaces, [external]); assert.equal(world.diagnostics().nodes, 0);
  external.geometry.dispose(); external.material.dispose();
});
const realContext = globalThis.AudioContext; globalThis.AudioContext = FakeAudioContext;
try {
  await test('lazy sound init, five fixed loop graphs and bounded set controls', () => {
    const sound = new Sound(), before = FakeAudioContext.instances.length;
    sound.set('pour', .5); assert.equal(sound.ctx, null); assert.equal(sound.burst('unknown'), false);
    const ctx = sound.init(); assert.equal(sound.ctx, ctx); assert.equal(sound.init(), ctx); assert.equal(FakeAudioContext.instances.length, before + 1);
    const d = sound.diagnostics(); assert.equal(d.loops, 5); assert.equal(d.sources, 10); assert.equal(d.timers, 0);
    for (let k = 0; k < 1000; k++) for (const name of Object.keys(sound.loops)) sound.set(name, k % 2 ? 3 : NaN);
    assert.deepEqual(sound.diagnostics(), d);
    for (const loop of Object.values(sound.loops)) { assert(loop.source.loop); assert.equal(loop.g.gain.events.at(-1).type, 'target'); assert(loop.g.gain.value >= 0 && loop.g.gain.value <= loop.level); }
    sound.dispose(); assert.equal(ctx.closes, 1); assert.equal(sound.diagnostics().nodes, 0); assert.equal(sound.diagnostics().sources, 0); sound.dispose(); assert.equal(ctx.closes, 1);
    assert.equal(sound.init(), null); assert.equal(sound.burst('click'), false);
  });
  await test('seven original bursts, 24 voice limit and natural source release', () => {
    const sound = new Sound(); sound.init();
    for (const name of ['click', 'clink', 'drip', 'whoosh', 'match', 'flash', 'pop']) assert(sound.burst(name));
    assert.equal(sound.voices.size, 7); const counts = new Set([...sound.voices].map(v => v.sources.size)); assert(counts.size > 1);
    for (let i = 0; i < 100; i++) sound.burst('pop'); assert.equal(sound.voices.size, 24); assert(sound.sources.size <= 10 + 24 * 3);
    sound.ctx.advance(1); assert.equal(sound.voices.size, 0); assert.equal(sound.sources.size, 10);
    sound.dispose(); assert.equal(sound.nodes.size, 0); assert.equal(sound.sources.size, 0);
  });
  await test('pending resume denial/pagehide cannot rebuild resources; listener cleanup', async () => {
    const originalAdd = globalThis.addEventListener, originalRemove = globalThis.removeEventListener, callbacks = new Set();
    globalThis.addEventListener = (name, fn) => { if (name === 'pagehide') callbacks.add(fn); };
    globalThis.removeEventListener = (name, fn) => { if (name === 'pagehide') callbacks.delete(fn); };
    try {
      const sound = new Sound(); const ctx = new FakeAudioContext({ state: 'suspended' }), gate = deferred();
      ctx.resume = () => gate.promise; globalThis.AudioContext = class { constructor() { return ctx; } };
      sound.init(); const pending = sound.pending; for (const fn of [...callbacks]) fn(); gate.reject(Error('denied')); await pending;
      assert.equal(callbacks.size, 0); assert.equal(sound.nodes.size, 0); assert.equal(sound.sources.size, 0); assert.equal(ctx.closes, 1); assert.equal(sound.init(), null);
    } finally { globalThis.AudioContext = FakeAudioContext; globalThis.addEventListener = originalAdd; globalThis.removeEventListener = originalRemove; }
  });
  await test('new Music shares Sound context; Music never closes owner context', async () => {
    const sound = new Sound(), music = new Music(sound), before = FakeAudioContext.instances.length;
    assert(music.toggle(true)); await music.pending;
    assert.equal(music.ctx, sound.ctx); assert.equal(FakeAudioContext.instances.length, before + 1);
    music.dispose(); assert.equal(sound.ctx.closes, 0); sound.burst('click'); sound.dispose(); assert.equal(sound.ctx.closes, 1);
  });
} finally { globalThis.AudioContext = realContext; }
console.log(JSON.stringify({ pass: true, cases, realBrowser: false, productionAcceptance: false }));

// Optional native browser gate. Writes only temporary evidence under the granted
// D:/deepseek-skill directory; no server is started and no production module read.
if (process.argv.includes('--browser')) {
  const { chromium } = await import('file:///D:/deepseek-skill/icbu-agent/node_modules/playwright-core/index.mjs');
  const { mkdir, writeFile } = await import('node:fs/promises');
  await mkdir('D:/deepseek-skill/owned-world-sound', { recursive: true });
  const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--mute-audio'] });
  try {
    const page = await browser.newPage({ viewport: { width: 1200, height: 850 } });
    // Private document has no Vite HMR client; parallel repository edits cannot
    // reload the evidence page while an offline render is awaiting suspension.
    await page.route('**/owned-world-sound-harness', route => route.fulfill({ contentType: 'text/html', body: '<!doctype html><title>Owned world sound audit</title><body></body>' }));
    await page.goto('http://127.0.0.1:5173/owned-world-sound-harness');
    const visual = await page.evaluate(async () => {
      const THREE = await import('/node_modules/three/build/three.module.js');
      const { buildWorld } = await import('/src/lab/owned/chemistry/world.js');
      document.body.innerHTML = ''; document.body.style.margin = '0';
      const renderer = new THREE.WebGLRenderer({ antialias: true }); renderer.setSize(1200, 850); renderer.toneMapping = THREE.NeutralToneMapping; renderer.shadowMap.enabled = true;
      document.body.append(renderer.domElement); const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(58, 1200 / 850, .01, 30);
      camera.position.set(1.55, 1.72, 2.38); camera.lookAt(0, .96, -.15);
      const world = buildWorld(renderer, scene); world.setLight(1);
      // Independent geometry-only readability reference: open glass vessel and white ticks.
      const glass = new THREE.MeshPhysicalMaterial({ color: '#e7e2ff', transparent: true, opacity: .28, roughness: .12, metalness: 0, side: THREE.DoubleSide, envMap: world.env });
      const vessel = new THREE.Mesh(new THREE.CylinderGeometry(.08, .075, .19, 48, 1, true), glass); vessel.position.set(-.18, .915, .1); scene.add(vessel);
      const white = new THREE.MeshBasicMaterial({ color: 'white' });
      for (let i = 0; i < 6; i++) { const tick = new THREE.Mesh(new THREE.BoxGeometry(i % 2 ? .018 : .032, .0025, .001), white); tick.position.set(-.18, .85 + i * .025, .178); scene.add(tick); }
      const tile = new THREE.Mesh(new THREE.BoxGeometry(.16, .004, .12), new THREE.MeshStandardMaterial({ color: '#e5dfeb', roughness: .8 })); tile.position.set(.17, .824, .1); scene.add(tile);
      renderer.render(scene, camera);
      window.__ownedWorldTest = { renderer, scene, camera, world };
      return { drawCalls: renderer.info.render.calls, triangles: renderer.info.render.triangles, texture: world.env.isTexture, diagnostics: world.diagnostics() };
    });
    await page.screenshot({ path: 'D:/deepseek-skill/owned-world-sound/room.png' });
    const lightCheck = await page.evaluate(() => {
      const { world, renderer, scene, camera } = window.__ownedWorldTest;
      const baseline = world.lights.map(l => l.intensity); world.setLight(.12); const darkKey = world.key.intensity;
      world.update(.016, { kick: 1, snare: .8, hat: .6, bar: 2, level: 1 }, [['#8844cc', '#442266', '#33bbaa']]); renderer.render(scene, camera);
      const active = world.lights.map(l => ({ intensity: l.intensity, color: l.color.getHexString() }));
      return { baseline, darkKey, active };

    });
    await page.screenshot({ path: 'D:/deepseek-skill/owned-world-sound/room-pulse.png' });
    Object.assign(lightCheck, await page.evaluate(() => { const { world, renderer, scene, camera } = window.__ownedWorldTest; world.update(.016, null, null); renderer.render(scene, camera); const stopped = world.lights.map(l => l.intensity); return { stopped, nullResets: stopped.every(v => Math.abs(v - .024) < 1e-8) }; }));
    await page.screenshot({ path: 'D:/deepseek-skill/owned-world-sound/room-dark.png' });
    const audio = await page.evaluate(async () => {
      const { Sound } = await import('/src/lab/owned/chemistry/sound.js');
      const { ScoreEngine } = await import('/src/lab/owned/music/engine.js');
      const Native = window.AudioContext, results = [];
      const measure = data => { let peak = 0, sum = 0; for (const x of data) { if (!Number.isFinite(x)) throw Error('nonfinite'); peak = Math.max(peak, Math.abs(x)); sum += x * x; } return { peak, rms: Math.sqrt(sum / data.length) }; };
      try {
        for (const name of ['pour', 'fizz', 'boil', 'hiss', 'flame', 'click', 'clink', 'drip', 'whoosh', 'match', 'flash', 'pop', 'combined']) {
          const ctx = new OfflineAudioContext(1, 48000 * 2, 48000); window.AudioContext = class { constructor() { return ctx; } };
          const sound = new Sound(); sound.init(); let music, stopPromise;
          if (name in sound.loops) {
            sound.set(name, 1);
            stopPromise = ctx.suspend(1.2).then(() => { sound.set(name, 0); return ctx.resume(); });
          } else if (name === 'combined') {
            for (const n of Object.keys(sound.loops)) sound.set(n, 1);
            for (let i = 0; i < 24; i++) sound.burst('pop');
            music = new ScoreEngine(ctx); music.start(.5, { manual: true }); music.scheduleUntil(1.3);
          } else sound.burst(name);
          const loops = [];
          for (const [n, loop] of Object.entries(sound.loops)) {
            const pcm = loop.source.buffer.getChannelData(0); let normal = 0;
            for (let i = 1; i < pcm.length; i++) normal = Math.max(normal, Math.abs(pcm[i] - pcm[i - 1]));
            const seam = Math.abs(pcm[0] - pcm.at(-1)), analytic = loop.source.buffer.ownedContinuity;
            const lastSampleError = Math.abs(pcm.at(-1) - analytic.expectedLast), nextSampleError = Math.abs(pcm[0] - analytic.expectedNext);
            loops.push({ name: n, seamAdjacent: seam, maximumNormalAdjacent: normal, analytic, lastSampleError, nextSampleError, pass: seam <= normal + 1e-6 && analytic.valueError < 1e-8 && analytic.slopeErrorPerSecond < 1e-5 && lastSampleError < 1e-6 && nextSampleError < 1e-6 });
          }
          const buffer = await ctx.startRendering(); await stopPromise;
          const data = buffer.getChannelData(0), full = measure(data), tail = measure(data.slice(-4800));
          const early = measure(data.slice(4800, 48000)); music?.stop(); sound.dispose();
          results.push({ name, ...full, early, tail, loopContinuity: loops, resources: sound.diagnostics(), pass: full.peak >= .001 && full.peak < .98 && full.rms >= .0001 && full.rms < .3 && (name === 'combined' || tail.peak < 1e-5) && loops.every(x => x.pass) && ['nodes', 'sources', 'voices', 'loops', 'timers'].every(k => sound.diagnostics()[k] === 0) });
        }
        window.AudioContext = Native;
        const sound = new Sound(); sound.init(); await sound.pending; const { Music } = await import('/src/lab/owned/music/glow.js'); const music = new Music(sound); music.toggle(true); await music.pending;
        const shared = { sameContext: music.ctx === sound.ctx, state: sound.ctx.state }; music.dispose(); shared.afterMusicState = sound.ctx.state; sound.dispose(); await sound.closed; shared.afterSoundState = sound.ctx.state; shared.resources = sound.diagnostics();
        return { results, shared, pass: results.every(x => x.pass) && shared.sameContext && shared.afterMusicState === 'running' && shared.afterSoundState === 'closed' && ['nodes', 'sources', 'voices', 'loops', 'timers'].every(k => shared.resources[k] === 0) };
      } finally { window.AudioContext = Native; }
    });
    await page.evaluate(() => { const t = window.__ownedWorldTest; t.world.dispose(); t.scene.traverse(o => { o.geometry?.dispose(); for (const m of [].concat(o.material || [])) m.dispose(); }); t.renderer.dispose(); });
    const report = { kind: 'native-browser-candidate', pass: visual.drawCalls <= 100 && visual.triangles <= 25000 && lightCheck.nullResets && audio.pass, capturedAt: new Date().toISOString(), screenshots: { room: 'setLight(1), no pulse, before night state', pulse: 'setLight(.12), active kick/snare/hat, before null reset', dark: 'setLight(.12), pulse null' }, visual, lightCheck, audio, productionAcceptance: false };
    await writeFile('D:/deepseek-skill/owned-world-sound/report.json', JSON.stringify(report, null, 2));
    assert(report.pass, JSON.stringify({ visual, lightCheck, failedAudio: audio.results.filter(r => !r.pass), shared: audio.shared }));
    console.log(JSON.stringify({ pass: report.pass, visual, lightCheck, audio: audio.results.map(r => ({ name: r.name, pass: r.pass, peak: r.peak, rms: r.rms, tail: r.tail, continuity: r.loopContinuity.every(x => x.pass) })), shared: audio.shared, report: 'D:/deepseek-skill/owned-world-sound/report.json', productionAcceptance: false }));
  } finally { await browser.close(); }
}

