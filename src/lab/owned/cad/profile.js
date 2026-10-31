// Independently authored surfaces-of-revolution calculus. No mesh or external asset input.
const MILLIMETRES = 1000;
const PI = Math.PI;
const finite = (n) => typeof n === 'number' && Number.isFinite(n);
const bounded = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

function linearSegment(z0, z1, r0, r1) {
  if (![z0, z1, r0, r1].every(finite) || z1 <= z0 || r0 < 0 || r1 < 0) throw new RangeError('Invalid linear cavity segment');
  const gradient = (r1 - r0) / (z1 - z0);
  return {
    z0, z1, r0, r1,
    radius(z) { return r0 + gradient * (z - z0); },
    integral(z) {
      const h = z - z0;
      return PI * h * (r0 * r0 + r0 * gradient * h + gradient * gradient * h * h / 3);
    },
    sample() { return [[z0, r0], [z1, r1]]; },
  };
}

function sphereSegment(spec) {
  const { z0, z1, centerZ, radius } = spec;
  if (![z0, z1, centerZ, radius].every(finite) || z1 <= z0 || radius <= 0 || Math.abs(z0 - centerZ) > radius + 1e-8 || Math.abs(z1 - centerZ) > radius + 1e-8) throw new RangeError('Invalid spherical cavity segment');
  const at = (z) => { const y = Math.abs(z - centerZ); return Math.sqrt(Math.max(0, (radius - y) * (radius + y))); };
  // Integrate from z0 with a local polynomial to avoid subtracting near-equal
  // sphere primitives at a pole. Kahan-style cancellation is unnecessary here.
  const startY = z0 - centerZ;
  const startRadiusSquared = Math.max(0, (radius - startY) * (radius + startY));
  return {
    z0, z1, r0: at(z0), r1: at(z1), radius: at,
    integral(z) { const h = z - z0; return PI * h * (startRadiusSquared - startY * h - h * h / 3); },
    sample(maxChordErrorMm) {
      const a0 = Math.asin(bounded((z0 - centerZ) / radius, -1, 1));
      const a1 = Math.asin(bounded((z1 - centerZ) / radius, -1, 1));
      const angle = 2 * Math.acos(bounded(1 - maxChordErrorMm / radius, -1, 1));
      const steps = Math.max(1, Math.ceil((a1 - a0) / Math.max(angle, 1e-6)));
      return Array.from({ length: steps + 1 }, (_, i) => { const a = a0 + (a1 - a0) * i / steps; return [centerZ + radius * Math.sin(a), radius * Math.cos(a)]; });
    },
  };
}

