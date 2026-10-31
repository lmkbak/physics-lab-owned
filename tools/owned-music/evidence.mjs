import { ScoreEngine, STEP } from '../../src/lab/owned/music/engine.js';
import { BeatMusic } from '../../src/lab/owned/music/beat.js';
import { Music, PALETTE } from '../../src/lab/owned/music/glow.js';

function stats(buffer, from = 0, to = buffer.duration) {
  let peak = 0, sum = 0, count = 0, finite = true;
  for (let c = 0; c < buffer.numberOfChannels; c++) {
    const data = buffer.getChannelData(c);
    for (let i = Math.floor(from * buffer.sampleRate); i < Math.min(data.length, Math.floor(to * buffer.sampleRate)); i++) {
      const x = data[i]; finite &&= Number.isFinite(x); peak = Math.max(peak, Math.abs(x)); sum += x * x; count++;
    }
  }
  return { peak, rms: Math.sqrt(sum / Math.max(1, count)), finite };
}
export function wav(buffer) {
  const channels = buffer.numberOfChannels, length = buffer.length, bytes = new ArrayBuffer(44 + length * channels * 2);
  const view = new DataView(bytes), text = (offset, s) => [...s].forEach((c, i) => view.setUint8(offset + i, c.charCodeAt(0)));
  text(0, 'RIFF'); view.setUint32(4, bytes.byteLength - 8, true); text(8, 'WAVE'); text(12, 'fmt ');
  view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, channels, true);
  view.setUint32(24, buffer.sampleRate, true); view.setUint32(28, buffer.sampleRate * channels * 2, true);
  view.setUint16(32, channels * 2, true); view.setUint16(34, 16, true); text(36, 'data'); view.setUint32(40, bytes.byteLength - 44, true);
  const data = Array.from({ length: channels }, (_, c) => buffer.getChannelData(c));
  for (let i = 0; i < length; i++) for (let c = 0; c < channels; c++) view.setInt16(44 + (i * channels + c) * 2, Math.round(Math.max(-1, Math.min(1, data[c][i])) * 32767), true);
  return new Blob([bytes], { type: 'audio/wav' });
}
export async function renderOffline() {
  const rate = 48000, scoreSeconds = STEP * 16 * 12, duration = scoreSeconds + 4;
  const ctx = new OfflineAudioContext(2, Math.ceil(duration * rate), rate), engine = new ScoreEngine(ctx);
  engine.start(.5, { manual: true, startAt: .1 });
  engine.scheduleUntil(scoreSeconds);
  const cutoff = scoreSeconds + 3.4;
  engine.out.gain.setValueAtTime(.5, cutoff);
  engine.out.gain.linearRampToValueAtTime(0, cutoff + .05);
  const buffer = await ctx.startRendering();
  const full = stats(buffer), tail = stats(buffer, duration - .1), sections = [];
  for (let phrase = 0; phrase < 3; phrase++) sections.push(stats(buffer, phrase * STEP * 64 + .1, (phrase + 1) * STEP * 64));
  const counts = { ...engine.counts }; engine.stop();
  const resources = engine.diagnostics();
  const pass = full.finite && full.peak > .02 && full.peak <= .98 && full.rms >= .005 && full.rms <= .35 && tail.peak < 1e-5 && resources.nodes === 0 && resources.sources === 0;
  return { buffer, report: { kind: 'OfflineAudioContext', pass, full, tail, sections, counts, resources, sampleRate: rate, duration, productionAcceptance: false } };
}
export async function renderStems() {
  const results = [];
  for (const part of ['kick', 'snare', 'hat', 'bass', 'pad', 'pluck']) {
    const ctx = new OfflineAudioContext(2, 48000 * 3, 48000), engine = new ScoreEngine(ctx);
    engine.start(.5, { manual: true, startAt: .1 });
    if (part === 'kick') engine.kick(.1, 1);
    else if (part === 'snare' || part === 'hat') engine.noiseHit(part, .1, 1);
    else engine.tone(part, .1, part === 'bass' ? 33 : 69, part === 'pad' ? 1.5 : .5, part === 'pad' ? .08 : .17, part === 'pad' ? 'sawtooth' : 'triangle', part === 'bass' ? 650 : 2400);
    const buffer = await ctx.startRendering(), measured = stats(buffer);
    engine.stop();
    results.push({ part, ...measured, pass: measured.finite && measured.peak > .001 && measured.peak <= .98, resources: engine.diagnostics() });
  }
  return results;
}

