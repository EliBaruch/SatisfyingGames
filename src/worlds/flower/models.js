// Flower world models, all code-built with the art kit's Parts (smooth rounded toy shapes,
// vertex colours, baked AO) and drawn with the shared lit material: growing flowers (roses,
// tulips, sunflowers), the carried bouquets, the counter, the tractor with cutter bar and
// wagon, the Grand Greenhouse, the cottages and the travel gate. Pure builders, no game state.
import * as THREE from 'three';
import { Parts, mergeParts, meshOf } from '../../engine/art/parts.js';
import { litMaterial } from '../../engine/art/material.js';
import { getModel } from '../../engine/art/assets.js';
import { makeCounter as artCounter } from '../../engine/art/props.js';

// Flower kinds. `id` is the item kind id; index order is used by the greenhouse tiers.
export const FLOWERS = [
  { id: 'rose',      name: 'Roses',      price: 4,  petal: 0xf5386f, petalDark: 0xb5174d, petalLight: 0xff86ad, center: 0xffd166, wrap: 0xff9fc2, ribbon: 0xffffff },
  { id: 'tulip',     name: 'Tulips',     price: 10, petal: 0x9a55ff, petalDark: 0x6a2fd6, petalLight: 0xc89cff, center: 0xffe066, wrap: 0xb89cff, ribbon: 0xffffff },
  { id: 'sunflower', name: 'Sunflowers', price: 25, petal: 0xffc414, petalDark: 0xf08c00, petalLight: 0xffe15a, center: 0x6b3e12, wrap: 0xffd24d, ribbon: 0xff6f4f },
  // decorative only (greenhouse planters); not a sellable item
  { id: 'orchid',    name: 'Orchids',    price: 60, petal: 0x2ec4ff, petalDark: 0x1486d6, petalLight: 0x8fe3ff, center: 0xfff3b0, wrap: 0xdff6ff, ribbon: 0xff4d7d },
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

const STEM = 0x3fbf55;
const STEM_DARK = 0x2a9a44;
const LEAF = 0x57d46a;
const LEAF_DARK = 0x3cb857;

// ------------------------------------------------------------------ helpers ---
const _gc = new Map();
const cached = (key, make) => { let g = _gc.get(key); if (!g) { g = make(); _gc.set(key, g); } return g; };

/**
 * A puffy scalloped disc (sunflower / daisy petals): a fan of triangles from a raised centre to a
 * wavy rim, smooth normals. About n * steps triangles. Lies in XZ, faces +Y.
 */
function petalDisc(R, n = 10, steps = 3, rise = 0.05, inner = 0.74) {
  return cached(`pd${R},${n},${steps},${rise},${inner}`, () => {
    const m = n * steps;
    const pos = new Float32Array((m + 1) * 3);
    pos[1] = rise;
    for (let i = 0; i < m; i++) {
      const a = (i / m) * Math.PI * 2;
      const s = Math.abs(Math.sin((a * n) / 2));
      const r = R * (inner + (1 - inner) * Math.pow(s, 0.45));
      pos[(i + 1) * 3] = Math.cos(a) * r;
      pos[(i + 1) * 3 + 1] = 0;
      pos[(i + 1) * 3 + 2] = Math.sin(a) * r;
    }
    const idx = [];
    for (let i = 0; i < m; i++) idx.push(0, 1 + ((i + 1) % m), 1 + i);   // counter-clockwise seen from +Y
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    // outward-and-up normals only (a flat fan has a degenerate rim): blend toward +Y for a soft look
    const nrm = g.attributes.normal;
    for (let i = 0; i < nrm.count; i++) {
      if (nrm.getY(i) < 0) nrm.setXYZ(i, -nrm.getX(i), -nrm.getY(i), -nrm.getZ(i));
    }
    return g;
  });
}

/** Tilt (Euler [x, y, z]) that turns +Y toward the direction (dx, dy, dz). */
function tiltTo(dx, dy, dz) {
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(dx, dy, dz).normalize());
  const e = new THREE.Euler().setFromQuaternion(q);
  return [e.x, e.y, e.z];
}
function rotate(v, rot) { return new THREE.Vector3(...v).applyEuler(new THREE.Euler(rot[0], rot[1], rot[2])); }

