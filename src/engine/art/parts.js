// Bloom Rush art kit - code-built modelling helpers (for everything the packs do not cover).
//
//   const b = new Parts();
//   b.rbox(0xc98a4b, 1.2, 0.8, 3.4, 0.08, [0, 0.4, 0]);      // rounded box: w, h, d, radius, pos
//   b.capsule(0xffffff, 0.12, 0.5, [0, 1, 0]);               // radius, length of the straight part
//   b.rcyl(0x58e0c4, 0.5, 0.1, 0.03, [0, 0.05, 0]);          // rounded cylinder: radius, height, bevel
//   b.model('food-kit/egg', { pos: [0, 1, 0], height: 0.3 });// merge a pack model's geometry into the piece
//   const geo = b.merged({ ao: true });                      // ONE non-indexed geometry (position/normal/color)
//   const mesh = new THREE.Mesh(geo, getSharedMaterial());
//
// All primitives keep three's smooth normals (spheres, cylinders, capsules, lathes, rounded boxes),
// with sensible default segment counts; ico()/oct() stay faceted on purpose.
// Signatures of add/box/sph/cyl/cone/ico/oct are identical to the old src/models.js Parts.
import * as THREE from 'three';
import { getGeometry, getSharedMaterial } from './assets.js';
import { newAcc, pushGeometry, finishAcc, bakeAO } from './bake.js';

const _p = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _s = new THREE.Vector3();
const _c = new THREE.Color();
const IDENT = new THREE.Matrix4();

// primitive geometry cache (shared, never disposed)
const GC = new Map();
function geo(key, make) {
  let g = GC.get(key);
  if (!g) { g = make(); GC.set(key, g); }
  return g;
}

/** A rounded box of size w x h x d with corner/edge radius r. S = 2*seg+1 grid; smooth normals. */
export function roundedBoxGeometry(w = 1, h = 1, d = 1, r = 0.1, seg = 2) {
  const S = seg * 2 + 1;
  r = Math.min(r, w / 2, h / 2, d / 2);
  const base = new THREE.BoxGeometry(1, 1, 1, S, S, S).toNonIndexed();
  const pos = base.attributes.position;
  const nor = base.attributes.normal;
  const half = 0.5 / S;
  const bx = w / 2 - r, by = h / 2 - r, bz = d / 2 - r;
  const n = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    n.set(x - Math.sign(x) * half, y - Math.sign(y) * half, z - Math.sign(z) * half).normalize();
    pos.setXYZ(i, bx * Math.sign(x) + n.x * r, by * Math.sign(y) + n.y * r, bz * Math.sign(z) + n.z * r);
    nor.setXYZ(i, n.x, n.y, n.z);
  }
  base.deleteAttribute('uv');
  return base;
}

/** Profile of a cylinder (radius r, height h, bevel b) for LatheGeometry: bottom centre -> up the side -> top centre. */
function roundedCylProfile(r, h, bevel, steps = 4) {
  const b = Math.min(bevel, r, h / 2);
  const pts = [new THREE.Vector2(0, -h / 2)];
  for (let i = 0; i <= steps; i++) { const a = (i / steps) * Math.PI / 2; pts.push(new THREE.Vector2(r - b + Math.sin(a) * b, -h / 2 + b - Math.cos(a) * b)); }
  for (let i = 0; i <= steps; i++) { const a = (i / steps) * Math.PI / 2; pts.push(new THREE.Vector2(r - b + Math.cos(a) * b, h / 2 - b + Math.sin(a) * b)); }
  pts.push(new THREE.Vector2(0, h / 2));
  return pts;
}

function toColor(c) { return _c.set(c ?? 0xffffff); }

// ------------------------------------------------------------------- merge ---
/**
 * parts: [{ geometry, color, matrix, vertexColors? }] -> one non-indexed BufferGeometry with
 * position / normal / color. `opts.ao` (true or bakeAO options) bakes ambient occlusion: darker toward
 * the ground, under overhangs and where one part's surface faces another part closely.
 */
export function mergeParts(parts, opts = {}) {
  const acc = newAcc();
  const boxes = [];
  const ranges = [];
  let start = 0;
  const bb = new THREE.Box3();
  for (const p of parts) {
    const g = p.geometry;
    const m = p.matrix || IDENT;
    const tint = toColor(p.color).clone();
    let colorFn;
    if (p.vertexColors && g.attributes.color) {
      const ca = g.attributes.color;
      colorFn = (i) => { _col.r = ca.getX(i) * tint.r; _col.g = ca.getY(i) * tint.g; _col.b = ca.getZ(i) * tint.b; return _col; };
    } else colorFn = () => tint;
    pushGeometry(acc, g, m, colorFn, false);
    const n = acc.count - start;
    ranges.push([start, start + n]);
    start += n;
    if (opts.ao) {
      bb.makeEmpty();
      const pa = g.attributes.position;
      for (let i = 0; i < pa.count; i++) { _p.fromBufferAttribute(pa, i).applyMatrix4(m); bb.expandByPoint(_p); }
      boxes.push({ min: bb.min.toArray(), max: bb.max.toArray() });
    }
  }
  const out = finishAcc(acc, { color: true, uv: false });
  if (opts.ao) {
    const o = typeof opts.ao === 'object' ? { ...opts.ao } : {};
    const boxOf = new Int32Array(out.attributes.position.count);
    ranges.forEach(([a, b], k) => boxOf.fill(k, a, b));
    o.boxes = o.boxes || boxes; o.boxOf = boxOf;
    if (opts.ao.noBoxes) o.boxes = null;
    bakeAO(out, o);
  }
  return out;
}
const _col = { r: 1, g: 1, b: 1 };

