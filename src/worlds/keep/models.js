// Ironwall Keep models, all code-built with the art kit's Parts (rounded toy shapes, vertex colours,
// baked AO) and drawn with the shared lit material: stack items (logs, arrow bundles, iron ore, bolt
// crates, ballista spears, stones, boulders), the oaks, ore veins and quarry rocks, the raiders and
// their kin, the war engines (archer and crossbow towers, ballistae, catapults, the great trebuchet),
// what they shoot, the stone wall and gatehouse, the workshops, the war chest, the citadel. Pure builders.
import * as THREE from 'three';
import { Parts, meshOf } from '../../engine/art/parts.js';

export const COLORS = {
  grass: 0x7fb04a, grassDark: 0x5f9138, dirt: 0xb48a5a, dirtDark: 0x8f6a42,
  stone: 0xc9c1b2, stoneDark: 0x9c9384, stoneLight: 0xe2dccf, slate: 0x5c6675, slateDark: 0x434b57,
  wood: 0xb47a42, woodDark: 0x7f5129, woodLight: 0xd9a96c, bark: 0x6f4a2c, leaf: 0x4f9a3a, leafDark: 0x3c7d2e, leafLight: 0x6fbb4a,
  iron: 0x5b6270, ironLight: 0x9aa3b2, steel: 0xdfe6f0, gold: 0xffc42e, goldDark: 0xd99a1a,
  red: 0xd23c3c, redDark: 0x9e2a2a, blue: 0x2f6fd0, blueDark: 0x22509a, cream: 0xf3e6c8,
  rope: 0xe9d8a6, feather: 0xf7f3ea, ore: 0x6b5a50, oreRust: 0xc0703a, ember: 0xff7a2a, flame: 0xffc233,
  skin: 0xf0c49a, skinGreen: 0x8fbf5a, skinOgre: 0x9a8f6a, leather: 0x8a5a32, hood: 0x5a3f7a, hoodDark: 0x412c5a,
  raiderCloth: 0x8c3b2e, black: 0x2a2626,
};

export const SIZES = {
  log: { len: 0.86, d: 0.46 }, logStep: 0.27,
  arrows: { len: 0.9, d: 0.34 }, arrowsStep: 0.2,
  ore: { len: 0.6, d: 0.48 }, oreStep: 0.3,
  bolts: { len: 0.72, d: 0.46 }, boltsStep: 0.3,
  spear: { len: 1.3, d: 0.3 }, spearStep: 0.2,
  stone: { len: 0.56, d: 0.5 }, stoneStep: 0.36,
  boulder: { len: 0.9, d: 0.82 }, boulderStep: 0.66,
};

const AO_SMALL = { ground: 0.1, groundH: 0.1, down: 0.05, noBoxes: true };
const AO_BIG = { ground: 0.2, groundH: 0.6, down: 0.06, noBoxes: true };
const AO_FOE = { ground: 0.2, groundH: 0.4, down: 0.12, noBoxes: true };
const Z90 = [0, 0, Math.PI / 2];
const X90 = [Math.PI / 2, 0, 0];

// ------------------------------------------------------------------ items ---
export function makeLogGeometry() {
  const b = new Parts();
  const { len } = SIZES.log;
  for (const [y, z] of [[0.1, -0.11], [0.1, 0.11], [0.26, 0]]) {
    b.cyl(COLORS.bark, 0.1, 0.1, len, [0, y, z], Z90, 7);
    for (const sx of [-1, 1]) b.cyl(COLORS.woodLight, 0.085, 0.085, 0.012, [sx * (len / 2 + 0.002), y, z], Z90, 7);
  }
  for (const x of [-0.24, 0.24]) b.box(COLORS.rope, 0.06, 0.34, 0.44, [x, 0.17, 0]);
  return b.merged({ ao: AO_SMALL });
}

/** A tied bundle of arrows: shafts, steel heads one end, white fletching the other. */
export function makeArrowsGeometry() {
  const b = new Parts();
  const L = SIZES.arrows.len;
  for (const [y, z] of [[0.05, -0.09], [0.05, 0.09], [0.13, 0]]) {
    b.cyl(COLORS.woodLight, 0.026, 0.026, L - 0.16, [-0.04, y, z], Z90, 4);
    b.cone(COLORS.steel, 0.05, 0.14, [L / 2 - 0.06, y, z], [0, 0, -Math.PI / 2], 4);
    b.box(COLORS.feather, 0.16, 0.09, 0.025, [-L / 2 + 0.08, y + 0.02, z]);
    b.box(COLORS.red, 0.16, 0.025, 0.08, [-L / 2 + 0.08, y, z]);
  }
  b.box(COLORS.leather, 0.07, 0.24, 0.3, [0.05, 0.1, 0]);
  return b.merged({ ao: AO_SMALL });
}

/** A lump of iron ore with rusty seams. */
export function makeOreGeometry() {
  const b = new Parts();
  b.ico(COLORS.ore, 0.26, [-0.06, 0.18, 0], [1.2, 0.7, 0.95]);
  b.ico(COLORS.slateDark, 0.18, [0.16, 0.14, 0.05], [1, 0.8, 1], [0, 0.7, 0]);
  b.ico(COLORS.oreRust, 0.09, [-0.1, 0.32, 0.08], [1.4, 0.5, 1]);
  b.ico(COLORS.oreRust, 0.07, [0.12, 0.25, -0.12], [1.2, 0.6, 1]);
  b.ico(COLORS.ironLight, 0.05, [0.02, 0.33, -0.05]);
  return b.merged({ ao: AO_SMALL });
}

/** A small iron-banded crate of crossbow bolts, the heads poking out of the top. */
export function makeBoltsGeometry() {
  const b = new Parts();
  const { len, d } = SIZES.bolts;
  b.rbox(COLORS.wood, len, 0.24, d, 0.03, [0, 0.12, 0], null, null, 1);
  for (const x of [-len / 2 + 0.08, len / 2 - 0.08]) b.box(COLORS.iron, 0.06, 0.25, d + 0.02, [x, 0.125, 0]);
  for (let i = 0; i < 4; i++) {
    const x = -0.2 + i * 0.13;
    b.cyl(COLORS.woodDark, 0.02, 0.02, 0.18, [x, 0.3, 0], null, 5);
    b.cone(COLORS.steel, 0.04, 0.09, [x, 0.42, 0], null, 4);
  }
  return b.merged({ ao: AO_SMALL });
}

/** A ballista spear: a long shaft with a broad steel head and leather vanes. */
export function makeSpearGeometry() {
  const b = new Parts();
  const L = SIZES.spear.len;
  for (const z of [-0.07, 0.07]) {
    b.cyl(COLORS.woodDark, 0.04, 0.04, L - 0.2, [-0.06, 0.07, z], Z90, 6);
    b.cone(COLORS.steel, 0.07, 0.22, [L / 2 - 0.1, 0.07, z], [0, 0, -Math.PI / 2], 4);
    b.rbox(COLORS.leather, 0.2, 0.1, 0.02, 0.01, [-L / 2 + 0.12, 0.1, z], null, null, 1);
  }
  b.rbox(COLORS.rope, 0.05, 0.12, 0.28, 0.02, [0, 0.07, 0], null, null, 1);
  return b.merged({ ao: AO_SMALL });
}

