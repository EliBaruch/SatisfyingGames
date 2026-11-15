// Bloom Rush art kit - loading and caching CC0 GLB models (Kenney, Quaternius).
//
//   await preload(['mini-shop/shelf-bags', 'food-kit/egg', ...]);   // parallel, never rejects
//   const shelf = getModel('mini-shop/shelf-bags');                   // Object3D, lit, shadows on, ground-centred
//   const geo = getGeometry('food-kit/egg', { height: 0.4 });         // ONE merged vertex-colour geometry
//   const mesh = new THREE.InstancedMesh(geo, getSharedMaterial(), 100);
//
// A model id is '<kit>/<name>' = the file assets/<kit>/<name>.glb (see assets/manifest.json).
import * as THREE from 'three';
import { GLTFLoader, MeshoptDecoder, SkeletonUtils } from 'addons';
import { toLit, getSharedMaterial, litMaterial, setRecolor } from './material.js';
import { newAcc, pushGeometry, finishAcc, bakeAO } from './bake.js';

export const BASE_URL = new URL('../../../assets/', import.meta.url).href;

/**
 * Recommended uniform scale per kit so every world agrees on the relative size of things.
 * The packs are authored at "toy" scale (a Kenney character is 0.67 tall, a shelf 0.9); the game
 * is 1 unit = 1 m with a 1.65 character, so the default for getModel is natural size x KIT_SCALE.
 * Pass `{ natural: true }` for the authored size, or size explicitly with height/width/depth/fit.
 */
export const KIT_SCALE = {
  'mini-characters': 2.3,    // standard character 0.67-0.72 -> 1.55-1.66 (hair and hats add a little)
  'mini-shop': 2.4,          // shelf 0.89 -> 2.1 tall, 1.9 wide
  'mini-forest': 2.4,
  'food-kit': 2.4,           // egg 0.165 -> 0.4 (toy-sized, readable from the camera)
  'nature-kit': 2.4,         // tree_default 1.71 -> 4.1
  'cube-pets': 0.42,         // authored 1.5-2 tall (huge): chick -> 0.67, cow -> 0.68
  'car-kit': 1.3,            // truck 3.25 -> 4.2 long, tractor 2.2 -> 2.9
  'factory-kit': 1.5,        // conveyor tile 1 -> 1.5, machine 1.2 -> 1.8
  farmbuildings: 0.55,       // barn 7.7 -> 4.2 wide (natural scale is huge)
  cutemonsters: 0.5,
  ultimatecrops: 2.4,
  simplenature: 0.55,
};

const DOUBLE_SIDED = /(^|\/)(grass|Grass|flower_|Flower_[12]\b|plant_flat|hanging|lily|leafs|Lettuce_1|Carrot_1|Corn_1|flag)/i;

/**
 * Palette fixes per kit. The Nature Kit ships pastel teal foliage; the game's meadows are green, so
 * teal hues (about 140-200 degrees) of the flat-colour Nature Kit materials are rotated to green.
 */
const KIT_RECOLOR = { 'nature-kit': 'foliage' };
const recolorKind = (e) => (e.kit === 'nature-kit' && /rock|stone/.test(e.id) ? 'rock' : KIT_RECOLOR[e.kit]);
const _hsl = { h: 0, s: 0, l: 0 };
export function recolor(kind, c) {
  c.getHSL(_hsl, THREE.SRGBColorSpace);
  const { h, s, l } = _hsl;
  if (h > 0.38 && h < 0.56) c.setHSL(h - 0.17, s * 0.8, l * 0.5, THREE.SRGBColorSpace);          // teal -> leaf green
  else if (h < 0.13 && s > 0.2) {
    if (kind === 'rock') c.setHSL(0.09, s * 0.22, l * 0.92, THREE.SRGBColorSpace);                    // peach stone -> warm grey
    else c.setHSL(0.07, Math.min(0.5, s * 0.6), l * 0.78, THREE.SRGBColorSpace);                          // peach wood -> tan
  }
  return c;
}

setRecolor(recolor);

// ------------------------------------------------------------------- loader ---
let _loader = null;
function loader() {
  if (!_loader) { _loader = new GLTFLoader(); _loader.setMeshoptDecoder(MeshoptDecoder); }
  return _loader;
}

