// Geometry helpers shared by engine and worlds: merge coloured primitives into one
// vertex-coloured BufferGeometry, the shared Lambert material, and the built-in cash
// bundle model. Pure builders, no game state.
import * as THREE from 'three';

// ------------------------------------------------------------ merge helper ---
const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();
const _v = new THREE.Vector3();
const _n3 = new THREE.Matrix3();
const _c = new THREE.Color();
const IDENT = new THREE.Matrix4();

/** parts: [{ geometry, color, matrix }] -> one non-indexed BufferGeometry with position/normal/color. */
export function mergeParts(parts) {
  let total = 0;
  const prepared = parts.map((p) => {
    const g = p.geometry.index ? p.geometry.toNonIndexed() : p.geometry;
    total += g.attributes.position.count;
    return { g, color: p.color, matrix: p.matrix || IDENT };
  });
  const pos = new Float32Array(total * 3);
  const nor = new Float32Array(total * 3);
  const col = new Float32Array(total * 3);
  let o = 0;
  for (const { g, color, matrix } of prepared) {
    _n3.getNormalMatrix(matrix);
    _c.set(color);
    const pa = g.attributes.position;
    const na = g.attributes.normal;
    for (let i = 0; i < pa.count; i++, o += 3) {
      _v.fromBufferAttribute(pa, i).applyMatrix4(matrix);
      pos[o] = _v.x; pos[o + 1] = _v.y; pos[o + 2] = _v.z;
      _v.fromBufferAttribute(na, i).applyMatrix3(_n3).normalize();
      nor[o] = _v.x; nor[o + 1] = _v.y; nor[o + 2] = _v.z;
      col[o] = _c.r; col[o + 1] = _c.g; col[o + 2] = _c.b;
    }
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  out.setAttribute('color', new THREE.BufferAttribute(col, 3));
  out.computeBoundingBox();
  out.computeBoundingSphere();
  return out;
}

// primitive geometry cache (shared, never disposed)
const GC = new Map();
export function geo(key, make) {
  let g = GC.get(key);
  if (!g) { g = make(); GC.set(key, g); }
  return g;
}

/** Collects coloured primitive parts. All position args are [x, y, z], rotations are Euler radians. */
export class Parts {
  constructor() { this.parts = []; }
  add(geometry, color, pos, rot, scl) {
    pos = pos || [0, 0, 0]; rot = rot || [0, 0, 0]; scl = scl || [1, 1, 1];
    _p.set(pos[0], pos[1], pos[2]);
    _q.setFromEuler(_e.set(rot[0], rot[1], rot[2], 'XYZ'));
    _s.set(scl[0], scl[1], scl[2]);
    this.parts.push({ geometry, color, matrix: new THREE.Matrix4().compose(_p, _q, _s) });
    return this;
  }
  box(color, w, h, d, pos, rot, scl) {
    return this.add(geo(`b${w},${h},${d}`, () => new THREE.BoxGeometry(w, h, d)), color, pos, rot, scl);
  }
  sph(color, r, pos, scl, rot, ws = 12, hs = 8) {
    return this.add(geo(`s${r},${ws},${hs}`, () => new THREE.SphereGeometry(r, ws, hs)), color, pos, rot, scl);
  }
  cyl(color, rt, rb, h, pos, rot, seg = 10, scl, open = false) {
    return this.add(geo(`c${rt},${rb},${h},${seg},${open}`, () => new THREE.CylinderGeometry(rt, rb, h, seg, 1, open)), color, pos, rot, scl);
  }
  cone(color, r, h, pos, rot, seg = 8, scl, open = false) {
    return this.add(geo(`k${r},${h},${seg},${open}`, () => new THREE.ConeGeometry(r, h, seg, 1, open)), color, pos, rot, scl);
  }
  ico(color, r, pos, scl, rot) {
    return this.add(geo(`i${r}`, () => new THREE.IcosahedronGeometry(r, 0)), color, pos, rot, scl);
  }
  oct(color, r, pos, scl, rot) {
    return this.add(geo(`o${r}`, () => new THREE.OctahedronGeometry(r, 0)), color, pos, rot, scl);
  }
  merged() { return mergeParts(this.parts); }
}

let _shared = null;
/** One vertex-colour Lambert material shared by every merged geometry. */
export function getSharedMaterial() {
  if (!_shared) _shared = new THREE.MeshLambertMaterial({ vertexColors: true });
  return _shared;
}

/** Bundle of cash (built-in item 'cash'), origin bottom-centre, long axis X. */
export const BILL = { len: 0.62, h: 0.1, d: 0.34, step: 0.1 };
export function makeBillGeometry() {
  const { len, h, d } = BILL;
  const b = new Parts();
  b.box(0x3fbf5c, len, h * 0.9, d, [0, h * 0.45, 0]);
  b.box(0xeaf6d2, 0.15, h * 0.97, d + 0.012, [0, h * 0.485, 0]);
  b.cyl(0xc4ecaa, 0.055, 0.055, 0.012, [0.0, h * 0.97 + 0.004, 0], null, 10);
  return b.merged();
}

/** Mesh with the shared material that casts shadows. */
export function meshOf(geometry, { receive = false } = {}) {
  const m = new THREE.Mesh(geometry, getSharedMaterial());
  m.castShadow = true;
  m.receiveShadow = receive;
  return m;
}

/** Deterministic PRNG (mulberry32) returning floats in [0, 1). */
export function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