/** A rough quarried stone (catapult shot). */
export function makeStoneGeometry() {
  const b = new Parts();
  b.ico(COLORS.stone, 0.26, [0, 0.21, 0], [1.05, 0.82, 0.95]);
  b.ico(COLORS.stoneDark, 0.14, [0.12, 0.3, 0.08], [1, 0.6, 1], [0, 0.6, 0]);
  return b.merged({ ao: AO_SMALL });
}

/** A great dressed boulder bound with an iron ring (trebuchet shot). */
export function makeBoulderGeometry() {
  const b = new Parts();
  b.sph(COLORS.stoneDark, 0.4, [0, 0.36, 0], [1.1, 0.9, 1.0], null, 10, 7);
  b.ico(COLORS.stone, 0.24, [0.15, 0.55, 0.12], [1, 0.6, 1]);
  b.torus(COLORS.iron, 0.4, 0.035, [0, 0.36, 0], [0, 0, 0], [1.1, 0.9, 1.02], Math.PI * 2, 4, 16);
  return b.merged({ ao: AO_SMALL });
}

// --------------------------------------------------------------- harvests ---
export const OAK_HEIGHT = 3.6;
export function makeOakGeometry() {
  const b = new Parts();
  b.cyl(COLORS.bark, 0.18, 0.26, 1.5, [0, 0.75, 0], null, 7);
  b.sph(COLORS.leafDark, 1.05, [0, 2.2, 0], [1, 0.82, 1], null, 8, 5);
  b.sph(COLORS.leaf, 0.85, [0.35, 2.75, 0.2], [1, 0.85, 1], null, 7, 5);
  b.ico(COLORS.leafLight, 0.62, [-0.3, 3.05, -0.25], [1, 0.85, 1]);
  return b.merged({ ao: { ground: 0.25, groundH: 0.8, down: 0.1, noBoxes: true } });
}
export function makeOakStumpGeometry() {
  const b = new Parts();
  b.cyl(COLORS.bark, 0.22, 0.27, 0.32, [0, 0.16, 0], null, 8);
  b.cyl(COLORS.woodLight, 0.21, 0.21, 0.02, [0, 0.325, 0], null, 8);
  for (let i = 0; i < 3; i++) b.box(COLORS.woodLight, 0.16, 0.04, 0.08, [Math.cos(i * 2.1) * 0.42, 0.02, Math.sin(i * 2.1) * 0.42], [0, i, 0]);
  return b.merged({ ao: AO_SMALL });
}
export const VEIN_HEIGHT = 1.3;
/** An iron vein: a dark outcrop streaked with rust. */
export function makeVeinGeometry() {
  const b = new Parts();
  b.ico(COLORS.slate, 0.62, [0, 0.5, 0], [1.1, 0.95, 1]);
  b.ico(COLORS.slateDark, 0.42, [0.4, 0.35, 0.25], [1, 0.9, 1], [0, 0.6, 0]);
  b.ico(COLORS.oreRust, 0.16, [-0.25, 0.85, -0.2], [1.5, 0.6, 1]);
  b.ico(COLORS.oreRust, 0.13, [0.25, 0.72, -0.4], [1.3, 0.6, 1]);
  b.ico(COLORS.ironLight, 0.08, [0.05, 1.0, 0.1]);
  return b.merged({ ao: AO_BIG });
}
export function makeRubbleGeometry() {
  const b = new Parts();
  for (let i = 0; i < 5; i++) b.ico(i % 2 ? COLORS.slate : COLORS.slateDark, 0.14 + (i % 3) * 0.04, [Math.cos(i * 1.3) * 0.32, 0.06, Math.sin(i * 1.3) * 0.32], [1.2, 0.6, 1]);
  return b.merged({ ao: AO_SMALL });
}
export const QUARRY_HEIGHT = 1.2;
/** A pale block of quarry stone with chisel marks. */
export function makeQuarryRockGeometry() {
  const b = new Parts();
  b.rbox(COLORS.stoneLight, 1.15, 0.85, 0.95, 0.12, [0, 0.43, 0], [0, 0.3, 0], null, 1);
  b.rbox(COLORS.stone, 0.7, 0.5, 0.6, 0.08, [0.15, 1.0, -0.05], [0, -0.2, 0], null, 1);
  b.box(COLORS.stoneDark, 0.5, 0.05, 0.02, [0, 0.6, -0.5], [0, 0.3, 0]);
  return b.merged({ ao: AO_BIG });
}
export function makeGravelGeometry() {
  const b = new Parts();
  for (let i = 0; i < 6; i++) b.ico(i % 2 ? COLORS.stone : COLORS.stoneLight, 0.11 + (i % 3) * 0.04, [Math.cos(i * 1.1) * 0.35, 0.05, Math.sin(i * 1.1) * 0.35], [1.2, 0.6, 1]);
  return b.merged({ ao: AO_SMALL });
}