const entries = new Map(); // id -> entry
const warned = new Set();
function warnOnce(key, msg) { if (!warned.has(key)) { warned.add(key); console.warn('[art] ' + msg); } }

function kitOf(id) { const i = id.indexOf('/'); return i < 0 ? '' : id.slice(0, i); }

function getEntry(id) {
  let e = entries.get(id);
  if (!e) {
    e = {
      id, kit: kitOf(id), state: 'idle', promise: null, scene: null, clips: [], skinned: false, dynamic: false,
      parts: null, box: new THREE.Box3(), triangles: 0, waiters: [], geoCache: new Map(),
    };
    entries.set(id, e);
  }
  return e;
}

function load(id) {
  const e = getEntry(id);
  if (e.promise) return e.promise;
  e.state = 'loading';
  e.promise = loader().loadAsync(`${BASE_URL}${id}.glb`).then((gltf) => {
    process(e, gltf);
    e.state = 'ready';
  }).catch((err) => {
    e.state = 'missing';
    warnOnce('load:' + id, `model "${id}" could not be loaded (${err && err.message ? err.message : err}); using a placeholder box`);
  }).then(() => {
    const w = e.waiters; e.waiters = [];
    for (const fn of w) { try { fn(); } catch (err) { console.warn('[art] ' + err); } }
    return e;
  });
  return e.promise;
}

/**
 * Load models in parallel. Accepts an array of ids (or one id). Never rejects: a missing file
 * logs one warning and later getModel/getGeometry calls return a visible placeholder box.
 * Resolves to the list of ids that failed (usually empty).
 */
export function preload(ids) {
  const list = Array.isArray(ids) ? ids : [ids];
  return Promise.all(list.map(load)).then(() => list.filter((id) => entries.get(id).state !== 'ready'));
}

/** Preload every model of manifest groups (dev convenience; real worlds list their own ids). */
export async function preloadGroups(...groups) {
  const res = await fetch(`${BASE_URL}manifest.json`);
  const man = await res.json();
  const ids = new Set();
  for (const g of groups) for (const e of (man.groups[g] || [])) { const [k, ...r] = e.id.split('/'); ids.add(`${k}/${e.as || r.join('/')}`); }
  return preload([...ids]);
}

export function isReady(id) { const e = entries.get(id); return !!e && e.state === 'ready'; }

// ------------------------------------------------------------ preprocessing ---
/**
 * Merge skinned meshes that share a skeleton and material (the characters ship body + head as two
 * meshes) into one SkinnedMesh: one draw call per pass instead of two. Returns true if merged.
 */
