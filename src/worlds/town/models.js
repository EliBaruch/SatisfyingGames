// Wheatwhistle Junction models, all code-built with the art kit's Parts (rounded toy shapes, vertex
// colours, baked AO) and drawn with the shared lit material: stack items (wheat sheaves, flour sacks,
// bread trays, milk churns, cheese wheels, pumpkins), the crops and their stubble, the market stall,
// the windmill with turning sails, the bakery, the creamery, the station house and clock tower, the
// freight train, the combine harvester, the delivery truck, cottages, lamps, bunting, the fountain
// and the harvest fair with its big wheel. Pure builders, no game state.
import * as THREE from 'three';
import { Parts, meshOf } from '../../engine/art/parts.js';
import { makeCounter as artCounter } from '../../engine/art/props.js';
import { getModel } from '../../engine/art/assets.js';
import { addBlob } from '../../engine/chars.js';

export const COLORS = {
  wheat: 0xf0bd3e, wheatDark: 0xd69a25, wheatLight: 0xffdc72, straw: 0xe9c865, stubble: 0xc9a24a,
  soil: 0x9a6a3e, soilDark: 0x7c5230,
  sack: 0xf3e6c4, sackShade: 0xe2cfa2, blue: 0x4a8fd9, blueDark: 0x35699f,
  bread: 0xd98b38, breadLight: 0xf2b866, crust: 0xb5682a,
  can: 0xcdd6de, canDark: 0x97a4b0, milk: 0xffffff,
  cheese: 0xffc93c, cheeseRind: 0xe7951f, wax: 0xd9483a,
  pumpkin: 0xf2891c, pumpkinDark: 0xd86c0c, pumpkinLight: 0xffa53a, stem: 0x5b8a2e, leaf: 0x58a23c, leafDark: 0x3f8230,
  wood: 0xc98a4b, woodDark: 0x9a6532, woodLight: 0xe4b676, bark: 0x8a5a36,
  brick: 0xc86a40, brickDark: 0xa55232, plaster: 0xfff0d2, plasterShade: 0xeed9ae,
  roofRed: 0xc64d3a, roofRedDark: 0xa13a2c, roofBlue: 0x4f7fb5, roofGreen: 0x5b9a72, thatch: 0xd6a546, slate: 0x6f7c8e,
  stone: 0xc4baa8, stoneDark: 0x9c9284, iron: 0x4a5261, black: 0x2c2f38,
  teal: 0x2d9480, tealDark: 0x1f6f60, red: 0xd9483a, redDark: 0xab3529, gold: 0xffc42e, cream: 0xfff4dc,
  glass: 0x9fd8f0, glassDark: 0x4d7fa6, glow: 0xffd66b, water: 0x6ec6ea, waterLight: 0xbfeaf8,
  green: 0x58b45a, pink: 0xff8fb0, purple: 0x9a6ad9, orange: 0xff9a3c,
};
const C = COLORS;

// shared dimensions so models, stacks and stations agree
export const SIZES = {
  wheat: { len: 0.8, d: 0.42, h: 0.3 }, wheatStep: 0.24,
  flour: { len: 0.7, d: 0.46, h: 0.32 }, flourStep: 0.28,
  bread: { len: 0.82, d: 0.5, h: 0.3 }, breadStep: 0.27,
  milk: { len: 0.72, d: 0.38, h: 0.34 }, milkStep: 0.31,
  cheese: { len: 0.62, d: 0.62, h: 0.2 }, cheeseStep: 0.2,
  pumpkin: { len: 0.56, d: 0.56, h: 0.36 }, pumpkinStep: 0.32,
  counter: { len: 3.4, depth: 1.2, h: 1.0 },
};
export const WHEAT_HEIGHT = 0.95;

const AO_SMALL = { ground: 0.1, groundH: 0.1, down: 0.05, noBoxes: true };
const AO_MID = { ground: 0.16, groundH: 0.3, down: 0.08, noBoxes: true };
const AO_BIG = { ground: 0.2, groundH: 0.55, down: 0.06, noBoxes: true };
const Z90 = [0, 0, Math.PI / 2];        // a cylinder's axis along X (its top toward -X)
const ZP = [0, 0, -Math.PI / 2];        // ... its top toward +X
const X90 = [Math.PI / 2, 0, 0];        // a cylinder's axis along Z (its top toward +Z)
const D = Math.SQRT1_2;
const FACE_CAMERA = -Math.PI * 0.75;

const _gc = new Map();
const once = (key, make) => { let g = _gc.get(key); if (!g) { g = make(); _gc.set(key, g); } return g; };

/** A gable roof: ridge along Z, base at y = 0, apex at y = h, eaves at x = +-w/2, gable ends at z = +-len/2. */
function gableGeometry(w, h, len) {
  return once(`gable${w},${h},${len}`, () => {
    const x = w / 2, z = len / 2;
    const A = [-x, 0, z], B = [x, 0, z], T = [0, h, z], A2 = [-x, 0, -z], B2 = [x, 0, -z], T2 = [0, h, -z];
    const tris = [A, B, T, B2, A2, T2, A, T, T2, A, T2, A2, B, B2, T2, B, T2, T, A, A2, B2, A, B2, B];
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(tris.flat()), 3));
    g.computeVertexNormals();
    return g;
  });
}
/** gable roof part: `ridge` 'z' (default) or 'x' */
function gable(b, color, w, h, len, pos, ridge = 'z') {
  return b.add(gableGeometry(w, h, len), color, pos, ridge === 'x' ? [0, Math.PI / 2, 0] : null);
}
/** One wedge of a cone (apex up at y = h, rim radius r, `n` wedges make the cone): used for striped tents. */
function wedgeGeometry(r, h, n, r2 = 0, y2 = h) {
  return once(`wedge${r},${h},${n},${r2},${y2}`, () => {
    const a = Math.PI / n;
    const p0 = [Math.sin(-a) * r, 0, Math.cos(-a) * r], p1 = [Math.sin(a) * r, 0, Math.cos(a) * r];
    const q0 = [Math.sin(-a) * r2, y2, Math.cos(-a) * r2], q1 = [Math.sin(a) * r2, y2, Math.cos(a) * r2];
    const tris = r2 > 0 ? [p0, p1, q1, p0, q1, q0] : [p0, p1, [0, h, 0]];
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(tris.flat()), 3));
    g.computeVertexNormals();
    return g;
  });
}
/** A striped cone (or frustum with r2 / y2) at pos, colours alternating round it. */
function striped(b, colors, r, h, n, pos, r2 = 0, y2 = h) {
  const g = wedgeGeometry(r, h, n, r2, y2);
  for (let i = 0; i < n; i++) b.add(g, colors[i % colors.length], pos, [0, (i / n) * Math.PI * 2, 0]);
}

// ------------------------------------------------------------------ items ---
/** A tied sheaf of wheat lying on its side. Origin bottom-centre, long axis X. */
export function makeWheatGeometry() {
  const b = new Parts();
  b.cyl(C.wheat, 0.1, 0.15, 0.52, [-0.12, 0.15, 0], ZP, 8);
  b.cyl(C.red, 0.135, 0.135, 0.07, [-0.06, 0.15, 0], ZP, 8);
  for (let i = 0; i < 5; i++) {
    const a = (i - 2) * 0.32;
    b.sph(i % 2 ? C.wheatLight : C.wheat, 0.075, [0.27, 0.15 + Math.abs(a) * 0.02 + (i % 2) * 0.05, Math.sin(a) * 0.34], [2.3, 0.85, 0.8], [0, -a, 0], 5, 4);
  }
  b.sph(C.wheatLight, 0.07, [0.3, 0.25, 0], [2.0, 0.8, 0.8], null, 5, 4);
  return b.merged({ ao: AO_SMALL });
}

/** A sack of flour: cream sack with a blue band and a gold grain mark. */
export function makeFlourGeometry() {
  const b = new Parts();
  const { len, d, h } = SIZES.flour;
  b.rbox(C.sack, len, h * 0.9, d, 0.13, [0, h * 0.45, 0], null, null, 2);
  b.rbox(C.blue, len * 0.34, h * 0.62, d + 0.02, 0.05, [0, h * 0.43, 0], null, null, 1);
  b.sph(C.gold, 0.07, [0, h * 0.9, 0], [1.3, 0.35, 0.8], null, 6, 4);
  for (const sx of [-1, 1]) b.sph(C.sackShade, 0.09, [sx * len * 0.38, h * 0.88, 0], [1, 0.6, 1.2], null, 6, 4);
  return b.merged({ ao: AO_SMALL });
}

/** Three crusty loaves on a baker's board. */
export function makeBreadGeometry() {
  const b = new Parts();
  const { len, d, h } = SIZES.bread;
  b.rbox(C.woodLight, len, 0.06, d, 0.03, [0, 0.03, 0], null, null, 1);
  for (let i = 0; i < 3; i++) {
    const x = (i - 1) * 0.26;
    b.sph(C.bread, 0.12, [x, 0.06 + (h - 0.06) * 0.48, 0], [0.98, (h - 0.06) / 0.25, 1.85], null, 8, 6);
    b.sph(C.breadLight, 0.085, [x, h - 0.05, 0], [0.9, 0.5, 2.0], null, 6, 4);
    for (const z of [-0.11, 0.02, 0.14]) b.box(C.crust, 0.17, 0.02, 0.035, [x, h - 0.015, z], [0, 0.5, 0]);
  }
  return b.merged({ ao: AO_SMALL });
}