// ----------------------------------------------------------------- flowers ---
/** Parts of one growing flower (instanced hundreds of times: about 150 triangles). Origin at the ground. */
export function flowerParts(kind, h = SIZES.flowerHeight) {
  const type = flowerIndex(kind);
  const F = FLOWERS[type] || FLOWERS[0];
  const b = new Parts();
  const s = h / 0.95;
  const stemH = (type === 2 ? 0.74 : type === 1 ? 0.62 : 0.66) * s;
  b.cyl(STEM, 0.04, 0.05, stemH, [0, stemH / 2, 0], null, 5, null, true);
  if (type === 0) { // rose: plump layered bloom, sepals, two soft leaves
    b.sph(LEAF, 0.15, [0.13 * s, 0.22 * s, 0.02], [1, 0.2, 0.55], [0, 0.2, 0.5], 4, 3);
    b.sph(LEAF_DARK, 0.14, [-0.12 * s, 0.34 * s, -0.02], [1, 0.2, 0.55], [0, 3.3, -0.45], 4, 3);
    b.cone(STEM_DARK, 0.13, 0.14, [0, 0.61 * s, 0], [Math.PI, 0, 0], 5);
    b.sph(F.petal, 0.26, [0, 0.72 * s, 0], [1, 0.8, 1], null, 8, 5);
    b.sph(F.petalDark, 0.17, [0.02, 0.86 * s, 0], [1, 0.62, 1], null, 6, 3);
  } else if (type === 1) { // tulip: egg-shaped cup, lighter tips, two long leaves
    b.sph(LEAF, 0.09, [0.09 * s, 0.26 * s, 0.0], [0.35, 1.9, 0.9], [0, 0, -0.35], 4, 3);
    b.sph(LEAF_DARK, 0.09, [-0.09 * s, 0.24 * s, 0.01], [0.35, 1.8, 0.9], [0, 0, 0.4], 4, 3);
    const y0 = stemH - 0.04;
    b.lathe(F.petal, [[0, 0], [0.15, 0.1], [0.16, 0.22], [0.11, 0.33], [0, 0.37]], [0, y0, 0], null, 7);
    b.lathe(F.petalLight, [[0.11, 0.34], [0.14, 0.27], [0, 0.36]], [0, y0 + 0.005, 0], null, 7, [1.03, 1.0, 1.03]);
  } else if (type === 2) { // sunflower: face tilted toward the camera, scalloped petals, brown seed head
    b.sph(LEAF, 0.18, [0.15 * s, 0.26 * s, 0.02], [1, 0.18, 0.6], [0, 0.2, 0.5], 4, 3);
    b.sph(LEAF_DARK, 0.16, [-0.14 * s, 0.4 * s, -0.02], [1, 0.18, 0.6], [0, 3.3, -0.45], 4, 3);
    const n = [-0.42, 1, -0.42];
    const rot = tiltTo(...n);
    const c = [0, stemH + 0.03, 0];
    const at = (y) => { const v = rotate([0, y, 0], rot); return [c[0] + v.x, c[1] + v.y, c[2] + v.z]; };
    b.add(petalDisc(0.34, 9, 2, 0.04), F.petalDark, at(-0.03), rot);
    b.add(petalDisc(0.3, 9, 2, 0.05), F.petal, at(0.0), [rot[0], rot[1] + 0.35, rot[2]]);
    b.sph(F.center, 0.17, at(0.03), [1, 0.5, 1], rot, 7, 3);
  } else { // orchid: arching spike of small blooms (decorative only)
    for (let i = 0; i < 4; i++) {
      const y = stemH * (0.55 + i * 0.13);
      b.sph(i % 2 ? F.petal : F.petalLight, 0.11 - i * 0.012, [0.05 * (i % 2 ? 1 : -1), y, 0.04], [1, 0.8, 1], null, 6, 4);
    }
    b.sph(LEAF, 0.15, [0.1, 0.18, 0.02], [1, 0.2, 0.5], [0, 0.2, 0.5], 5, 3);
  }
  return b.parts;
}

export function makeFlowerGeometry(kind) { return mergeParts(flowerParts(kind)); }

export function makeStubGeometry() {
  const b = new Parts();
  b.cyl(STEM_DARK, 0.04, 0.055, 0.14, [0, 0.07, 0], null, 5);
  b.cyl(0x8fd06a, 0.04, 0.04, 0.012, [0, 0.146, 0], null, 5);
  return b.merged();
}