// ------------------------------------------------------------------- foes ---
// all face +Z, origin on the ground (the horde turns them toward the wall)
function humanoid(b, { body, belt, skin, head = 0.24, h = 1.0, wide = 1 }) {
  for (const sx of [-1, 1]) b.cyl(COLORS.black, 0.08 * wide, 0.09 * wide, 0.36 * h, [sx * 0.13 * wide, 0.18 * h, 0], null, 5);
  b.sph(body, 0.3, [0, 0.62 * h, 0], [wide, 1.2 * h, 0.85 * wide], null, 8, 5);
  b.box(belt, 0.6 * wide, 0.08, 0.5 * wide, [0, 0.46 * h, 0]);
  b.sph(skin, head, [0, 1.0 * h + head * 0.6, 0.02], null, null, 7, 5);
  return 1.0 * h + head * 0.6;
}
export const RAIDER_HEIGHT = 1.35;
/** A hooded raider with a spiked club. */
export function makeRaiderGeometry() {
  const b = new Parts();
  const hy = humanoid(b, { body: COLORS.raiderCloth, belt: COLORS.leather, skin: COLORS.skinGreen });
  b.cone(COLORS.hood, 0.3, 0.42, [0, hy + 0.14, -0.04], [-0.25, 0, 0], 8);
  for (const sx of [-1, 1]) { b.sph(0xffef6a, 0.045, [sx * 0.09, hy + 0.02, 0.21], null, null, 4, 3); }
  b.cone(COLORS.skinGreen, 0.06, 0.2, [0.25, hy + 0.05, 0], [0, 0, -1.2], 5);
  b.cone(COLORS.skinGreen, 0.06, 0.2, [-0.25, hy + 0.05, 0], [0, 0, 1.2], 5);
  // the club, raised
  b.cyl(COLORS.woodDark, 0.05, 0.07, 0.7, [0.34, 0.95, 0.15], [0.5, 0, -0.3], 6);
  b.ico(COLORS.wood, 0.15, [0.45, 1.27, 0.32], [1, 1.2, 1]);
  for (let i = 0; i < 3; i++) b.cone(COLORS.ironLight, 0.035, 0.1, [0.45 + Math.cos(i * 2.1) * 0.13, 1.3 + Math.sin(i * 2.1) * 0.1, 0.32 + 0.1], [Math.PI / 2, 0, 0], 3);
  for (const sx of [-1, 1]) b.ico(COLORS.skinGreen, 0.08, [sx * 0.32, 0.68, 0.08]);
  return b.merged({ ao: AO_FOE });
}
export const SHIELD_HEIGHT = 1.5;
/** A shieldbearer: iron cap, a big round shield in front. */
export function makeShieldGeometry() {
  const b = new Parts();
  const hy = humanoid(b, { body: 0x6b5a48, belt: COLORS.black, skin: COLORS.skinGreen, h: 1.08, wide: 1.1 });
  b.sph(COLORS.iron, 0.27, [0, hy + 0.06, 0.0], [1, 0.75, 1], null, 7, 4);
  b.cone(COLORS.ironLight, 0.06, 0.2, [0, hy + 0.28, 0], null, 5);
  for (const sx of [-1, 1]) b.ico(0xff5a3a, 0.045, [sx * 0.09, hy - 0.02, 0.21]);
  // round shield with a boss and rim
  b.cyl(COLORS.redDark, 0.48, 0.48, 0.08, [0, 0.68, 0.36], X90, 12);
  b.torus(COLORS.iron, 0.47, 0.04, [0, 0.68, 0.4], null, null, Math.PI * 2, 3, 12);
  b.ico(COLORS.ironLight, 0.12, [0, 0.68, 0.42], [1, 1, 0.6]);
  b.box(COLORS.cream, 0.08, 0.7, 0.02, [0, 0.68, 0.41]);
  b.cyl(COLORS.woodDark, 0.035, 0.035, 1.4, [0.36, 0.9, 0], [0.15, 0, 0], 5);
  b.cone(COLORS.steel, 0.07, 0.24, [0.36, 1.68, 0.1], [0.15, 0, 0], 4);
  return b.merged({ ao: AO_FOE });
}
export const BRUTE_HEIGHT = 2.3;
/** A hulking brute with a tree-trunk club. */
export function makeBruteGeometry() {
  const b = new Parts();
  for (const sx of [-1, 1]) b.cyl(COLORS.skinOgre, 0.18, 0.2, 0.6, [sx * 0.3, 0.3, 0], null, 7);
  b.sph(COLORS.skinOgre, 0.62, [0, 1.15, 0], [1.1, 1.0, 0.9], null, 8, 6);
  b.sph(0xb7ac84, 0.42, [0, 1.0, 0.25], [1.1, 0.95, 0.6], null, 7, 4);
  b.box(COLORS.leather, 1.2, 0.36, 0.95, [0, 0.66, 0]);
  b.sph(COLORS.skinOgre, 0.36, [0, 1.92, 0.12], [1, 0.9, 1], null, 7, 5);
  for (const sx of [-1, 1]) {
    b.sph(0xff4a2a, 0.06, [sx * 0.13, 1.98, 0.43], null, null, 5, 4);
    b.cone(COLORS.cream, 0.05, 0.16, [sx * 0.12, 1.8, 0.44], [-0.3, 0, 0], 5);
    b.sph(COLORS.skinOgre, 0.17, [sx * 0.66, 1.25, 0.1], [1, 1.6, 1], null, 7, 5);
    b.sph(COLORS.skinOgre, 0.15, [sx * 0.72, 0.82, 0.22], null, null, 7, 5);
  }
  b.cyl(COLORS.bark, 0.12, 0.2, 1.4, [0.78, 1.25, 0.45], [0.8, 0, -0.35], 7);
  b.sph(COLORS.bark, 0.25, [0.98, 1.75, 0.95], [1, 1.3, 1], null, 7, 5);
  return b.merged({ ao: AO_FOE });
}
export const KNIGHT_HEIGHT = 1.75;
/** A black knight: plate, plumed helm, a long blade. Fast. */
export function makeKnightGeometry() {
  const b = new Parts();
  const hy = humanoid(b, { body: COLORS.slateDark, belt: COLORS.goldDark, skin: COLORS.slate, h: 1.15, wide: 1.05, head: 0.26 });
  b.box(COLORS.slate, 0.62, 0.36, 0.44, [0, 0.95, 0]);
  for (const sx of [-1, 1]) b.ico(COLORS.slate, 0.16, [sx * 0.34, 1.05, 0], [1, 0.8, 1]);
  b.box(COLORS.black, 0.3, 0.05, 0.03, [0, hy + 0.02, 0.25]);
  b.ico(COLORS.red, 0.11, [0, hy + 0.3, -0.08], [0.6, 1, 2.2]);
  b.box(COLORS.raiderCloth, 0.56, 0.7, 0.05, [0, 0.75, -0.24], [-0.1, 0, 0]);
  b.box(COLORS.steel, 0.07, 1.1, 0.03, [0.36, 1.05, 0.3], [0.6, 0, 0]);
  b.box(COLORS.goldDark, 0.26, 0.05, 0.06, [0.36, 0.65, 0.05], [0.6, 0, 0]);
  return b.merged({ ao: AO_FOE });
}
export const RAM_HEIGHT = 2.1;
/** A covered battering ram on wheels with an iron-capped trunk, pushed by its crew under the roof. */
export function makeRamGeometry() {
  const b = new Parts();
  for (const sx of [-1, 1]) for (const z of [-0.8, 0.8]) {
    b.cyl(COLORS.woodDark, 0.34, 0.34, 0.14, [sx * 0.82, 0.34, z], Z90, 10);
    b.cyl(COLORS.iron, 0.1, 0.1, 0.16, [sx * 0.82, 0.34, z], Z90, 6);
  }
  b.rbox(COLORS.wood, 1.5, 0.16, 2.4, 0.04, [0, 0.62, 0], null, null, 1);
  for (const sx of [-1, 1]) for (const z of [-1.05, 1.05]) b.cyl(COLORS.woodDark, 0.07, 0.07, 1.1, [sx * 0.66, 1.2, z], null, 6);
  // the roof of hides
  for (const sx of [-1, 1]) b.rbox(sx < 0 ? COLORS.leather : 0x9a6a3a, 1.0, 0.1, 2.6, 0.04, [sx * 0.42, 1.95, 0], [0, 0, sx * -0.55], null, 1);
  b.cyl(COLORS.woodDark, 0.06, 0.06, 2.7, [0, 2.2, 0], X90, 6);
  // the ram itself
  b.cyl(COLORS.bark, 0.22, 0.22, 3.2, [0, 1.0, 0.45], X90, 9);
  b.cyl(COLORS.iron, 0.3, 0.26, 0.4, [0, 1.0, 2.1], X90, 9);
  b.sph(COLORS.ironLight, 0.25, [0, 1.0, 2.3], [1, 1, 0.6], null, 8, 5);
  for (const z of [-0.4, 0.6]) b.cyl(COLORS.rope, 0.02, 0.02, 0.9, [0, 1.5, z], null, 4);
  b.rbox(COLORS.red, 0.04, 0.6, 0.6, 0.02, [-0.86, 1.4, -0.5], [0, 0, 0.55], null, 1);
  return b.merged({ ao: AO_FOE });
}

