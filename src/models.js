// Bloom Rush — procedural low-poly models (pure builders, no game state).
import * as THREE from 'three';
import { FLOWERS, SIZES } from './config.js';

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
function geo(key, make) {
  let g = GC.get(key);
  if (!g) { g = make(); GC.set(key, g); }
  return g;
}

/** Collects coloured primitive parts. All position args are [x, y, z], rotations are Euler radians. */
class Parts {
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

function meshOf(geometry, { receive = false } = {}) {
  const m = new THREE.Mesh(geometry, getSharedMaterial());
  m.castShadow = true;
  m.receiveShadow = receive;
  return m;
}

const STEM = 0x35b04a;
const STEM_DARK = 0x278a3b;
const LEAF = 0x4cd05e;

// ----------------------------------------------------------------- flowers ---
function flowerParts(type, h = SIZES.flowerHeight) {
  const F = FLOWERS[type] || FLOWERS[0];
  const b = new Parts();
  const s = h / 0.95;
  const stemH = type === 2 ? 0.72 : 0.64;
  b.cyl(STEM, 0.04, 0.05, stemH * s, [0, (stemH * s) / 2, 0], null, 5, null, true);
  // two leaves
  b.oct(LEAF, 0.15, [0.1 * s, 0.2 * s, 0.02], [1, 0.22, 0.5], [0, 0.2, 0.5]);
  b.oct(STEM_DARK, 0.14, [-0.1 * s, 0.33 * s, -0.02], [1, 0.22, 0.5], [0, 3.3, -0.45]);
  if (type === 0) { // rose: layered round bloom
    b.ico(F.petal, 0.24, [0, 0.7 * s, 0], [1, 0.85, 1], [0.3, 0.2, 0]);
    b.ico(F.petalDark, 0.185, [0, 0.79 * s, 0], [1, 0.8, 1], [0, 0.6, 0]);
    b.ico(F.petal, 0.11, [0, 0.89 * s, 0], [1, 0.8, 1], [0.2, 1.1, 0]);
    // sepals
    b.oct(STEM_DARK, 0.1, [0, 0.6 * s, 0], [1.4, 0.3, 1.4], [0, 0.4, 0]);
  } else if (type === 1) { // tulip: open cup with a bright rim
    b.cyl(F.petalDark, 0.1, 0.06, 0.2 * s, [0, 0.7 * s, 0], null, 6);
    b.cyl(F.center, 0.1, 0.1, 0.06 * s, [0, 0.84 * s, 0], null, 6);
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2 + 0.3;
      const sx = Math.sin(a), cz = Math.cos(a);
      b.oct(i % 2 ? F.petal : 0xb98aff, 0.25, [sx * 0.11, 0.84 * s, cz * 0.11], [0.55, 0.9, 0.3], [cz * 0.5, a, -sx * 0.5].map((v, j) => (j === 1 ? a : v)));
    }
  } else if (type === 2) { // sunflower: tilted disc toward the camera
    const n = new THREE.Vector3(-0.38, 1, -0.38).normalize();
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), n);
    const eu = new THREE.Euler().setFromQuaternion(q);
    const rot = [eu.x, eu.y, eu.z];
    const c = [0, 0.76 * s, 0];
    const at = (x, y, z) => { const v = new THREE.Vector3(x, y, z).applyQuaternion(q); return [c[0] + v.x, c[1] + v.y, c[2] + v.z]; };
    b.cyl(F.petalDark, 0.27, 0.27, 0.05, at(0, -0.02, 0), rot, 8);
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2;
      const pr = [rot[0], rot[1], rot[2]];
      const qq = new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.PI / 2, 0, -a)).premultiply(q);
      const ee = new THREE.Euler().setFromQuaternion(qq);
      b.cone(i % 2 ? F.petal : 0xffdf40, 0.075, 0.2, at(Math.sin(a) * 0.3, 0.02, Math.cos(a) * 0.3), [ee.x, ee.y, ee.z], 4, [1, 1, 0.5], true);
      void pr;
    }
    b.cyl(F.center, 0.19, 0.19, 0.09, at(0, 0.02, 0), rot, 8);
    b.cyl(0x8a5a22, 0.09, 0.09, 0.1, at(0, 0.03, 0), rot, 6);
  } else { // orchid: several blooms along the stem
    const spots = [[0.1, 0.5, 0.6], [-0.1, 0.68, 2.4], [0.04, 0.86, 4.2]];
    spots.forEach(([x, y, a], i) => {
      const sz = 1 - i * 0.12;
      const px = x * s, py = y * s;
      for (let k = 0; k < 3; k++) {
        const ang = a + (k * Math.PI * 2) / 3;
        b.oct(k === 0 ? F.petalDark : F.petal, 0.27 * sz, [px, py, 0], [1, 0.3, 0.55], [0, ang, 0.2]);
      }
      b.oct(F.center, 0.08 * sz, [px, py + 0.04, 0], [1, 1, 1]);
    });
  }
  return b.parts;
}