/** A milk churn lying on its side (lid toward +X), with a blue label. */
export function makeMilkGeometry() {
  const b = new Parts();
  const r = 0.165, y = r;
  b.cyl(C.can, r, r, 0.4, [-0.14, y, 0], ZP, 10);
  b.cyl(C.canDark, r + 0.012, r + 0.012, 0.035, [-0.3, y, 0], ZP, 10);
  b.cyl(C.canDark, r + 0.012, r + 0.012, 0.035, [0.02, y, 0], ZP, 10);
  b.cyl(C.can, 0.1, r, 0.13, [0.125, y, 0], ZP, 10);
  b.cyl(C.canDark, 0.1, 0.1, 0.07, [0.22, y, 0], ZP, 10);
  b.cyl(C.can, 0.13, 0.13, 0.045, [0.275, y, 0], ZP, 10);
  b.rbox(C.blue, 0.2, 0.03, 0.2, 0.012, [-0.14, y * 2 - 0.008, 0], null, null, 1);
  b.sph(C.milk, 0.05, [-0.14, y * 2 + 0.008, 0], [1, 0.4, 1.2], null, 6, 4);
  return b.merged({ ao: AO_SMALL });
}

/** A wheel of cheese with a rind, a wax seal and a few holes. */
export function makeCheeseGeometry() {
  const b = new Parts();
  const h = SIZES.cheese.h - 0.01;
  b.rcyl(C.cheese, 0.3, h, 0.05, [0, h / 2, 0], null, 14);
  b.cyl(C.cheeseRind, 0.304, 0.304, h * 0.42, [0, h / 2, 0], null, 14, null, true);
  b.cyl(C.wax, 0.1, 0.1, 0.012, [0, h + 0.004, 0], null, 10);
  for (const [x, z, r] of [[0.17, 0.08, 0.035], [-0.14, 0.14, 0.045], [-0.08, -0.18, 0.04], [0.15, -0.14, 0.03]]) b.cyl(C.cheeseRind, r, r, 0.01, [x, h + 0.003, z], null, 6);
  return b.merged({ ao: AO_SMALL });
}

function pumpkinParts(b, k = 1, y0 = 0) {
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    b.sph(i % 2 ? C.pumpkin : C.pumpkinLight, 0.16 * k, [Math.cos(a) * 0.1 * k, y0 + 0.16 * k, Math.sin(a) * 0.1 * k], [1, 1.02, 1], [0, -a, 0], 5, 4);
  }
  b.sph(C.pumpkinDark, 0.1 * k, [0, y0 + 0.26 * k, 0], [1.2, 0.5, 1.2], null, 6, 4);
  b.cyl(C.stem, 0.025 * k, 0.04 * k, 0.12 * k, [0.01 * k, y0 + 0.34 * k, 0], [0, 0, 0.25], 5);
}
function pumpkinAt(b, x, y, z, k = 1) { const p = new Parts(); pumpkinParts(p, k); b.append(p, [x, y, z]); }
/** A pumpkin. */
export function makePumpkinGeometry() {
  const b = new Parts();
  pumpkinParts(b, 1.05);
  return b.merged({ ao: AO_SMALL });
}

// ------------------------------------------------------------------ crops ---
/** A tuft of ripe wheat (the field's `plant`): stalks with heavy heads. About 100 triangles. */
export function makeWheatPlant() {
  const b = new Parts();
  const N = 6;
  for (let i = 0; i < N; i++) {
    const a = (i / N) * Math.PI * 2 + (i % 2) * 0.4, r = i === 0 ? 0 : 0.2 + (i % 3) * 0.07;
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    const h = 0.68 + (i % 3) * 0.08, lean = 0.12 + (i % 2) * 0.06;
    const rot = [Math.sin(a) * lean, 0, -Math.cos(a) * lean];
    b.cone(i % 2 ? C.wheatDark : C.wheat, 0.04, h, [x + Math.cos(a) * lean * h * 0.25, h / 2, z + Math.sin(a) * lean * h * 0.25], rot, 3);
    b.oct(i % 3 === 0 ? C.wheatLight : C.wheat, 0.075, [x + Math.cos(a) * lean * h * 0.55, h + 0.06, z + Math.sin(a) * lean * h * 0.55], [0.75, 2.3, 0.75], rot);
  }
  return b.merged({ ao: { ground: 0.3, groundH: 0.5, down: 0, noBoxes: true } });
}
/** Stubble left behind by the scythe. */
export function makeWheatStub() {
  const b = new Parts();
  for (let i = 0; i < 6; i++) {
    const a = i * 1.1, r = 0.12 + (i % 3) * 0.11;
    b.cone(i % 2 ? C.stubble : C.straw, 0.035, 0.14, [Math.cos(a) * r, 0.07, Math.sin(a) * r], null, 3);
  }
  b.box(C.straw, 0.4, 0.02, 0.05, [0.05, 0.02, 0.08], [0, 0.7, 0]);
  b.box(C.stubble, 0.34, 0.02, 0.05, [-0.08, 0.02, -0.1], [0, -0.5, 0]);
  return b.merged();
}

function vineParts(b) {
  for (const [x, z, s, r] of [[0.34, 0.1, 1, 0.3], [-0.3, 0.22, 0.85, 2.1], [-0.12, -0.36, 0.95, 4.0], [0.3, -0.3, 0.7, 5.2]]) {
    b.sph(s > 0.9 ? C.leaf : C.leafDark, 0.2 * s, [x, 0.05, z], [1.25, 0.16, 1], [0, r, 0.15], 6, 3);
  }
}
/** A fat pumpkin on its vine (the patch's `plant`). */
export function makePumpkinPlant() {
  const b = new Parts();
  vineParts(b);
  pumpkinParts(b, 1.5, 0.02);
  return b.merged({ ao: AO_MID });
}
/** The vine after picking, with a small green bud. */
export function makePumpkinStub() {
  const b = new Parts();
  vineParts(b);
  b.sph(C.leaf, 0.08, [0, 0.08, 0], [1, 0.85, 1], null, 6, 4);
  return b.merged();
}

/** A full milk churn standing by its cow (the paddock's `plant`). */
export function makeMilkCanPlant() {
  const b = new Parts();
  b.cyl(C.can, 0.22, 0.23, 0.46, [0, 0.23, 0], null, 10);
  b.cyl(C.canDark, 0.24, 0.24, 0.04, [0, 0.06, 0], null, 10);
  b.cyl(C.canDark, 0.235, 0.235, 0.04, [0, 0.4, 0], null, 10);
  b.cyl(C.can, 0.13, 0.22, 0.15, [0, 0.535, 0], null, 10);
  b.cyl(C.canDark, 0.13, 0.13, 0.08, [0, 0.65, 0], null, 10);
  b.cyl(C.can, 0.17, 0.17, 0.05, [0, 0.71, 0], null, 10);
  b.sph(C.milk, 0.11, [0, 0.74, 0], [1, 0.45, 1], null, 8, 4);
  for (const sx of [-1, 1]) b.torus(C.canDark, 0.07, 0.018, [sx * 0.25, 0.48, 0], [0, 0, 0], null, Math.PI * 2, 4, 8);
  b.rbox(C.blue, 0.2, 0.16, 0.03, 0.012, [-0.16 * D - 0.02, 0.26, -0.16 * D - 0.02], [0, Math.PI / 4, 0], null, 1);
  return b.merged({ ao: AO_MID });
}
/** The milking stool that waits while the cow fills the next churn. */
export function makeMilkStub() {
  const b = new Parts();
  b.rcyl(C.woodLight, 0.2, 0.06, 0.02, [0, 0.27, 0], null, 10);
  for (let i = 0; i < 3; i++) { const a = i * 2.094 + 0.4; b.cyl(C.woodDark, 0.025, 0.03, 0.26, [Math.cos(a) * 0.13, 0.13, Math.sin(a) * 0.13], [Math.sin(a) * 0.2, 0, -Math.cos(a) * 0.2], 5); }
  return b.merged({ ao: AO_SMALL });
}

