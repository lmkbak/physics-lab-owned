import { BufferGeometry, Float32BufferAttribute } from 'three';

/** Build a closed liquid volume at a specified analytic level. Supports polar spouts.
 * No old liquid mesh, sampled vendor geometry or shader implementation is used.
 */
export function createLiquidGeometry(profile, { volumeMl = profile.fullCapacity, angularSegments = 256 } = {}) {
  if (!Number.isFinite(volumeMl) || !Number.isInteger(angularSegments) || angularSegments < 16 || angularSegments > 2048) throw new RangeError('Invalid liquid mesh options');
  const level = profile.levelFor(volumeMl);
  const geometry = new BufferGeometry();
  if (level <= profile.bottom) {
    geometry.setAttribute('position', new Float32BufferAttribute([], 3));
    geometry.setIndex([]);
    return geometry;
  }
  // Keep analytic section transitions, refine height for non-axisymmetric spouts.
  const heights = new Set([profile.bottom, level]);
  for (const [y] of profile.pts) if (y > profile.bottom && y < level) heights.add(y);
  // A small fill near a spherical pole needs more slices than the whole-vessel
  // display profile. Subdivide the actual wet height so low volumes keep accuracy.
  for (let i = 1; i < 96; i++) heights.add(profile.bottom + (level - profile.bottom) * i / 96);
  const ys = [...heights].sort((a, b) => a - b);
  const positions = [], indices = [], rings = [];
  for (const y of ys) {
    const radii = Array.from({ length: angularSegments }, (_, j) => profile.radiusAt(y, 2 * Math.PI * j / angularSegments));
    if (radii.every(r => r < 1e-14)) {
      rings.push({ start: positions.length / 3, point: true }); positions.push(0, y, 0);
    } else {
      rings.push({ start: positions.length / 3, point: false });
      for (let j = 0; j < angularSegments; j++) { const a = 2 * Math.PI * j / angularSegments, r = radii[j]; positions.push(r * Math.cos(a), y, -r * Math.sin(a)); }
    }
  }
  for (let i = 1; i < rings.length; i++) {
    const lo = rings[i - 1], hi = rings[i];
    if (lo.point && hi.point) throw new RangeError('Liquid profile contains a closed interval');
    for (let j = 0; j < angularSegments; j++) {
      const k = (j + 1) % angularSegments;
      if (lo.point) indices.push(lo.start, hi.start + k, hi.start + j);
      else if (hi.point) indices.push(lo.start + j, lo.start + k, hi.start);
      else indices.push(lo.start + j, lo.start + k, hi.start + j, lo.start + k, hi.start + k, hi.start + j);
    }
  }
  for (const [ring, y, top] of [[rings[0], ys[0], false], [rings.at(-1), ys.at(-1), true]]) {
    if (ring.point) continue;
    const center = positions.length / 3; positions.push(0, y, 0);
    for (let j = 0; j < angularSegments; j++) { const k = (j + 1) % angularSegments; indices.push(center, ring.start + (top ? j : k), ring.start + (top ? k : j)); }
  }
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals(); geometry.computeBoundingBox(); geometry.computeBoundingSphere();
  geometry.userData = { ownedLiquid: true, volumeMl: Math.min(Math.max(0, volumeMl), profile.fullCapacity), levelM: level, nonAxisymmetric: profile.nonAxisymmetric, analyticVolumeMl: profile.volumeAt(level) };
  return geometry;
}
