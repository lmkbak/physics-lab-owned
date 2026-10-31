import * as THREE from 'three';

// New dimensions chosen to contain the consumer's work and bottle placement zones.
export const BENCH_Y = .82;
export const SHELF = Object.freeze({ z: -.37, depth: .20, tiers: Object.freeze([1.08, 1.36]) });
const BASE = ['#9e4ced', '#45216b', '#46cdbb'];
const unit = value => Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0;

export function buildWorld(renderer, scene, { variant = 'glow' } = {}) {
  const studio = variant === 'studio';
  const root = new THREE.Group(); root.name = 'owned-chemistry-room'; scene.add(root);
  const geometries = new Set(), materials = new Set(), textures = new Set();
  const surfaces = [], colliders = [], lights = [], strips = [];
  let disposed = false, room = 1;
  const previous = { background: scene.background, fog: scene.fog, environment: scene.environment };
  const background = new THREE.Color('#10091d'), fog = new THREE.Fog('#10091d', 3.2, 10);
  scene.background = background; scene.fog = fog;
  const material = (color, options = {}) => {
    const m = new THREE.MeshStandardMaterial({ color, roughness: studio ? .6 : .44, metalness: .22, ...options });
    materials.add(m); return m;
  };
  const dark = material('#20152d'), top = material('#74637f', { roughness: .46 }), metal = material('#63556e', { metalness: .7 });
  const wall = material('#170f21', { roughness: .88 }), floorMat = material('#251b2d', { roughness: .95 });
  function box(name, dimensions, position, mat, surface) {
    const geometry = new THREE.BoxGeometry(...dimensions); geometries.add(geometry);
    const mesh = new THREE.Mesh(geometry, mat); mesh.name = name; mesh.position.set(...position);
    mesh.castShadow = true; mesh.receiveShadow = true; root.add(mesh);
    if (surface) { mesh.userData.surface = surface; surfaces.push(mesh); }
    return mesh;
  }
  function solid(name, dimensions, position, mat, surface) {
    const mesh = box(name, dimensions, position, mat, surface);
    mesh.updateMatrixWorld(); colliders.push(new THREE.Box3().setFromObject(mesh)); return mesh;
  }
  solid('worktop', [2.5, .055, 1], [0, BENCH_Y - .0275, -.02], top, 'bench');
  for (const x of [-1.09, 1.09]) {
    solid('trestle-foot', [.21, .055, .79], [x, .0275, -.02], dark);
    box('trestle-upright', [.065, .72, .065], [x, .41, -.02], metal);
    for (const z of [-.30, .26]) {
      const brace = box('diagonal-support', [.045, .47, .045], [x, .55, z], metal);
      brace.rotation.x = z < 0 ? -.45 : .45;
    }
  }
  for (const y of SHELF.tiers) {
    solid('reagent-shelf', [1.40, .025, SHELF.depth], [0, y - .0125, SHELF.z], dark, 'shelf');
    box('shelf-backstop', [1.40, .018, .012], [0, y + .009, SHELF.z - .094], metal);
    for (const x of [-.65, .65]) box('shelf-cantilever', [.027, .025, .23], [x, y - .035, -.40], metal);
  }
  for (const x of [-.68, .68]) solid('shelf-pillar', [.035, .75, .035], [x, 1.15, -.49], metal);
  solid('floor', [5.2, .06, 5.8], [0, -.035, .25], floorMat);
  solid('rear-wall', [5.2, 2.7, .08], [0, 1.32, -1.24], wall);
  for (const x of [-2.55, 2.55]) solid('side-wall', [.08, 2.7, 5.8], [x, 1.32, .25], wall);
  // Repeated floor inlays and asymmetric wall ribs are original geometry, not textures.
  for (let i = -4; i <= 4; i++) box('floor-inlay', [.006, .002, 4.4], [i * .48, -.003, .35], dark);
  for (const x of [-1.85, -1.25, 1.45, 2.05]) box('wall-rib', [.026, 1.95, .07], [x, 1.22, -1.17], metal);
  for (let i = 0; i < 3; i++) {
    const m = material(BASE[i], { emissive: BASE[i], emissiveIntensity: 1.3, metalness: .1 }); strips.push(m);
    const x = (i - 1) * 1.45;
    box('neon-vertical', [.018, .91, .015], [x, 1.74, -1.18], m);
    const angle = box('neon-diagonal', [.018, .39, .015], [x + .11, 2.32, -1.18], m); angle.rotation.z = -.65;
    const edge = box('worktop-neon', [.74, .012, .012], [(i - 1) * .81, BENCH_Y - .04, .487], m); edge.castShadow = false;
  }
  // Original analytic equirectangular reflection field. No image/HDR/network input.
  const width = 128, height = 64, data = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const u = x / width, v = y / height, ceiling = Math.exp(-(((v - .24) / .11) ** 2));
    const panels = Math.max(0, Math.cos(u * Math.PI * 6)) ** 16 * ceiling;
    const k = (y * width + x) * 4;
    data[k] = 17 + panels * 115; data[k + 1] = 10 + panels * 90; data[k + 2] = 28 + panels * 155; data[k + 3] = 255;
  }
  const env = new THREE.DataTexture(data, width, height); env.mapping = THREE.EquirectangularReflectionMapping;
  env.colorSpace = THREE.SRGBColorSpace; env.needsUpdate = true; textures.add(env); scene.environment = env;
  const hemi = new THREE.HemisphereLight('#c5b6e0', '#211129', studio ? 3.2 : 2.8); root.add(hemi);
  const key = new THREE.DirectionalLight('#f2deff', studio ? 6.0 : 5.5); key.position.set(-1.4, 2.5, 1.7); key.castShadow = true;
  key.shadow.mapSize.set(1024, 1024); Object.assign(key.shadow.camera, { left: -1.7, right: 1.7, top: 1.6, bottom: -1.3, near: .1, far: 8 });
  key.target.position.set(0, .8, -.05); root.add(key, key.target);
  for (let i = 0; i < 3; i++) { const light = new THREE.PointLight(BASE[i], .65, 4.5, 2); light.position.set((i - 1) * 1.15, 1.55, -.65); root.add(light); lights.push(light); }
  const baseKey = key.intensity, baseHemi = hemi.intensity;
  function update(dt, pulse, palette) {
    if (disposed) return;
    const bar = Number.isFinite(pulse?.bar) ? Math.max(0, Math.floor(pulse.bar)) : 0;
    const candidate = Array.isArray(palette) && palette.length ? palette[bar % palette.length] : null;
    const colors = Array.isArray(candidate) && candidate.length >= 3 ? candidate : BASE;
    const drives = pulse ? [unit(pulse.kick), unit(pulse.snare), unit(pulse.hat)] : [0, 0, 0];
    key.intensity = baseKey * room; hemi.intensity = baseHemi * (.2 + .8 * room);
    for (let i = 0; i < 3; i++) {
      const color = pulse && typeof colors[i] === 'string' && /^#[0-9a-f]{6}$/i.test(colors[i]) ? colors[i] : BASE[i];
      lights[i].color.set(color); strips[i].color.set(color); strips[i].emissive.set(color);
      lights[i].intensity = .20 * room + drives[i] * (.8 + unit(pulse?.level));
      strips[i].emissiveIntensity = .55 + .75 * room + drives[i] * 2.4;
    }
  }
  function setLight(value) { if (!disposed) { room = unit(value); update(0, null, null); } }
  function diagnostics() { return { disposed, geometries: geometries.size, materials: materials.size, textures: textures.size, nodes: root.children.length }; }
  function dispose() {
    if (disposed) return; disposed = true;
    root.removeFromParent();
    for (const g of geometries) g.dispose(); for (const m of materials) m.dispose(); for (const t of textures) t.dispose();
    key.shadow.dispose();
    if (scene.background === background) scene.background = previous.background;
    if (scene.fog === fog) scene.fog = previous.fog;
    if (scene.environment === env) scene.environment = previous.environment;
    const owned = new Set(root.children); for (let i = surfaces.length - 1; i >= 0; i--) if (owned.has(surfaces[i])) surfaces.splice(i, 1);
    root.clear(); geometries.clear(); materials.clear(); textures.clear(); colliders.length = 0;
  }
  update(0, null, null);
  return { env, surfaces, setLight, update, dispose, key, root, lights, strips, colliders, spawn: new THREE.Vector3(0, 1.38, .72), bounds: new THREE.Box3(new THREE.Vector3(-2.5, 0, -1.2), new THREE.Vector3(2.5, 2.65, 3.1)), diagnostics };
}
export function buildStudioWorld(renderer, scene) { return buildWorld(renderer, scene, { variant: 'studio' }); }