// -------------------------------------------------------------- small props ---
function crate(b, x, y, z, s = 0.6, yaw = 0, c = C.wood) {
  b.rbox(c, s, s * 0.7, s, 0.03, [x, y + s * 0.35, z], [0, yaw, 0], null, 1);
  b.box(C.woodDark, s + 0.02, 0.05, s + 0.02, [x, y + s * 0.62, z], [0, yaw, 0]);
  b.box(C.woodDark, s + 0.02, 0.05, s + 0.02, [x, y + s * 0.1, z], [0, yaw, 0]);
}
function barrel(b, x, z, r = 0.32, h = 0.75) {
  b.lathe(C.wood, [[r * 0.85, 0], [r, h * 0.5], [r * 0.85, h], [0, h]], [x, 0, z], null, 10);
  for (const y of [0.18, 0.82]) b.torus(C.iron, r * 0.93, 0.02, [x, h * y, z], X90, null, Math.PI * 2, 4, 10);
}
/** A lamp post (y = 0 at the foot); the lantern hangs toward (dx, dz). */
function lamp(b, x, z, dx = -D, dz = -D, h = 2.7) {
  b.cyl(C.iron, 0.05, 0.08, h, [x, h / 2, z], null, 6);
  b.rcyl(C.iron, 0.16, 0.14, 0.04, [x, 0.07, z], null, 8);
  b.box(C.iron, 0.05, 0.05, 0.5, [x + dx * 0.22, h - 0.05, z + dz * 0.22], [0, Math.atan2(dx, dz), 0]);
  const lx = x + dx * 0.44, lz = z + dz * 0.44;
  b.rbox(C.glow, 0.2, 0.26, 0.2, 0.05, [lx, h - 0.28, lz], null, null, 1);
  b.cone(C.iron, 0.2, 0.14, [lx, h - 0.08, lz], null, 6);
  b.box(C.iron, 0.22, 0.03, 0.22, [lx, h - 0.42, lz]);
}
/** A string of pennants from a to b ([x, y, z]) with a little sag. */
function bunting(b, a, c, n = 9, colors = [C.red, C.gold, C.blue, C.cream, C.green]) {
  const yaw = Math.atan2(c[0] - a[0], c[2] - a[2]);
  for (let i = 0; i < n; i++) {
    const u = (i + 0.5) / n, sag = Math.sin(u * Math.PI) * 0.35;
    b.cone(colors[i % colors.length], 0.16, 0.32, [a[0] + (c[0] - a[0]) * u, a[1] + (c[1] - a[1]) * u - sag - 0.16, a[2] + (c[2] - a[2]) * u], [Math.PI, -yaw, 0], 4, [0.25, 1, 1]);
  }
  const len = Math.hypot(c[0] - a[0], c[1] - a[1], c[2] - a[2]);
  for (let i = 0; i < 4; i++) {
    const u0 = i / 4, u1 = (i + 1) / 4, um = (u0 + u1) / 2;
    const y0 = a[1] + (c[1] - a[1]) * u0 - Math.sin(u0 * Math.PI) * 0.35, y1 = a[1] + (c[1] - a[1]) * u1 - Math.sin(u1 * Math.PI) * 0.35;
    b.box(C.cream, 0.025, 0.025, len / 4 + 0.02, [a[0] + (c[0] - a[0]) * um, (y0 + y1) / 2, a[2] + (c[2] - a[2]) * um], [0, yaw, 0]);
  }
}
/** A wooden rail fence from (x0, z0) to (x1, z1): posts and two rails. */
export function fenceRun(b, x0, z0, x1, z1, h = 0.85, c = C.woodLight) {
  const len = Math.hypot(x1 - x0, z1 - z0), n = Math.max(1, Math.round(len / 1.5));
  const yaw = Math.atan2(x1 - x0, z1 - z0);
  for (let i = 0; i <= n; i++) {
    const u = i / n;
    b.rbox(C.wood, 0.14, h, 0.14, 0.03, [x0 + (x1 - x0) * u, h / 2, z0 + (z1 - z0) * u], [0, yaw, 0], null, 1);
  }
  for (const y of [h * 0.42, h * 0.8]) b.box(c, 0.06, 0.1, len, [(x0 + x1) / 2, y, (z0 + z1) / 2], [0, yaw, 0]);
}
/** A round hay bale lying on its side. */
export function hayBale(b, x, z, yaw = 0, r = 0.55, len = 0.9, y = 0) {
  b.cyl(C.straw, r, r, len, [x, y + r, z], [Math.PI / 2, 0, -yaw], 12);
  for (const s of [-0.28, 0.28]) b.cyl(C.wheatDark, r + 0.012, r + 0.012, 0.06, [x + Math.sin(yaw) * s * len, y + r, z + Math.cos(yaw) * s * len], [Math.PI / 2, 0, -yaw], 12);
}
export function makeHayBales() {
  const b = new Parts();
  hayBale(b, 0, 0, 0.3); hayBale(b, 1.15, 0.2, 0.3); hayBale(b, 0.55, 0.1, 0.3, 0.55, 0.9, 0.95);
  return b.merged({ ao: AO_MID });
}
/** A scarecrow for the wheat field. */
export function makeScarecrow() {
  const b = new Parts();
  b.cyl(C.woodDark, 0.06, 0.07, 2.2, [0, 1.1, 0], null, 6);
  b.cyl(C.woodDark, 0.05, 0.05, 1.7, [0, 1.55, 0], Z90, 6);
  b.rbox(C.blue, 0.62, 0.7, 0.3, 0.1, [0, 1.38, 0], null, null, 1);
  for (const sx of [-1, 1]) { b.rbox(C.blue, 0.5, 0.2, 0.22, 0.07, [sx * 0.52, 1.55, 0], null, null, 1); b.sph(C.straw, 0.1, [sx * 0.83, 1.55, 0], [1.4, 0.8, 0.8], null, 5, 4); }
  b.rbox(C.red, 0.64, 0.12, 0.32, 0.04, [0, 1.12, 0], null, null, 1);
  b.sph(C.sack, 0.25, [0, 2.02, 0], [1, 0.95, 1], null, 9, 7);
  for (const sx of [-1, 1]) b.sph(C.black, 0.035, [sx * 0.09, 2.05, 0.22], null, null, 5, 4);
  b.cone(C.orange, 0.04, 0.16, [0, 1.98, 0.3], X90, 5);
  b.rcyl(C.straw, 0.42, 0.04, 0.015, [0, 2.2, 0], [0.06, 0, 0], 14);
  b.cone(C.wheat, 0.24, 0.32, [0, 2.36, 0], null, 10);
  b.rcyl(C.red, 0.2, 0.05, 0.015, [0, 2.25, 0], null, 10);
  for (let i = 0; i < 5; i++) b.cone(C.straw, 0.05, 0.3, [(i - 2) * 0.12, 0.98, 0.02], [Math.PI, 0, 0], 4);
  return b.merged({ ao: AO_MID });
}
/** A stone well with a little roof. */
export function makeWell() {
  const b = new Parts();
  b.cyl(C.stone, 0.7, 0.75, 0.7, [0, 0.35, 0], null, 12);
  b.torus(C.stoneDark, 0.68, 0.09, [0, 0.7, 0], X90, null, Math.PI * 2, 5, 12);
  b.cyl(C.water, 0.58, 0.58, 0.02, [0, 0.62, 0], null, 12);
  for (const sx of [-1, 1]) b.rbox(C.wood, 0.12, 1.5, 0.12, 0.03, [sx * 0.66, 1.4, 0], null, null, 1);
  gable(b, C.roofRed, 1.9, 0.55, 1.3, [0, 2.1, 0]);
  b.cyl(C.woodDark, 0.06, 0.06, 1.3, [0, 1.75, 0], Z90, 6);
  crate(b, 0.9, 0, 0.75, 0.42, 0.4);
  return b.merged({ ao: AO_BIG });
}

// ------------------------------------------------------------ market stall ---
/**
 * The market stall: the art kit's counter under a frame with a striped valance, pennants and crates
 * of produce at both ends. Long axis Z, customers on +X.
 */
export function makeStall() {
  const g = new THREE.Group();
  g.add(artCounter({ ...SIZES.counter, accent: C.red, wood: 0xc08347, top: 0xfff3d6, register: false }));
  const b = new Parts();
  const L = SIZES.counter.len, PZ = L / 2 + 0.28;
  for (const z of [-PZ, PZ]) {
    b.rbox(C.wood, 0.16, 3.0, 0.16, 0.04, [-0.45, 1.5, z], null, null, 1);
    b.sph(C.gold, 0.12, [-0.45, 3.06, z], null, null, 8, 6);
  }
  b.rbox(C.woodDark, 0.14, 0.14, PZ * 2 + 0.3, 0.04, [-0.45, 2.86, 0], null, null, 1);
  // striped valance hanging from the beam
  const n = 10, w = (PZ * 2 - 0.2) / n;
  for (let i = 0; i < n; i++) {
    const z = -PZ + 0.1 + (i + 0.5) * w;
    b.rbox(i % 2 ? C.cream : C.red, 0.06, 0.42, w, 0.02, [-0.45, 2.6, z], null, null, 1);
    b.sph(i % 2 ? C.cream : C.red, w / 2, [-0.45, 2.39, z], [0.14, 0.5, 1], null, 6, 4);
  }
  // produce at both ends of the stall
  crate(b, -0.2, 0, PZ + 0.6, 0.66, 0.15);
  pumpkinAt(b, -0.2, 0.46, PZ + 0.6, 1.15);
  crate(b, 0.55, 0, PZ + 0.75, 0.5, -0.3, C.woodLight);
  for (const [x, z] of [[0.45, 0.06], [0.66, -0.06], [0.55, 0.14]]) b.sph(C.red, 0.11, [x, 0.42, PZ + 0.75 + z], null, null, 6, 5);
  barrel(b, -0.25, -PZ - 0.62);
  for (let i = 0; i < 4; i++) b.cone(C.wheat, 0.05, 0.75, [-0.25 + Math.cos(i * 1.6) * 0.12, 1.05, -PZ - 0.62 + Math.sin(i * 1.6) * 0.12], [Math.sin(i * 1.6) * 0.2, 0, -Math.cos(i * 1.6) * 0.2], 4);
  g.add(meshOf(b.merged({ ao: AO_BIG })));
  return g;
}

// ---------------------------------------------------------------- windmill ---
/**
 * The windmill: a plastered tower on a stone base, a shingled cap and four lattice sails that face the
 * camera. Returns a Group; userData { sails (Object3D: rotate about its local Z), mouth [x,y,z], spout [x,y,z] }.
 */