// ------------------------------------------------------------ projectiles ---
// long axis +Z, centred on the origin
export function shotArrow() {
  const b = new Parts();
  b.cyl(COLORS.woodLight, 0.025, 0.025, 0.9, [0, 0, 0], X90, 4);
  b.cone(COLORS.steel, 0.05, 0.16, [0, 0, 0.5], X90, 4);
  b.rbox(COLORS.feather, 0.02, 0.1, 0.18, 0.01, [0, 0.03, -0.38], null, null, 1);
  b.rbox(COLORS.red, 0.1, 0.02, 0.18, 0.01, [0, 0, -0.38], null, null, 1);
  return b.merged({ ao: false });
}
export function shotBolt() {
  const b = new Parts();
  b.cyl(COLORS.woodDark, 0.035, 0.035, 0.7, [0, 0, 0], X90, 5);
  b.cone(COLORS.steel, 0.07, 0.2, [0, 0, 0.44], X90, 4);
  b.rbox(COLORS.leather, 0.02, 0.1, 0.14, 0.01, [0, 0.04, -0.28], null, null, 1);
  b.rbox(COLORS.leather, 0.1, 0.02, 0.14, 0.01, [0, 0, -0.28], null, null, 1);
  return b.merged({ ao: false });
}
export function shotSpear() {
  const b = new Parts();
  b.cyl(COLORS.woodDark, 0.06, 0.06, 2.2, [0, 0, 0], X90, 6);
  b.cone(COLORS.steel, 0.14, 0.45, [0, 0, 1.3], X90, 4);
  for (const r of [0, Math.PI / 2]) b.rbox(COLORS.red, 0.02, 0.26, 0.4, 0.01, [0, 0, -0.9], [0, 0, r], null, 1);
  return b.merged({ ao: false });
}
export function shotStone() {
  const b = new Parts();
  b.ico(COLORS.stone, 0.36, [0, 0, 0], [1.05, 0.9, 1]);
  b.ico(COLORS.stoneDark, 0.2, [0.16, 0.12, 0.1], [1, 0.7, 1]);
  return b.merged({ ao: false });
}
export function shotBoulder() {
  const b = new Parts();
  b.sph(COLORS.stoneDark, 0.75, [0, 0, 0], [1.05, 0.95, 1], null, 10, 7);
  b.ico(COLORS.stone, 0.42, [0.3, 0.35, 0.2], [1, 0.6, 1]);
  b.torus(COLORS.iron, 0.76, 0.06, [0, 0, 0], null, [1.05, 0.95, 1.02], Math.PI * 2, 4, 16);
  return b.merged({ ao: false });
}

// ------------------------------------------------------------ war engines ---
/** A small archer figure for the crew of a tower (about 1.1 tall), facing +Z. */
function archerParts(b, x, y, z, cloth = COLORS.blue) {
  b.cyl(cloth, 0.16, 0.2, 0.5, [x, y + 0.25, z], null, 7);
  b.sph(COLORS.skin, 0.15, [x, y + 0.66, z], null, null, 7, 5);
  b.sph(COLORS.redDark, 0.155, [x, y + 0.71, z - 0.01], [1, 0.75, 1], null, 7, 4);
  b.torus(COLORS.woodDark, 0.32, 0.025, [x + 0.08, y + 0.48, z + 0.22], [0, Math.PI / 2, 0], [1, 1, 1], Math.PI, 3, 10);
  b.cyl(COLORS.rope, 0.008, 0.008, 0.62, [x + 0.08, y + 0.48, z + 0.22], null, 3);
}

/**
 * An archer tower: a round stone tower with a crenellated top and up to four archers (crew).
 * userData: { head (turns, holds the crew), muzzle, crew [Mesh] }. About 5 tall.
 */
export function makeArcherTower() {
  const g = new THREE.Group();
  const b = new Parts();
  const H = 3.4;
  b.lathe(COLORS.stone, [[1.25, 0], [1.2, 0.3], [1.05, H - 0.2], [1.25, H], [1.25, H + 0.15]], [0, 0, 0], null, 16);
  for (const y of [0.9, 1.9, 2.8]) b.torus(COLORS.stoneDark, 1.18 - (y / H) * 0.15, 0.05, [0, y, 0], X90, null, Math.PI * 2, 4, 16);
  b.rbox(COLORS.woodDark, 0.7, 1.1, 0.2, 0.08, [0, 0.55, -1.12]);
  b.rbox(0x2b3340, 0.22, 0.5, 0.2, 0.06, [0, 2.2, -1.06], null, null, 1);
  b.cyl(COLORS.wood, 1.3, 1.3, 0.12, [0, H + 0.2, 0], null, 16);
  for (let i = 0; i < 10; i++) { const a = (i / 10) * Math.PI * 2; b.rbox(COLORS.stoneLight, 0.38, 0.42, 0.26, 0.05, [Math.cos(a) * 1.18, H + 0.47, Math.sin(a) * 1.18], [0, -a, 0], null, 1); }
  b.cyl(COLORS.woodDark, 0.04, 0.04, 1.6, [0.9, H + 1.0, 0.9], null, 5);
  b.rbox(COLORS.red, 0.04, 0.4, 0.6, 0.02, [0.9, H + 1.55, 0.6], null, null, 1);
  g.add(meshOf(b.merged({ ao: AO_BIG })));
  const head = new THREE.Group();
  head.position.set(0, H + 0.26, 0);
  const crew = [];
  const spots = [[0, 0.35], [-0.55, 0], [0.55, 0], [0, -0.45]];
  for (const [x, z] of spots) {
    const c = new Parts();
    archerParts(c, x, 0, z);
    const m = meshOf(c.merged({ ao: false }), { cast: false });
    head.add(m); crew.push(m);
  }
  g.add(head);
  g.userData = { head, muzzle: { x: 0, y: 0.6, z: 0.6 }, crew, recoil: 0.05 };
  return g;
}