export function makeFlowerGeometry(typeIdx) {
  return mergeParts(flowerParts(typeIdx));
}

export function makeStubGeometry() {
  const b = new Parts();
  b.cyl(STEM_DARK, 0.04, 0.055, 0.14, [0, 0.07, 0], null, 5);
  return b.merged();
}

export function makeBouquetGeometry(typeIdx) {
  const F = FLOWERS[typeIdx] || FLOWERS[0];
  const b = new Parts();
  const { len, h, d } = SIZES.bouquet;
  const x0 = -len / 2;
  const R = d / 2 - 0.02;
  const cl = 0.66;
  const cy = h / 2;
  // wrap cone: wide end at +X, tip at -X (cylinder axis Y rotated to X: +Y -> -X with rot z = +90deg)
  b.cyl(F.wrap, 0.02, R, cl, [x0 + cl / 2, cy, 0], [0, 0, -Math.PI / 2], 7, [1, (h / 2 - 0.005) / R, 1]);
  // ribbon band
  const rx = x0 + cl * 0.62;
  const rr = 0.02 + (R - 0.02) * 0.62 + 0.012;
  b.cyl(F.ribbon, rr, rr, 0.09, [rx, cy, 0], [0, 0, -Math.PI / 2], 7, [1, (h / 2 - 0.005) / R * (R / rr) * 1.0, 1]);
  // blooms poking out at +X
  const bx = x0 + cl - 0.02;
  b.ico(F.petal, 0.115, [bx + 0.2, cy + 0.0, -0.1]);
  b.ico(F.petalDark, 0.115, [bx + 0.24, cy + 0.0, 0.1]);
  b.ico(F.petal, 0.12, [bx + 0.3, cy + 0.01, 0.0]);
  // little green leaf
  b.oct(LEAF, 0.1, [bx + 0.08, cy + 0.07, 0], [1, 0.25, 1.4]);
  return b.merged();
}

export function makeBillGeometry() {
  const { len, h, d } = SIZES.bill;
  const b = new Parts();
  b.box(0x3fbf5c, len, h * 0.9, d, [0, h * 0.45, 0]);
  b.box(0xeaf6d2, 0.15, h * 0.97, d + 0.012, [0, h * 0.485, 0]);
  b.cyl(0xc4ecaa, 0.055, 0.055, 0.012, [0.0, h * 0.97 + 0.004, 0], null, 10);
  return b.merged();
}

// -------------------------------------------------------------- characters ---
export const LOOKS = {
  player: { skin: 0xffd0a6, shirt: 0x19b9b0, pants: 0x2f5fb0, hair: 0x6b4226, hat: 'straw', apron: false, tool: 'scythe', scale: 1 },
  cutter: { skin: 0xf2b88c, shirt: 0xff8a2a, pants: 0x4a4f7a, hair: 0x3a2a20, hat: 'cap', apron: false, tool: 'scythe', scale: 1 },
  cashier: { skin: 0xffd9b8, shirt: 0xff6fa5, pants: 0x3e4a73, hair: 0xd9812c, hat: null, apron: true, tool: null, scale: 1 },
};

const SKINS = [0xffd9b8, 0xf2b88c, 0xd89a6c, 0xa86f48, 0x7c4a2d, 0xffe0c8];
const SHIRTS = [0xff5d73, 0x5b8cff, 0xffc233, 0x9a6cff, 0x39c96b, 0xff8a2a, 0xe056c8, 0x2ec4ff, 0xf2f2f2];
const PANTS = [0x3a4a8c, 0x5a5160, 0x2f6b5c, 0x7a4b2a, 0x4a3a7a, 0x2c3e5c];
const HAIRS = [0x2b1b12, 0x5a3a22, 0xd9812c, 0xf2d27a, 0x8c2f2f, 0x1c1c26, 0xbfbfc9, 0x5c3a8c];
const pick = (a) => a[(Math.random() * a.length) | 0];

export function randomCustomerLook() {
  const r = Math.random();
  return {
    skin: pick(SKINS), shirt: pick(SHIRTS), pants: pick(PANTS), hair: pick(HAIRS),
    hat: r < 0.2 ? 'cap' : r < 0.32 ? 'straw' : null,
    capColor: pick(SHIRTS),
    apron: false, tool: null, scale: 0.92 + Math.random() * 0.16,
  };
}