export function makeWindmill() {
  const g = new THREE.Group();
  const b = new Parts();
  b.rcyl(C.stone, 1.9, 0.5, 0.12, [0, 0.25, 0], null, 14);
  b.lathe(C.plaster, [[1.62, 0.45], [1.42, 2.3], [1.16, 4.3], [1.08, 4.75]], [0, 0, 0], null, 12);
  b.torus(C.woodDark, 1.44, 0.08, [0, 2.3, 0], X90, null, Math.PI * 2, 5, 12);
  b.torus(C.woodDark, 1.12, 0.07, [0, 4.72, 0], X90, null, Math.PI * 2, 5, 12);
  b.cone(C.roofRed, 1.42, 1.45, [0, 5.45, 0], null, 12);
  b.sph(C.gold, 0.13, [0, 6.22, 0], null, null, 8, 6);
  // door and windows on the two faces the camera sees
  b.rbox(C.woodDark, 0.8, 1.4, 0.24, 0.1, [-D * 1.52, 1.1, -D * 1.52], [0, Math.PI / 4, 0], null, 1);
  b.sph(C.gold, 0.06, [-D * 1.66 + 0.16, 1.1, -D * 1.66 - 0.16], null, null, 6, 4);
  b.rbox(C.glassDark, 0.42, 0.5, 0.2, 0.08, [-1.3, 3.1, 0.25], [0, Math.PI / 2 - 0.1, 0], null, 1);
  b.rbox(C.glassDark, 0.42, 0.5, 0.2, 0.08, [0.3, 3.3, -1.26], [0, 0.1, 0], null, 1);
  b.rbox(C.glassDark, 0.34, 0.4, 0.2, 0.08, [-D * 1.36, 3.0, -D * 1.36], [0, Math.PI / 4, 0], null, 1);
  // the grain hopper on the field side (-X) and the flour chute at the front (-Z)
  b.rbox(C.wood, 0.9, 0.7, 1.0, 0.08, [-1.75, 0.85, 0.2], null, null, 1);
  b.rbox(C.woodDark, 1.0, 0.1, 1.1, 0.04, [-1.75, 1.22, 0.2], null, null, 1);
  b.rbox(C.wood, 0.8, 0.16, 1.2, 0.05, [0.9, 0.75, -1.75], [0.5, 0, 0], null, 1);
  crate(b, 1.85, 0, -1.2, 0.5, 0.2);
  g.add(meshOf(b.merged({ ao: AO_BIG }), { receive: true }));

  // sails: built in the XY plane, facing local +Z, then turned to the camera
  const sails = new THREE.Group();
  const s = new Parts();
  s.cyl(C.woodDark, 0.24, 0.24, 0.5, [0, 0, -0.15], X90, 10);
  s.sph(C.gold, 0.16, [0, 0, 0.14], null, null, 8, 6);
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2;
    const arm = new Parts();
    arm.box(C.woodDark, 0.1, 3.0, 0.08, [0, 1.5, 0]);
    arm.rbox(C.cream, 0.72, 2.1, 0.04, 0.02, [0.42, 1.85, 0], null, null, 1);
    for (let k = 0; k < 4; k++) arm.box(C.wood, 0.78, 0.05, 0.06, [0.42, 0.95 + k * 0.6, 0.01]);
    arm.box(C.wood, 0.05, 2.1, 0.06, [0.8, 1.85, 0.01]);
    s.append(arm, [0, 0, 0], [0, 0, a]);
  }
  sails.add(meshOf(s.merged()));
  sails.position.set(-D * 1.5, 4.35, -D * 1.5);
  sails.rotation.y = FACE_CAMERA;
  g.add(sails);
  g.userData = { sails, mouth: [-1.75, 1.5, 0.2], spout: [0.9, 1.0, -1.8] };
  return g;
}

// ------------------------------------------------------------------ bakery ---
/** The bakery: brick oven house with a tall chimney, a striped awning and a loaf sign. userData { mouth, spout, chimney }. */
export function makeBakery() {
  const g = new THREE.Group();
  const b = new Parts();
  b.rbox(C.stone, 3.7, 0.3, 3.7, 0.08, [0, 0.15, 0], null, null, 1);
  b.rbox(C.plaster, 3.4, 2.3, 3.4, 0.12, [0, 1.4, 0], null, null, 1);
  b.rbox(C.brick, 3.46, 0.7, 3.46, 0.08, [0, 0.62, 0], null, null, 1);
  gable(b, C.roofRed, 4.0, 1.45, 3.9, [0, 2.5, 0]);
  b.box(C.roofRedDark, 0.2, 0.12, 4.0, [0, 3.93, 0]);
  // chimney at the back
  b.rbox(C.brick, 0.7, 2.3, 0.7, 0.06, [0.95, 3.6, 0.9], null, null, 1);
  b.rbox(C.brickDark, 0.86, 0.2, 0.86, 0.05, [0.95, 4.78, 0.9], null, null, 1);
  // -X face (toward the flour bay): the oven mouth with a warm glow
  b.rbox(C.brickDark, 0.3, 1.3, 1.4, 0.1, [-1.68, 1.05, 0.55], null, null, 1);
  b.rbox(C.black, 0.3, 0.8, 0.95, 0.2, [-1.74, 0.95, 0.55], null, null, 1);
  b.rbox(C.glow, 0.3, 0.34, 0.7, 0.12, [-1.77, 0.76, 0.55], null, null, 1);
  b.rbox(C.glassDark, 0.2, 0.6, 0.6, 0.08, [-1.66, 1.95, -0.95], null, null, 1);
  b.rbox(C.cream, 0.24, 0.08, 0.72, 0.03, [-1.7, 1.62, -0.95], null, null, 1);
  // -Z face: the shop window under a striped awning, the door and the serving shelf
  b.rbox(C.woodDark, 0.8, 1.5, 0.2, 0.08, [0.95, 1.05, -1.68], null, null, 1);
  b.sph(C.gold, 0.06, [0.7, 1.05, -1.8], null, null, 6, 4);
  b.rbox(C.glassDark, 1.5, 0.85, 0.2, 0.08, [-0.6, 1.5, -1.66], null, null, 1);
  b.rbox(C.woodLight, 1.7, 0.1, 0.5, 0.04, [-0.6, 1.0, -1.85], null, null, 1);
  for (let i = 0; i < 3; i++) b.sph(C.bread, 0.14, [-1.05 + i * 0.45, 1.14, -1.86], [1.5, 0.8, 0.9], null, 7, 5);
  for (let i = 0; i < 6; i++) {
    const x = -1.4 + (i + 0.5) * 0.27;
    b.box(i % 2 ? C.cream : C.red, 0.27, 0.06, 0.8, [x, 2.2, -2.02], [-0.5, 0, 0]);
    b.box(i % 2 ? C.cream : C.red, 0.27, 0.16, 0.05, [x, 1.96, -2.38]);
  }
  // the loaf sign over the door
  b.box(C.iron, 0.06, 0.06, 0.6, [0.95, 2.45, -1.95]);
  b.rbox(C.cream, 0.9, 0.6, 0.08, 0.06, [0.95, 2.1, -2.2], null, null, 1);
  b.sph(C.bread, 0.2, [0.95, 2.1, -2.26], [1.7, 0.95, 0.4], null, 8, 6);
  barrel(b, 2.05, -1.35, 0.3, 0.7);
  crate(b, -2.1, 0, -1.45, 0.5, 0.3);
  g.add(meshOf(b.merged({ ao: AO_BIG }), { receive: true }));
  g.userData = { mouth: [-1.8, 1.0, 0.55], spout: [-0.6, 1.3, -1.9], chimney: [0.95, 4.95, 0.9] };
  return g;
}

// ---------------------------------------------------------------- creamery ---
/** The creamery: a whitewashed dairy with a blue roof, a copper vat and a giant cheese on its sign. userData { mouth, spout }. */
export function makeCreamery() {
  const g = new THREE.Group();
  const b = new Parts();
  b.rbox(C.stone, 3.5, 0.3, 3.5, 0.08, [0, 0.15, 0], null, null, 1);
  b.rbox(0xfdfaf2, 3.2, 2.1, 3.2, 0.12, [0, 1.3, 0], null, null, 1);
  b.rbox(C.blue, 3.26, 0.5, 3.26, 0.08, [0, 0.52, 0], null, null, 1);
  gable(b, C.roofBlue, 3.8, 1.25, 3.7, [0, 2.3, 0], 'x');
  b.box(C.blueDark, 3.8, 0.12, 0.2, [0, 3.53, 0]);
  // -Z face (toward the milk bay): the intake hatch and a window
  b.rbox(C.blueDark, 1.3, 1.2, 0.3, 0.1, [0.5, 1.05, -1.58], null, null, 1);
  b.rbox(C.black, 0.95, 0.75, 0.3, 0.16, [0.5, 0.98, -1.63], null, null, 1);
  b.rbox(C.glassDark, 0.55, 0.55, 0.2, 0.08, [-0.95, 1.7, -1.56], null, null, 1);
  // -X face (toward the street): the cheese counter, door and sign
  b.rbox(C.woodDark, 0.2, 1.45, 0.8, 0.08, [-1.58, 1.02, 0.85], null, null, 1);
  b.rbox(C.woodLight, 0.5, 0.1, 1.5, 0.04, [-1.78, 0.98, -0.55], null, null, 1);
  b.rbox(C.glassDark, 0.2, 0.7, 1.3, 0.08, [-1.56, 1.5, -0.55], null, null, 1);
  b.rcyl(C.cheese, 0.26, 0.17, 0.05, [-1.8, 1.12, -0.85], null, 12);
  b.rcyl(C.cheese, 0.22, 0.15, 0.05, [-1.8, 1.11, -0.3], null, 12);
  // the big cheese on the gable, and a copper vat chimney
  b.rcyl(C.cheese, 0.62, 0.3, 0.08, [-1.95, 2.95, 0], Z90, 16);
  b.cyl(C.cheeseRind, 0.63, 0.63, 0.12, [-1.95, 2.95, 0], Z90, 16, null, true);
  for (const [y, z, r] of [[3.15, 0.2, 0.09], [2.8, -0.22, 0.11], [2.78, 0.26, 0.07]]) b.cyl(C.cheeseRind, r, r, 0.02, [-2.12, y, z], Z90, 6);
  b.cyl(0xc8794a, 0.3, 0.3, 0.9, [0.9, 3.3, 0.7], null, 10);
  b.cone(0xa85f38, 0.36, 0.3, [0.9, 3.9, 0.7], null, 10);
  // churns by the door
  for (const [x, z] of [[-2.0, 1.55], [-1.6, 1.85]]) {
    b.cyl(C.can, 0.2, 0.21, 0.42, [x, 0.21, z], null, 9);
    b.cyl(C.can, 0.12, 0.2, 0.13, [x, 0.49, z], null, 9);
    b.cyl(C.canDark, 0.15, 0.15, 0.08, [x, 0.6, z], null, 9);
  }
  g.add(meshOf(b.merged({ ao: AO_BIG }), { receive: true }));
  g.userData = { mouth: [0.5, 1.0, -1.7], spout: [-1.85, 1.25, -0.55] };
  return g;
}