/** A timber crossbow tower: a stone footing, a timber platform and a big crossbow that turns. */
export function makeCrossbowTower() {
  const g = new THREE.Group();
  const b = new Parts();
  const H = 3.6;
  b.rbox(COLORS.stoneDark, 2.3, 0.8, 2.3, 0.12, [0, 0.4, 0]);
  for (const [x, z] of [[-0.85, -0.85], [0.85, -0.85], [-0.85, 0.85], [0.85, 0.85]]) b.cyl(COLORS.woodDark, 0.13, 0.17, H, [x, H / 2 + 0.5, z], null, 7);
  for (const y of [1.6, 2.7]) for (const [x, z, w, d] of [[0, -0.85, 1.8, 0.1], [0, 0.85, 1.8, 0.1], [-0.85, 0, 0.1, 1.8], [0.85, 0, 0.1, 1.8]]) b.rbox(COLORS.wood, w, 0.12, d, 0.03, [x, y, z], null, null, 1);
  b.rbox(COLORS.woodLight, 2.4, 0.18, 2.4, 0.06, [0, H + 0.5, 0], null, null, 1);
  for (const [x, z, w, d] of [[0, -1.12, 2.4, 0.12], [-1.12, 0, 0.12, 2.4], [1.12, 0, 0.12, 2.4]]) b.rbox(COLORS.wood, w, 0.55, d, 0.04, [x, H + 0.85, z], null, null, 1);
  b.cone(COLORS.redDark, 1.5, 1.0, [0, H + 2.65, 0], [0, Math.PI / 4, 0], 4);
  for (const [x, z] of [[-1.0, -1.0], [1.0, -1.0], [-1.0, 1.0], [1.0, 1.0]]) b.cyl(COLORS.woodDark, 0.07, 0.07, 1.6, [x, H + 1.35, z], null, 5);
  g.add(meshOf(b.merged({ ao: AO_BIG })));
  const head = new THREE.Group();
  head.position.set(0, H + 1.05, 0);
  const c = new Parts();
  c.cyl(COLORS.iron, 0.14, 0.18, 0.4, [0, -0.25, 0], null, 8);
  c.rbox(COLORS.woodDark, 0.28, 0.22, 1.7, 0.06, [0, 0.05, 0.15], null, null, 1);
  for (const sx of [-1, 1]) c.rbox(COLORS.iron, 1.0, 0.1, 0.14, 0.04, [sx * 0.5, 0.1, 0.8], [0, sx * 0.4, 0], null, 1);
  c.cyl(COLORS.rope, 0.012, 0.012, 1.8, [0, 0.12, 0.42], Z90, 4);
  c.cyl(COLORS.woodDark, 0.03, 0.03, 0.8, [0, 0.2, 0.6], X90, 5);
  c.cone(COLORS.steel, 0.06, 0.16, [0, 0.2, 1.06], X90, 4);
  archerParts(c, -0.45, -0.25, -0.5, COLORS.redDark);
  head.add(meshOf(c.merged({ ao: false })));
  g.add(head);
  g.userData = { head, muzzle: { x: 0, y: 0.2, z: 1.1 }, crew: [], recoil: 0.2 };
  return g;
}

/** A ballista on a stone bastion: a great bow on a turning carriage. */
export function makeBallista() {
  const g = new THREE.Group();
  const b = new Parts();
  const H = 2.2;
  b.rbox(COLORS.stone, 2.8, H, 2.8, 0.15, [0, H / 2, 0]);
  for (let i = 0; i < 4; i++) for (const s of [-1, 1]) {
    const along = -1.05 + i * 0.7;
    b.rbox(COLORS.stoneLight, 0.4, 0.45, 0.3, 0.05, [along, H + 0.22, s * 1.25], null, null, 1);
    b.rbox(COLORS.stoneLight, 0.3, 0.45, 0.4, 0.05, [s * 1.25, H + 0.22, along], null, null, 1);
  }
  b.rbox(COLORS.woodDark, 0.9, 1.4, 0.22, 0.08, [0, 0.7, -1.42]);
  g.add(meshOf(b.merged({ ao: AO_BIG })));
  const head = new THREE.Group();
  head.position.set(0, H + 0.1, 0);
  const c = new Parts();
  c.cyl(COLORS.wood, 0.5, 0.6, 0.25, [0, 0.12, 0], null, 10);
  for (const sx of [-1, 1]) c.rbox(COLORS.woodDark, 0.14, 0.7, 0.14, 0.04, [sx * 0.3, 0.55, -0.1], null, null, 1);
  c.rbox(COLORS.woodDark, 0.36, 0.26, 2.4, 0.06, [0, 0.95, 0.3], [-0.06, 0, 0], null, 1);
  for (const sx of [-1, 1]) {
    c.rbox(COLORS.wood, 1.4, 0.14, 0.18, 0.05, [sx * 0.72, 1.0, 1.15], [0, sx * 0.45, 0], null, 1);
    c.cyl(COLORS.iron, 0.12, 0.12, 0.3, [sx * 0.22, 1.0, 1.25], null, 7);
  }
  c.cyl(COLORS.rope, 0.016, 0.016, 2.5, [0, 1.05, 0.55], Z90, 4);
  c.cyl(COLORS.woodDark, 0.05, 0.05, 1.5, [0, 1.12, 0.9], X90, 5);
  c.cone(COLORS.steel, 0.11, 0.3, [0, 1.12, 1.75], X90, 4);
  c.cyl(COLORS.iron, 0.1, 0.1, 0.5, [0, 0.95, -0.85], Z90, 8);
  archerParts(c, -0.75, 0, -0.9, COLORS.blueDark);
  head.add(meshOf(c.merged({ ao: false })));
  g.add(head);
  g.userData = { head, muzzle: { x: 0, y: 1.12, z: 1.8 }, crew: [], recoil: 0.35 };
  return g;
}

/**
 * A catapult: a wheeled frame with a throwing arm and bucket. userData.arm swings about X (the
 * bucket starts low at the back and is flung up over the front); userData.head turns the whole cart.
 */
export function makeCatapult() {
  const g = new THREE.Group();
  const head = new THREE.Group();
  const b = new Parts();
  for (const sx of [-1, 1]) {
    b.rbox(COLORS.woodDark, 0.2, 0.22, 2.8, 0.05, [sx * 0.75, 0.55, 0], null, null, 1);
    for (const z of [-1.0, 1.0]) {
      b.cyl(COLORS.wood, 0.42, 0.42, 0.14, [sx * 0.95, 0.42, z], Z90, 12);
      b.cyl(COLORS.iron, 0.12, 0.12, 0.18, [sx * 0.95, 0.42, z], Z90, 6);
    }
    b.rbox(COLORS.woodDark, 0.18, 1.6, 0.18, 0.04, [sx * 0.6, 1.25, 0.35], [0.25, 0, 0], null, 1);
  }
  for (const z of [-1.1, 0.35, 1.1]) b.rbox(COLORS.wood, 1.7, 0.16, 0.2, 0.04, [0, 0.6, z], null, null, 1);
  b.rbox(COLORS.wood, 1.4, 0.22, 0.24, 0.05, [0, 2.0, 0.55], null, null, 1);   // the stop bar
  b.cyl(COLORS.rope, 0.12, 0.12, 1.1, [0, 0.75, 0], Z90, 8);
  head.add(meshOf(b.merged({ ao: AO_BIG })));
  const arm = new THREE.Group();
  arm.position.set(0, 0.75, 0);
  const a = new Parts();
  a.rbox(COLORS.woodLight, 0.18, 0.18, 2.4, 0.05, [0, 0, -1.1], null, null, 1);
  a.cyl(COLORS.woodDark, 0.38, 0.28, 0.25, [0, 0.1, -2.25], null, 10);
  a.ico(COLORS.stone, 0.26, [0, 0.32, -2.25], [1, 0.8, 1]);
  arm.add(meshOf(a.merged({ ao: false })));
  // resting: the arm lies back toward -Z, tilted down; firing swings it up and over (negative X rotation)
  arm.rotation.x = 0.25;
  head.add(arm);
  g.add(head);
  g.userData = { head, arm, muzzle: { x: 0, y: 0.4, z: -2.25 }, crew: [], recoil: 0.1, throwAngle: 1.9 };
  return g;
}

