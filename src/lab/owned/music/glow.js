import { MusicTransport } from './engine.js';

// Four original black-violet scenes, three independently addressable lamps each.
export const PALETTE = Object.freeze([
  Object.freeze(['#9234e8', '#32104f', '#38dbc8']),
  Object.freeze(['#dc39be', '#471578', '#74b8f7']),
  Object.freeze(['#693bea', '#211038', '#c75cff']),
  Object.freeze(['#ad48f5', '#39134d', '#53dbb3']),
]);

export class Music extends MusicTransport {
  constructor(sound) {
    super(() => {
      if (!sound || typeof sound.init !== 'function') throw new Error('sound.init is required');
      const initialized = sound.init();
      // Existing sound creates ctx synchronously, preserving first-gesture resume.
      if (sound.ctx) {
        // init may also return ancillary asynchronous setup; never leak rejection.
        if (initialized && typeof initialized.catch === 'function') initialized.catch(() => {});
        return sound.ctx;
      }
      return Promise.resolve(initialized).then(() => sound.ctx);
    }, false);
    this.sound = sound;
  }
  toggle(force) {
    const desired = typeof force === 'boolean' ? force : !this.on;
    if (this.disposed) return false;
    if (!desired) { this.stop(); return false; }
    this.activate(this.volume).catch(() => {});
    // This reports requested state. Async resume denial rolls on back to false.
    return this.on;
  }
  pulse() {
    const p = this.on && !this.disposed ? this.engine?.pulse() : null;
    return p ? { kick: p.kick, snare: p.snare, hat: p.hat, bar: p.bar, level: p.level } : null;
  }
}
