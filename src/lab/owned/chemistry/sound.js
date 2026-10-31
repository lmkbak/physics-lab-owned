// Original procedural laboratory sounds. No media, network, or external samples.
const clamp = value => Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0;
const attempt = fn => { try { return fn(); } catch { return undefined; } };
const LOOP = Object.freeze({ pour: ['bandpass', 850, .24], fizz: ['highpass', 3200, .12], boil: ['lowpass', 900, .30], hiss: ['highpass', 4200, .10], flame: ['lowpass', 1500, .25] });
const BURSTS = new Set(['click', 'clink', 'drip', 'whoosh', 'match', 'flash', 'pop']);

export class Sound {
  constructor() {
    this.ctx = null; this.master = null; this.loops = {}; this.noise = null;
    this.nodes = new Set(); this.sources = new Set(); this.voices = new Set();
    this.targets = {}; this.disposed = false; this.lastError = null; this.pending = null;
    this.pagehide = () => this.dispose(); globalThis.addEventListener?.('pagehide', this.pagehide);
  }
  node(node, voice) { this.nodes.add(node); voice?.nodes.push(node); return node; }
  gain(value, voice) { const gain = this.node(this.ctx.createGain(), voice); gain.gain.value = value; return gain; }
  init() {
    if (this.disposed) return null;
    if (!this.ctx) {
      const Context = globalThis.AudioContext || globalThis.webkitAudioContext;
      if (!Context) { this.lastError = new Error('Web Audio unavailable'); return null; }
      try {
        this.ctx = new Context({ latencyHint: 'interactive' });
        this.master = this.gain(.09); this.master.connect(this.ctx.destination);
        this.noise = this.periodicBuffer(719, 0x6a31);
        let index = 0;
        for (const [name, [type, hz, level]] of Object.entries(LOOP)) {
          const source = this.node(this.ctx.createBufferSource()); source.buffer = this.periodicBuffer(503 + 181 * index, 0x1551 + index); source.loop = true;
          const f = this.node(this.ctx.createBiquadFilter()); f.type = type; f.frequency.value = hz;
          const g = this.gain(0); source.connect(f); f.connect(g); g.connect(this.master);
          // Audio-rate LFO, not a JS timer, supplies physical fluctuation.
          const lfo = this.node(this.ctx.createOscillator()), depth = this.gain(hz * .08);
          lfo.frequency.value = [5, 13, 2, 7, 3][index]; lfo.connect(depth); depth.connect(f.frequency);
          source.start(); lfo.start(); this.sources.add(source); this.sources.add(lfo);
          this.loops[name] = { g, f, source, lfo, depth, level };
          this.set(name, this.targets[name] || 0); index++;
        }
      } catch (error) { this.lastError = error; this.dispose(); return null; }
    }
    if (this.ctx.state === 'closed') return null;
    if (this.ctx.state !== 'running' && typeof this.ctx.resume === 'function') {
      try {
        this.pending ??= Promise.resolve(this.ctx.resume()).catch(error => { this.lastError = error; }).finally(() => { this.pending = null; });
      } catch (error) { this.lastError = error; }
    }
    return this.ctx;
  }
  periodicBuffer(harmonics, seed) {
    const ctx = this.ctx, length = Math.round(ctx.sampleRate), buffer = ctx.createBuffer(1, length, ctx.sampleRate), data = buffer.getChannelData(0);
    // Integer-frequency Fourier modes make x(0)=x(1) and equal derivatives.
    // Sparse modes avoid an FFT dependency while covering the desired noise band.
    const modes = 96, terms = [];
    for (let k = 0; k < modes; k++) {
      seed = (Math.imul(seed, 1664525) + 1013904223) | 0;
      const frequency = 37 + ((seed >>> 0) % Math.min(harmonics * 15, Math.floor(ctx.sampleRate / 2) - 100));
      const phase = ((seed >>> 8) / 16777216) * Math.PI * 2;
      terms.push([frequency, phase]);
      for (let i = 0; i < length; i++) data[i] += Math.sin(i / length * frequency * Math.PI * 2 + phase) / modes;
    }
    let peak = 0; for (const x of data) peak = Math.max(peak, Math.abs(x));
    const scale = .8 / Math.max(.01, peak); for (let i = 0; i < length; i++) data[i] *= scale;
    // Expose only analytic boundary evidence, not a second audio signal path.
    const valueAt = t => terms.reduce((sum, [f, p]) => sum + Math.sin(t * f * 2 * Math.PI + p) / modes, 0) * scale;
    const slopeAt = t => terms.reduce((sum, [f, p]) => sum + Math.cos(t * f * 2 * Math.PI + p) * f * 2 * Math.PI / modes, 0) * scale;
    buffer.ownedContinuity = { valueError: Math.abs(valueAt(0) - valueAt(1)), slopeErrorPerSecond: Math.abs(slopeAt(0) - slopeAt(1)), expectedLast: valueAt((length - 1) / length), expectedNext: valueAt(1) };
    return buffer;
  }
  set(name, value) {
    if (this.disposed || !Object.hasOwn(LOOP, name)) return false;
    const amount = clamp(value); this.targets[name] = amount;
    const loop = this.loops[name];
    if (loop && this.ctx?.state !== 'closed') {
      const now = this.ctx.currentTime;
      loop.g.gain.cancelScheduledValues(now); loop.g.gain.setTargetAtTime(amount * loop.level, now, .025);
    }
    return true;
  }
  voice(name) {
    if (this.voices.size >= 24) this.release(this.voices.values().next().value, true);
    const voice = { name, nodes: [], sources: new Set() }; this.voices.add(voice); return voice;
  }
  source(voice, node, time, duration) {
    this.node(node, voice); this.sources.add(node); voice.sources.add(node);
    node.onended = () => { this.sources.delete(node); voice.sources.delete(node); if (!voice.sources.size) this.release(voice); };
    node.start(time); node.stop(time + duration); return node;
  }
  release(voice, stop = false) {
    if (!this.voices.delete(voice)) return;
    for (const source of voice.sources) { source.onended = null; if (stop) attempt(() => source.stop(this.ctx.currentTime)); this.sources.delete(source); }
    voice.sources.clear();
    for (const n of voice.nodes) { attempt(() => n.disconnect()); this.nodes.delete(n); }
  }
  tone(voice, time, frequency, endFrequency, duration, level, type = 'sine') {
    const osc = this.ctx.createOscillator(); osc.type = type;
    osc.frequency.setValueAtTime(frequency, time); osc.frequency.exponentialRampToValueAtTime(endFrequency, time + duration * .8);
    const amp = this.gain(0, voice); amp.gain.setValueAtTime(0, time); amp.gain.linearRampToValueAtTime(level, time + .002);
    amp.gain.exponentialRampToValueAtTime(.00001, time + duration - .004); amp.gain.setValueAtTime(0, time + duration);
    osc.connect(amp); amp.connect(this.master); this.source(voice, osc, time, duration + .002);
  }
  noiseBurst(voice, time, duration, frequency, endFrequency, level, type = 'bandpass') {
    const source = this.ctx.createBufferSource(); source.buffer = this.noise;
    const filter = this.node(this.ctx.createBiquadFilter(), voice); filter.type = type; filter.Q.value = .8;
    filter.frequency.setValueAtTime(frequency, time); filter.frequency.exponentialRampToValueAtTime(endFrequency, time + duration);
    const amp = this.gain(0, voice); amp.gain.setValueAtTime(0, time); amp.gain.linearRampToValueAtTime(level, time + .003);
    amp.gain.exponentialRampToValueAtTime(.00001, time + duration - .003); amp.gain.setValueAtTime(0, time + duration);
    source.connect(filter); filter.connect(amp); amp.connect(this.master); this.source(voice, source, time, duration + .002);
  }
  burst(name) {
    if (this.disposed || !BURSTS.has(name)) return false;
    if (!this.init() || this.ctx.state === 'closed') return false;
    const time = this.ctx.currentTime + .004, v = this.voice(name);
    if (name === 'click') { this.tone(v, time, 1450, 620, .025, .10, 'triangle'); this.tone(v, time + .012, 840, 380, .026, .06); }
    if (name === 'clink') for (const [hz, peak, duration] of [[1270, .15, .36], [2183, .08, .24], [3461, .05, .17]]) this.tone(v, time, hz, hz, duration, peak);
    if (name === 'drip') this.tone(v, time, 1050, 360, .18, .20);
    if (name === 'whoosh') this.noiseBurst(v, time, .42, 320, 3200, .40);
    if (name === 'match') this.noiseBurst(v, time, .19, 6200, 1800, .28, 'highpass');
    if (name === 'flash') { this.tone(v, time, 2800, 4200, .13, .10); this.noiseBurst(v, time, .16, 4800, 9000, .12, 'highpass'); }
    if (name === 'pop') { this.tone(v, time, 190, 46, .24, .32); this.noiseBurst(v, time, .095, 2100, 400, .14); }
    return true;
  }
  diagnostics() { return { nodes: this.nodes.size, sources: this.sources.size, voices: this.voices.size, loops: Object.keys(this.loops).length, timers: 0, disposed: this.disposed }; }
  dispose() {
    if (this.disposed) return; this.disposed = true;
    globalThis.removeEventListener?.('pagehide', this.pagehide);
    for (const voice of [...this.voices]) this.release(voice, true);
    for (const source of this.sources) { source.onended = null; attempt(() => source.stop(this.ctx.currentTime)); }
    this.sources.clear(); for (const node of this.nodes) attempt(() => node.disconnect()); this.nodes.clear();
    this.loops = {}; this.noise = null; this.master = null;
    if (this.ctx && this.ctx.state !== 'closed') this.closed = attempt(() => Promise.resolve(this.ctx.close()).catch(() => {}));
  }
}