function mergeSkinned(scene) {
  const meshes = [];
  scene.traverse((o) => { if (o.isSkinnedMesh) meshes.push(o); });
  if (meshes.length < 2) return false;
  const first = meshes[0];
  const nb = first.skeleton.bones.length;
  for (const m of meshes) {
    if (m.material !== first.material || m.parent !== first.parent) return false;
    if (!m.bindMatrix.equals(first.bindMatrix) || !m.matrix.equals(first.matrix)) return false;
    if (!m.geometry.attributes.skinIndex || !m.geometry.attributes.skinWeight) return false;
    if (m.skeleton.bones.length !== nb || !m.skeleton.bones.every((b, i) => b === first.skeleton.bones[i])) return false;
  }
  // Each mesh may carry its own inverse bind matrices. Re-express every mesh's vertices in the first
  // mesh's bind space: v' = inv(A_k) ^-1 * B_k * v. Valid when all bones a vertex uses agree on that transform.
  const invA = first.skeleton.boneInverses;
  const T = meshes.map((m) => m.skeleton.boneInverses.map((iB, k) => invA[k].clone().invert().multiply(iB)));
  const N3 = T.map((arr) => arr.map((t) => new THREE.Matrix3().getNormalMatrix(t)));
  const same = (x, y) => { for (let i = 0; i < 16; i++) if (Math.abs(x.elements[i] - y.elements[i]) > 1e-4) return false; return true; };
  let total = 0, idxTotal = 0;
  for (const m of meshes) { total += m.geometry.attributes.position.count; idxTotal += m.geometry.index ? m.geometry.index.count : m.geometry.attributes.position.count; }
  const pos = new Float32Array(total * 3), nor = new Float32Array(total * 3), uv = new Float32Array(total * 2);
  const sIdx = new Uint16Array(total * 4), sW = new Float32Array(total * 4), index = new Uint32Array(idxTotal);
  const p = new THREE.Vector3(), n = new THREE.Vector3();
  let v = 0, ii = 0;
  for (let mi = 0; mi < meshes.length; mi++) {
    const g = meshes[mi].geometry, cnt = g.attributes.position.count;
    const A = g.attributes;
    for (let i = 0; i < cnt; i++) {
      // pick the transform of the vertex's bones (they must all agree)
      let kref = -1;
      for (let k = 0; k < 4; k++) {
        if (A.skinWeight.getComponent(i, k) < 0.001) continue;
        const bone = A.skinIndex.getComponent(i, k);
        if (kref < 0) kref = bone; else if (!same(T[mi][bone], T[mi][kref])) return false;
      }
      if (kref < 0) kref = 0;
      p.fromBufferAttribute(A.position, i).applyMatrix4(T[mi][kref]);
      n.fromBufferAttribute(A.normal, i).applyMatrix3(N3[mi][kref]).normalize();
      pos[(v + i) * 3] = p.x; pos[(v + i) * 3 + 1] = p.y; pos[(v + i) * 3 + 2] = p.z;
      nor[(v + i) * 3] = n.x; nor[(v + i) * 3 + 1] = n.y; nor[(v + i) * 3 + 2] = n.z;
      if (A.uv) { uv[(v + i) * 2] = A.uv.getX(i); uv[(v + i) * 2 + 1] = A.uv.getY(i); }
      for (let k = 0; k < 4; k++) { sIdx[(v + i) * 4 + k] = A.skinIndex.getComponent(i, k); sW[(v + i) * 4 + k] = A.skinWeight.getComponent(i, k); }
    }
    if (g.index) for (let i = 0; i < g.index.count; i++) index[ii++] = g.index.getX(i) + v;
    else for (let i = 0; i < cnt; i++) index[ii++] = v + i;
    v += cnt;
  }
  const geom = new THREE.BufferGeometry();
  geom.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geom.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  geom.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  geom.setAttribute('skinIndex', new THREE.BufferAttribute(sIdx, 4));
  geom.setAttribute('skinWeight', new THREE.BufferAttribute(sW, 4));
  geom.setIndex(new THREE.BufferAttribute(index, 1));
  const merged = new THREE.SkinnedMesh(geom, first.material);
  merged.name = first.name;
  merged.bind(first.skeleton, first.bindMatrix);
  merged.userData = { ...first.userData };
  merged.frustumCulled = false; // bind-pose bounds are smaller than animated poses
  const parent = first.parent;
  for (const m of meshes) parent.remove(m);
  parent.add(merged);
  return true;
}

function process(e, gltf) {
  const scene = gltf.scene;
  e.scene = scene;
  e.clips = gltf.animations || [];
  const double = DOUBLE_SIDED.test(e.id);
  scene.updateMatrixWorld(true);
  mergeSkinned(scene);
  const groups = new Map(); // source material -> { src, items:[mesh] }
  scene.traverse((o) => {
    if (!o.isMesh) return;
    if (o.isSkinnedMesh) e.skinned = true;
    const src = o.material;
    o.userData.srcMat = src;
    if (!groups.has(src)) groups.set(src, { src, items: [] });
    groups.get(src).items.push(o);
    o.material = toLit(src, { double, recolor: recolorKind(e) });
    o.castShadow = true; o.receiveShadow = true;
  });
  e.dynamic = e.skinned || e.clips.length > 0;
  e.groups = groups;
  if (e.dynamic) {
    e.box.setFromObject(scene);
    e.parts = null;
  } else {
    // flatten: one merged geometry per source material, node transforms baked in, UVs kept
    e.parts = [];
    for (const { src, items } of groups.values()) {
      const acc = newAcc();
      for (const m of items) pushGeometry(acc, m.geometry, m.matrixWorld, null, true);
      const geometry = finishAcc(acc, { color: false, uv: true });
      e.parts.push({ geometry, material: toLit(src, { double, recolor: recolorKind(e) }) });
    }
    e.box.makeEmpty();
    for (const p of e.parts) e.box.union(p.geometry.boundingBox);
  }
  let tris = 0;
  scene.traverse((o) => { if (o.isMesh) { const g = o.geometry; tris += (g.index ? g.index.count : g.attributes.position.count) / 3; } });
  e.triangles = tris;
  e.size = e.box.getSize(new THREE.Vector3());
}