// Real-time evidence only runs after an explicit browser gesture.
export function recordRealtime(adapter = 'beat', durationMs = 6000, onSample = () => {}, { readPulse = m => m.pulse() } = {}) {
  const sound = { ctx: null, init() { this.ctx ??= new AudioContext({ latencyHint: 'interactive' }); } };
  const music = adapter === 'glow' ? new Music(sound) : new BeatMusic();
  const opening = adapter === 'glow' ? (music.toggle(true), music.pending) : music.start(.5);
  let interval, timeout, settleCancel, cancelled = false;
  const cleanup = () => { clearInterval(interval); clearTimeout(timeout); music.dispose(); if (sound.ctx?.state !== 'closed') sound.ctx?.close(); };
  const cancellation = new Promise(resolve => { settleCancel = resolve; });
  const running = Promise.resolve(opening).then(() => new Promise((resolve, reject) => {
    if (cancelled) { resolve({ cancelled: true, pass: false }); return; }
    if (!music.on || !music.engine) { cleanup(); reject(Error('Audio resume denied')); return; }
    const samples = [];
    interval = setInterval(() => {
      const engine = music.engine, ctx = music.ctx, wall = performance.now(), pulse = readPulse(music);
      // Independent observer: never calls the candidate engine's audibleTime().
      const stamp = ctx.getOutputTimestamp?.();
      const age = stamp ? (wall - stamp.performanceTime) / 1000 : Infinity;
      const audibleTime = stamp?.contextTime > 0 && age >= 0 && age < .5
        ? Math.min(ctx.currentTime, stamp.contextTime + age)
        : ctx.currentTime - (ctx.baseLatency || 0) - (ctx.outputLatency || 0);
      samples.push({ performanceTime: wall, contextTime: ctx.currentTime, audibleTime, pulse, events: engine.events.filter(e => e.time <= audibleTime).slice(-1) });
      onSample(samples.at(-1));
    }, 20);
    timeout = setTimeout(() => {
      const events = new Map();
      for (const sample of samples) for (const e of sample.events) {
        const observed = adapter === 'beat' ? sample.pulse?.beat : sample.pulse?.kick;
        if (e.kick && observed > .2 && !events.has(e.time)) events.set(e.time, Math.max(0, sample.audibleTime - e.time));
      }
      const onsetErrorsMs = [...events.values()].map(x => x * 1000);
      const before = music.diagnostics(); music.stop();
      const stoppedPulse = music.pulse(), after = music.diagnostics();
      cleanup();
      const maximumOnsetErrorMs = Math.max(0, ...onsetErrorsMs);
      const stopped = adapter === 'beat' ? stoppedPulse?.beat === 0 && stoppedPulse?.chord === -1 : stoppedPulse === null;
      resolve({ kind: 'AudioContext', adapter, samples, before, after, stoppedPulse, onsetErrorsMs, maximumOnsetErrorMs, pass: samples.length > Math.min(100, durationMs / 40) && onsetErrorsMs.length > 2 && maximumOnsetErrorMs <= 40 && stopped && ['nodes', 'sources', 'voices', 'events', 'timers'].every(k => after[k] === 0), productionAcceptance: false });
    }, durationMs);
  })).catch(error => { cleanup(); throw error; });
  const result = Promise.race([running, cancellation]);
  return { result, cancel: () => { cancelled = true; cleanup(); settleCancel({ cancelled: true, pass: false, after: music.diagnostics() }); } };
}

if (typeof document !== 'undefined') {
  const output = document.querySelector('#report'), audio = document.querySelector('audio'), lamps = document.querySelectorAll('.lamp');
  const show = value => { output.textContent = JSON.stringify(value, null, 2); window.__ownedMusicEvidence = value; };
  let recording, audioUrl, uiGeneration = 0;
  document.querySelector('#offline')?.addEventListener('click', async () => {
    try {
      show({ status: 'rendering' });
      const { buffer, report } = await renderOffline(); report.stems = await renderStems(); report.pass &&= report.stems.every(s => s.pass);
      if (audioUrl) URL.revokeObjectURL(audioUrl); audioUrl = URL.createObjectURL(wav(buffer)); audio.src = audioUrl;
      const link = document.querySelector('#wav'); link.href = audioUrl; link.hidden = false;
      show(report);
    } catch (e) { show({ error: e.message, pass: false }); }
  });
  for (const adapter of ['beat', 'glow']) document.querySelector(`#${adapter}`)?.addEventListener('click', async () => {
    const generation = ++uiGeneration;
    recording?.cancel(); recording = recordRealtime(adapter, 6000, sample => {
      if (generation !== uiGeneration) return;
      const pulse = sample.pulse, bar = pulse?.bar ?? pulse?.chord ?? 0, strength = pulse?.beat ?? pulse?.level ?? 0;
      lamps.forEach((lamp, i) => { lamp.style.background = PALETTE[Math.max(0, bar) % 4][i]; lamp.style.opacity = String(.15 + strength * .85); });
    });
    try { const report = await recording.result; if (generation === uiGeneration) show(report); }
    catch (e) { if (generation === uiGeneration) show({ pass: false, error: e.message }); }
    if (generation === uiGeneration) lamps.forEach(lamp => { lamp.style.opacity = '0'; });
  });
  globalThis.addEventListener('pagehide', () => { recording?.cancel(); if (audioUrl) URL.revokeObjectURL(audioUrl); });
}
