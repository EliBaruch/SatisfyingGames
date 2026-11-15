// Flower world models: growing flowers, bouquets (the carried item), the shop counter
// and the Grand Greenhouse. Pure builders, no game state. (Moved from the original
// models.js; characters and the tractor now come from src/engine/chars.js.)
import * as THREE from 'three';
import { Parts, mergeParts, geo, meshOf } from '../../engine/geom.js';

// Flower kinds. `id` is the item kind id; index order is used by the greenhouse tiers.
export const FLOWERS = [
  { id: 'rose',      name: 'Roses',      price: 4,  petal: 0xff4d7d, petalDark: 0xd92a5c, center: 0xffd166, wrap: 0xffe3ec, ribbon: 0xffffff },
  { id: 'tulip',     name: 'Tulips',     price: 10, petal: 0x9b5cff, petalDark: 0x6f35d9, center: 0xffe066, wrap: 0xeee3ff, ribbon: 0xffffff },
  { id: 'sunflower', name: 'Sunflowers', price: 25, petal: 0xffcc1a, petalDark: 0xf29a00, center: 0x6b3e12, wrap: 0xfff4cf, ribbon: 0xff7a59 },
  // decorative only (greenhouse planters); not a sellable item any more
  { id: 'orchid',    name: 'Orchids',    price: 60, petal: 0x2ec4ff, petalDark: 0x1486d6, center: 0xfff3b0, wrap: 0xdff6ff, ribbon: 0xff4d7d },
];
/** Flower index from an item id ('rose') or an index. */
export function flowerIndex(k) {
  if (typeof k === 'number') return k;
  const i = FLOWERS.findIndex((f) => f.id === k);
  return i < 0 ? 0 : i;
}

// Shared dimensions so that models, stacks and shops agree.
export const SIZES = {
  flowerHeight: 0.95,                              // growing flower, origin at ground
  bouquet: { len: 0.95, h: 0.26, d: 0.42 },        // lies on its side along X, origin bottom-centre
  bouquetStep: 0.235,                              // vertical distance between stacked bouquets
  counter: { len: 3.4, depth: 1.2, h: 1.0 },       // long axis = Z, customer side = local +X
};

const STEM = 0x35b04a;
const STEM_DARK = 0x278a3b;
const LEAF = 0x4cd05e;

// ----------------------------------------------------------------- flowers ---
function flowerParts(kind, h = SIZES.flowerHeight) {
  const type = flowerIndex(kind);
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

export function makeFlowerGeometry(kind) {
  return mergeParts(flowerParts(kind));
}

export function makeStubGeometry() {
  const b = new Parts();
  b.cyl(STEM_DARK, 0.04, 0.055, 0.14, [0, 0.07, 0], null, 5);
  return b.merged();
}

export function makeBouquetGeometry(kind) {
  const F = FLOWERS[flowerIndex(kind)] || FLOWERS[0];
  const b = new Parts();
  const { len, h, d } = SIZES.bouquet;
  const x0 = -len / 2;
  const cy = h / 2;
  const fy = (h / 2 - 0.004);          // half height available
  // Fat paper wrap: truncated cone, narrow end at -X, wide mouth toward +X.
  const R0 = 0.105, R1 = d / 2 - 0.005, cl = 0.58;
  // (cylinder axis Y maps to world +X; local X maps to world Y, so flatten local X)
  const flat = [fy / R1, 1, 1];
  b.cyl(F.wrap, R1, R0, cl, [x0 + cl / 2, cy, 0], [0, 0, -Math.PI / 2], 8, flat);
  // flared paper lip at the mouth
  b.cyl(F.wrap, R1 + 0.004, R1, 0.05, [x0 + cl + 0.02, cy, 0], [0, 0, -Math.PI / 2], 8, flat);
  // ribbon band
  const rt = 0.3;
  const rr = R0 + (R1 - R0) * rt + 0.012;
  b.cyl(F.ribbon, rr + 0.012, rr, 0.09, [x0 + cl * rt, cy, 0], [0, 0, -Math.PI / 2], 8, flat);
  // big blooms bursting out of the mouth
  const bx = x0 + cl + 0.02;
  const br = 0.155, sy = fy / br;
  b.ico(F.petal, br, [bx + 0.09, cy, -0.115], [1, sy, 1]);
  b.ico(F.petalDark, br, [bx + 0.09, cy, 0.115], [1, sy, 1]);
  b.ico(F.petal, br, [bx + 0.21, cy, 0.0], [1, sy, 1]);
  b.ico(F.center, 0.06, [bx + 0.335, cy, 0.0]);
  b.oct(LEAF, 0.11, [bx + 0.0, cy + 0.05, 0.17], [1, 0.3, 0.8]);
  b.oct(LEAF, 0.11, [bx + 0.0, cy + 0.05, -0.17], [1, 0.3, 0.8]);
  return b.merged();
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
    for (const sx of [-1, 1]) {
      b.box(0xe3a766, 0.03, 0.5, 0.9, [sx * (D / 2 + 0.005), 0.5, z]);
      b.box(accent, 0.03, 0.4, 0.8, [sx * (D / 2 + 0.02), 0.5, z]);
      b.box(0xfff0d0, 0.03, 0.3, 0.7, [sx * (D / 2 + 0.03), 0.5, z]);
    }
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
      fr.box(WHITE, 0.12, 0.12, rl, [x, WH + 0.3 + rise / 2, sz * hz / 2], [sz * slope, 0, 0]);
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
  for (const sz of [-1, 1]) gp.box(GL, W, 0.05, rl, [0, WH + 0.3 + rise / 2 + 0.03, sz * hz / 2], [sz * slope, 0, 0]);
  // gable triangles
  const tri = geo('gable', () => {
    const s = new THREE.Shape();
    s.moveTo(-hz, 0); s.lineTo(hz, 0); s.lineTo(0, rise); s.lineTo(-hz, 0);
    return new THREE.ExtrudeGeometry(s, { depth: 0.05, bevelEnabled: false });
  });
  for (const sx of [-1, 1]) gp.add(tri, GL, [sx * hx, WH + 0.3, 0], [0, Math.PI / 2, 0]);
  const glassMat = new THREE.MeshLambertMaterial({ vertexColors: true, transparent: true, opacity: 0.3, depthWrite: false });
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
    const fp = flowerParts(type, 1.05);
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