// ------------------------------------------------------------------- sizing ---
const _box = new THREE.Box3();
const _p = new THREE.Vector3();

/** Resolve size opts to { s, rotY, off (Vector3, in unscaled rotated space), size (final Vector3) }. */
function resolveFit(box, kit, opts) {
  const rotY = opts.rotY || 0;
  let b = box;
  if (rotY) {
    _box.makeEmpty();
    const c = Math.cos(rotY), s = Math.sin(rotY);
    for (const x of [box.min.x, box.max.x]) for (const y of [box.min.y, box.max.y]) for (const z of [box.min.z, box.max.z]) {
      _p.set(x * c + z * s, y, -x * s + z * c); _box.expandByPoint(_p);
    }
    b = _box;
  }
  const size = b.getSize(new THREE.Vector3());
  const ctr = b.getCenter(new THREE.Vector3());
  let s;
  const f = opts.fit;
  if (opts.height != null) s = opts.height / size.y;
  else if (opts.width != null) s = opts.width / size.x;
  else if (opts.depth != null) s = opts.depth / size.z;
  else if (f != null) {
    const fx = Array.isArray(f) ? f[0] : typeof f === 'object' ? f.x : f;
    const fy = Array.isArray(f) ? f[1] : typeof f === 'object' ? f.y : f;
    const fz = Array.isArray(f) ? f[2] : typeof f === 'object' ? f.z : f;
    s = Infinity;
    if (fx != null) s = Math.min(s, fx / size.x);
    if (fy != null) s = Math.min(s, fy / size.y);
    if (fz != null) s = Math.min(s, fz / size.z);
  } else s = opts.natural ? 1 : (KIT_SCALE[kit] || 1);
  if (opts.scale != null) s *= opts.scale;
  const origin = opts.origin || 'bottom';
  const off = new THREE.Vector3();
  if (origin === 'bottom') off.set(-ctr.x, -b.min.y, -ctr.z);
  else if (origin === 'center') off.set(-ctr.x, -ctr.y, -ctr.z);
  else if (origin === 'top') off.set(-ctr.x, -b.max.y, -ctr.z);
  else if (origin === 'back') off.set(-ctr.x, -b.min.y, -b.min.z);   // base edge at z = 0
  // 'pivot' keeps the authored origin
  return { s, rotY, off, size: size.multiplyScalar(s) };
}

// -------------------------------------------------------------- placeholders ---
let _phMat = null;
function placeholderGroup(id, opts) {
  if (!_phMat) _phMat = litMaterial({ color: 0xff3fb4 });
  const h = opts.height ?? (Array.isArray(opts.fit) ? opts.fit[1] : null) ?? 1;
  const w = opts.width ?? (Array.isArray(opts.fit) ? opts.fit[0] : null) ?? h;
  const d = opts.depth ?? (Array.isArray(opts.fit) ? opts.fit[2] : null) ?? w;
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), _phMat);
  m.position.y = h / 2;
  m.castShadow = true;
  const g = new THREE.Group();
  g.add(m);
  g.userData.placeholder = id;
  return g;
}

function placeholderGeometry(opts) {
  const h = opts.height ?? 1, w = opts.width ?? h, d = opts.depth ?? w;
  const g = new THREE.BoxGeometry(w, h, d).toNonIndexed();
  g.translate(0, h / 2, 0);
  const n = g.attributes.position.count;
  const col = new Float32Array(n * 3);
  _tmpC.set(0xff3fb4);
  for (let i = 0; i < n; i++) { col[i * 3] = _tmpC.r; col[i * 3 + 1] = _tmpC.g; col[i * 3 + 2] = _tmpC.b; }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.deleteAttribute('uv');
  return g;
}
const _tmpC = new THREE.Color();

