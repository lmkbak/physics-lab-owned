// Independent physical-acoustic designs. No recording input, imports or runtime recipes.
export const VERSION = '1.0.0';
export const SAMPLE_RATE = 44100;
const TAU = 2 * Math.PI;
export const DESIGNS = {
  'click-switch': { seed: 0x4231, duration: .18, peak: .66, kind: 'contact', attack: .00035, tail: .012,
    modes: [[410,.018,.55],[1570,.014,.6],[3260,.009,.42],[6170,.006,.18]],
    contacts: [[0,1],[.0084,.48]], noise: { low: 1300, high: 7800, gain: .6, decay: .0045 },
    origin: 'Over-centre latch: two impacts, damped shell and spring modes, band-limited contact friction.' },
  'impact-glass': { seed: 0x713b, duration: 1.05, peak: .76, kind: 'contact', attack: .00045, tail: .035,
    modes: [[2890,.16,1],[4630,.135,.78],[6710,.09,.56],[8950,.065,.28]],
    contacts: [[0,1]], noise: { low: 2300, high: 11500, gain: .38, decay: .011 },
    origin: 'Thin stiff vessel: inharmonic high modes with frequency-dependent damping and short contact noise.' },
  'impact-metal': { seed: 0x922d, duration: 1.25, peak: .76, kind: 'contact', attack: .00055, tail: .045,
    modes: [[1360,.24,1],[2180,.19,.87],[3680,.145,.64],[5930,.10,.37],[7810,.07,.2]],
    contacts: [[0,1]], noise: { low: 1100, high: 9000, gain: .23, decay: .019 },
    origin: 'Thin metal plate: inharmonic bending modes, long ring and brief surface friction.' },
  'impact-wood': { seed: 0xa17f, duration: .42, peak: .76, kind: 'contact', attack: .0013, tail: .025,
    modes: [[173,.038,1],[397,.027,.8],[714,.021,.64],[1090,.016,.35],[1620,.012,.17]],
    contacts: [[0,1]], noise: { low: 90, high: 1900, gain: .24, decay: .014 },
    origin: 'Highly damped wooden body: low bending/cavity modes and soft band-limited contact.' },
  explosion: { seed: 0xb821, duration: .95, peak: .84, kind: 'combustion', attack: .0018, tail: .06,
    modes: [[47,.14,1],[81,.10,.67],[151,.065,.34]], pressureDecay: .055,
    noise: { low: 30, high: 3200, endHigh: 210, gain: 1.6, decay: .17 },
    origin: 'Engine power-stroke pressure rise and decay, cavity modes and cooling turbulent gas with falling cutoff.' },
  motor: { seed: 0xc593, duration: 1.2, peak: .58, kind: 'motor', baseRpm: 600, rotationHz: 10,
    harmonics: [[10,.12],[50,.9],[100,.48],[150,.27],[300,.19],[650,.12],[1200,.06]],
    modulationHz: 10, modulationDepth: .14,
    noise: { low: 210, high: 4600, gain: .15, crossfadeSeconds: .04 }, seamWarpSeconds: .002,
    origin: '600 rpm rotor, commutation and slot harmonics, periodic load modulation, shaped bearing/air noise with complementary overlap crossfade.' },
};
export function random(seed) {
  let s = seed >>> 0;
  return () => { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; return (s >>> 0) / 2147483648 - 1; };
}
const smooth = x => x * x * (3 - 2 * x);
function noiseTrack(length, seed, spec, duration) {
  const rnd = random(seed), out = new Float64Array(length);
  let lower = 0, upper = 0;
  const aLow = 1 - Math.exp(-TAU * spec.low / SAMPLE_RATE);
  for (let i = 0; i < length; i++) {
    const t = i / SAMPLE_RATE;
    const cutoff = spec.endHigh ? spec.high * (spec.endHigh / spec.high) ** Math.min(1,t/duration) : spec.high;
    const aHigh = 1 - Math.exp(-TAU * cutoff / SAMPLE_RATE);
    const white = rnd(); lower += aLow * (white - lower);
    upper += aHigh * ((white - lower) - upper); // high-pass then low-pass: actual band-limited noise
    out[i] = upper;
  }
  return out;
}
export function synthesize(name, seedOverride) {
  const d = DESIGNS[name]; if (!d) throw new Error(`Unknown design ${name}`);
  const n = Math.round(d.duration * SAMPLE_RATE), out = new Float64Array(n);
  const seed = seedOverride ?? d.seed;
  if (d.kind === 'motor') {
    const overlap = Math.round(d.noise.crossfadeSeconds * SAMPLE_RATE);
    const raw = noiseTrack(n + overlap, seed, d.noise, d.duration);
    const periodic = new Float64Array(n + 1);
    // Splice the warm filtered tail into the beginning with complementary smooth windows.
    for (let i = 0; i < n; i++) {
      let v = raw[i];
      if (i < overlap) { const w = smooth(i / overlap); v = raw[n+i] * (1-w) + raw[i] * w; }
      periodic[i] = v;
    }
    periodic[n] = periodic[0];
    const edge = Math.round(d.seamWarpSeconds * SAMPLE_RATE);
    for (let i = 0; i < n; i++) {
      // C1 seam time warp and a 4-sample common point keep quantized value/slope stable.
      let p = i;
      if (i < edge) { const u=(i-4)/(edge-4); p=i<=4?0:edge*(2*u*u-u*u*u); }
      else if (i > n-1-edge) { const k=n-1-i, u=(k-4)/(edge-4); p=k<=4?n:n-edge*(2*u*u-u*u*u); }
      const t = p / n * d.duration;
      let v = 0;
      for (const [hz,amp] of d.harmonics) v += amp * Math.sin(TAU*hz*t);
      v *= 1 + d.modulationDepth * Math.cos(TAU*d.modulationHz*t);
      const j = Math.min(n-1,Math.floor(p)), frac = p-j;
      v += (periodic[j]*(1-frac)+periodic[j+1]*frac) * d.noise.gain;
      out[i] = v;
    }
  } else {
    const ns = noiseTrack(n, seed, d.noise, d.duration);
    const contacts = d.contacts ?? [[0,1]];
    for (let i = 0; i < n; i++) {
      const time = i / SAMPLE_RATE;
      let v = 0;
      for (const [delay,weight] of contacts) {
        const t = time-delay; if (t < 0) continue;
        const attack = 1-Math.exp(-t/d.attack);
        let body = 0;
        for (const [hz,decay,amp] of d.modes) body += amp*Math.sin(TAU*hz*t)*Math.exp(-t/decay);
        if (d.kind === 'combustion') body += .5*(t/d.pressureDecay)*Math.exp(1-t/d.pressureDecay);
        const k = Math.max(0,i-Math.round(delay*SAMPLE_RATE));
        v += weight*attack*(body + ns[k]*d.noise.gain*Math.exp(-t/d.noise.decay));
      }
      out[i] = v;
    }
  }
  // DC removal before normalization, with explicit finite checks before any quantization.
  let mean = 0;
  for (const x of out) { if (!Number.isFinite(x)) throw new Error('Nonfinite synthesis'); mean += x/n; }
  let max = 0;
  for (let i=0;i<n;i++) {
    out[i] -= mean;
    if (d.kind !== 'motor') {
      const t=i/SAMPLE_RATE;
      out[i] *= smooth(Math.min(1,t/.00025))*smooth(Math.min(1,(n-1-i)/SAMPLE_RATE/d.tail));
    }
    max=Math.max(max,Math.abs(out[i]));
  }
  if (!(max > 1e-6)) throw new Error('Silent synthesis');
  for(let i=0;i<n;i++) out[i] *= d.peak/max;
  return out;
}
export function encodeWav(pcm) {
  const buf=Buffer.alloc(44+pcm.length*2);
  buf.write('RIFF'); buf.writeUInt32LE(buf.length-8,4); buf.write('WAVEfmt ',8);
  buf.writeUInt32LE(16,16); buf.writeUInt16LE(1,20); buf.writeUInt16LE(1,22);
  buf.writeUInt32LE(SAMPLE_RATE,24); buf.writeUInt32LE(SAMPLE_RATE*2,28);
  buf.writeUInt16LE(2,32); buf.writeUInt16LE(16,34); buf.write('data',36); buf.writeUInt32LE(pcm.length*2,40);
  for(let i=0;i<pcm.length;i++) {
    if(!Number.isFinite(pcm[i]) || Math.abs(pcm[i])>.89) throw new Error('Invalid PCM before quantization');
    buf.writeInt16LE(Math.round(pcm[i]*32767),44+i*2);
  }
  return buf;
}