// ---------------------------------------------------------------- bouquets ---
/**
 * The carried item: a fat paper-wrapped bouquet lying on its side along X (mouth toward +X), origin
 * bottom-centre, 0.95 x 0.26 x 0.42. Soft paper cone in a pale tint of the flower colour, a ribbon band
 * and a plump cluster of blooms bursting from the mouth. About 300 triangles.
 */
export function makeBouquetGeometry(kind) {
  const F = FLOWERS[flowerIndex(kind)] || FLOWERS[0];
  const type = flowerIndex(kind);
  const b = new Parts();
  const { len, h, d } = SIZES.bouquet;
  const x0 = -len / 2;
  const cy = h / 2;
  const cl = 0.42, R1 = d / 2 - 0.005, R0 = 0.09;
  const flat = [(h / 2 + 0.01) / R1, 1, 1];        // cone axis Y -> world X; local X -> world Y
  const rotX = [0, 0, -Math.PI / 2];
  // paper cone, flared lip, ribbon band
  b.cyl(F.wrap, R1, R0, cl, [x0 + cl / 2, cy, 0], rotX, 8, flat);
  b.cyl(0xffffff, R1 + 0.012, R1 - 0.01, 0.06, [x0 + cl + 0.015, cy, 0], rotX, 8, flat, true);
  const rt = 0.3, rr = R0 + (R1 - R0) * rt + 0.012;
  b.cyl(F.ribbon, rr + 0.014, rr, 0.1, [x0 + cl * rt, cy, 0], rotX, 8, flat, true);
  const bx = x0 + cl + 0.01;
  b.sph(LEAF, 0.13, [bx + 0.05, cy + 0.04, 0.19], [1.3, 0.35, 0.8], [0, 0.4, 0], 4, 3);
  b.sph(LEAF_DARK, 0.13, [bx + 0.05, cy + 0.04, -0.19], [1.3, 0.35, 0.8], [0, -0.4, 0], 4, 3);
  if (type === 0) {
    const r = 0.22;
    b.sph(F.petal, r, [bx + 0.15, cy, -0.13], null, null, 7, 4);
    b.sph(F.petalDark, r, [bx + 0.15, cy + 0.02, 0.14], null, null, 7, 4);
    b.sph(F.petal, r + 0.01, [bx + 0.35, cy + 0.01, 0.0], null, null, 7, 4);
    b.sph(F.petalLight, 0.13, [bx + 0.5, cy + 0.04, 0.1], null, null, 5, 3);
  } else if (type === 1) {
    const cup = [[0, 0], [0.14, 0.1], [0.15, 0.2], [0.1, 0.32], [0, 0.35]];
    const spots = [[0.13, 0.0, -0.12, F.petal], [0.15, 0.0, 0.13, F.petalDark], [0.32, 0.01, 0.0, F.petal], [0.44, 0.03, 0.1, F.petalLight]];
    for (const [x, y, z, c] of spots) b.lathe(c, cup, [bx + x - 0.03, cy + y, z], [0, 0, -Math.PI / 2 + (z > 0 ? 0.1 : -0.1)], 6, [0.78, 0.9, 0.9]);
  } else {
    // sunflower faces turned toward the camera side (+Z) and the mouth (+X)
    const rot = tiltTo(0.45, 0.35, 0.85);
    const mk = (x, y, z, k, c1) => {
      b.add(petalDisc(0.2 * k, 9, 2, 0.03), c1, [bx + x, cy + y, z], rot);
      b.sph(F.center, 0.105 * k, [bx + x, cy + y, z], [1, 0.55, 1], rot, 6, 3);
    };
    mk(0.14, 0.0, -0.11, 1.1, F.petalDark);
    mk(0.17, 0.03, 0.13, 1.1, F.petal);
    mk(0.36, 0.04, 0.0, 1.15, F.petalLight);
  }
  return b.merged({ ao: { ground: 0.12, groundH: 0.12, down: 0.05, noBoxes: true } });
}

// ----------------------------------------------------------------- counter ---
/** The shop counter: the art kit's rounded counter with the plot's colour as accent, a bell and a flower pot. */
export function makeCounter(accent = 0xff6fa5) {
  const g = artCounter({ len: SIZES.counter.len, depth: SIZES.counter.depth, h: SIZES.counter.h, accent });
  return g;
}

