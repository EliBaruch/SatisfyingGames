// Chicken farm models, all code-built with the art kit's Parts (smooth rounded toy shapes, vertex
// colours, baked AO) and drawn with the shared lit material: stack items (egg trays, cartons, feed
// sacks), nests, the farm stand counter, the egg packing machine and its belts, the silo / trough
// fill indicators, the hen house, the Giant Golden Egg monument, the travel gate. Pure builders.
import * as THREE from 'three';
import { Parts, meshOf } from '../../engine/art/parts.js';
import { makeCounter as artCounter } from '../../engine/art/props.js';

export const COLORS = {
  egg: 0xfff1dc, eggShade: 0xf3dcbc, gold: 0xffc42e, goldDark: 0xe49a12, goldLight: 0xffe58a,
  straw: 0xe8bd5c, strawDark: 0xcf9b3a, kraft: 0xd9a566, kraftDark: 0xb98448, cream: 0xfff4d6,
  red: 0xe5483c, barn: 0xd9503f, barnDark: 0xa83a2e, roof: 0x7c8794, wood: 0xc98a4b, woodDark: 0x9a6532,
  pulp: 0xdcc9a2, sack: 0xecd7a6, sackBand: 0x58b45a,
};

// shared dimensions so models, stacks and stations agree
export const SIZES = {
  eggTray: { len: 0.84, d: 0.54, h: 0.3 }, eggStep: 0.26,
  carton: { len: 0.86, d: 0.46, h: 0.3 }, cartonStep: 0.3,
  sack: { len: 0.66, d: 0.46, h: 0.34 }, sackStep: 0.3,
  counter: { len: 3.4, depth: 1.2, h: 1.0 },
};

const AO_SMALL = { ground: 0.1, groundH: 0.1, down: 0.05, noBoxes: true };

// ------------------------------------------------------------------ items ---
/** An egg tray (2 x 3 eggs) lying flat: the carried "egg" item. Origin bottom-centre, long axis X. */
export function makeEggTrayGeometry(gold = false) {
  const b = new Parts();
  const { len, d } = SIZES.eggTray;
  const shell = gold ? COLORS.gold : COLORS.egg, shade = gold ? COLORS.goldDark : COLORS.eggShade;
  b.rbox(gold ? 0xb98a3c : COLORS.pulp, len, 0.07, d, 0.03, [0, 0.035, 0], null, null, 1);
  for (let i = 0; i < 3; i++) for (let j = 0; j < 2; j++) {
    const x = (i - 1) * 0.265, z = (j - 0.5) * 0.25;
    b.cyl(gold ? 0xb98a3c : COLORS.pulp, 0.095, 0.075, 0.06, [x, 0.08, z], null, 6);
    b.sph((i + j) % 2 ? shade : shell, 0.09, [x, 0.17, z], [1, 1.32, 1], null, 6, 5);
  }
  return b.merged({ ao: AO_SMALL });
}

/** A packed egg carton (printed lid, belly band, egg badge). Gold variant for premium cartons. */
export function makeCartonGeometry(gold = false) {
  const b = new Parts();
  const { len, d, h } = SIZES.carton;
  const body = gold ? 0xf0b838 : COLORS.kraft, lid = gold ? 0xfff0b0 : COLORS.cream, band = gold ? 0xe5483c : COLORS.red;
  b.rbox(body, len, h * 0.7, d, 0.06, [0, h * 0.35, 0], null, null, 1);
  b.rbox(lid, len - 0.04, h * 0.34, d - 0.03, 0.08, [0, h * 0.7, 0], null, null, 1);
  b.rbox(band, 0.2, h * 1.0, d + 0.02, 0.04, [-len * 0.22, h * 0.5, 0], null, null, 1);
  b.sph(gold ? COLORS.gold : COLORS.egg, 0.1, [len * 0.14, h * 0.86, 0], [1, 0.55, 1.2], null, 7, 5);
  b.sph(gold ? COLORS.goldLight : COLORS.eggShade, 0.07, [len * 0.3, h * 0.84, 0.02], [1, 0.5, 1.2], null, 6, 4);
  return b.merged({ ao: AO_SMALL });
}