// ----------------------------------------------------------- cows and trough ---
/** The feed trough of the paddock (long axis X); the fill is drawn by the scene. */
export function makeTroughGeometry(len = 4.4) {
  const b = new Parts();
  b.rbox(C.wood, len, 0.5, 0.95, 0.06, [0, 0.42, 0], null, null, 1);
  b.rbox(C.woodDark, len + 0.1, 0.1, 1.05, 0.04, [0, 0.66, 0], null, null, 1);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.rbox(C.woodDark, 0.16, 0.5, 0.16, 0.03, [sx * (len / 2 - 0.2), 0.25, sz * 0.36], null, null, 1);
  return b.merged({ ao: AO_MID });
}

// ------------------------------------------------------------------ station ---
/** The station house (long axis X, track side +Z): cream walls, teal trim, a hipped roof, a name board. */
export function makeStationHouse() {
  const b = new Parts();
  b.rbox(C.plaster, 4.2, 2.2, 1.9, 0.1, [0, 1.1, 0], null, null, 1);
  b.rbox(C.teal, 4.26, 0.5, 1.96, 0.06, [0, 0.27, 0], null, null, 1);
  b.rbox(C.roofRed, 4.9, 0.16, 2.9, 0.06, [0, 2.3, -0.2], null, null, 1);
  gable(b, C.roofRed, 2.5, 0.85, 4.6, [0, 2.36, 0], 'x');
  b.box(C.roofRedDark, 4.7, 0.1, 0.18, [0, 3.2, 0]);
  // -Z face: door, ticket window, benches under the eaves
  b.rbox(C.tealDark, 0.75, 1.5, 0.16, 0.08, [-1.2, 0.95, -0.92], null, null, 1);
  b.rbox(C.glassDark, 1.1, 0.75, 0.16, 0.08, [0.55, 1.35, -0.92], null, null, 1);
  b.rbox(C.cream, 1.3, 0.1, 0.3, 0.04, [0.55, 0.92, -1.0], null, null, 1);
  b.rbox(C.glassDark, 0.16, 0.7, 0.7, 0.08, [-2.06, 1.35, 0], null, null, 1);
  for (const x of [-2.3, 2.3]) b.rbox(C.teal, 0.12, 2.2, 0.12, 0.03, [x, 1.1, -1.45], null, null, 1);
  // the name board on the roof edge and a round clock
  b.rbox(C.teal, 2.6, 0.5, 0.1, 0.05, [0, 2.75, -1.6], null, null, 1);
  b.rbox(C.cream, 2.4, 0.34, 0.1, 0.04, [0, 2.75, -1.64], null, null, 1);
  b.rbox(C.wood, 1.3, 0.08, 0.4, 0.03, [1.5, 0.45, -1.25], null, null, 1);
  for (const x of [1.0, 2.0]) b.box(C.iron, 0.06, 0.45, 0.36, [x, 0.22, -1.25]);
  b.rbox(C.brick, 0.5, 1.0, 0.5, 0.05, [1.4, 3.1, 0.3], null, null, 1);
  return b.merged({ ao: AO_BIG });
}
/** The clock tower that rises beside the station house. About 7.6 tall. */
export function makeClockTower() {
  const b = new Parts();
  b.rbox(C.stone, 2.1, 0.5, 2.1, 0.08, [0, 0.25, 0], null, null, 1);
  b.rbox(C.plaster, 1.7, 5.2, 1.7, 0.1, [0, 3.0, 0], null, null, 1);
  b.rbox(C.teal, 1.76, 0.4, 1.76, 0.06, [0, 0.7, 0], null, null, 1);
  b.rbox(C.teal, 1.9, 0.22, 1.9, 0.06, [0, 4.25, 0], null, null, 1);
  b.rbox(C.plasterShade, 1.9, 1.5, 1.9, 0.1, [0, 5.1, 0], null, null, 1);
  b.rbox(C.teal, 2.1, 0.2, 2.1, 0.06, [0, 5.95, 0], null, null, 1);
  b.cone(C.roofRed, 1.5, 1.5, [0, 6.8, 0], [0, Math.PI / 4, 0], 4);
  b.sph(C.gold, 0.14, [0, 7.6, 0], null, null, 8, 6);
  b.cyl(C.gold, 0.02, 0.02, 0.5, [0, 7.85, 0], null, 4);
  // clock faces toward the camera sides
  for (const [x, z, rot] of [[-0.97, 0, Z90], [0, -0.97, X90]]) {
    b.cyl(C.cream, 0.6, 0.6, 0.08, [x, 5.1, z], rot, 18);
    b.torus(C.gold, 0.6, 0.05, [x * 1.03, 5.1, z * 1.03], x ? [0, Math.PI / 2, 0] : null, null, Math.PI * 2, 5, 18);
    if (x) { b.box(C.black, 0.04, 0.42, 0.07, [x - 0.05, 5.26, 0]); b.box(C.black, 0.04, 0.07, 0.32, [x - 0.05, 5.1, -0.14]); }
    else { b.box(C.black, 0.07, 0.42, 0.04, [0, 5.26, z - 0.05]); b.box(C.black, 0.32, 0.07, 0.04, [0.14, 5.1, z - 0.05]); }
  }
  for (const [x, z] of [[-0.87, 0], [0, -0.87]]) for (const y of [1.9, 3.1]) b.rbox(C.glassDark, x ? 0.1 : 0.4, 0.6, x ? 0.4 : 0.1, 0.04, [x, y, z], null, null, 1);
  return b.merged({ ao: AO_BIG });
}

/** A signal post; userData.arm drops when a train is due. */
export function makeSignal() {
  const g = new THREE.Group();
  const b = new Parts();
  b.cyl(C.cream, 0.07, 0.1, 3.6, [0, 1.8, 0], null, 6);
  b.rcyl(C.iron, 0.24, 0.2, 0.05, [0, 0.1, 0], null, 8);
  b.cone(C.red, 0.12, 0.25, [0, 3.72, 0], null, 6);
  for (let i = 0; i < 5; i++) b.box(C.iron, 0.3, 0.04, 0.04, [0.12, 0.6 + i * 0.5, 0]);
  g.add(meshOf(b.merged({ ao: AO_MID })));
  const arm = new THREE.Group();
  const a = new Parts();
  a.rbox(C.red, 1.1, 0.24, 0.07, 0.03, [0.5, 0, 0], null, null, 1);
  a.rbox(C.cream, 0.16, 0.25, 0.08, 0.02, [0.78, 0, 0], null, null, 1);
  a.cyl(C.gold, 0.12, 0.12, 0.1, [-0.05, 0, 0], X90, 8);
  arm.add(meshOf(a.merged()));
  arm.position.set(0, 3.25, -0.12);
  g.add(arm);
  g.userData.arm = arm;
  return g;
}