/** The great trebuchet: a tall A-frame, a long arm with a counterweight box and a sling. About 9 tall. */
export function makeTrebuchet() {
  const g = new THREE.Group();
  const head = new THREE.Group();
  const b = new Parts();
  for (const sx of [-1, 1]) {
    b.rbox(COLORS.woodDark, 0.34, 0.34, 6.4, 0.08, [sx * 1.5, 0.3, 0], null, null, 1);
    b.rbox(COLORS.woodDark, 0.28, 5.4, 0.28, 0.06, [sx * 1.3, 2.8, -1.1], [0.35, 0, sx * -0.05], null, 1);
    b.rbox(COLORS.woodDark, 0.28, 5.4, 0.28, 0.06, [sx * 1.3, 2.8, 1.1], [-0.35, 0, sx * -0.05], null, 1);
    for (const z of [-2.6, 2.6]) { b.cyl(COLORS.wood, 0.5, 0.5, 0.2, [sx * 1.75, 0.5, z], Z90, 12); b.cyl(COLORS.iron, 0.14, 0.14, 0.24, [sx * 1.75, 0.5, z], Z90, 6); }
  }
  for (const z of [-3, 0, 3]) b.rbox(COLORS.wood, 3.3, 0.24, 0.3, 0.05, [0, 0.4, z], null, null, 1);
  b.cyl(COLORS.iron, 0.18, 0.18, 3.0, [0, 5.3, 0], Z90, 10);
  b.rbox(COLORS.redDark, 0.06, 1.2, 1.6, 0.03, [-1.42, 3.0, 0], null, null, 1);
  b.sph(COLORS.gold, 0.25, [-1.47, 3.0, 0], [0.3, 1, 1], null, 8, 6);
  head.add(meshOf(b.merged({ ao: AO_BIG })));
  const arm = new THREE.Group();
  arm.position.set(0, 5.3, 0);
  const a = new Parts();
  a.rbox(COLORS.woodLight, 0.32, 0.32, 8.0, 0.08, [0, 0, -1.8], null, null, 1);
  for (const z of [-4.5, -2.0, 0.8]) a.rbox(COLORS.iron, 0.38, 0.38, 0.12, 0.03, [0, 0, z], null, null, 1);
  // the counterweight box hangs at the short end (+Z)
  a.rbox(COLORS.woodDark, 1.6, 1.4, 1.4, 0.1, [0, -1.0, 2.1]);
  a.rbox(COLORS.stoneDark, 1.3, 0.3, 1.1, 0.06, [0, -0.2, 2.1], null, null, 1);
  // the sling and its boulder at the long end (-Z)
  a.cyl(COLORS.rope, 0.03, 0.03, 1.4, [0, -0.7, -5.8], null, 4);
  a.sph(COLORS.leather, 0.5, [0, -1.4, -5.8], [1, 0.5, 1], null, 8, 5);
  a.sph(COLORS.stoneDark, 0.45, [0, -1.15, -5.8], null, null, 9, 6);
  arm.add(meshOf(a.merged({ ao: false })));
  arm.rotation.x = 0.55;      // cocked: the long end low at the back
  head.add(arm);
  g.add(head);
  g.userData = { head, arm, muzzle: { x: 0, y: -1.15, z: -5.8 }, crew: [], recoil: 0.04, throwAngle: 2.3 };
  return g;
}

// ------------------------------------------------------------- the keep ---
/** A run of crenellated stone wall along +X from x = 0 to `len`, `h` tall, with a walkway behind. */
export function makeWallGeometry(len, h = 2.6, seed = 1) {
  const b = new Parts();
  b.rbox(COLORS.stone, len, h, 1.0, 0.08, [len / 2, h / 2, 0]);
  const n = Math.max(1, Math.round(len / 0.9));
  const step = len / n;
  for (let i = 0; i < n; i++) if (i % 2 === 0) b.rbox(COLORS.stoneLight, step * 0.9, 0.5, 0.36, 0.05, [(i + 0.5) * step, h + 0.25, 0.3], null, null, 1);
  // a few darker stones and a plinth
  let s = seed * 9301 + 49297;
  const rnd = () => { s = (s * 233280 + 49297) % 2147483647; return (s % 1000) / 1000; };
  for (let i = 0; i < len * 0.9; i++) b.rbox(COLORS.stoneDark, 0.5 + rnd() * 0.4, 0.3, 0.06, 0.03, [rnd() * len, 0.4 + rnd() * (h - 0.8), -0.5], null, null, 1);
  b.rbox(COLORS.stoneDark, len, 0.3, 1.2, 0.06, [len / 2, 0.15, 0], null, null, 1);
  return b.merged({ ao: AO_BIG });
}
/** A low fence of stakes for the near sides of the yard (kept low so the camera sees in). */
export function makeLowWallGeometry(len) {
  const b = new Parts();
  b.rbox(COLORS.stone, len, 0.7, 0.8, 0.1, [len / 2, 0.35, 0]);
  b.rbox(COLORS.stoneLight, len, 0.12, 0.9, 0.05, [len / 2, 0.75, 0], null, null, 1);
  return b.merged({ ao: AO_BIG });
}
/** A square corner tower, `h` tall. */
export function makeCornerTowerGeometry(h = 4) {
  const b = new Parts();
  b.rbox(COLORS.stone, 2.2, h, 2.2, 0.12, [0, h / 2, 0]);
  for (const [x, z] of [[-0.9, -0.9], [0.9, -0.9], [-0.9, 0.9], [0.9, 0.9], [0, -0.9], [0, 0.9], [-0.9, 0], [0.9, 0]]) b.rbox(COLORS.stoneLight, 0.45, 0.5, 0.45, 0.06, [x, h + 0.25, z], null, null, 1);
  b.cone(COLORS.slate, 1.5, 1.6, [0, h + 1.3, 0], [0, Math.PI / 4, 0], 4);
  b.rbox(0x2b3340, 0.24, 0.6, 0.06, 0.05, [0, h * 0.6, -1.11], null, null, 1);
  return b.merged({ ao: AO_BIG });
}
/** The gatehouse: two towers and an arch over the opening (width `w`), the portcullis raised. */
export function makeGatehouseGeometry(w = 4, h = 3.6) {
  const b = new Parts();
  for (const sx of [-1, 1]) {
    b.rbox(COLORS.stone, 1.8, h + 1.2, 2.2, 0.12, [sx * (w / 2 + 0.9), (h + 1.2) / 2, 0]);
    for (const [x, z] of [[-0.6, -0.8], [0.6, -0.8], [-0.6, 0.8], [0.6, 0.8]]) b.rbox(COLORS.stoneLight, 0.45, 0.5, 0.45, 0.06, [sx * (w / 2 + 0.9) + x, h + 1.45, z], null, null, 1);
    b.rbox(COLORS.blue, 0.06, 1.8, 1.0, 0.03, [sx * (w / 2 + 0.9), h - 0.1, -1.13], [0, Math.PI / 2, 0], null, 1);
    b.sph(COLORS.gold, 0.2, [sx * (w / 2 + 0.9), h + 0.1, -1.16], [1, 1, 0.3], null, 8, 6);
  }
  b.rbox(COLORS.stone, w + 0.2, 1.1, 2.0, 0.1, [0, h + 0.15, 0]);
  for (let i = 0; i < 5; i++) b.rbox(COLORS.stoneLight, 0.45, 0.45, 0.45, 0.06, [-w / 2 + 0.4 + i * (w - 0.8) / 4, h + 0.92, 0.6], null, null, 1);
  // raised portcullis teeth under the arch
  for (let i = 0; i < 6; i++) { const x = -w / 2 + 0.35 + i * (w - 0.7) / 5; b.cyl(COLORS.iron, 0.05, 0.05, 0.7, [x, h - 0.55, 0.3], null, 5); b.cone(COLORS.iron, 0.06, 0.15, [x, h - 0.97, 0.3], [Math.PI, 0, 0], 4); }
  b.rbox(COLORS.iron, w, 0.08, 0.08, 0.02, [0, h - 0.2, 0.3], null, null, 1);
  return b.merged({ ao: AO_BIG });
}