// ---------------------------------------------------------------- getModel ---
function buildHolder(e, opts) {
  const fit = resolveFit(e.box, e.kit, opts);
  const holder = new THREE.Group();
  holder.name = e.id;
  holder.scale.setScalar(fit.s);
  holder.rotation.y = fit.rotY;
  // p' = s * (R p + off)  ==  position s*off, rotation R, scale s
  holder.position.copy(fit.off).multiplyScalar(fit.s);
  const castShadow = opts.shadow !== false;
  const receiveShadow = opts.receive !== false;
  if (e.dynamic) {
    const inst = SkeletonUtils.clone(e.scene);
    inst.traverse((o) => { if (o.isMesh) { o.castShadow = castShadow; o.receiveShadow = receiveShadow; } });
    holder.add(inst);
    holder.userData.instance = inst;
  } else {
    for (const p of e.parts) {
      const mesh = new THREE.Mesh(p.geometry, opts.material || p.material);
      mesh.castShadow = castShadow; mesh.receiveShadow = receiveShadow;
      holder.add(mesh);
    }
  }
  return { holder, fit };
}

/**
 * A fresh instance of a model, ready to add to the scene.
 *
 * opts (all optional):
 *   height | width | depth   size so that extent equals this (uniform scale)
 *   fit: [x, y, z] | n       uniform scale to fit inside this box (use null for "don't care": [1.8, null, 0.9])
 *   scale                    extra multiplier (default 1)
 *   natural: true            skip the kit's default scale (KIT_SCALE) and use the authored size
 *   rotY                     yaw in radians baked into the model's frame
 *   origin                   'bottom' (default, ground centre) | 'center' | 'top' | 'back' | 'pivot'
 *   shadow / receive         false to switch casting / receiving off
 *   material                 override the lit material (static models only)
 *
 * Static models are flattened to one mesh per material (usually 1-2 draw calls) and share
 * geometry and materials with every other instance. Skinned / animated models are cloned with
 * SkeletonUtils (shared geometry + materials, own skeleton); the returned group has
 * `userData.instance` (the cloned scene, the AnimationMixer root) and `userData.clips`.
 * Returns a Group you may freely position, rotate and scale. If the model is not loaded
 * (never preloaded, still loading, or missing) you get a pink placeholder box that is swapped for
 * the real model as soon as it loads.
 */
export function getModel(id, opts = {}) {
  const e = getEntry(id);
  const root = new THREE.Group();
  root.name = id;
  const finish = () => {
    for (let i = root.children.length - 1; i >= 0; i--) root.remove(root.children[i]);
    const { holder, fit } = buildHolder(e, opts);
    root.add(holder);
    root.userData.size = fit.size;
    root.userData.height = fit.size.y;
    root.userData.scale = fit.s;
    root.userData.clips = e.clips;
    root.userData.instance = holder.userData.instance || null;
    root.userData.placeholder = null;
  };
  if (e.state === 'ready') { finish(); root.userData.id = id; return root; }
  root.userData.id = id;
  const ph = placeholderGroup(id, opts);
  root.add(ph);
  root.userData.placeholder = id;
  if (e.state === 'idle') {
    warnOnce('late:' + id, `getModel("${id}") called before preload(); loading it now and showing a placeholder until it arrives`);
    load(id);
  }
  e.waiters.push(() => { if (e.state === 'ready') finish(); else warnOnce('missing:' + id, `model "${id}" is missing`); });
  return root;
}

// ------------------------------------------------------------- getGeometry ---
// palette / texture sampling for vertex-colour baking
const _texData = new WeakMap();
const S2L = new Float32Array(256);
for (let i = 0; i < 256; i++) { const c = i / 255; S2L[i] = c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); }

function texData(tex) {
  let d = _texData.get(tex);
  if (d) return d;
  const img = tex.image;
  const w = img.width, h = img.height;
  let ctx;
  if (typeof OffscreenCanvas !== 'undefined') ctx = new OffscreenCanvas(w, h).getContext('2d', { willReadFrequently: true });
  else { const c = document.createElement('canvas'); c.width = w; c.height = h; ctx = c.getContext('2d', { willReadFrequently: true }); }
  ctx.drawImage(img, 0, 0);
  d = { w, h, data: ctx.getImageData(0, 0, w, h).data, srgb: tex.colorSpace === THREE.SRGBColorSpace };
  _texData.set(tex, d);
  return d;
}

function wrapIdx(i, n, mode) {
  if (mode === THREE.RepeatWrapping) return ((i % n) + n) % n;
  if (mode === THREE.MirroredRepeatWrapping) { const m = ((i % (2 * n)) + 2 * n) % (2 * n); return m < n ? m : 2 * n - 1 - m; }
  return i < 0 ? 0 : i >= n ? n - 1 : i;
}