// ---------------------------------------------------------------- cottages ---
/** A toy cottage: rounded plinth and walls, a thatched cone roof, chimney, door, windows with flower boxes. */
export function makeCottage(wall = 0xfff0c2, roof = 0xe8553d) {
  const b = new Parts();
  const W = 4.2, H = 2.5, D = 3.6;
  b.rbox(0xe9dcc3, W + 0.3, 0.34, D + 0.3, 0.08, [0, 0.17, 0]);
  b.rbox(wall, W, H, D, 0.2, [0, 0.3 + H / 2, 0]);
  // roof: stretched rounded cone
  b.lathe(roof, [[0, 2.35], [0.9, 2.05], [1.85, 1.45], [2.45, 0.75], [2.6, 0.55], [2.45, 0.5], [0, 0.5]], [0, 0.3 + H - 0.5, 0], null, 12, [W / 5.1 * 1.1, 1, D / 5.1 * 1.1]);
  b.sph(0xffd23f, 0.16, [0, 0.3 + H + 1.88, 0], null, null, 8, 6);
  b.rbox(0xf0e6d2, 0.6, 1.4, 0.6, 0.12, [1.1, 0.3 + H + 1.0, -0.5]);
  b.rbox(0xd9ccb0, 0.78, 0.16, 0.78, 0.06, [1.1, 0.3 + H + 1.72, -0.5]);
  // door
  b.rbox(0xffffff, 1.15, 1.75, 0.2, 0.08, [0, 1.2, D / 2 + 0.02]);
  b.rbox(0x9a6a3a, 0.9, 1.6, 0.22, 0.07, [0, 1.17, D / 2 + 0.04]);
  b.sph(0xffd23f, 0.075, [0.26, 1.15, D / 2 + 0.17], null, null, 6, 4);
  for (const sx of [-1.4, 1.4]) {
    b.rbox(0xffffff, 0.95, 0.95, 0.16, 0.07, [sx, 1.75, D / 2 + 0.02]);
    b.rbox(0xa8e4ff, 0.72, 0.72, 0.18, 0.05, [sx, 1.75, D / 2 + 0.04]);
    b.rbox(0xffffff, 0.07, 0.74, 0.2, 0.02, [sx, 1.75, D / 2 + 0.05], null, null, 1);
    b.rbox(0xffffff, 0.74, 0.07, 0.2, 0.02, [sx, 1.75, D / 2 + 0.05], null, null, 1);
    b.rbox(0xb9824a, 1.05, 0.26, 0.34, 0.07, [sx, 1.12, D / 2 + 0.22]);
    for (let k = 0; k < 4; k++) b.sph([0xff5d8f, 0xffd23f, 0xffffff, 0xff9ec7][k], 0.12, [sx - 0.36 + k * 0.24, 1.36, D / 2 + 0.24], null, null, 7, 5);
  }
  return b.merged({ ao: { ground: 0.2, groundH: 0.5, down: 0.12, boxK: 0.18 } });
}

// ----------------------------------------------------------------- tractor ---
/**
 * The harvester: the pack tractor with a spinning cutter reel and bar in front and a wagon behind that
 * carries the stack. Faces +Z. userData: wheels (wagon wheels, spun about X), blade (the reel),
 * bedAnchor (stack parent: front-centre of the wagon floor), bob (visual bounce).
 */