/** The war chest: an iron-bound chest, lid open, spilling gold (the bounty lands beside it). */
export function makeWarChestGeometry() {
  const b = new Parts();
  b.rbox(COLORS.redDark, 1.4, 0.7, 0.9, 0.08, [0, 0.35, 0]);
  for (const x of [-0.5, 0.5]) b.rbox(COLORS.gold, 0.1, 0.72, 0.92, 0.03, [x, 0.36, 0], null, null, 1);
  b.rbox(COLORS.redDark, 1.4, 0.12, 0.9, 0.06, [0, 0.98, 0.42], [-1.1, 0, 0], null, 1);
  b.sph(COLORS.gold, 0.5, [0, 0.68, 0], [1.25, 0.32, 0.75], null, 10, 6);
  for (let i = 0; i < 7; i++) b.cyl(COLORS.gold, 0.1, 0.1, 0.03, [-0.5 + i * 0.17, 0.02, -0.7 - (i % 2) * 0.15], null, 10);
  b.sph(COLORS.gold, 0.12, [0.0, 0.07, -0.95], [1, 0.3, 1], null, 8, 4);
  return b.merged({ ao: AO_BIG });
}

/** A workshop under a canvas awning (fletcher, forge, spear works, mason). kind picks the dressing. */
export function makeWorkshop(kind) {
  const g = new THREE.Group();
  const b = new Parts();
  const cloth = { fletcher: COLORS.leaf, forge: COLORS.redDark, spears: COLORS.blue, mason: 0x8a7a68 }[kind] || COLORS.red;
  for (const [x, z] of [[-1.3, -1.1], [1.3, -1.1], [-1.3, 1.1], [1.3, 1.1]]) b.cyl(COLORS.woodDark, 0.09, 0.11, 2.4, [x, 1.2, z], null, 6);
  for (const sx of [-1, 1]) b.rbox(cloth, 1.6, 0.08, 2.8, 0.03, [sx * 0.72, 2.6, 0], [0, 0, sx * -0.38], null, 1);
  b.rbox(COLORS.cream, 0.06, 0.35, 2.8, 0.02, [-1.46, 2.2, 0], null, null, 1);
  b.rbox(COLORS.cream, 0.06, 0.35, 2.8, 0.02, [1.46, 2.2, 0], null, null, 1);
  b.rbox(COLORS.wood, 2.0, 0.12, 1.1, 0.04, [0, 0.9, 0], null, null, 1);
  for (const [x, z] of [[-0.85, -0.4], [0.85, -0.4], [-0.85, 0.4], [0.85, 0.4]]) b.rbox(COLORS.woodDark, 0.1, 0.85, 0.1, 0.03, [x, 0.43, z], null, null, 1);
  if (kind === 'fletcher') {
    for (let i = 0; i < 6; i++) b.cyl(COLORS.woodLight, 0.02, 0.02, 0.9, [-0.5 + i * 0.12, 1.0, 0], Z90, 4);
    b.cyl(COLORS.leather, 0.15, 0.13, 0.6, [0.7, 1.25, 0.2], [0.2, 0, 0], 8);
    b.rbox(COLORS.feather, 0.3, 0.1, 0.3, 0.04, [0.6, 1.01, -0.3], null, null, 1);
  } else if (kind === 'forge') {
    b.rbox(COLORS.stoneDark, 1.1, 1.0, 1.0, 0.12, [-0.4, 0.5, 0], null, null, 1);
    b.cyl(COLORS.stoneDark, 0.25, 0.3, 1.6, [-0.4, 1.8, 0.2], null, 8);
    b.rbox(COLORS.ember, 0.6, 0.12, 0.5, 0.05, [-0.4, 1.02, 0], null, null, 1);
    b.rbox(COLORS.iron, 0.5, 0.3, 0.22, 0.05, [0.6, 1.1, 0], null, null, 1);
    b.cone(COLORS.iron, 0.11, 0.3, [0.95, 1.18, 0], Z90, 4);
  } else if (kind === 'spears') {
    for (let i = 0; i < 4; i++) b.cyl(COLORS.woodDark, 0.04, 0.04, 2.0, [0, 1.0 + i * 0.07, -0.35 + i * 0.2], Z90, 5);
    b.cone(COLORS.steel, 0.08, 0.25, [1.12, 1.07, -0.15], [0, 0, -Math.PI / 2], 4);
  } else if (kind === 'mason') {
    b.rbox(COLORS.stoneLight, 0.7, 0.5, 0.6, 0.08, [-0.3, 1.21, 0]);
    b.cyl(COLORS.iron, 0.05, 0.05, 0.4, [0.5, 1.1, 0.1], Z90, 5);
    b.rbox(COLORS.woodDark, 0.16, 0.16, 0.16, 0.03, [0.75, 1.1, 0.1], null, null, 1);
  }
  g.add(meshOf(b.merged({ ao: AO_BIG })));
  g.userData = { mouth: [0, 1.3, 0], spout: [0, 1.3, 0] };
  return g;
}