function buildScythe() {
  const g = new THREE.Group();
  const b = new Parts();
  // pole runs through the hand along local -Y (the arm direction)
  b.cyl(0xb97a3c, 0.035, 0.035, 1.35, [0, -0.5, 0], null, 6);
  b.sph(0x8a5424, 0.05, [0, 0.19, 0], null, null, 6, 4);
  b.cyl(0x9aa3b2, 0.05, 0.05, 0.07, [0, -1.15, 0], null, 6);
  g.add(meshOf(b.merged()));
  // blade: partial torus in the XY plane, starting at the pole tip, curving away and back
  const R = 0.58;
  const bg = new Parts();
  const tg = geo('scytheBlade', () => new THREE.TorusGeometry(R, 0.075, 4, 10, 1.3));
  bg.add(tg, 0xdfe7f2, [0, -1.18 + R, 0], [0, 0, -Math.PI / 2 - 1.25], [1, 1, 0.5]);
  bg.add(geo('scytheTip', () => new THREE.TorusGeometry(R + 0.06, 0.02, 4, 10, 1.3)), 0xffffff, [0, -1.18 + R, 0.0], [0, 0, -Math.PI / 2 - 1.25], [1.05, 1.05, 0.6]);
  g.add(meshOf(bg.merged()));
  return g;
}