// -------------------------------------------------------------------- train ---
function wheelPair(r, track, tyre = C.black, hub = C.red) {
  const b = new Parts();
  for (const sx of [-1, 1]) {
    b.cyl(tyre, r, r, 0.14, [sx * track, 0, 0], Z90, 14);
    b.cyl(hub, r * 0.78, r * 0.78, 0.16, [sx * track, 0, 0], Z90, 12);
    b.cyl(C.gold, r * 0.24, r * 0.24, 0.2, [sx * track, 0, 0], Z90, 8);
    for (let i = 0; i < 3; i++) b.box(tyre, 0.17, r * 1.5, r * 0.16, [sx * track, 0, 0], [i * Math.PI / 3, 0, 0]);
  }
  b.cyl(C.iron, 0.06, 0.06, track * 2, [0, 0, 0], Z90, 6);
  return b.merged();
}
/** The locomotive: a chunky tank engine, facing +Z. userData { wheels, wheelR, funnel }. About 4.6 long, 3 tall. */
export function makeLocomotive() {
  const g = new THREE.Group();
  const b = new Parts();
  b.rbox(C.black, 1.5, 0.32, 4.3, 0.08, [0, 0.72, 0], null, null, 1);
  b.rbox(C.red, 1.7, 0.3, 0.2, 0.06, [0, 0.7, 2.2], null, null, 1);
  for (const sx of [-1, 1]) b.cyl(C.iron, 0.12, 0.12, 0.2, [sx * 0.55, 0.7, 2.36], X90, 8);
  // cowcatcher
  for (let i = 0; i < 5; i++) b.box(C.red, 0.1, 0.5, 0.5, [(i - 2) * 0.3, 0.38, 2.48], [-0.65, 0, 0]);
  b.box(C.redDark, 1.5, 0.1, 0.12, [0, 0.2, 2.66]);
  // boiler, smokebox, funnel, domes
  b.cyl(C.teal, 0.66, 0.66, 2.5, [0, 1.52, 0.75], X90, 16);
  for (const z of [-0.2, 0.75, 1.7]) b.torus(C.gold, 0.665, 0.035, [0, 1.52, z], null, null, Math.PI * 2, 4, 16);
  b.cyl(C.black, 0.68, 0.68, 0.34, [0, 1.52, 2.08], X90, 16);
  b.cyl(C.iron, 0.5, 0.5, 0.06, [0, 1.52, 2.27], X90, 14);
  b.sph(C.glow, 0.17, [0, 2.3, 2.14], null, null, 8, 6);
  b.cyl(C.iron, 0.2, 0.2, 0.14, [0, 2.3, 2.06], X90, 8);
  b.cyl(C.black, 0.17, 0.21, 0.62, [0, 2.44, 1.6], null, 10);
  b.cyl(C.black, 0.33, 0.2, 0.26, [0, 2.86, 1.6], null, 10);
  b.torus(C.gold, 0.22, 0.03, [0, 2.72, 1.6], X90, null, Math.PI * 2, 4, 10);
  b.sph(C.gold, 0.27, [0, 2.2, 0.78], [1, 0.95, 1], null, 10, 8);
  b.cyl(C.tealDark, 0.2, 0.24, 0.3, [0, 2.24, 0.0], null, 10);
  b.sph(C.tealDark, 0.2, [0, 2.4, 0.0], [1, 0.6, 1], null, 8, 6);
  // side tanks and running board
  for (const sx of [-1, 1]) {
    b.rbox(C.teal, 0.3, 0.7, 2.0, 0.07, [sx * 0.7, 1.26, 0.5], null, null, 1);
    b.box(C.gold, 0.04, 0.07, 2.0, [sx * 0.86, 1.5, 0.5]);
    b.box(C.iron, 0.2, 0.06, 3.9, [sx * 0.84, 0.9, 0.15]);
    b.box(C.gold, 0.06, 0.1, 1.9, [sx * 0.86, 0.5, 0.15]);           // connecting rod
  }
  // cab
  b.rbox(C.teal, 1.7, 1.55, 1.45, 0.1, [0, 1.72, -1.2], null, null, 1);
  b.rbox(C.red, 1.95, 0.16, 1.85, 0.07, [0, 2.6, -1.25], null, null, 1);
  for (const sx of [-1, 1]) {
    b.rbox(C.glassDark, 0.1, 0.55, 0.7, 0.05, [sx * 0.83, 2.05, -1.15], null, null, 1);
    b.rbox(C.gold, 0.06, 0.3, 0.6, 0.03, [sx * 0.87, 1.35, -1.2], null, null, 1);
  }
  b.rbox(C.glassDark, 0.42, 0.42, 0.1, 0.05, [-0.4, 2.1, -0.47], null, null, 1);
  b.rbox(C.glassDark, 0.42, 0.42, 0.1, 0.05, [0.4, 2.1, -0.47], null, null, 1);
  b.rbox(C.black, 1.5, 0.9, 0.5, 0.08, [0, 1.3, -2.05], null, null, 1);          // coal bunker
  b.sph(C.iron, 0.42, [0, 1.75, -2.05], [1.5, 0.4, 0.5], null, 7, 4);
  const body = meshOf(b.merged({ ao: AO_MID }));
  g.add(body);
  const wheels = [];
  const wg = wheelPair(0.5, 0.74);
  for (const z of [1.25, 0.15, -0.95]) { const w = meshOf(wg); w.position.set(0, 0.5, z); g.add(w); wheels.push(w); }
  const small = meshOf(wheelPair(0.34, 0.74)); small.position.set(0, 0.34, -2.0); g.add(small); wheels.push(small);
  addBlob(g, { rx: 1.2, rz: 2.7, yaw: true });
  g.userData = { wheels, wheelR: 0.5, funnel: { x: 0, y: 3.1, z: 1.6 } };
  return g;
}
/**
 * An open freight wagon, facing +Z. `emblem`: 'bread' | 'cheese' | 'pumpkin' painted on both sides so
 * the player can see what it wants. userData.bedAnchor: the load starts there (columns go toward -Z).
 */
export function makeWagon(color = C.red, emblem = 'bread') {
  const g = new THREE.Group();
  const b = new Parts();
  const dark = new THREE.Color(color).multiplyScalar(0.72).getHex();
  b.rbox(C.black, 1.4, 0.24, 3.7, 0.06, [0, 0.66, 0], null, null, 1);
  b.rbox(C.woodLight, 1.72, 0.12, 3.6, 0.04, [0, 0.84, 0], null, null, 1);
  for (const sx of [-1, 1]) {
    b.rbox(color, 0.12, 0.62, 3.6, 0.04, [sx * 0.84, 1.18, 0], null, null, 1);
    b.box(dark, 0.16, 0.08, 3.64, [sx * 0.84, 1.5, 0]);
    for (const z of [-1.5, -0.5, 0.5, 1.5]) b.box(dark, 0.16, 0.62, 0.1, [sx * 0.85, 1.18, z]);
    // the emblem plate
    b.cyl(C.cream, 0.27, 0.27, 0.05, [sx * 0.92, 1.2, 0], Z90, 14);
    if (emblem === 'bread') b.sph(C.bread, 0.13, [sx * 0.95, 1.2, 0], [0.3, 0.85, 1.6], null, 7, 5);
    else if (emblem === 'cheese') { b.cyl(C.cheese, 0.17, 0.17, 0.07, [sx * 0.95, 1.2, 0], Z90, 3); }
    else { b.sph(C.pumpkin, 0.15, [sx * 0.95, 1.18, 0], [0.3, 0.85, 1.05], null, 7, 5); b.box(C.stem, 0.06, 0.08, 0.05, [sx * 0.95, 1.35, 0]); }
  }
  for (const sz of [-1, 1]) b.rbox(color, 1.72, 0.62, 0.12, 0.04, [0, 1.18, sz * 1.76], null, null, 1);
  b.box(C.iron, 0.2, 0.14, 0.6, [0, 0.66, 2.0]); b.box(C.iron, 0.2, 0.14, 0.6, [0, 0.66, -2.0]);
  const wp = wheelPair(0.36, 0.74, C.black, C.iron);
  for (const z of [-1.15, 1.15]) b.add(wp, 0xffffff, [0, 0.36, z], null, null, true);
  g.add(meshOf(b.merged({ ao: AO_MID })));
  const bed = new THREE.Object3D();
  bed.position.set(0, 0.91, 1.28);
  g.add(bed);
  g.userData.bedAnchor = bed;
  addBlob(g, { rx: 1.15, rz: 2.2, yaw: true });
  return g;
}
/** The whole train for the 'train' role: a locomotive and three wagons (bread, cheese, pumpkins). */
export function makeTrain() {
  return { loco: makeLocomotive(), wagons: [makeWagon(C.red, 'bread'), makeWagon(C.blue, 'cheese'), makeWagon(C.green, 'pumpkin')] };
}

// ------------------------------------------------------------------ vehicles ---
/** The combine harvester (harvester role contract): a wide header with a turning reel, facing +Z. */
export function makeCombine() {
  const g = new THREE.Group();
  const b = new Parts();
  b.rbox(C.red, 1.9, 1.25, 2.9, 0.2, [0, 1.45, -0.5]);
  b.rbox(C.redDark, 1.96, 0.3, 2.96, 0.1, [0, 0.9, -0.5], null, null, 1);
  b.rbox(C.gold, 1.7, 0.55, 1.7, 0.12, [0, 2.3, -0.95], null, null, 1);              // grain tank
  b.rbox(C.wheat, 1.45, 0.1, 1.45, 0.04, [0, 2.56, -0.95], null, null, 1);
  b.rbox(C.glass, 1.25, 1.0, 1.05, 0.14, [0, 2.4, 0.55], null, null, 1);              // cab
  b.rbox(C.cream, 1.4, 0.12, 1.2, 0.05, [0, 2.95, 0.55], null, null, 1);
  b.rbox(C.red, 1.3, 0.5, 1.1, 0.1, [0, 1.85, 0.55], null, null, 1);
  b.cyl(C.iron, 0.07, 0.07, 1.0, [0.8, 2.6, -1.6], null, 6);                          // exhaust
  b.cyl(C.gold, 0.14, 0.14, 1.9, [-1.1, 2.5, -0.9], [0.3, 0, 0.9], 8);                // unloading pipe
  b.rbox(C.red, 1.0, 0.45, 1.3, 0.1, [0, 0.9, 1.45], [0.35, 0, 0], null, 1);          // feeder neck
  // header
  b.rbox(C.gold, 4.0, 0.5, 0.9, 0.1, [0, 0.5, 2.25], null, null, 1);
  for (const sx of [-1, 1]) b.rbox(C.redDark, 0.12, 0.95, 1.35, 0.05, [sx * 2.02, 0.62, 2.45], null, null, 1);
  for (let i = 0; i < 9; i++) b.cone(C.iron, 0.07, 0.4, [(i - 4) * 0.45, 0.22, 2.85], X90, 4);
  for (const sx of [-1, 1]) b.sph(C.glow, 0.11, [sx * 0.72, 1.55, 1.0], null, null, 6, 5);
  g.add(meshOf(b.merged({ ao: AO_MID })));

  const reel = new THREE.Group();
  const r = new Parts();
  r.cyl(C.iron, 0.07, 0.07, 3.9, [0, 0, 0], Z90, 6);
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2, y = Math.cos(a) * 0.5, z = Math.sin(a) * 0.5;
    r.box(C.cream, 3.8, 0.07, 0.12, [0, y, z], [a, 0, 0]);
    for (const sx of [-1, 1]) r.box(C.red, 0.06, 0.5, 0.06, [sx * 1.85, y / 2, z / 2], [a, 0, 0]);
  }
  reel.add(meshOf(r.merged()));
  reel.position.set(0, 0.95, 2.75);
  g.add(reel);

  const wheels = [];
  const front = meshOf(wheelPair(0.78, 1.08, C.black, C.gold)); front.position.set(0, 0.78, 0.45); g.add(front); wheels.push(front);
  const rear = meshOf(wheelPair(0.48, 0.95, C.black, C.gold)); rear.position.set(0, 0.48, -1.5); g.add(rear); wheels.push(rear);
  const bed = new THREE.Object3D();
  bed.position.set(0, 2.62, -0.6);
  g.add(bed);
  g.userData = { wheels, blade: reel, bedAnchor: bed, bob: 0, blobLength: 2.9, blobOffset: 0.6 };
  return g;
}