/** A banner on a pole. */
export function makeBannerGeometry(color = COLORS.blue) {
  const b = new Parts();
  b.cyl(COLORS.woodDark, 0.05, 0.06, 3.4, [0, 1.7, 0], null, 6);
  b.sph(COLORS.gold, 0.1, [0, 3.45, 0], null, null, 6, 5);
  b.rbox(color, 0.05, 1.3, 0.75, 0.02, [0, 2.65, 0.4], null, null, 1);
  b.cone(color, 0.38, 0.4, [0, 1.81, 0.4], [Math.PI, Math.PI / 4, 0], 4, [0.13, 1, 1]);
  b.sph(COLORS.gold, 0.16, [0.03, 2.75, 0.4], [0.3, 1, 1], null, 7, 5);
  return b.merged({ ao: AO_BIG });
}
/** A soldiers' tent. */
export function makeTentGeometry(color = COLORS.cream, r = 1.4) {
  const b = new Parts();
  const h = r * 1.5;
  b.cone(color, r, h, [0, h / 2, 0], null, 10);
  for (let i = 0; i < 5; i++) { const a = i * 1.257; b.rbox(COLORS.red, 0.05, h * 0.9, 0.12, 0.02, [Math.cos(a) * r * 0.5, h * 0.45, Math.sin(a) * r * 0.5], [Math.sin(a) * 0.55, 0, -Math.cos(a) * 0.55], null, 1); }
  b.rbox(0x4a3428, r * 0.5, h * 0.45, 0.1, 0.05, [0, h * 0.21, -r * 0.82], [0.5, 0, 0], null, 1);
  b.cyl(COLORS.woodDark, 0.03, 0.03, 0.6, [0, h + 0.2, 0], null, 5);
  b.rbox(COLORS.red, 0.03, 0.2, 0.36, 0.01, [0, h + 0.4, 0.18], null, null, 1);
  return b.merged({ ao: AO_BIG });
}
/** A cart of barrels and sacks, for dressing. */
export function makeCartGeometry() {
  const b = new Parts();
  b.rbox(COLORS.wood, 1.2, 0.2, 2.0, 0.04, [0, 0.6, 0], null, null, 1);
  for (const sx of [-1, 1]) { b.cyl(COLORS.woodDark, 0.4, 0.4, 0.1, [sx * 0.68, 0.4, 0], Z90, 12); b.rbox(COLORS.woodDark, 0.08, 0.35, 2.0, 0.02, [sx * 0.58, 0.85, 0], null, null, 1); }
  b.cyl(COLORS.woodDark, 0.25, 0.25, 0.6, [0, 1.0, -0.5], null, 10);
  b.sph(COLORS.cream, 0.3, [0.1, 0.9, 0.4], [1, 0.8, 1.2], null, 8, 6);
  b.cyl(COLORS.woodDark, 0.04, 0.04, 1.4, [0, 0.6, 1.6], X90, 5);
  return b.merged({ ao: AO_BIG });
}

/** The Citadel: a great keep tower with four turrets, a gold-roofed spire and banners. About 13 tall. */
export function makeCitadel() {
  const g = new THREE.Group();
  const b = new Parts();
  b.rbox(COLORS.stoneDark, 9, 0.6, 9, 0.15, [0, 0.3, 0]);
  b.rbox(COLORS.stone, 7, 6.5, 7, 0.2, [0, 3.85, 0]);
  for (let i = 0; i < 8; i++) for (const s of [-1, 1]) {
    const along = -3.05 + i * (6.1 / 7);
    b.rbox(COLORS.stoneLight, 0.55, 0.6, 0.5, 0.06, [along, 7.4, s * 3.25], null, null, 1);
    b.rbox(COLORS.stoneLight, 0.5, 0.6, 0.55, 0.06, [s * 3.25, 7.4, along], null, null, 1);
  }
  for (const [x, z] of [[-3.5, -3.5], [3.5, -3.5], [-3.5, 3.5], [3.5, 3.5]]) {
    b.cyl(COLORS.stone, 1.1, 1.2, 9, [x, 4.5, z], null, 14);
    b.cone(COLORS.blue, 1.4, 2.6, [x, 10.3, z], null, 14);
    b.sph(COLORS.gold, 0.22, [x, 11.7, z], null, null, 8, 6);
    b.rbox(0x2b3340, 0.3, 0.8, 0.2, 0.08, [x - 0.8, 6.5, z - 0.8], [0, Math.PI / 4, 0], null, 1);
  }
  b.rbox(COLORS.stoneLight, 3.6, 4.0, 3.6, 0.15, [0, 9.2, 0]);
  b.cone(COLORS.gold, 2.7, 4.2, [0, 13.3, 0], [0, Math.PI / 4, 0], 4);
  b.cyl(COLORS.woodDark, 0.06, 0.06, 2.4, [0, 16.4, 0], null, 6);
  b.rbox(COLORS.red, 0.06, 1.0, 1.6, 0.03, [0, 17.0, 0.8], null, null, 1);
  b.rbox(COLORS.woodDark, 2.0, 3.0, 0.3, 0.2, [-1.2, 1.9, -3.55], null, null, 1);
  b.sph(COLORS.gold, 0.3, [-1.2, 3.8, -3.6], [1, 1, 0.3], null, 8, 6);
  for (const x of [-3, 1.5]) { b.rbox(COLORS.red, 0.1, 2.6, 1.3, 0.04, [x, 5.5, -3.56], [0, Math.PI / 2, 0], null, 1); b.sph(COLORS.gold, 0.3, [x, 5.6, -3.62], [1, 1, 0.25], null, 8, 6); }
  g.add(meshOf(b.merged({ ao: { ground: 0.18, groundH: 0.8, down: 0, noBoxes: true } })));
  return g;
}

/** The world gate: two stone pillars and a lintel with a gold crown. */
export function makeGateArch(width = 7) {
  const b = new Parts();
  for (const sx of [-1, 1]) {
    b.rbox(COLORS.stone, 0.9, 4.2, 0.9, 0.1, [sx * width / 2, 2.1, 0]);
    b.rbox(COLORS.stoneLight, 1.1, 0.3, 1.1, 0.06, [sx * width / 2, 4.35, 0], null, null, 1);
    b.rbox(COLORS.blue, 0.06, 1.6, 0.7, 0.02, [sx * width / 2, 2.8, -0.48], [0, Math.PI / 2, 0], null, 1);
  }
  b.rbox(COLORS.stone, width + 1.4, 0.6, 1.0, 0.12, [0, 4.0, 0]);
  b.cyl(COLORS.gold, 0.5, 0.55, 0.35, [0, 4.6, 0], null, 12);
  for (let i = 0; i < 5; i++) { const a = (i / 5) * Math.PI * 2; b.cone(COLORS.gold, 0.12, 0.35, [Math.cos(a) * 0.45, 4.95, Math.sin(a) * 0.45], null, 5); }
  return b.merged({ ao: AO_BIG });
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