export function makeCharacter(look = {}) {
  const L = { skin: 0xffd0a6, shirt: 0x3399ff, pants: 0x3a4a8c, hair: 0x5a3a22, hat: null, apron: false, tool: null, scale: 1, ...look };
  const root = new THREE.Group();
  const rig = new THREE.Group();
  root.add(rig);
  const shoe = 0x6b4426;

  // torso
  const t = new Parts();
  t.cyl(L.shirt, 0.25, 0.3, 0.46, [0, 0.93, 0], null, 12, [1, 1, 0.82]);
  t.cyl(L.pants, 0.3, 0.3, 0.24, [0, 0.69, 0], null, 12, [1, 1, 0.82]);
  t.sph(L.shirt, 0.15, [0.35, 1.08, 0], [1, 1, 1], null, 8, 6);
  t.sph(L.shirt, 0.15, [-0.35, 1.08, 0], [1, 1, 1], null, 8, 6);
  t.cyl(L.skin, 0.09, 0.1, 0.1, [0, 1.2, 0], null, 8);
  if (L.apron) {
    t.box(0xffffff, 0.46, 0.5, 0.05, [0, 0.82, 0.235], [0.08, 0, 0]);
    t.box(0xff6fa5, 0.46, 0.06, 0.06, [0, 0.58, 0.245], [0.08, 0, 0]);
    t.box(0xffffff, 0.1, 0.36, 0.05, [0.17, 1.12, 0.2], [0.3, 0, 0]);
    t.box(0xffffff, 0.1, 0.36, 0.05, [-0.17, 1.12, 0.2], [0.3, 0, 0]);
    t.box(0xffe27a, 0.2, 0.14, 0.06, [0, 0.68, 0.27]);
  } else if (L.hat === 'straw') {
    // overalls: bib + straps
    t.box(0x2f5fb0 === L.pants ? L.pants : L.pants, 0.34, 0.3, 0.05, [0, 0.98, 0.215], [0.02, 0, 0]);
    t.box(L.pants, 0.07, 0.4, 0.05, [0.15, 1.1, 0.19], [0.1, 0, 0]);
    t.box(L.pants, 0.07, 0.4, 0.05, [-0.15, 1.1, 0.19], [0.1, 0, 0]);
    t.sph(0xffd23f, 0.035, [0.09, 1.02, 0.245], null, null, 6, 4);
    t.sph(0xffd23f, 0.035, [-0.09, 1.02, 0.245], null, null, 6, 4);
  }
  rig.add(meshOf(t.merged()));

  // head
  const head = new THREE.Group();
  head.position.set(0, 1.4, 0);
  const hp = new Parts();
  hp.sph(L.skin, 0.27, [0, 0, 0], null, null, 16, 12);
  hp.sph(L.skin, 0.05, [0.265, -0.01, 0], [0.5, 1, 1], null, 6, 4);
  hp.sph(L.skin, 0.05, [-0.265, -0.01, 0], [0.5, 1, 1], null, 6, 4);
  // hair cap + back
  if (L.hat !== 'cap') hp.add(geo('hairCap', () => new THREE.SphereGeometry(0.29, 16, 8, 0, Math.PI * 2, 0, Math.PI * 0.4)), L.hair, [0, 0.02, -0.02]);
  hp.sph(L.hair, 0.27, [0, -0.02, -0.07], [1, 0.95, 0.95], null, 12, 8);
  // face
  hp.sph(0x2b2233, 0.04, [0.1, 0.02, 0.235], [1, 1.25, 0.6], null, 8, 6);
  hp.sph(0x2b2233, 0.04, [-0.1, 0.02, 0.235], [1, 1.25, 0.6], null, 8, 6);
  hp.sph(0xffffff, 0.014, [0.11, 0.045, 0.255], null, null, 4, 3);
  hp.sph(0xffffff, 0.014, [-0.09, 0.045, 0.255], null, null, 4, 3);
  hp.sph(0xff8fa0, 0.05, [0.16, -0.06, 0.2], [1, 0.7, 0.4], null, 6, 4);
  hp.sph(0xff8fa0, 0.05, [-0.16, -0.06, 0.2], [1, 0.7, 0.4], null, 6, 4);
  hp.add(geo('smile', () => new THREE.TorusGeometry(0.055, 0.013, 4, 8, Math.PI)), 0x7a3b3b, [0, -0.07, 0.245], [0, 0, Math.PI]);
  if (L.hat === 'straw') {
    hp.cyl(0xf2c75c, 0.5, 0.5, 0.035, [0, 0.2, 0], [0.06, 0, 0], 16);
    hp.cyl(0xf7d878, 0.22, 0.26, 0.17, [0, 0.29, 0], null, 12);
    hp.cyl(0xe2453c, 0.265, 0.265, 0.05, [0, 0.235, 0], null, 12);
  } else if (L.hat === 'cap') {
    const cc = L.capColor ?? (L.shirt === LOOKS.cutter.shirt ? 0xffe14d : L.shirt);
    hp.add(geo('capDome', () => new THREE.SphereGeometry(0.295, 14, 8, 0, Math.PI * 2, 0, Math.PI * 0.5)), cc, [0, 0.07, 0]);
    hp.box(cc, 0.34, 0.035, 0.24, [0, 0.12, 0.3], [0.2, 0, 0]);
    hp.sph(0xffffff, 0.04, [0, 0.35, 0], null, null, 6, 4);
  }
  head.add(meshOf(hp.merged()));
  rig.add(head);

  // arms / legs on pivots
  const mkArm = (sx) => {
    const pv = new THREE.Group();
    pv.position.set(sx * 0.36, 1.08, 0);
    pv.rotation.order = 'YXZ';
    const a = new Parts();
    a.cyl(L.shirt, 0.09, 0.085, 0.3, [0, -0.17, 0], null, 8);
    a.sph(L.skin, 0.105, [0, -0.38, 0], null, null, 10, 8);
    pv.add(meshOf(a.merged()));
    const hand = new THREE.Object3D();
    hand.position.set(0, -0.38, 0);
    pv.add(hand);
    rig.add(pv);
    return { pv, hand };
  };
  const mkLeg = (sx) => {
    const pv = new THREE.Group();
    pv.position.set(sx * 0.15, 0.6, 0);
    const a = new Parts();
    a.cyl(L.pants, 0.11, 0.105, 0.4, [0, -0.2, 0], null, 8);
    a.sph(shoe, 0.13, [0, -0.5, 0.05], [1, 0.72, 1.45], null, 10, 6);
    pv.add(meshOf(a.merged()));
    rig.add(pv);
    return pv;
  };
  const armL = mkArm(1); // +X is the character's left (faces +Z)
  const armR = mkArm(-1);
  const legL = mkLeg(1);
  const legR = mkLeg(-1);

  if (L.tool === 'scythe') {
    const sc = buildScythe();
    armR.hand.add(sc);
    root.userData.tool = sc;
  }

  root.userData.hands = { left: armL.hand, right: armR.hand };
  root.userData.parts = { rig, head, armL: armL.pv, armR: armR.pv, legL, legR };
  root.userData.anim = { phase: Math.random() * 6, run: 0, carry: 0, swing: 0, wave: 0, t: Math.random() * 6, swingPhase: 0 };
  root.userData.hasTool = L.tool === 'scythe';
  root.scale.setScalar(L.scale);
  return root;
}

const lerp = (a, b, t) => a + (b - a) * t;

