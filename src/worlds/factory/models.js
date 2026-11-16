// Volt Works (factory world): item geometries and code-built props. Items are vertex-colour
// geometries with the origin at the bottom centre, long axis X (docs/ENGINE.md section 5).
import * as THREE from 'three';
import { Parts as ArtParts } from '../../engine/art/parts.js';
import { getGlossMaterial } from '../../engine/art/material.js';

class Parts extends ArtParts {
  rbox(c, w, h, d, r, pos, rot, scl, seg = 1) { return super.rbox(c, w, h, d, r, pos, rot, scl, seg); }
}

const cache = new Map();
const once = (key, make) => { let g = cache.get(key); if (!g) { g = make(); cache.set(key, g); } return g; };

/** metal / plastic items share one glossy vertex-colour material */
export const itemGloss = () => getGlossMaterial(0.42, 40);

// ------------------------------------------------------------------ items
export const SCRAP = { w: 0.62, d: 0.5, step: 0.25 };
export function makeScrapGeometry() {
  return once('scrap', () => {
    const b = new Parts();
    b.ico(0x8d949e, 0.2, [-0.12, 0.15, 0.03], [1.25, 0.72, 1.0], [0.3, 0.6, 0.2]);
    b.ico(0xb7653a, 0.17, [0.14, 0.13, -0.06], [1.1, 0.75, 1.15], [0.8, 0.1, 0.5]);
    b.ico(0x6f7782, 0.13, [0.03, 0.14, 0.14], [1.3, 0.7, 0.9], [0.1, 1.2, 0.9]);
    b.cyl(0xc9d0d8, 0.05, 0.05, 0.3, [0.02, 0.21, -0.02], [0.3, 0.4, 1.35], 6);
    b.box(0xd98a3c, 0.22, 0.03, 0.14, [-0.08, 0.235, 0.0], [0.15, 0.5, 0.1]);
    return b.merged();
  });
}

export const CELL = { w: 0.46, d: 0.46, step: 0.27 };
export function makeCellGeometry() {
  return once('cell', () => {
    const b = new Parts();
    b.rcyl(0x2f8df0, 0.2, 0.25, 0.03, [0, 0.125, 0], null, 14);
    b.cyl(0x7fe9ff, 0.204, 0.204, 0.05, [0, 0.14, 0], null, 14);          // glowing band
    b.cyl(0xe9eef4, 0.17, 0.17, 0.012, [0, 0.252, 0], null, 12);          // top cap
    b.cyl(0xd7dde6, 0.07, 0.07, 0.035, [0, 0.262, 0], null, 8);           // terminal
    return b.merged();
  });
}

export const PACK = { w: 0.86, d: 0.54, step: 0.235 };
export function makePackGeometry() {
  return once('pack', () => {
    const b = new Parts();
    b.rbox(0x2b3442, 0.84, 0.22, 0.52, 0.045, [0, 0.11, 0]);
    b.rbox(0x39d98a, 0.86, 0.05, 0.54, 0.02, [0, 0.07, 0]);                // green stripe all round
    for (let i = 0; i < 4; i++) b.cyl(0x2f8df0, 0.075, 0.075, 0.03, [-0.27 + i * 0.18, 0.225, 0.1], null, 8);
    for (let i = 0; i < 4; i++) b.cyl(0x2f8df0, 0.075, 0.075, 0.03, [-0.27 + i * 0.18, 0.225, -0.1], null, 8);
    b.rbox(0xffd23f, 0.2, 0.04, 0.12, 0.015, [0.3, 0.225, 0]);             // connector
    return b.merged();
  });
}

export const STEEL = { w: 0.62, d: 0.62, step: 0.22 };
export function makeSteelGeometry() {
  return once('steel', () => {
    const b = new Parts();
    b.torus(0xc4ccd6, 0.2, 0.1, [0, 0.105, 0], [Math.PI / 2, 0, 0], [1, 1, 1.05], Math.PI * 2, 6, 14);
    b.cyl(0x98a2b0, 0.11, 0.11, 0.2, [0, 0.105, 0], null, 10, null, true);
    b.box(0xf2a71b, 0.07, 0.215, 0.62, [0, 0.107, 0]);                      // strap
    return b.merged();
  });
}

export const PANEL = { w: 0.92, d: 0.6, step: 0.13 };
export function makePanelGeometry() {
  return once('panel', () => {
    const b = new Parts();
    b.rbox(0xe4474f, 0.9, 0.09, 0.58, 0.04, [0, 0.055, 0]);
    b.rbox(0xbfe6ff, 0.34, 0.03, 0.26, 0.02, [0.2, 0.1, -0.08]);            // window cut-out
    b.rbox(0x9b2a33, 0.1, 0.03, 0.035, 0.012, [-0.25, 0.1, 0.12]);          // handle
    return b.merged();
  });
}

