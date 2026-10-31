// Original synthesis and score; only Web Audio primitives, no assets or samples.
export const BPM = 108;
export const STEP = 60 / BPM / 4;
export const clampVolume = v => Number.isFinite(Number(v)) ? Math.min(1, Math.max(0, Number(v))) : 0;
const midi = n => 440 * 2 ** ((n - 69) / 12);
const HARMONY = [[45, 52, 59, 62], [48, 55, 59, 64], [43, 50, 57, 62], [47, 54, 57, 64]];
const KICKS = [[0, 7, 10], [0, 6, 11], [0, 5, 10, 14], [0, 7, 13]];
const BASS = [0, 3, 7, 10, 14];
const PLUCK = [2, 5, 9, 12, 15];
const safe = fn => { try { return fn(); } catch { return undefined; } };

export class ScoreEngine {
  constructor(ctx) {
    this.ctx = ctx;
    this.nodes = new Set();
    this.sources = new Set();
    this.voices = new Set();
    this.events = [];
    this.counts = { kick: 0, snare: 0, hat: 0, bass: 0, pad: 0, pluck: 0 };
    this.on = false;
    this.timer = null;
    this.volume = .5;
    this.noise = null;
  }
  node(node, voice) {
    this.nodes.add(node);
    if (voice) voice.nodes.push(node);
    return node;
  }
  gain(value, voice) {
    const n = this.node(this.ctx.createGain(), voice);
    n.gain.value = value;
    return n;
  }
  filter(type, frequency, voice) {
    const f = this.node(this.ctx.createBiquadFilter(), voice);
    f.type = type;
    f.frequency.value = frequency;
    return f;
  }
  graph(volume) {
    this.volume = clampVolume(volume);
    this.out = this.gain(this.volume);
    this.dry = this.gain(.65);
    this.duck = this.gain(1);
    this.wet = this.gain(.22);
    this.feedback = this.gain(.31);
    this.delay = this.node(this.ctx.createDelay(2));
    this.delay.delayTime.value = STEP * 3;
    this.echoFilter = this.filter('lowpass', 2400);
    this.duck.connect(this.dry);
    this.duck.connect(this.delay);
    this.dry.connect(this.out);
    this.delay.connect(this.echoFilter);
    this.echoFilter.connect(this.feedback);
    this.feedback.connect(this.delay);
    // Echo is ducked too; feedback remains below unity even at full volume.
    this.echoFilter.connect(this.wet);
    this.wet.connect(this.out);
    this.out.connect(this.ctx.destination);
    this.noise = this.ctx.createBuffer(1, Math.ceil(this.ctx.sampleRate * .3), this.ctx.sampleRate);
    const data = this.noise.getChannelData(0);
    let seed = 0x6d39e124;
    for (let i = 0; i < data.length; i++) {
      seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5;
      data[i] = (seed >>> 0) / 2147483648 - 1;
    }
  }
  start(volume = .5, { manual = false, startAt = this.ctx.currentTime + .035 } = {}) {
    this.stop();
    this.graph(volume);
    this.on = true;
    this.index = 0;
    this.origin = startAt;
    this.next = startAt;
    if (!manual) {
      this.tick();
      this.timer = setInterval(() => this.tick(), 25);
    }
  }
  tick() {
    if (this.ctx.state === 'closed') { this.stop(); return; }
    if (!this.on || this.ctx.state !== 'running') return;
    const now = this.ctx.currentTime;
    // A stalled tab skips missing steps, never emits a burst of stale notes.
    if (this.next < now - .04) {
      this.index = Math.max(this.index, Math.ceil((now + .015 - this.origin) / STEP));
      this.next = this.origin + this.index * STEP;
    }
    this.scheduleUntil(now + .12);
    this.events = this.events.filter(e => e.time >= now - 3);
  }
  scheduleUntil(end) {
    while (this.on && this.next < end) {
      this.step(this.index, this.next);
      this.index++;
      this.next = this.origin + this.index * STEP;
    }
  }
  voice(part, time, duration) {
    this.counts[part]++;
    const v = { part, nodes: [], sources: new Set(), end: time + duration };
    this.voices.add(v);
    return v;
  }
  source(v, source, time, end) {
    this.node(source, v);
    this.sources.add(source);
    v.sources.add(source);
    source.onended = () => {
      this.sources.delete(source);
      v.sources.delete(source);
      if (!v.sources.size) this.release(v);
    };
    source.start(time);
    source.stop(end);
    return source;
  }
  release(v) {
    if (!this.voices.delete(v)) return;
    for (const n of v.nodes) {
      safe(() => n.disconnect());
      this.nodes.delete(n);
    }
  }
  envelope(v, time, duration, peak, attack = .004) {
    const amp = this.gain(0, v);
    amp.gain.setValueAtTime(0, time);
    amp.gain.linearRampToValueAtTime(peak, time + attack);
    amp.gain.exponentialRampToValueAtTime(.0001, time + duration);
    amp.gain.setValueAtTime(0, time + duration + .002);
    return amp;
  }
  tone(part, time, note, duration, peak, type, cutoff, detune = 0) {
    const v = this.voice(part, time, duration);
    const osc = this.ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(midi(note), time);
    osc.detune.value = detune;
    const f = this.filter('lowpass', cutoff, v);
    const amp = this.envelope(v, time, duration, peak, part === 'pad' ? .11 : .006);
    osc.connect(f); f.connect(amp); amp.connect(this.duck);
    this.source(v, osc, time, time + duration + .005);
  }
  kick(time, strength) {
    const v = this.voice('kick', time, .32);
    const osc = this.ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(142, time);
    osc.frequency.exponentialRampToValueAtTime(43, time + .14);
    const amp = this.envelope(v, time, .29, strength * .55, .002);
    osc.connect(amp); amp.connect(this.dry);
    this.source(v, osc, time, time + .32);
    this.duck.gain.setValueAtTime(1, time);
    this.duck.gain.linearRampToValueAtTime(.28, time + .006);
    this.duck.gain.exponentialRampToValueAtTime(1, time + .23);
    this.wet.gain.setValueAtTime(.22, time);
    this.wet.gain.linearRampToValueAtTime(.07, time + .006);
    this.wet.gain.linearRampToValueAtTime(.22, time + .23);
  }
  noiseHit(part, time, strength) {
    const hat = part === 'hat';
    const duration = hat ? .055 : .18;
    const v = this.voice(part, time, duration);
    const source = this.ctx.createBufferSource(); source.buffer = this.noise;
    const f = this.filter('highpass', hat ? 6900 : 1500, v);
    const amp = this.envelope(v, time, duration, strength * (hat ? .1 : .23), .001);
    source.connect(f); f.connect(amp); amp.connect(this.dry);
    this.source(v, source, time, time + duration + .005);
    if (!hat) {
      const tone = this.ctx.createOscillator(); tone.type = 'triangle';
      tone.frequency.setValueAtTime(184, time);
      const body = this.envelope(v, time, .09, strength * .08);
      tone.connect(body); body.connect(this.dry);
      this.source(v, tone, time, time + .1);
    }
  }
  step(index, time) {
    const step = index % 16, bar = Math.floor(index / 16), chord = bar % 4;
    const phrase = Math.floor(bar / 4) % 3, notes = HARMONY[chord];
    const kick = KICKS[chord].includes(step) ? (step === 0 ? 1 : .76) : 0;
    const snare = [4, 12].includes(step) ? .88 : (chord === 3 && step === 15 ? .35 : 0);
    const hat = step % 2 === 0 ? .65 : ([3, 11].includes(step) && phrase !== 2 ? .32 : 0);
    if (kick) this.kick(time, kick);
    if (snare) this.noiseHit('snare', time, snare);
    if (hat) this.noiseHit('hat', time, hat);
    if (BASS.includes(step)) this.tone('bass', time, notes[step === 10 ? 1 : 0] - 12, STEP * 1.65, .17, 'triangle', 650);
    if (step === 0) for (let j = 0; j < 4; j++) {
      this.tone('pad', time, notes[j] + 12, STEP * 13, .025, 'sawtooth', 1100 + chord * 140, j % 2 ? 5 : -5);
    }
    if (PLUCK.includes(step) && !(phrase === 2 && step > 9)) {
      const position = (PLUCK.indexOf(step) * 3 + chord) % 4;
      this.tone('pluck', time, notes[position] + 24, STEP * 1.8, phrase === 1 ? .1 : .065, 'sine', 4200);
    }
    this.events.push({ time, bar, chord, kick, snare, hat });
  }
  audibleTime() {
    const ctx = this.ctx;
    if (typeof ctx.getOutputTimestamp === 'function') {
      const stamp = safe(() => ctx.getOutputTimestamp());
      const wall = globalThis.performance?.now?.();
      if (stamp && stamp.contextTime > 0 && Number.isFinite(stamp.performanceTime) && Number.isFinite(wall)) {
        const age = (wall - stamp.performanceTime) / 1000;
        if (age >= 0 && age < .5) return Math.min(ctx.currentTime, stamp.contextTime + age);
      }
    }
    return ctx.currentTime - (ctx.baseLatency || 0) - (ctx.outputLatency || 0);
  }
  pulse() {
    if (!this.on || this.ctx.state !== 'running' || !this.volume) return null;
    const now = this.audibleTime();
    let last = null, kick = 0, snare = 0, hat = 0;
    for (const e of this.events) {
      const age = now - e.time;
      if (age < 0) break;
      last = e;
      kick = Math.max(kick, e.kick * Math.exp(-age / .13));
      snare = Math.max(snare, e.snare * Math.exp(-age / .095));
      hat = Math.max(hat, e.hat * Math.exp(-age / .045));
    }
    if (!last) return null;
    return { kick, snare, hat, bar: last.bar, chord: last.chord, level: Math.min(1, (.6 * kick + .28 * snare + .12 * hat) * this.volume * 2) };
  }
  setVolume(volume) {
    this.volume = clampVolume(volume);
    if (this.out) {
      const now = this.ctx.currentTime;
      this.out.gain.cancelScheduledValues(now);
      this.out.gain.setTargetAtTime(this.volume, now, .012);
    }
  }
  stop() {
    this.on = false;
    if (this.timer !== null) clearInterval(this.timer);
    this.timer = null;
    const now = this.ctx.currentTime;
    if (this.out) safe(() => {
      this.out.gain.cancelScheduledValues(now);
      this.out.gain.setValueAtTime(0, now);
    });
    for (const source of this.sources) {
      source.onended = null;
      safe(() => source.stop(now));
    }
    this.sources.clear();
    for (const n of this.nodes) safe(() => n.disconnect());
    this.nodes.clear(); this.voices.clear(); this.events.length = 0;
    this.noise = null;
    this.out = this.duck = this.dry = this.delay = this.wet = this.feedback = this.echoFilter = null;
  }
  diagnostics() {
    return { nodes: this.nodes.size, sources: this.sources.size, voices: this.voices.size, events: this.events.length, timers: this.timer === null ? 0 : 1, counts: { ...this.counts } };
  }
}