export function animateCharacter(char, dt, opts = {}) {
  const { moving = false, speed = 1, carrying = false, action = null } = opts;
  const P = char.userData.parts;
  const A = char.userData.anim;
  if (!P || !A) return;
  const k = 1 - Math.exp(-dt * 12);
  A.run += ((moving ? 1 : 0) - A.run) * k;
  A.carry += ((carrying ? 1 : 0) - A.carry) * k;
  A.swing += ((action === 'swing' ? 1 : 0) - A.swing) * k;
  A.wave += ((action === 'wave' ? 1 : 0) - A.wave) * k;
  A.t += dt;
  const sp = Math.min(Math.max(speed, 0.4), 2.2);
  if (A.run > 0.02) A.phase += dt * (9 + 3.5 * sp);
  A.swingPhase += dt * (A.swing > 0.05 ? 12 : 0);

  const run = A.run;
  const sinP = Math.sin(A.phase);
  const cosP = Math.cos(A.phase);
  const breathe = Math.sin(A.t * 2.4);
  const hasTool = char.userData.hasTool;

  // legs
  P.legL.rotation.x = sinP * 0.9 * run;
  P.legR.rotation.x = -sinP * 0.9 * run;
  P.legL.rotation.z = 0.02;
  P.legR.rotation.z = -0.02;

  // arms: left
  let lx = lerp(0.04 * breathe, -sinP * 0.8, run);
  let lz = lerp(0.08 + 0.02 * breathe, 0.12, run);
  let ly = 0;
  // right (tool arm if any)
  let rx = lerp(0.04 * breathe, sinP * 0.8, run);
  let rz = lerp(-0.08 - 0.02 * breathe, -0.12, run);
  let ry = 0;
  if (hasTool) {
    rx = lerp(-0.55 + 0.04 * breathe, -0.55 + sinP * 0.22, run);
    rz = -0.1;
    // swing: sweep the scythe forward and side to side
    rx = lerp(rx, -1.25, A.swing);
    ry = Math.sin(A.swingPhase) * 0.95 * A.swing;
    rz = lerp(rz, -0.05, A.swing);
  }
  // carrying: both arms held back and a little out
  const c = A.carry;
  lx = lerp(lx, 1.05, c); lz = lerp(lz, 0.3, c);
  if (!hasTool) { rx = lerp(rx, 1.05, c); rz = lerp(rz, -0.3, c); } else { rx = lerp(rx, 0.9, c * (1 - A.swing)); rz = lerp(rz, -0.3, c * (1 - A.swing)); }
  // wave
  const w = A.wave;
  if (w > 0.01) {
    rx = lerp(rx, 0.0, w);
    rz = lerp(rz, -2.5 + Math.sin(A.t * 9) * 0.35, w);
    ry = lerp(ry, 0, w);
  }
  P.armL.rotation.set(lx, ly, lz);
  P.armR.rotation.set(rx, ry, rz);

  // body: bob, lean, breathing, little twist
  const bob = Math.abs(cosP) * 0.085 * run;
  P.rig.position.y = bob;
  P.rig.rotation.x = 0.13 * run + 0.03 * Math.sin(A.t * 1.2) * (1 - run);
  P.rig.rotation.y = sinP * 0.1 * run - Math.sin(A.swingPhase) * 0.22 * A.swing;
  P.rig.rotation.z = cosP * 0.04 * run;
  P.rig.scale.y = 1 + 0.018 * breathe * (1 - run);
  P.head.rotation.x = -0.05 * run + 0.02 * breathe;
  P.head.rotation.z = -cosP * 0.05 * run;
}

// ----------------------------------------------------------------- counter ---
export function makeCounter(accent = 0xff6fa5) {
  const g = new THREE.Group();
  const b = new Parts();
  const L = SIZES.counter.len; // 3.4
  const D = SIZES.counter.depth; // 1.2
  b.box(0xe9dcc3, D + 0.1, 0.14, L + 0.1, [0, 0.07, 0]); // stone plinth
  b.box(0xc98a4b, D, 0.74, L, [0, 0.51, 0]); // wooden body
  b.box(accent, D + 0.1, 0.12, L + 0.1, [0, 0.9, 0]); // accent trim band
  b.box(0xfff3d6, D + 0.02, 0.04, L + 0.02, [0, 0.98, 0]); // cream top
  // customer-side panels
  for (let i = 0; i < 3; i++) {
    const z = -1.08 + i * 1.08;
    b.box(0xe3a766, 0.03, 0.5, 0.9, [D / 2 + 0.005, 0.5, z]);
    b.box(0xfff0d0, 0.03, 0.36, 0.76, [D / 2 + 0.02, 0.5, z]);
  }
  // corner posts
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.box(0xa56a33, 0.12, 0.74, 0.12, [sx * (D / 2), 0.51, sz * (L / 2)]);
  // register near +Z end (keep z in [-1.5, 0.5] clear)
  b.box(0x3b4458, 0.5, 0.2, 0.42, [-0.05, 1.12, 1.25]);
  b.box(0x5a6578, 0.46, 0.08, 0.38, [-0.05, 1.26, 1.25]);
  b.box(0x58e0c4, 0.04, 0.22, 0.3, [0.1, 1.38, 1.25], [0, 0, -0.35]);
  b.box(0xffd23f, 0.2, 0.04, 0.34, [0.28, 1.06, 1.25]);
  b.box(0xffffff, 0.12, 0.02, 0.14, [-0.18, 1.24, 1.25]);
  // little bell
  b.sph(0xffd23f, 0.07, [-0.3, 1.04, 0.75], [1, 0.8, 1], null, 8, 6);
  g.add(meshOf(b.merged(), { receive: true }));
  return g;
}