export const WHEEL = { w: 0.6, d: 0.6, step: 0.24 };
export function makeWheelGeometry() {
  return once('wheel', () => {
    const b = new Parts();
    b.torus(0x23262d, 0.2, 0.105, [0, 0.11, 0], [Math.PI / 2, 0, 0], [1, 1, 1.1], Math.PI * 2, 7, 16);
    b.cyl(0xd3d9e2, 0.135, 0.135, 0.16, [0, 0.11, 0], null, 12);
    b.cyl(0x8c95a3, 0.05, 0.05, 0.18, [0, 0.11, 0], null, 8);
    return b.merged();
  });
}

// ----------------------------------------------------- the scrap yard heaps
/** A heap of scrap and ore lying on the ground (the yard's "plant"). */
export function makeScrapHeapGeometry() {
  return once('scrap-heap', () => {
    const b = new Parts();
    b.ico(0x8a919b, 0.34, [-0.1, 0.2, 0.05], [1.2, 0.66, 1.05], [0.2, 0.5, 0.1]);
    b.ico(0xb7653a, 0.27, [0.22, 0.18, -0.12], [1.1, 0.7, 1.2], [0.7, 0.2, 0.4]);
    b.ico(0x656d78, 0.22, [0.02, 0.2, 0.26], [1.2, 0.7, 0.9], [0.1, 1.1, 0.8]);
    b.ico(0xa9b1bb, 0.16, [-0.3, 0.12, -0.2], [1, 0.7, 1], [1.1, 0.3, 0.2]);
    b.cyl(0xc9d0d8, 0.06, 0.06, 0.5, [0.06, 0.36, -0.02], [0.35, 0.5, 1.3], 6);
    b.torus(0x4a5059, 0.13, 0.045, [0.2, 0.3, 0.14], [1.2, 0.2, 0.3], null, Math.PI * 2, 5, 10);
    b.box(0xd98a3c, 0.3, 0.035, 0.2, [-0.12, 0.39, 0.02], [0.2, 0.6, 0.12]);
    b.box(0x2f8df0, 0.16, 0.12, 0.1, [0.3, 0.12, 0.3], [0.1, 0.4, 0.2]);
    return b.merged({ ao: { ground: 0.3, groundH: 0.25, noBoxes: true } });
  });
}
/** What is left after sweeping: a clean swept patch with a couple of bolts. */
export function makeSweptGeometry() {
  return once('swept', () => {
    const b = new Parts();
    b.cyl(0xe2d6bd, 0.56, 0.56, 0.012, [0, 0.01, 0], null, 14);
    b.cyl(0xc9d0d8, 0.03, 0.03, 0.03, [0.2, 0.03, 0.1], null, 6);
    b.cyl(0xb7653a, 0.025, 0.025, 0.03, [-0.15, 0.03, -0.2], null, 6);
    return b.merged();
  });
}

export { Parts, THREE };

// ---------------------------------------------------------------- vehicles
import { getModel } from '../../engine/art/assets.js';
import { litMaterial } from '../../engine/art/material.js';
import { addBlob } from '../../engine/chars.js';

const glossOf = new Map();
/** A pack model drawn with the glossy variant of its own palette material (paint, metal). */
export function glossModel(id, opts = {}, gloss = 0.55, shine = 60) {
  const m = getModel(id, opts);
  m.traverse((o) => {
    if (!o.isMesh || !o.material) return;
    const src = o.material;
    const key = src.uuid + '|' + gloss + '|' + shine;
    let g = glossOf.get(key);
    if (!g) {
      g = litMaterial({ map: src.map || null, color: src.color ? src.color.clone() : 0xffffff, vertexColors: !!src.vertexColors, side: src.side, gloss, shine });
      g.name = (src.name || 'lit') + '-gloss';
      glossOf.set(key, g);
    }
    o.material = g;
  });
  return m;
}

/** Road vehicles are drawn a third larger than the other worlds' so they sit right next to 1.9 m people. */
export const CAR_SCALE = 1.35;
function vehicle(id, { bed, blob, scale = CAR_SCALE } = {}) {
  const g = new THREE.Group();
  g.add(glossModel(id, { scale }));
  const anchor = new THREE.Object3D();
  anchor.position.set(bed[0], bed[1], bed[2]);
  g.add(anchor);
  g.userData.bedAnchor = anchor;
  g.userData.wheels = [];
  addBlob(g, { rx: blob[0], rz: blob[1], yaw: true });
  return g;
}
/** The buyer's van: the load disappears inside. */
export const makeVan = () => vehicle('car-kit/van', { bed: [0, 0.75, -0.9], blob: [1.5, 2.7] });
/** Pickup truck with an open bed. */
export const makeTruck = () => vehicle('car-kit/truck', { bed: [0, 1.28, -1.45], blob: [1.5, 2.9] });
/** Box delivery truck: the load disappears inside. */
export const makeDelivery = () => vehicle('car-kit/delivery', { bed: [0, 0.9, -1.2], blob: [1.5, 3.1] });
