import { MusicTransport } from './engine.js';

export class BeatMusic extends MusicTransport {
  constructor() {
    super(() => {
      const Context = globalThis.AudioContext || globalThis.webkitAudioContext;
      if (!Context) throw new Error('Web Audio is unavailable');
      return new Context({ latencyHint: 'interactive' });
    }, true);
  }
  start(volume = .5) { return this.activate(volume); }
  pulse() {
    const p = this.on && !this.disposed ? this.engine?.pulse() : null;
    return p ? { beat: Math.max(p.kick, p.snare * .7, p.hat * .35), chord: p.chord } : { beat: 0, chord: -1 };
  }
}