// ----------------------------------------------------------------- tractor ---
function makeWheel(r, w, hub, lugs) {
  const pv = new THREE.Group();
  const p = new Parts();
  p.cyl(0x2d2d38, r, r, w, [0, 0, 0], [0, 0, Math.PI / 2], 14);
  p.cyl(hub, r * 0.55, r * 0.55, w + 0.05, [0, 0, 0], [0, 0, Math.PI / 2], 10);
  p.cyl(0xffffff, r * 0.18, r * 0.18, w + 0.09, [0, 0, 0], [0, 0, Math.PI / 2], 6);
  for (let i = 0; i < lugs; i++) {
    const a = (i / lugs) * Math.PI * 2;
    p.box(0x1c1c24, w + 0.02, r * 0.22, r * 0.28, [0, Math.sin(a) * r, Math.cos(a) * r], [-a + Math.PI / 2 * 0 + 0, 0, 0]);
  }
  const m = meshOf(p.merged());
  pv.add(m);
  return pv;
}

export function makeTractor(color = 0xe8452c) {
  const g = new THREE.Group();
  const dark = new THREE.Color(color).multiplyScalar(0.75).getHex();
  const b = new Parts();
  // chassis
  b.box(0x3a3f4d, 1.2, 0.22, 3.1, [0, 0.46, -0.15]);
  // engine hood
  b.box(color, 1.0, 0.72, 0.95, [0, 0.98, 0.9]);
  b.box(dark, 1.04, 0.1, 0.99, [0, 0.64, 0.9]);
  b.box(0xffffff, 0.6, 0.06, 0.7, [0, 1.37, 0.9]);
  // grille + headlights
  b.box(0x2d3140, 0.7, 0.45, 0.05, [0, 0.98, 1.39]);
  for (const sx of [-1, 1]) b.sph(0xfff2a0, 0.12, [sx * 0.36, 1.08, 1.4], [1, 1, 0.6], null, 8, 6);
  // exhaust
  b.cyl(0x3a3f4d, 0.07, 0.07, 0.8, [0.34, 1.78, 0.75], null, 8);
  b.cyl(0x22252e, 0.1, 0.07, 0.1, [0.34, 2.2, 0.75], null, 8);
  // fenders over big wheels
  for (const sx of [-1, 1]) b.box(dark, 0.5, 0.08, 1.4, [sx * 0.8, 1.46, 0.1]);
  // cabin: seat, posts and roof
  b.box(0x2e3550, 0.6, 0.12, 0.5, [0, 0.9, -0.2]);
  b.box(0x2e3550, 0.6, 0.55, 0.12, [0, 1.15, -0.42]);
  b.box(0x3a3f4d, 0.07, 0.07, 0.07, [0, 1.3, 0.35]);
  b.box(0x3a3f4d, 0.04, 0.55, 0.04, [0, 1.55, 0.3], [0.35, 0, 0]);
  for (const sx of [-1, 1]) for (const sz of [-0.55, 0.45]) b.box(0xffffff, 0.08, 1.1, 0.08, [sx * 0.52, 1.55, sz]);
  b.box(0xffffff, 1.3, 0.1, 1.3, [0, 2.12, -0.05]);
  b.box(color, 1.38, 0.06, 1.38, [0, 2.2, -0.05]);
  // bed (open cargo, low walls)
  b.box(0x9a6a3a, 1.6, 0.1, 1.2, [0, 0.52, -1.18]);
  b.box(0xb98048, 0.1, 0.34, 1.2, [-0.8, 0.74, -1.18]);
  b.box(0xb98048, 0.1, 0.34, 1.2, [0.8, 0.74, -1.18]);
  b.box(0xb98048, 1.7, 0.34, 0.1, [0, 0.74, -1.78]);
  b.box(0xb98048, 1.7, 0.34, 0.1, [0, 0.74, -0.6]);
  // blade arms
  for (const sx of [-1, 1]) b.box(0x3a3f4d, 0.12, 0.12, 0.8, [sx * 0.62, 0.46, 1.4]);
  g.add(meshOf(b.merged(), { receive: false }));

  // wheels
  const wheels = [];
  const wr = 0.68;
  for (const sx of [-1, 1]) {
    const w = makeWheel(wr, 0.38, 0xffd23f, 10);
    w.position.set(sx * 0.78, wr, 0.0);
    g.add(w); wheels.push(w);
    const f = makeWheel(0.38, 0.28, 0xffd23f, 8);
    f.position.set(sx * 0.68, 0.38, 1.05);
    g.add(f); wheels.push(f);
  }

  // cutter reel
  const blade = new THREE.Group();
  blade.position.set(0, 0.5, 1.8);
  const rp = new Parts();
  rp.cyl(0x9aa3b2, 0.07, 0.07, 3.4, [0, 0, 0], [0, 0, Math.PI / 2], 8);
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
    rp.box(i % 2 ? 0xff5a3c : 0xe8302a, 3.1, 0.05, 0.5, [0, Math.sin(a) * 0.25, Math.cos(a) * 0.25], [-a + Math.PI / 2, 0, 0].map((v, j) => (j === 0 ? -(a - Math.PI / 2) : v)));
  }
  for (const sx of [-1, 1]) rp.cyl(0xb02a24, 0.52, 0.52, 0.07, [sx * 1.65, 0, 0], [0, 0, Math.PI / 2], 12);
  blade.add(meshOf(rp.merged()));
  g.add(blade);

  const bedAnchor = new THREE.Object3D();
  bedAnchor.position.set(0, 0.57, -1.18);
  g.add(bedAnchor);
  g.userData.wheels = wheels;
  g.userData.blade = blade;
  g.userData.bedAnchor = bedAnchor;
  return g;
}