/** The bakery's delivery truck (vendor role): the pack flatbed. */
export function makeBakeryTruck() {
  const g = new THREE.Group();
  g.add(getModel('car-kit/delivery-flat', { receive: true }));
  const bed = new THREE.Object3D();
  bed.position.set(0, 0.86, -0.25);
  g.add(bed);
  g.userData.bedAnchor = bed;
  g.userData.wheels = [];
  addBlob(g, { rx: 1.1, rz: 2.3, yaw: true });
  return g;
}

// ----------------------------------------------------------------- the town ---
const COTTAGES = [
  { wall: 0xfff0d2, roof: C.roofRed, trim: C.woodDark },
  { wall: 0xffe2c0, roof: C.slate, trim: C.tealDark },
  { wall: 0xf7f2e2, roof: C.thatch, trim: C.woodDark },
  { wall: 0xffd9b8, roof: C.roofGreen, trim: C.woodDark },
  { wall: 0xe9f1f4, roof: C.roofBlue, trim: C.blueDark },
];
/** Add a cottage to `b` at (x, z): door and windows face the camera (-X and -Z). v = variant, s = size. */
export function cottage(b, x, z, v = 0, s = 1, ridge = 'z') {
  const K = COTTAGES[v % COTTAGES.length];
  const w = 2.7 * s, d = 2.5 * s, h = 1.9 * s;
  const p = new Parts();
  p.rbox(C.stone, w + 0.2, 0.24, d + 0.2, 0.06, [0, 0.12, 0], null, null, 1);
  p.rbox(K.wall, w, h, d, 0.1, [0, 0.2 + h / 2, 0], null, null, 1);
  if (ridge === 'z') gable(p, K.roof, w + 0.5, 1.2 * s, d + 0.5, [0, h + 0.15, 0]);
  else gable(p, K.roof, d + 0.5, 1.2 * s, w + 0.5, [0, h + 0.15, 0], 'x');
  p.rbox(C.brick, 0.42 * s, 1.1 * s, 0.42 * s, 0.04, [w * 0.24, h + 0.85 * s, d * 0.2], null, null, 1);
  // -Z face
  p.rbox(K.trim, 0.62 * s, 1.15 * s, 0.14, 0.06, [-w * 0.2, 0.2 + 0.58 * s, -d / 2 - 0.02], null, null, 1);
  p.rbox(C.glassDark, 0.6 * s, 0.55 * s, 0.14, 0.06, [w * 0.22, 0.2 + h * 0.58, -d / 2 - 0.02], null, null, 1);
  p.rbox(C.red, 0.7 * s, 0.14, 0.24, 0.04, [w * 0.22, 0.2 + h * 0.36, -d / 2 - 0.1], null, null, 1);
  // -X face
  p.rbox(C.glassDark, 0.14, 0.55 * s, 0.6 * s, 0.06, [-w / 2 - 0.02, 0.2 + h * 0.58, d * 0.18], null, null, 1);
  p.rbox(C.glassDark, 0.14, 0.55 * s, 0.6 * s, 0.06, [-w / 2 - 0.02, 0.2 + h * 0.58, -d * 0.22], null, null, 1);
  b.append(p, [x, 0, z]);
}
export function addLamp(b, x, z, dx, dz, h) { lamp(b, x, z, dx, dz, h); }
export function addBunting(b, a, c, n, colors) { bunting(b, a, c, n, colors); }
export function addCrate(b, x, z, s, yaw, c) { crate(b, x, 0, z, s, yaw, c); }
export function addBarrel(b, x, z, r, h) { barrel(b, x, z, r, h); }
export function addPumpkin(b, x, z, k = 1, y = 0) { pumpkinAt(b, x, y, z, k); }

/** The town fountain: a stone basin, water and a tiered spout. userData.water (Mesh) for a ripple. */
export function makeFountain() {
  const g = new THREE.Group();
  const b = new Parts();
  b.rcyl(C.stone, 1.45, 0.42, 0.1, [0, 0.21, 0], null, 18);
  b.torus(C.stoneDark, 1.38, 0.1, [0, 0.42, 0], X90, null, Math.PI * 2, 5, 18);
  b.cyl(C.water, 1.28, 1.28, 0.04, [0, 0.4, 0], null, 18);
  b.cyl(C.stone, 0.2, 0.3, 0.9, [0, 0.85, 0], null, 10);
  b.cyl(C.stone, 0.7, 0.24, 0.22, [0, 1.36, 0], null, 12);
  b.cyl(C.waterLight, 0.62, 0.62, 0.04, [0, 1.47, 0], null, 12);
  b.cyl(C.stone, 0.1, 0.14, 0.5, [0, 1.7, 0], null, 8);
  b.sph(C.waterLight, 0.2, [0, 2.0, 0], [1, 1.3, 1], null, 8, 6);
  for (let i = 0; i < 6; i++) { const a = i * 1.047; b.sph(C.waterLight, 0.07, [Math.cos(a) * 0.45, 1.75 - (i % 2) * 0.12, Math.sin(a) * 0.45], [1, 1.6, 1], null, 5, 4); }
  g.add(meshOf(b.merged({ ao: AO_MID }), { receive: true }));
  return g;
}

// ------------------------------------------------------------- the harvest fair ---
/**
 * The Harvest Fair: a big wheel with round gondolas, a striped big top, a carousel, booths, balloons
 * and bunting. Returns a Group (about 13 across, the wheel 10.5 tall);
 * userData { wheel (rotate about local Z), carousel (rotate about Y) }.
 */