export function makeTractor() {
  const g = new THREE.Group();
  const body = getModel('car-kit/tractor', { receive: true });
  body.position.set(0, 0, 0.0);
  g.add(body);
  // cutter bar and spinning reel
  const bar = new Parts();
  bar.rbox(0xc9d2de, 3.5, 0.16, 0.5, 0.06, [0, 0.28, 2.55]);
  bar.rbox(0x4a5060, 3.6, 0.22, 0.12, 0.05, [0, 0.46, 2.78]);
  for (const sx of [-1, 1]) {
    bar.rbox(0x3a3f4d, 0.14, 0.14, 1.2, 0.04, [sx * 0.62, 0.45, 1.85]);
    bar.rbox(0xe53935, 0.12, 0.7, 0.4, 0.05, [sx * 1.75, 0.55, 2.4]);
  }
  g.add(meshOf(bar.merged({ ao: true })));
  const blade = new THREE.Group();
  blade.position.set(0, 0.85, 2.45);
  const rp = new Parts();
  rp.cyl(0x9aa3b2, 0.09, 0.09, 3.4, [0, 0, 0], [0, 0, Math.PI / 2], 8);
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    rp.rbox(i % 2 ? 0xffb21a : 0xff4d4d, 3.1, 0.1, 0.38, 0.04, [0, Math.sin(a) * 0.42, Math.cos(a) * 0.42], [-a + Math.PI / 2, 0, 0], null, 1);
  }
  blade.add(meshOf(rp.merged()));
  g.add(blade);
  // wagon behind: rounded timber bed with low walls, hitch, two spinning wheels
  const wag = new Parts();
  const zc = -3.1, bw = 1.7, bl = 3.0, fy = 0.62;
  wag.rbox(0xa86b36, bw, 0.16, bl, 0.06, [0, fy - 0.08, zc]);
  wag.rbox(0xc98a4b, 0.12, 0.5, bl, 0.05, [-bw / 2 + 0.06, fy + 0.2, zc]);
  wag.rbox(0xc98a4b, 0.12, 0.5, bl, 0.05, [bw / 2 - 0.06, fy + 0.2, zc]);
  wag.rbox(0xc98a4b, bw, 0.5, 0.12, 0.05, [0, fy + 0.2, zc - bl / 2 + 0.06]);
  wag.rbox(0xc98a4b, bw, 0.5, 0.12, 0.05, [0, fy + 0.2, zc + bl / 2 - 0.06]);
  wag.rbox(0x3a3f4d, 0.18, 0.14, 1.6, 0.04, [0, 0.5, -1.55]);       // draw bar to the tractor
  g.add(meshOf(wag.merged({ ao: true })));
  const wheels = [];
  for (const sx of [-1, 1]) {
    const w = getModel('car-kit/wheel-tractor-back', { height: 0.95 });
    const pv = new THREE.Group();
    pv.position.set(sx * (bw / 2 + 0.2), 0.475, zc - 0.2);
    pv.add(w);
    w.position.y = -0.475;
    g.add(pv);
    wheels.push(pv);
  }
  const bed = new THREE.Object3D();
  bed.position.set(0, fy, zc + bl / 2 - 0.35);
  g.add(bed);
  g.userData.wheels = wheels;
  g.userData.blade = blade;
  g.userData.bedAnchor = bed;
  g.userData.bob = 0.04;
  g.userData.blobLength = 3.0;      // blob shadow ellipse (half length) and offset along the vehicle
  g.userData.blobOffset = -0.7;
  return g;
}

// -------------------------------------------------------------- greenhouse ---
const glassMat = (() => { let m = null; return () => (m || (m = litMaterial({ color: 0xcdf1ff, transparent: true, opacity: 0.3, depthWrite: false }))); })();

/**
 * The Grand Greenhouse: white rounded frame, glass walls and a gabled roof with a taller central hall,
 * arched door, brass finials, and tiers of flowers inside. 10 x 8 footprint, faces -Z (the camera side).
 */