/** A sack of chicken feed with a tied neck and a green band. */
export function makeFeedSackGeometry() {
  const b = new Parts();
  const { len, d, h } = SIZES.sack;
  b.rbox(COLORS.sack, len, h * 0.88, d, 0.13, [0, h * 0.44, 0], null, null, 2);
  b.rbox(COLORS.sackBand, len * 0.36, h * 0.6, d + 0.02, 0.05, [0, h * 0.42, 0], null, null, 1);
  b.sph(0xffd54a, 0.07, [0, h * 0.44, d / 2 + 0.01], [1, 0.8, 0.4], null, 6, 4);
  b.sph(COLORS.sack, 0.1, [len * 0.36, h * 0.9, 0], [1, 0.6, 0.9], null, 6, 4);
  b.sph(COLORS.sack, 0.1, [-len * 0.36, h * 0.9, 0], [1, 0.6, 0.9], null, 6, 4);
  b.cyl(0x9a6532, 0.03, 0.03, 0.06, [0, h * 0.97, 0], [0, 0, Math.PI / 2], 6);
  return b.merged({ ao: AO_SMALL });
}

// ------------------------------------------------------------------ nests ---
function nestParts(b, egg, gold) {
  b.cyl(COLORS.strawDark, 0.4, 0.42, 0.1, [0, 0.05, 0], null, 12);
  b.torus(COLORS.straw, 0.34, 0.1, [0, 0.12, 0], [Math.PI / 2, 0, 0], [1, 1, 1], Math.PI * 2, 6, 14);
  b.cyl(COLORS.straw, 0.3, 0.3, 0.06, [0, 0.12, 0], null, 12);
  for (let i = 0; i < 6; i++) b.sph(i % 2 ? COLORS.strawDark : COLORS.straw, 0.07, [Math.cos(i * 1.05) * 0.4, 0.2, Math.sin(i * 1.05) * 0.4], [2, 0.4, 0.7], [0, -i * 1.05, 0], 4, 3);
  if (egg) {
    const shell = gold ? COLORS.gold : COLORS.egg, shade = gold ? COLORS.goldDark : COLORS.eggShade;
    b.sph(shell, 0.17, [0.02, 0.3, 0.02], [1, 1.28, 1], [0, 0, 0.18], 8, 6);
    if (!gold) b.sph(shade, 0.1, [-0.14, 0.2, -0.08], [1, 0.85, 1], null, 5, 4);
  }
}
/** nest holding an egg (the source's `plant`) */
export function makeNestWithEgg(gold = false) {
  const b = new Parts(); nestParts(b, true, gold);
  return b.merged({ ao: { ground: 0.1, groundH: 0.16, down: 0.05, noBoxes: true } });
}
/** empty straw nest (the source's `stub`) */
export function makeEmptyNest() {
  const b = new Parts(); nestParts(b, false, false);
  return b.merged({ ao: { ground: 0.1, groundH: 0.16, down: 0.05, noBoxes: true } });
}

// ----------------------------------------------------------------- counter ---
export function makeStandCounter(accent = 0x58b45a) {
  // the art kit's counter with a striped awning over it
  const g = new THREE.Group();
  g.add(artCounter({ ...SIZES.counter, accent, wood: 0xcf9a5a, top: 0xfff3d6, register: true }));
  return g;
}

/** Striped awning + posts over the stand (long axis Z like the counter, customer side +X). */
export function makeAwning(len = 3.8, c1 = 0xe5483c, c2 = 0xfff4e0) {
  const b = new Parts();
  const n = 7, seg = len / n, y0 = 2.45, depth = 2.4;
  for (let i = 0; i < n; i++) {
    b.rbox(i % 2 ? c2 : c1, depth, 0.1, seg + 0.01, 0.04, [0.0, y0, -len / 2 + (i + 0.5) * seg], [0, 0, -0.17], null, 1);
    b.sph(i % 2 ? c2 : c1, 0.16, [depth / 2 + 0.05, y0 - 0.38, -len / 2 + (i + 0.5) * seg], [0.5, 0.9, 1.4], null, 6, 4);
  }
  for (const z of [-len / 2 + 0.1, len / 2 - 0.1]) b.rbox(COLORS.woodDark, 0.14, y0 + 0.1, 0.14, 0.05, [-depth / 2 + 0.2, (y0 + 0.1) / 2, z], null, null, 1);
  b.rbox(COLORS.wood, 0.1, 0.12, len, 0.04, [-depth / 2 + 0.25, y0 + 0.28, 0], null, null, 1);
  return b.merged({ ao: AO_SMALL });
}