export function makeFair() {
  const g = new THREE.Group();
  const b = new Parts();
  // trodden fairground and a ring of straw
  b.rcyl(0xe6cf9a, 6.6, 0.1, 0.04, [0, 0.05, 0], null, 28);
  // the wheel's A-frame (the wheel faces the camera: its axle runs along the camera diagonal)
  const HUB = 5.6, ax = D, az = D;      // axle direction (x, z); the frames stand in front of and behind the wheel
  for (const k of [-1, 1]) {
    const cx = 1.5 + k * ax * 0.7, cz = 1.5 + k * az * 0.7;
    for (const s of [-1, 1]) {
      const fx = cx + s * (-az) * 2.4, fz = cz + s * ax * 2.4;
      const mx = (fx + cx) / 2, mz = (fz + cz) / 2, len = Math.hypot(2.4, HUB);
      b.cyl(C.cream, 0.13, 0.16, len, [mx, HUB / 2, mz], [0, FACE_CAMERA, s * Math.atan2(2.4, HUB)], 7);
    }
    b.rcyl(C.red, 0.32, 0.3, 0.06, [cx, HUB, cz], [Math.PI / 2, 0, -Math.PI / 4], 10);
  }
  // the big top
  const TX = -3.4, TZ = 0.6;
  striped(b, [C.red, C.cream], 2.6, 1.7, 14, [TX, 0.1, TZ], 2.6, 1.7);
  striped(b, [C.cream, C.red], 2.9, 2.0, 14, [TX, 1.8, TZ]);
  b.cyl(C.woodDark, 0.05, 0.05, 1.0, [TX, 4.2, TZ], null, 5);
  b.cone(C.gold, 0.2, 0.5, [TX + 0.25, 4.5, TZ], [0, 0, -Math.PI / 2], 4, [1, 1, 0.2]);
  b.rbox(0x4a2f22, 0.9, 1.3, 0.2, 0.2, [TX - D * 2.5, 0.75, TZ - D * 2.5], [0, Math.PI / 4, 0], null, 1);
  // booths with striped roofs
  for (const [x, z, c] of [[-0.6, -4.2, C.blue], [2.6, -3.9, C.green], [-4.6, -3.3, C.gold]]) {
    b.rbox(C.woodLight, 1.7, 0.9, 1.2, 0.06, [x, 0.55, z], null, null, 1);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.box(C.wood, 0.09, 1.6, 0.09, [x + sx * 0.8, 1.5, z + sz * 0.55]);
    for (let i = 0; i < 5; i++) b.box(i % 2 ? C.cream : c, 0.37, 0.07, 1.6, [x - 0.74 + i * 0.37, 2.32 - Math.abs(i - 2) * 0.0, z], [0, 0, 0]);
    gable(b, c, 1.95, 0.4, 1.7, [x, 2.36, z], 'x');
    pumpkinAt(b, x - 0.4, 1.0, z - 0.2, 0.9);
    b.rcyl(C.cheese, 0.2, 0.14, 0.04, [x + 0.35, 1.08, z - 0.15], null, 10);
  }
  // balloons
  const BAL = [C.red, C.gold, C.blue, C.pink, C.green, C.purple, C.orange];
  for (const [x, z, n] of [[4.9, -1.6, 5], [-5.6, 2.6, 4], [0.6, -5.6, 4]]) {
    b.cyl(C.woodDark, 0.05, 0.07, 1.3, [x, 0.65, z], null, 5);
    for (let i = 0; i < n; i++) {
      const a = i * 1.3, r = 0.28 + (i % 2) * 0.16, y = 2.5 + (i % 3) * 0.42;
      b.sph(BAL[(i + n) % BAL.length], 0.3, [x + Math.cos(a) * r, y, z + Math.sin(a) * r], [1, 1.2, 1], null, 8, 6);
      b.box(C.cream, 0.015, y - 1.55, 0.015, [x + Math.cos(a) * r * 0.5, (y + 1.0) / 2, z + Math.sin(a) * r * 0.5], [Math.sin(a) * 0.2, 0, -Math.cos(a) * 0.2]);
    }
  }
  // flag poles and bunting round the ground
  const poles = [[-6.2, -1.2], [-2.6, -5.9], [2.2, -5.8], [5.9, -3.0], [6.3, 1.8]];
  for (const [x, z] of poles) { b.cyl(C.cream, 0.06, 0.08, 3.6, [x, 1.8, z], null, 6); b.sph(C.gold, 0.11, [x, 3.66, z], null, null, 6, 5); }
  for (let i = 0; i < poles.length - 1; i++) bunting(b, [poles[i][0], 3.4, poles[i][1]], [poles[i + 1][0], 3.4, poles[i + 1][1]], 9);
  hayBale(b, 4.2, -4.6, 0.8); hayBale(b, -1.9, -5.2, -0.4, 0.5, 0.8);
  addPumpkin(b, 3.5, -5.3, 1.7); addPumpkin(b, 4.6, -5.6, 1.2); addPumpkin(b, -2.9, -4.4, 1.4);
  g.add(meshOf(b.merged({ ao: AO_BIG }), { receive: true }));

  // the wheel
  const wheel = new THREE.Group();
  const w = new Parts();
  const R = 4.4, N = 10;
  for (const z of [-0.42, 0.42]) {
    w.torus(C.red, R, 0.09, [0, 0, z], null, null, Math.PI * 2, 5, 30);
    w.torus(C.gold, R * 0.55, 0.05, [0, 0, z], null, null, Math.PI * 2, 4, 24);
    for (let i = 0; i < N; i++) { const a = (i / N) * Math.PI * 2; w.box(C.cream, 0.07, R, 0.05, [Math.sin(a) * R / 2, Math.cos(a) * R / 2, z], [0, 0, -a]); }
  }
  w.cyl(C.gold, 0.4, 0.4, 1.1, [0, 0, 0], X90, 12);
  for (let i = 0; i < N; i++) {
    const a = (i / N) * Math.PI * 2, x = Math.sin(a) * R, y = Math.cos(a) * R;
    w.cyl(C.iron, 0.04, 0.04, 0.9, [x, y, 0], X90, 5);
    w.cyl(BAL[i % BAL.length], 0.46, 0.46, 0.6, [x, y, 0], X90, 12);       // round gondolas look right at any angle
    w.cyl(C.cream, 0.3, 0.3, 0.64, [x, y, 0], X90, 10);
  }
  wheel.add(meshOf(w.merged()));
  wheel.position.set(1.5, HUB, 1.5);
  wheel.rotation.y = FACE_CAMERA;
  g.add(wheel);

  // the carousel
  const car = new THREE.Group();
  const c = new Parts();
  c.rcyl(C.red, 1.5, 0.22, 0.06, [0, 0.2, 0], null, 18);
  c.cyl(C.gold, 0.16, 0.16, 2.3, [0, 1.3, 0], null, 8);
  striped(c, [C.cream, C.blue], 1.75, 0.9, 12, [0, 2.3, 0]);
  c.sph(C.gold, 0.14, [0, 3.26, 0], null, null, 6, 5);
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2, x = Math.cos(a) * 1.05, z = Math.sin(a) * 1.05;
    c.cyl(C.gold, 0.03, 0.03, 2.0, [x, 1.3, z], null, 5);
    c.sph(i % 2 ? C.cream : C.pink, 0.2, [x, 0.95 + (i % 2) * 0.25, z], [0.8, 0.9, 1.7], [0, -a, 0], 7, 5);
    c.sph(i % 2 ? C.cream : C.pink, 0.12, [x - Math.sin(a) * 0.3, 1.18 + (i % 2) * 0.25, z + Math.cos(a) * 0.3], null, null, 6, 4);
  }
  car.add(meshOf(c.merged({ ao: AO_MID })));
  car.position.set(1.4, 0.1, -2.6);
  g.add(car);
  g.userData = { wheel, carousel: car };
  return g;
}

/** The fairground before the fair: a sign, a few stakes with bunting and bales. */
export function makeFairSite() {
  const b = new Parts();
  b.rcyl(0xe6cf9a, 5.2, 0.08, 0.03, [0, 0.04, 0], null, 24);
  const poles = [[-4.4, -1.5], [-1.2, -4.4], [3.2, -3.6]];
  for (const [x, z] of poles) b.cyl(C.cream, 0.06, 0.08, 2.6, [x, 1.3, z], null, 6);
  bunting(b, [-4.4, 2.5, -1.5], [-1.2, 2.5, -4.4], 8);
  bunting(b, [-1.2, 2.5, -4.4], [3.2, 2.5, -3.6], 8);
  hayBale(b, 2.4, 1.2, 0.5); hayBale(b, 1.3, 2.0, 1.2); hayBale(b, 1.9, 1.6, 0.8, 0.5, 0.85, 0.9);
  addPumpkin(b, -0.6, 0.4, 2.2); addPumpkin(b, 0.7, -0.5, 1.4);
  return b.merged({ ao: AO_MID });
}

/** The travel gate: two posts wound with wheat, a beam and a row of pennants. */
export function makeGateArch(width = 6) {
  const b = new Parts();
  for (const sx of [-1, 1]) {
    b.rbox(C.wood, 0.5, 3.6, 0.5, 0.1, [sx * width / 2, 1.8, 0], null, null, 1);
    b.rcyl(C.stone, 0.6, 0.3, 0.08, [sx * width / 2, 0.15, 0], null, 12);
    b.sph(C.gold, 0.26, [sx * width / 2, 3.8, 0], null, null, 8, 6);
    for (let i = 0; i < 4; i++) b.cone(C.wheat, 0.07, 0.9, [sx * (width / 2 - 0.34), 1.1 + i * 0.1, (i - 1.5) * 0.12], [0, 0, sx * 0.3], 4);
  }
  b.rbox(C.woodDark, width + 1.2, 0.5, 0.5, 0.14, [0, 3.35, 0], null, null, 1);
  b.rbox(C.red, 2.2, 0.8, 0.12, 0.06, [0, 2.75, 0], null, null, 1);
  b.sph(C.gold, 0.24, [0, 2.75, -0.08], [1, 1, 0.4], null, 8, 6);
  bunting(b, [-width / 2 + 0.4, 3.05, -0.3], [width / 2 - 0.4, 3.05, -0.3], 9);
  return b.merged({ ao: AO_BIG });
}

/** A level-crossing barrier: a post and a striped arm along +X; userData.arm lifts (rotation.z). */
export function makeBarrier() {
  const g = new THREE.Group();
  const b = new Parts();
  b.rbox(C.cream, 0.3, 1.2, 0.3, 0.06, [0, 0.6, 0], null, null, 1);
  b.rbox(C.red, 0.34, 0.2, 0.34, 0.05, [0, 1.25, 0], null, null, 1);
  b.sph(C.red, 0.12, [0, 1.5, 0], null, null, 6, 5);
  g.add(meshOf(b.merged({ ao: AO_MID })));
  const arm = new THREE.Group();
  const a = new Parts();
  for (let i = 0; i < 6; i++) a.rbox(i % 2 ? C.cream : C.red, 0.6, 0.12, 0.08, 0.03, [0.3 + i * 0.6, 0, 0], null, null, 1);
  arm.add(meshOf(a.merged()));
  arm.position.set(0, 1.0, 0);
  g.add(arm);
  g.userData.arm = arm;
  return g;
}

/** A soft round patch of warm light on the ground (unlit, additive). */
export function makeGlow(radius, color, opacity = 0.5) {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const ctx = c.getContext('2d');
  const gr = ctx.createRadialGradient(64, 64, 4, 64, 64, 64);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.5, 'rgba(255,255,255,0.35)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = gr; ctx.fillRect(0, 0, 128, 128);
  const m = new THREE.Mesh(new THREE.PlaneGeometry(radius * 2, radius * 2),
    new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(c), color, transparent: true, opacity, depthWrite: false, blending: THREE.AdditiveBlending }));
  m.rotation.x = -Math.PI / 2;
  m.renderOrder = 2;
  return m;
}