const _px = [0, 0, 0];
function sampleTexture(tex, td, u, v, out) {
  const y01 = tex.flipY ? 1 - v : v;
  const fx = u * td.w - 0.5, fy = y01 * td.h - 0.5;
  const x0 = Math.floor(fx), y0 = Math.floor(fy);
  const tx = fx - x0, ty = fy - y0;
  out[0] = out[1] = out[2] = 0;
  for (let j = 0; j < 2; j++) for (let i = 0; i < 2; i++) {
    const wgt = (i ? tx : 1 - tx) * (j ? ty : 1 - ty);
    if (wgt === 0) continue;
    const xx = wrapIdx(x0 + i, td.w, tex.wrapS), yy = wrapIdx(y0 + j, td.h, tex.wrapT);
    const o = (yy * td.w + xx) * 4;
    if (td.srgb) { out[0] += S2L[td.data[o]] * wgt; out[1] += S2L[td.data[o + 1]] * wgt; out[2] += S2L[td.data[o + 2]] * wgt; }
    else { out[0] += (td.data[o] / 255) * wgt; out[1] += (td.data[o + 1] / 255) * wgt; out[2] += (td.data[o + 2] / 255) * wgt; }
  }
  return out;
}

const _uv = new THREE.Vector2();
const _col = { r: 1, g: 1, b: 1 };
/** colour-per-source-vertex function for one mesh + source material */
function bakeColorFn(mesh, mat, rk) {
  const g = mesh.geometry;
  const base = rk && !mat.map ? recolor(rk, (mat.color || new THREE.Color(1, 1, 1)).clone()) : (mat.color || new THREE.Color(1, 1, 1));
  const map = mat.map && mat.map.image ? mat.map : null;
  const uvAttr = map ? g.attributes[map.channel ? `uv${map.channel}` : 'uv'] : null;
  const vc = mat.vertexColors && g.attributes.color ? g.attributes.color : null;
  const td = map && uvAttr ? texData(map) : null;
  if (map) map.updateMatrix();
  const indexed = !!g.index;
  const ia = g.index;
  return (i) => {
    // pushGeometry expands indexed geometry to non-indexed: i is the expanded index
    const src = indexed ? ia.getX(i) : i;
    let r = base.r, gg = base.g, b = base.b;
    if (td) {
      _uv.set(uvAttr.getX(src), uvAttr.getY(src)).applyMatrix3(map.matrix);
      sampleTexture(map, td, _uv.x, _uv.y, _px);
      r *= _px[0]; gg *= _px[1]; b *= _px[2];
    }
    if (vc) { r *= vc.getX(src); gg *= vc.getY(src); b *= vc.getZ(src); }
    _col.r = r; _col.g = gg; _col.b = b;
    return _col;
  };
}

function buildGeometry(e, opts) {
  const acc = newAcc();
  e.scene.updateMatrixWorld(true);
  for (const { src, items } of e.groups.values()) {
    if (src.transparent && src.opacity < 0.35) continue; // skip glass-like panes
    for (const m of items) pushGeometry(acc, m.geometry, m.matrixWorld, bakeColorFn(m, src, recolorKind(e)), false);
  }
  const geo = finishAcc(acc, { color: true, uv: false });
  const fit = resolveFit(e.box, e.kit, opts);
  const M = new THREE.Matrix4();
  // p' = s * (R p + off)
  M.makeRotationY(fit.rotY);
  M.premultiply(new THREE.Matrix4().makeTranslation(fit.off.x, fit.off.y, fit.off.z));
  M.premultiply(new THREE.Matrix4().makeScale(fit.s, fit.s, fit.s));
  geo.applyMatrix4(M);
  if (opts.ao) bakeAO(geo, typeof opts.ao === 'object' ? opts.ao : {});
  geo.computeBoundingBox();
  geo.computeBoundingSphere();
  geo.userData.size = fit.size.clone();
  geo.userData.id = e.id;
  return geo;
}

function geoKey(id, opts) {
  return [opts.height, opts.width, opts.depth, Array.isArray(opts.fit) ? opts.fit.join(',') : opts.fit, opts.scale, opts.natural ? 1 : 0, opts.rotY, opts.origin, opts.ao ? JSON.stringify(opts.ao) : ''].join('|');
}