// ------------------------------------------------------------------- Parts ---
/** Collects coloured primitive parts. Positions are [x, y, z]; rotations are Euler radians [x, y, z]. */
export class Parts {
  constructor() { this.parts = []; }

  add(geometry, color, pos, rot, scl, vertexColors = false) {
    pos = pos || [0, 0, 0]; rot = rot || [0, 0, 0]; scl = scl || [1, 1, 1];
    _p.set(pos[0], pos[1], pos[2]);
    _q.setFromEuler(_e.set(rot[0], rot[1], rot[2], 'XYZ'));
    _s.set(scl[0], scl[1], scl[2]);
    this.parts.push({ geometry, color, vertexColors, matrix: new THREE.Matrix4().compose(_p, _q, _s) });
    return this;
  }
  /** sharp box */
  box(color, w, h, d, pos, rot, scl) {
    return this.add(geo(`b${w},${h},${d}`, () => new THREE.BoxGeometry(w, h, d)), color, pos, rot, scl);
  }
  /** rounded box with edge radius r (seg = bevel smoothness, 1..3) */
  rbox(color, w, h, d, r = 0.06, pos, rot, scl, seg = 2) {
    return this.add(geo(`rb${w},${h},${d},${r},${seg}`, () => roundedBoxGeometry(w, h, d, r, seg)), color, pos, rot, scl);
  }
  sph(color, r, pos, scl, rot, ws = 18, hs = 12) {
    return this.add(geo(`s${r},${ws},${hs}`, () => new THREE.SphereGeometry(r, ws, hs)), color, pos, rot, scl);
  }
  /** cylinder along Y; rt = top radius, rb = bottom radius */
  cyl(color, rt, rb, h, pos, rot, seg = 20, scl, open = false) {
    return this.add(geo(`c${rt},${rb},${h},${seg},${open}`, () => new THREE.CylinderGeometry(rt, rb, h, seg, 1, open)), color, pos, rot, scl);
  }
  cone(color, r, h, pos, rot, seg = 20, scl, open = false) {
    return this.add(geo(`k${r},${h},${seg},${open}`, () => new THREE.ConeGeometry(r, h, seg, 1, open)), color, pos, rot, scl);
  }
  /** capsule along Y: radius r, straight length len (total height = len + 2r) */
  capsule(color, r, len, pos, rot, scl, caps = 5, radial = 14) {
    return this.add(geo(`cap${r},${len},${caps},${radial}`, () => new THREE.CapsuleGeometry(r, len, caps, radial)), color, pos, rot, scl);
  }
  torus(color, R, r, pos, rot, scl, arc = Math.PI * 2, rseg = 10, tseg = 20) {
    return this.add(geo(`t${R},${r},${arc},${rseg},${tseg}`, () => new THREE.TorusGeometry(R, r, rseg, tseg, arc)), color, pos, rot, scl);
  }
  /** surface of revolution about Y from a profile [[radius, y], ...] (smooth normals) */
  lathe(color, profile, pos, rot, seg = 24, scl) {
    const key = `l${seg},${profile.map((p) => p.join(':')).join(';')}`;
    return this.add(geo(key, () => new THREE.LatheGeometry(profile.map((p) => new THREE.Vector2(p[0], p[1])), seg)), color, pos, rot, scl);
  }
  /** cylinder with rounded top and bottom edges (radius r, height h, bevel), centred on its middle */
  rcyl(color, r, h, bevel = 0.04, pos, rot, seg = 28, scl) {
    return this.add(geo(`rc${r},${h},${bevel},${seg}`, () => new THREE.LatheGeometry(roundedCylProfile(r, h, bevel), seg)), color, pos, rot, scl);
  }
  /** flat-shaded low-poly blobs (faceted on purpose) */
  ico(color, r, pos, scl, rot) {
    return this.add(geo(`i${r}`, () => new THREE.IcosahedronGeometry(r, 0)), color, pos, rot, scl);
  }
  oct(color, r, pos, scl, rot) {
    return this.add(geo(`o${r}`, () => new THREE.OctahedronGeometry(r, 0)), color, pos, rot, scl);
  }
  /**
   * Merge a pack model's geometry (via getGeometry: baked palette colours) into this piece.
   * opts: { pos, rot, scl, tint (multiplies the baked colours), ...getGeometry sizing opts }.
   * The model should be preloaded; a missing one shows up as a pink placeholder box.
   */
  model(id, opts = {}) {
    const { pos, rot, scl, tint, ...g } = opts;
    return this.add(getGeometry(id, g), tint ?? 0xffffff, pos, rot, scl, true);
  }
  /** Another Parts' contents, transformed. */
  append(other, pos, rot, scl) {
    const m = new THREE.Matrix4().compose(
      _p.set(...(pos || [0, 0, 0])), _q.setFromEuler(_e.set(...(rot || [0, 0, 0]), 'XYZ')), _s.set(...(scl || [1, 1, 1])),
    );
    for (const p of other.parts) this.parts.push({ ...p, matrix: m.clone().multiply(p.matrix) });
    return this;
  }
  merged(opts) { return mergeParts(this.parts, opts); }
}

/** A Mesh from a Parts (or a merged geometry) with the shared lit material and shadows on. */
export function meshOf(geometry, { cast = true, receive = false } = {}) {
  const m = new THREE.Mesh(geometry.merged ? geometry.merged() : geometry, getSharedMaterial());
  m.castShadow = cast;
  m.receiveShadow = receive;
  return m;
}