export function makeGreenhouse() {
  const g = new THREE.Group();
  const W = 10, D = 8, WH = 3.1, RH = 5.2;
  const hx = W / 2, hz = D / 2;
  const WHITE = 0xffffff, post = 0.2;
  const fr = new Parts();
  // plinth and floor
  fr.rbox(0xd9cdb5, W + 0.7, 0.3, D + 0.7, 0.1, [0, 0.15, 0]);
  fr.rbox(0xf4ecdc, W + 0.3, 0.2, D + 0.3, 0.08, [0, 0.34, 0]);
  fr.rbox(0x7fb468, W - 0.3, 0.1, D - 0.3, 0.04, [0, 0.42, 0]);
  const y0 = 0.4;
  const xs = [-hx, -hx / 2, 0, hx / 2, hx];
  const zs = [-hz, -hz / 2, 0, hz / 2, hz];
  for (const x of xs) for (const z of [-hz, hz]) fr.rbox(WHITE, post, WH, post, 0.07, [x, y0 + WH / 2, z], null, null, 1);
  for (const z of zs) for (const x of [-hx, hx]) if (z !== -hz && z !== hz) fr.rbox(WHITE, post, WH, post, 0.07, [x, y0 + WH / 2, z], null, null, 1);
  for (const y of [y0 + 0.75, y0 + WH]) {
    fr.rbox(WHITE, W + post, 0.16, 0.16, 0.06, [0, y, -hz], null, null, 1);
    fr.rbox(WHITE, W + post, 0.16, 0.16, 0.06, [0, y, hz], null, null, 1);
    fr.rbox(WHITE, 0.16, 0.16, D + post, 0.06, [-hx, y, 0], null, null, 1);
    fr.rbox(WHITE, 0.16, 0.16, D + post, 0.06, [hx, y, 0], null, null, 1);
  }
  // roof trusses (ridge parallel to X)
  const rise = RH - (y0 + WH);
  const slope = Math.atan2(rise, hz);
  const rl = Math.hypot(rise, hz);
  for (const x of xs) for (const sz of [-1, 1]) fr.rbox(WHITE, 0.16, 0.16, rl, 0.06, [x, y0 + WH + rise / 2, sz * hz / 2], [sz * slope, 0, 0], null, 1);
  fr.rbox(WHITE, W + 0.5, 0.24, 0.24, 0.1, [0, RH, 0], null, null, 1);
  for (const sz of [-1, 1]) for (let i = 1; i < 4; i++) {
    const t = i / 4;
    fr.rbox(WHITE, W, 0.1, 0.1, 0.04, [0, y0 + WH + rise * t, sz * hz * (1 - t)], null, null, 1);
  }
  for (const sx of [-1, 1]) fr.rbox(WHITE, 0.14, rise, 0.14, 0.05, [sx * hx, y0 + WH + rise / 2, 0], null, null, 1);
  // arched door on the -Z face
  fr.rbox(0xffd9a0, 2.0, 2.5, 0.1, 0.06, [0, y0 + 1.25, -hz - 0.04]);
  for (const sx of [-1, 1]) fr.rbox(WHITE, 0.16, 2.7, 0.2, 0.06, [sx * 1.05, y0 + 1.35, -hz - 0.06], null, null, 1);
  fr.rbox(WHITE, 2.4, 0.18, 0.2, 0.06, [0, y0 + 2.7, -hz - 0.06], null, null, 1);
  fr.rbox(WHITE, 0.08, 2.5, 0.14, 0.03, [0, y0 + 1.25, -hz - 0.1], null, null, 1);
  fr.sph(0xffc233, 0.08, [0.16, y0 + 1.2, -hz - 0.2], null, null, 8, 6);
  fr.sph(0xffc233, 0.08, [-0.16, y0 + 1.2, -hz - 0.2], null, null, 8, 6);
  // little gable over the door
  fr.rbox(0xff6fa5, 2.9, 0.2, 0.7, 0.08, [0, y0 + 2.95, -hz - 0.35], [-0.35, 0, 0]);
  // finials and flag
  for (const sx of [-1, 1]) {
    fr.cyl(0xffc233, 0.06, 0.06, 0.45, [sx * (hx + 0.1), RH + 0.1, 0], null, 10);
    fr.sph(0xffc233, 0.2, [sx * (hx + 0.1), RH + 0.45, 0], null, null, 14, 10);
  }
  fr.cyl(0xe8e8f0, 0.045, 0.045, 1.7, [0, RH + 0.85, 0], null, 8);
  fr.sph(0xffc233, 0.11, [0, RH + 1.72, 0], null, null, 8, 6);
  fr.rbox(0xff4d7d, 0.04, 0.46, 0.95, 0.02, [0, RH + 1.4, 0.5], null, null, 1);
  fr.rbox(0xffd23f, 0.045, 0.15, 0.95, 0.02, [0, RH + 1.4, 0.5], null, null, 1);
  g.add(meshOf(fr.merged({ ao: { ground: 0.2, groundH: 0.6, down: 0.05, noBoxes: true } }), { receive: true }));

  // glass: translucent, no shadow
  const gp = new Parts();
  const gh = WH - 0.2, gy = y0 + WH / 2 + 0.02;
  gp.box(0xffffff, W, gh, 0.05, [0, gy, -hz]);
  gp.box(0xffffff, W, gh, 0.05, [0, gy, hz]);
  gp.box(0xffffff, 0.05, gh, D, [-hx, gy, 0]);
  gp.box(0xffffff, 0.05, gh, D, [hx, gy, 0]);
  for (const sz of [-1, 1]) gp.box(0xffffff, W, 0.05, rl, [0, y0 + WH + rise / 2 + 0.04, sz * hz / 2], [sz * slope, 0, 0]);
  const tri = cached('gable', () => {
    const s = new THREE.Shape();
    s.moveTo(-hz, 0); s.lineTo(hz, 0); s.lineTo(0, rise); s.lineTo(-hz, 0);
    return new THREE.ExtrudeGeometry(s, { depth: 0.05, bevelEnabled: false });
  });
  for (const sx of [-1, 1]) gp.add(tri, 0xffffff, [sx * hx, y0 + WH, 0], [0, Math.PI / 2, 0]);
  const glass = new THREE.Mesh(gp.merged(), glassMat());
  glass.geometry.deleteAttribute('color');
  glass.renderOrder = 5;
  glass.castShadow = false;
  g.add(glass);

  // tiers of planters full of flowers (rose, tulip, sunflower, ...) inside
  const ip = new Parts();
  const types = [2, 1, 0, 1];
  for (let r = 0; r < 4; r++) {
    const z = -2.4 + r * 1.6;
    const y = 0.5 + r * 0.26;
    ip.rbox(0xb97a3c, 8.6, y - 0.1, 1.15, 0.1, [0, (y + 0.1) / 2, z]);
    ip.rbox(0x5a3a22, 8.4, 0.1, 0.95, 0.04, [0, y + 0.02, z], null, null, 1);
    const fp = flowerParts(types[r], 1.05);
    for (let i = 0; i < 12; i++) {
      const x = -4 + i * (8 / 11);
      for (const dz of [-0.26, 0.26]) {
        const ang = ((i * 7 + r * 3) % 11) * 0.6;
        const sc = 0.78 + ((i * 5 + r) % 4) * 0.05;
        const mm = new THREE.Matrix4().compose(new THREE.Vector3(x + (dz > 0 ? 0.3 : 0), y + 0.04, z + dz), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), ang), new THREE.Vector3(sc, sc, sc));
        for (const part of fp) ip.parts.push({ ...part, matrix: mm.clone().multiply(part.matrix) });
      }
    }
  }
  g.add(meshOf(ip.merged(), { receive: true }));
  return g;
}