/**
 * The model flattened into ONE merged, non-indexed BufferGeometry with `position`, `normal` and a
 * `color` vertex attribute (palette texture sampled at every vertex, node transforms applied,
 * sized and re-origined like getModel). Draw it with the shared material:
 *
 *   const m = new THREE.InstancedMesh(getGeometry('food-kit/egg', { height: 0.36 }), getSharedMaterial(), 64);
 *
 * Same size opts as getModel, plus `ao` (true or a bakeAO options object) to darken the base and
 * undersides. The result is cached and shared: never mutate or dispose it. `geometry.userData.size`
 * holds the final size. Triangles with glass-like transparency are skipped.
 * If the model is not loaded yet you get a placeholder box geometry that is filled in place once it loads.
 */
export function getGeometry(id, opts = {}) {
  const e = getEntry(id);
  const key = geoKey(id, opts);
  let g = e.geoCache.get(key);
  if (g) return g;
  if (e.state === 'ready') {
    g = buildGeometry(e, opts);
    e.geoCache.set(key, g);
    return g;
  }
  g = placeholderGeometry(opts);
  g.userData.placeholder = id;
  e.geoCache.set(key, g);
  if (e.state === 'idle') { warnOnce('late:' + id, `getGeometry("${id}") called before preload(); loading it now and using a placeholder box until it arrives`); load(id); }
  e.waiters.push(() => {
    if (e.state !== 'ready') { warnOnce('missing:' + id, `model "${id}" is missing`); return; }
    const real = buildGeometry(e, opts);
    g.setAttribute('position', real.attributes.position);
    g.setAttribute('normal', real.attributes.normal);
    g.setAttribute('color', real.attributes.color);
    g.computeBoundingBox(); g.computeBoundingSphere();
    g.userData.size = real.userData.size;
    g.userData.placeholder = null;
  });
  return g;
}

/**
 * A single-draw-call Mesh (merged vertex-colour geometry + shared material) for static scenery
 * and props. Cheaper than getModel for anything that never animates; same look.
 */
export function getMesh(id, opts = {}) {
  const m = new THREE.Mesh(getGeometry(id, opts), getSharedMaterial());
  m.castShadow = opts.shadow !== false;
  m.receiveShadow = opts.receive !== false;
  m.name = id;
  return m;
}

// ----------------------------------------------------------------- queries ---
/** The AnimationClips of a loaded model (shared, do not mutate) or []. */
export function getClips(id) { const e = entries.get(id); return e && e.state === 'ready' ? e.clips : []; }

/** Natural (authored) info of a loaded model: { id, kit, triangles, size:[x,y,z], skinned, clips:[names], scale } */
export function info(id) {
  const e = entries.get(id);
  if (!e || e.state !== 'ready') return null;
  return {
    id, kit: e.kit, triangles: e.triangles, size: e.size.toArray().map((v) => +v.toFixed(3)),
    skinned: e.skinned, clips: e.clips.map((c) => c.name), scale: KIT_SCALE[e.kit] || 1,
    drawCalls: e.dynamic ? e.groups.size : e.parts.length,
  };
}

/** Everything the loader knows: [{ id, state: 'ready'|'loading'|'missing', ...info }]. */
export function listLoaded() {
  return [...entries.values()].map((e) => (e.state === 'ready' ? { state: 'ready', ...info(e.id) } : { id: e.id, state: e.state }));
}

/** Total triangles and mesh count under an Object3D (instances counted, hidden objects skipped). */
export function measure(obj) {
  let triangles = 0, meshes = 0, drawCalls = 0;
  obj.traverseVisible((o) => {
    if (!o.isMesh) return;
    const g = o.geometry;
    const t = (g.index ? g.index.count : g.attributes.position.count) / 3;
    const n = o.isInstancedMesh ? o.count : 1;
    triangles += t * n; meshes += n; drawCalls += 1;
  });
  return { triangles: Math.round(triangles), meshes, drawCalls };
}

/** Per-frame renderer counters: { drawCalls, triangles, geometries, textures }. */
export function renderStats(renderer) {
  const i = renderer.info;
  return { drawCalls: i.render.calls, triangles: i.render.triangles, geometries: i.memory.geometries, textures: i.memory.textures };
}

export { getSharedMaterial };