// -------------------------------------------------------------- greenhouse ---
export function makeGreenhouse() {
  const g = new THREE.Group();
  const W = 10, D = 8, WH = 3.2, RH = 5.4;
  const hx = W / 2, hz = D / 2;
  const WHITE = 0xffffff;
  const fr = new Parts();
  // base kerb + stone path floor
  fr.box(0xd9cdb5, W + 0.5, 0.3, D + 0.5, [0, 0.15, 0]);
  fr.box(0xf4ecdc, W + 0.2, 0.34, D + 0.2, [0, 0.17, 0]);
  fr.box(0x6a8a54, W - 0.2, 0.36, D - 0.2, [0, 0.18, 0]);
  const post = 0.16;
  // wall frames: posts every 2.5 in x, every 2 in z
  const xs = [-hx, -hx / 2, 0, hx / 2, hx];
  const zs = [-hz, -hz / 2, 0, hz / 2, hz];
  for (const x of xs) for (const z of [-hz, hz]) fr.box(WHITE, post, WH, post, [x, 0.3 + WH / 2, z]);
  for (const z of zs) for (const x of [-hx, hx]) if (z !== -hz && z !== hz) fr.box(WHITE, post, WH, post, [x, 0.3 + WH / 2, z]);
  // horizontal bars
  for (const y of [0.9, WH + 0.3]) {
    fr.box(WHITE, W + post, 0.12, 0.12, [0, y, -hz]);
    fr.box(WHITE, W + post, 0.12, 0.12, [0, y, hz]);
    fr.box(WHITE, 0.12, 0.12, D + post, [-hx, y, 0]);
    fr.box(WHITE, 0.12, 0.12, D + post, [hx, y, 0]);
  }
  // roof trusses (gable along X: ridge parallel to X)
  const rise = RH - (WH + 0.3);
  const slope = Math.atan2(rise, hz);
  const rl = Math.hypot(rise, hz);
  for (const x of xs) {
    for (const sz of [-1, 1]) {
      fr.box(WHITE, 0.12, 0.12, rl, [x, WH + 0.3 + rise / 2, sz * hz / 2], [sz * slope, 0, 0].map((v, i) => (i === 0 ? -sz * slope : v)));
    }
  }
  fr.box(WHITE, W + 0.3, 0.16, 0.16, [0, RH, 0]); // ridge
  for (const sz of [-1, 1]) for (let i = 1; i < 4; i++) {
    const t = i / 4;
    fr.box(WHITE, W, 0.08, 0.08, [0, WH + 0.3 + rise * t, sz * hz * (1 - t)]);
  }
  // gable end braces
  for (const sx of [-1, 1]) {
    fr.box(WHITE, 0.1, rise, 0.1, [sx * hx, WH + 0.3 + rise / 2, 0]);
  }
  // door on the -Z face
  fr.box(0xffd9a0, 1.8, 2.5, 0.08, [0, 1.55, -hz - 0.02]);
  fr.box(0xffffff, 0.12, 2.6, 0.14, [-0.95, 1.55, -hz - 0.03]);
  fr.box(0xffffff, 0.12, 2.6, 0.14, [0.95, 1.55, -hz - 0.03]);
  fr.box(0xffffff, 2.0, 0.12, 0.14, [0, 2.88, -hz - 0.03]);
  fr.box(0xffffff, 0.06, 2.4, 0.1, [0, 1.55, -hz - 0.06]);
  fr.sph(0xffc233, 0.07, [0.15, 1.5, -hz - 0.12], null, null, 6, 4);
  fr.sph(0xffc233, 0.07, [-0.15, 1.5, -hz - 0.12], null, null, 6, 4);
  // finials + flag
  for (const sx of [-1, 1]) {
    fr.cyl(0xffc233, 0.05, 0.05, 0.4, [sx * (hx + 0.1), RH + 0.1, 0], null, 6);
    fr.sph(0xffc233, 0.16, [sx * (hx + 0.1), RH + 0.38, 0], null, null, 8, 6);
  }
  fr.cyl(0xe8e8f0, 0.04, 0.04, 1.6, [0, RH + 0.8, 0], null, 6);
  fr.sph(0xffc233, 0.1, [0, RH + 1.62, 0], null, null, 8, 6);
  fr.box(0xff4d7d, 0.03, 0.42, 0.9, [0, RH + 1.3, 0.5]);
  fr.box(0xffd23f, 0.032, 0.14, 0.9, [0, RH + 1.3, 0.5]);
  g.add(meshOf(fr.merged(), { receive: true }));

  // glass
  const gp = new Parts();
  const GL = 0xbfeeff;
  gp.box(GL, W, WH - 0.2, 0.05, [0, 0.3 + WH / 2 + 0.05, -hz]);
  gp.box(GL, W, WH - 0.2, 0.05, [0, 0.3 + WH / 2 + 0.05, hz]);
  gp.box(GL, 0.05, WH - 0.2, D, [-hx, 0.3 + WH / 2 + 0.05, 0]);
  gp.box(GL, 0.05, WH - 0.2, D, [hx, 0.3 + WH / 2 + 0.05, 0]);
  for (const sz of [-1, 1]) gp.box(GL, W, 0.05, rl, [0, WH + 0.3 + rise / 2 + 0.03, sz * hz / 2], [-sz * slope, 0, 0]);
  // gable triangles
  const tri = geo('gable', () => {
    const s = new THREE.Shape();
    s.moveTo(-hz, 0); s.lineTo(hz, 0); s.lineTo(0, rise); s.lineTo(-hz, 0);
    return new THREE.ExtrudeGeometry(s, { depth: 0.05, bevelEnabled: false });
  });
  for (const sx of [-1, 1]) gp.add(tri, GL, [sx * hx, WH + 0.3, 0], [0, Math.PI / 2, 0]);
  const glassMat = new THREE.MeshLambertMaterial({ vertexColors: true, transparent: true, opacity: 0.26, depthWrite: false });
  const glass = new THREE.Mesh(gp.merged(), glassMat);
  glass.renderOrder = 5;
  glass.castShadow = false;
  g.add(glass);

  // planters + flowers inside
  const ip = new Parts();
  const tiers = 4;
  for (let r = 0; r < tiers; r++) {
    const z = -2.4 + r * 1.6;
    const y = 0.36 + r * 0.28;
    ip.box(0xb97a3c, 8.6, y - 0.18, 1.2, [0, (y + 0.18) / 2, z]);
    ip.box(0x5a3a22, 8.4, 0.08, 1.0, [0, y + 0.02, z]);
    ip.box(0xffffff, 8.7, 0.07, 1.28, [0, y - 0.15, z]);
    const type = [3, 2, 1, 0][r];
    const fp = flowerParts(type, 0.95);
    for (let i = 0; i < 12; i++) {
      const x = -4 + i * (8 / 11);
      for (const dz of [-0.28, 0.28]) {
        const ang = ((i * 7 + r * 3) % 11) * 0.6;
        const sc = 0.82 + ((i * 5 + r) % 4) * 0.05;
        const mm = new THREE.Matrix4().compose(
          new THREE.Vector3(x + (dz > 0 ? 0.3 : 0), y + 0.04, z + dz),
          new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), ang),
          new THREE.Vector3(sc, sc, sc),
        );
        for (const part of fp) ip.parts.push({ geometry: part.geometry, color: part.color, matrix: mm.clone().multiply(part.matrix) });
      }
    }
  }
  const ipm = meshOf(ip.merged(), { receive: true });
  g.add(ipm);
  return g;
}
