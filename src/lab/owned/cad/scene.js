import * as THREE from 'three';
import { createCavityProfile } from './profile.js';

// Owned CAD scene adapter. Inputs are the independently authored scene schema.
// Display offsets never alter the construction coordinates used by simulation.
function decodeB64(b64, Type, name) {
  if (typeof b64 !== 'string' || !b64) throw new TypeError(`Invalid base64 mesh payload: ${name}`);
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(b64) || b64.length % 4) throw new TypeError(`Malformed base64 payload: ${name}`);
  let bytes;
  if (globalThis.Buffer?.from) bytes = new Uint8Array(globalThis.Buffer.from(b64, 'base64'));
  else if (typeof globalThis.atob === 'function') {
    const raw = globalThis.atob(b64); bytes = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  } else throw new Error('No base64 decoder available');
  if (bytes.byteLength % Type.BYTES_PER_ELEMENT) throw new RangeError(`Misaligned mesh payload: ${name}`);
  return new Type(bytes.buffer, bytes.byteOffset, bytes.byteLength / Type.BYTES_PER_ELEMENT);
}
function geometryFor(mesh) {
  if (typeof mesh.name !== 'string' || !mesh.name.trim() || typeof mesh.group !== 'string' || !mesh.group.trim()) throw new TypeError('Owned CAD mesh needs nonempty name and group');
  for (const key of ['opacity', 'roughness']) if (mesh[key] !== undefined && (!Number.isFinite(mesh[key]) || mesh[key] < 0 || mesh[key] > 1)) throw new RangeError(`Invalid ${key}: ${mesh.name}`);
  const p = mesh.positions ?? (mesh.posB64 ? decodeB64(mesh.posB64, Float32Array, mesh.name) : null);
  const indices = mesh.indices ?? (mesh.idxB64 ? decodeB64(mesh.idxB64, Uint32Array, mesh.name) : null);
  if (!p || p.length < 9 || p.length % 3) throw new TypeError(`Invalid vertices: ${mesh.name}`);
  if (!indices || !indices.length || indices.length % 3) throw new TypeError(`Invalid indices: ${mesh.name}`);
  if (Array.isArray(p) && !p.every(Number.isFinite)) throw new TypeError(`Invalid vertices: ${mesh.name}`);
  for (let i = 0; i < indices.length; i++) if (!Number.isSafeInteger(indices[i]) || indices[i] < 0 || indices[i] >= p.length / 3) throw new TypeError(`Invalid indices: ${mesh.name}`);
  const positions = new Float32Array(p.length);
  for (let i = 0; i < p.length; i += 3) {
    positions[i] = p[i] * .001;
    positions[i + 1] = p[i + 2] * .001;
    positions[i + 2] = -p[i + 1] * .001;
  }
  if (!positions.every(Number.isFinite)) throw new RangeError(`Vertex exceeds runtime precision: ${mesh.name}`);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setIndex(new THREE.BufferAttribute(indices instanceof Uint32Array ? indices : Uint32Array.from(indices), 1));
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}
function materialFor(mesh, studio) {
  const color = mesh.color;
  if (!Array.isArray(color) || color.length !== 3 || !color.every(x => Number.isFinite(x) && x >= 0 && x <= 1)) throw new TypeError(`Invalid RGB color: ${mesh.name}`);
  const c = new THREE.Color().setRGB(...color, THREE.SRGBColorSpace);
  if (mesh.glass) return new THREE.MeshPhysicalMaterial({
    color: c, roughness: studio ? .09 : .12, metalness: 0,
    transmission: .95, thickness: .0016, ior: 1.47,
    transparent: true, opacity: .42, depthWrite: false, side: THREE.DoubleSide,
    clearcoat: 1, clearcoatRoughness: .07,
    attenuationColor: c, attenuationDistance: mesh.color[0] > mesh.color[2] * 1.4 ? .12 : 2,
  });
  return new THREE.MeshStandardMaterial({ color: c, metalness: mesh.metal ? .78 : 0,
    roughness: mesh.roughness ?? (mesh.metal ? .32 : .65),
    transparent: (mesh.opacity ?? 1) < 1, opacity: mesh.opacity ?? 1,
    depthWrite: (mesh.opacity ?? 1) >= 1,
    emissive: mesh.marking && !studio ? c : 0, emissiveIntensity: mesh.marking && !studio ? .15 : 0,
  });
}
export function buildOwnedScene(data, { groups, assembly = false, studio = false, fill = .9 } = {}) {
  if (data?.schema !== 'owned-cad-scene/1' || data.units !== 'mm' || data.up !== 'Z' || !Array.isArray(data.meshes)) throw new TypeError('Unsupported owned CAD scene contract');
  const names = new Set(data.meshes.map(m => m.group));
  if (groups) for (const name of groups) if (!names.has(name)) throw new RangeError(`Missing owned CAD group: ${name}`);
  const selected = groups ? new Set(groups) : names;
  const root = new THREE.Group(), groupMap = new Map(), meshMap = new Map();
  const geometries = [], materials = [];
  let disposed = false;
  try {
    for (const mesh of data.meshes) {
      if (!selected.has(mesh.group)) continue;
      if (meshMap.has(mesh.name)) throw new RangeError(`Duplicate owned CAD mesh: ${mesh.name}`);
      const geometry = geometryFor(mesh); geometries.push(geometry);
      const material = materialFor(mesh, studio); materials.push(material);
      const object = new THREE.Mesh(geometry, material);
      object.name = mesh.name;
      object.userData = { ownedCad: true, group: mesh.group, role: mesh.role ?? null, constructionUnits: 'm', marking: !!mesh.marking };
      object.castShadow = !mesh.glass; object.receiveShadow = true;
      let group = groupMap.get(mesh.group);
      if (!group) { group = new THREE.Group(); group.name = mesh.group; root.add(group); groupMap.set(mesh.group, group); }
      if (assembly && mesh.assemblyOffset_mm) {
        const o = mesh.assemblyOffset_mm;
        if (!Array.isArray(o) || o.length !== 3 || !o.every(Number.isFinite)) throw new TypeError('Invalid assembly offset');
        object.position.set(o[0] * .001, o[2] * .001, -o[1] * .001);
      }
      group.add(object); meshMap.set(mesh.name, object);
    }
    const profiles = new Map();
    for (const [name, spec] of Object.entries(data.profiles ?? {})) if (selected.has(name)) profiles.set(name, createCavityProfile(spec, { fill }));
    return { root, groups: groupMap, meshes: meshMap, profiles,
      dispose() { if (disposed) return; disposed = true; root.removeFromParent(); root.clear(); for (const g of geometries) g.dispose(); for (const m of materials) m.dispose(); groupMap.clear(); meshMap.clear(); profiles.clear(); },
    };
  } catch (error) {
    for (const g of geometries) g.dispose(); for (const m of materials) m.dispose(); root.clear();
    throw error;
  }
}
export async function loadOwnedScene(url, options = {}) {
  const resolved = new URL(url, globalThis.location?.href ?? 'http://localhost');
  if (typeof location !== 'undefined' && resolved.origin !== location.origin) throw new TypeError('Owned CAD assets must be same-origin');
  const response = await fetch(resolved, { signal: options.signal });
  if (!response.ok) throw new Error(`Owned CAD HTTP ${response.status}: ${resolved.pathname}`);
  const data = await response.json();
  options.signal?.throwIfAborted();
  return buildOwnedScene(data, options);
}