/** Spec uses local millimetres; returned public heights/radii use metres and volumes use mL. */
export function createCavityProfile(spec, { fill = 0.9, maxChordErrorMm = 0.02 } = {}) {
  if (!spec || !finite(fill) || fill < 0 || fill > 1 || !finite(maxChordErrorMm) || maxChordErrorMm <= 0 || maxChordErrorMm > 0.02) throw new RangeError('Invalid cavity profile options');
  let segments;
  if (spec.type === 'piecewise-linear-radius') {
    if (!Array.isArray(spec.inner) || spec.inner.length < 2) throw new RangeError('Cavity needs at least two inner points');
    for (const point of spec.inner) if (!Array.isArray(point) || point.length !== 2) throw new TypeError('Inner points must be [zMm,rMm]');
    segments = spec.inner.slice(1).map((p, i) => linearSegment(spec.inner[i][0], p[0], spec.inner[i][1], p[1]));
  } else if (spec.type === 'analytic-radius-segments') {
    if (!Array.isArray(spec.segments) || !spec.segments.length) throw new RangeError('Cavity requires analytic segments');
    segments = spec.segments.map(s => {
      if (s.kind === 'sphere') return sphereSegment(s);
      if (s.kind === 'linear') return linearSegment(s.z0, s.z1, s.r0, s.r1);
      throw new TypeError(`Unsupported cavity segment: ${s.kind}`);
    });
  } else throw new TypeError(`Unsupported cavity profile: ${spec.type}`);
  for (const s of segments) if (s.r0 === 0 && s.r1 === 0 && s.integral(s.z1) <= 0) throw new RangeError('Cavity cannot contain a closed zero-area interval');
  for (let i = 1; i < segments.length; i++) {
    if (segments[i].r0 === 0 || segments[i - 1].r1 === 0) throw new RangeError('Cavity cannot have an internal pinch closure');
    if (Math.abs(segments[i].z0 - segments[i - 1].z1) > 1e-8 || Math.abs(segments[i].r0 - segments[i - 1].r1) > 1e-6) throw new RangeError('Cavity segments must join continuously');
  }
  const prefixes = [0];
  for (const s of segments) prefixes.push(prefixes.at(-1) + s.integral(s.z1));
  const bottomMm = segments[0].z0, rimMm = segments.at(-1).z1;
  const spout = spec.analytic?.type === 'cylinder-with-polar-spout' ? spec.analytic : null;
  if (spout) {
    const { radius_mm: r, bottom_mm: b, spoutStart_mm: s, rim_mm: h, reach_mm: reach, halfAngle_rad: angle } = spout;
    if (![r, b, s, h, reach, angle].every(finite) || r <= 0 || reach < 0 || angle <= 0 || angle > PI || s < b || h <= s || b !== bottomMm || h !== rimMm || segments.some(v => Math.abs(v.r0 - r) > 1e-8 || Math.abs(v.r1 - r) > 1e-8)) throw new RangeError('Invalid polar spout cavity');
  }
  // Integrate the polar cross-section A = 1/2 ∫(r + L*t*f(theta))² dtheta.
  // ∫[-1,1](1-u²)^3 du=32/35; ∫[-1,1](1-u²)^6 du=2048/3003.
  const spoutVolumeMm3 = (z) => {
    if (!spout || z <= spout.spoutStart_mm) return 0;
    const { radius_mm: r, spoutStart_mm: start, rim_mm: rim, reach_mm: L, halfAngle_rad: a } = spout;
    const d = Math.min(z, rim) - start, D = rim - start;
    return a * r * L * (16 / 35) * d * d / D + a * L * L * (1024 / 3003) * d ** 3 / (3 * D * D);
  };
  const fullCapacity = (prefixes.at(-1) + spoutVolumeMm3(rimMm)) / 1000;
  if (!finite(fullCapacity) || fullCapacity <= 0) throw new RangeError('Cavity must have positive finite volume');
  const volumeAtMm = (z) => {
    if (z <= bottomMm) return 0;
    if (z >= rimMm) return fullCapacity;
    const i = segments.findIndex(s => z <= s.z1);
    return (prefixes[i] + segments[i].integral(z) + spoutVolumeMm3(z)) / 1000;
  };
  const pointsMm = segments.flatMap((s, i) => s.sample(maxChordErrorMm).slice(i ? 1 : 0));
  const pts = pointsMm.map(([z, r]) => [z / MILLIMETRES, r / MILLIMETRES]);
  const nominalMl = spec.nominalMl ?? spec.nominal_ml ?? null;
  if (nominalMl !== null && (!finite(nominalMl) || nominalMl <= 0 || nominalMl > fullCapacity)) throw new RangeError('Nominal marking must fit inside cavity');
  const profile = {
    pts, cum: pointsMm.map(([z]) => volumeAtMm(z)),
    bottom: bottomMm / MILLIMETRES, rim: rimMm / MILLIMETRES,
    rimR: segments.at(-1).r1 / MILLIMETRES,
    capacity: fullCapacity * fill, fullCapacity, nominalMl,
    volumeAt(heightM) {
      if (!finite(heightM)) throw new TypeError('Liquid height must be finite');
      return volumeAtMm(heightM * MILLIMETRES);
    },
    levelFor(volumeMl) {
      if (!finite(volumeMl)) throw new TypeError('Liquid volume must be finite');
      if (volumeMl <= 0) return profile.bottom;
      if (volumeMl >= fullCapacity) return profile.rim;
      let lo = bottomMm, hi = rimMm;
      for (let i = 0; i < 64; i++) { const mid = (lo + hi) / 2; if (volumeAtMm(mid) < volumeMl) lo = mid; else hi = mid; }
      return (lo + hi) / (2 * MILLIMETRES);
    },
    radiusAt(heightM, theta = 0) {
      if (!finite(heightM) || !finite(theta)) throw new TypeError('Cavity height and azimuth must be finite');
      const z = bounded(heightM * MILLIMETRES, bottomMm, rimMm);
      const base = segments.find(s => z <= s.z1).radius(z);
      if (!spout || z <= spout.spoutStart_mm) return base / MILLIMETRES;
      const signed = Math.atan2(Math.sin(theta), Math.cos(theta));
      const u = Math.abs(signed) / spout.halfAngle_rad;
      const extra = u < 1 ? spout.reach_mm * ((z - spout.spoutStart_mm) / (rimMm - spout.spoutStart_mm)) * (1 - u * u) ** 3 : 0;
      return (base + extra) / MILLIMETRES;
    },
    nonAxisymmetric: !!spout,
  };
  return profile;
}