// -------------------------------------------------------------- travel gate ---
/** An arch across the road: cream pillars with lanterns, a flowered pink beam. Faces -Z; sign is drawn by the scene. */
export function makeGateArch(width = 6.4) {
  const b = new Parts();
  const GW = width;
  for (const sx of [-1, 1]) {
    b.rbox(0xf6ecd6, 0.9, 3.6, 0.9, 0.2, [sx * GW / 2, 1.8, 0]);
    b.rbox(0xe0d2b4, 1.15, 0.28, 1.15, 0.1, [sx * GW / 2, 0.14, 0]);
    b.rbox(0xe0d2b4, 1.15, 0.26, 1.15, 0.1, [sx * GW / 2, 3.7, 0]);
    b.sph(0xffd23f, 0.34, [sx * GW / 2, 4.1, 0], null, null, 14, 10);
    // flower tubs at the foot
    b.rcyl(0xe07a4a, 0.5, 0.45, 0.08, [sx * (GW / 2 + 1.15), 0.23, 0], null, 18);
    b.sph(0x45b84e, 0.5, [sx * (GW / 2 + 1.15), 0.62, 0], [1, 0.7, 1], null, 10, 7);
    for (let k = 0; k < 5; k++) b.sph([0xff4d7d, 0xffd23f, 0xffffff, 0x9b5cff, 0xff4d7d][k], 0.16, [sx * (GW / 2 + 1.15) + Math.cos(k * 1.26) * 0.3, 0.86 + (k % 2) * 0.06, Math.sin(k * 1.26) * 0.3], null, null, 8, 6);
  }
  b.rbox(0xff7aa8, GW + 1.2, 0.6, 0.62, 0.22, [0, 3.45, 0]);
  b.rbox(0xffffff, GW + 0.6, 0.14, 0.7, 0.06, [0, 3.1, 0]);
  const n = 9;
  for (let i = 0; i < n; i++) {
    b.sph([0xff4d7d, 0xffd23f, 0x9b5cff, 0xffffff][i % 4], 0.24, [-GW / 2 + 0.25 + i * (GW - 0.5) / (n - 1), 3.92, 0], null, null, 10, 8);
    b.sph(LEAF, 0.16, [-GW / 2 + 0.25 + i * (GW - 0.5) / (n - 1) + 0.18, 3.82, 0.12], [1.3, 0.6, 1], null, 6, 4);
  }
  return b.merged({ ao: { ground: 0.2, groundH: 0.5, down: 0.05, noBoxes: true } });
}