// Shared lifecycle for the two public adapters. Owned contexts are never recreated.
export class MusicTransport {
  constructor(provider, ownsContext) {
    this.provider = provider;
    this.ownsContext = ownsContext;
    this.ctx = null;
    this.engine = null;
    this.on = false;
    this.disposed = false;
    this.generation = 0;
    this.pending = null;
    this.contextPromise = null;
    this.volume = .5;
    this.lastError = null;
    this.pagehide = () => this.dispose();
    globalThis.addEventListener?.('pagehide', this.pagehide);
  }
  get timer() { return this.engine?.timer ?? null; }
  get out() { return this.engine?.out ?? null; }
  get master() { return this.out; }
  get duck() { return this.engine?.duck ?? null; }
  get dry() { return this.engine?.dry ?? null; }
  get delay() { return this.engine?.delay ?? null; }
  async activate(volume = this.volume) {
    if (this.disposed) return;
    this.setVolume(volume);
    if (this.on) return this.pending ?? undefined;
    this.on = true;
    const generation = ++this.generation;
    const valid = () => !this.disposed && this.on && this.generation === generation;
    // Promise creation happens synchronously in the user gesture, including resume.
    const work = (async () => {
      try {
        if (!this.ctx) {
          if (!this.contextPromise) {
            const supplied = this.provider();
            if (supplied && typeof supplied.then === 'function') {
              this.contextPromise = Promise.resolve(supplied).then(ctx => {
                if (!ctx) throw new Error('AudioContext unavailable');
                this.ctx = ctx;
                if (this.disposed && this.ownsContext) safe(() => ctx.close()?.catch?.(() => {}));
                return ctx;
              }).finally(() => { this.contextPromise = null; });
            } else {
              if (!supplied) throw new Error('AudioContext unavailable');
              this.ctx = supplied;
            }
          }
          if (this.contextPromise) await this.contextPromise;
          if (!valid()) return;
        }
        const ctx = this.ctx;
        if (ctx.state === 'closed') throw new Error('AudioContext is closed');
        if (ctx.state !== 'running') await ctx.resume();
        if (!valid()) return;
        this.engine ??= new ScoreEngine(ctx);
        this.engine.start(this.volume);
        this.lastError = null;
      } catch (error) {
        if (!valid()) return;
        this.lastError = error;
        this.stop();
        // Resume may be denied before a user gesture. Retain this single context
        // for a later explicit retry; dispose remains its only close owner.
        throw error;
      }
    })();
    this.pending = work;
    try { await work; } finally { if (this.pending === work) this.pending = null; }
  }
  setVolume(volume) { this.volume = clampVolume(volume); this.engine?.setVolume(this.volume); }
  stop() { ++this.generation; this.on = false; this.engine?.stop(); }
  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.stop();
    globalThis.removeEventListener?.('pagehide', this.pagehide);
    if (this.ownsContext && this.ctx?.state !== 'closed') safe(() => this.ctx?.close()?.catch?.(() => {}));
  }
  diagnostics() {
    return this.engine?.diagnostics() ?? { nodes: 0, sources: 0, voices: 0, events: 0, timers: 0, counts: {} };
  }
}
