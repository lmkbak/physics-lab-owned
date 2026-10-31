export class Param {
  constructor(value = 0) { this.value = value; this.events = []; }
  add(type, value, time, extra) { this.events.push({ type, value, time, extra }); this.value = value; return this; }
  setValueAtTime(v, t) { return this.add('set', v, t); }
  linearRampToValueAtTime(v, t) { return this.add('linear', v, t); }
  exponentialRampToValueAtTime(v, t) { if (!(v > 0)) throw Error('exponential target must be positive'); return this.add('exp', v, t); }
  setTargetAtTime(v, t, k) { return this.add('target', v, t, k); }
  cancelScheduledValues(t) { this.events = this.events.filter(e => e.time < t); return this; }
}
class Node {
  constructor(ctx, kind) {
    this.ctx = ctx; this.kind = kind; this.connections = new Set(); this.disconnected = false;
    for (const key of ['gain', 'frequency', 'detune', 'delayTime', 'Q']) this[key] = new Param();
    ctx.nodes.push(this);
  }
  connect(n) { this.connections.add(n); return n; }
  disconnect() { this.connections.clear(); this.disconnected = true; }
  start(t) { if (this.started !== undefined) throw Error('double source start'); this.started = t; }
  stop(t) { this.stopped = t; }
}
export class FakeAudioContext {
  static instances = [];
  constructor({ state = 'running' } = {}) {
    this.currentTime = 0; this.state = state; this.sampleRate = 48000;
    this.baseLatency = .012; this.outputLatency = .028;
    this.nodes = []; this.destination = { kind: 'destination' }; this.closes = 0; this.resumes = 0;
    FakeAudioContext.instances.push(this);
  }
  createGain() { return new Node(this, 'gain'); }
  createOscillator() { return new Node(this, 'oscillator'); }
  createBufferSource() { return new Node(this, 'buffer'); }
  createBiquadFilter() { return new Node(this, 'filter'); }
  createDelay() { return new Node(this, 'delay'); }
  createBuffer(channels, length, sampleRate) { const data = Array.from({ length: channels }, () => new Float32Array(length)); return { length, sampleRate, getChannelData: n => data[n] }; }
  resume() { this.resumes++; this.state = 'running'; return Promise.resolve(); }
  close() { this.closes++; this.state = 'closed'; return Promise.resolve(); }
  advance(time) {
    this.currentTime = time;
    for (const node of this.nodes) if (node.onended && node.stopped <= time) {
      const done = node.onended; node.onended = null; done();
    }
  }
}
export function deferred() {
  let resolve, reject;
  const promise = new Promise((r, j) => { resolve = r; reject = j; });
  return { promise, resolve, reject };
}
