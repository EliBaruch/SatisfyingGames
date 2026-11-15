// Chicken farm models, all code-built with the art kit's Parts (smooth rounded toy shapes, vertex
// colours, baked AO) and drawn with the shared lit material: stack items (egg trays, cartons, feed
// sacks), nests, the farm stand counter, the egg packing machine and its belts, the silo / trough
// fill indicators, the hen house, the Giant Golden Egg monument, the travel gate. Pure builders.
import * as THREE from 'three';
import { Parts, meshOf } from '../../engine/art/parts.js';
import { makeCounter as artCounter } from '../../engine/art/props.js';
import { getModel } from '../../engine/art/assets.js';
import { addBlob } from '../../engine/chars.js';
import { litMaterial } from '../../engine/art/material.js';

export const COLORS = {
  egg: 0xfff1dc, eggShade: 0xf3dcbc, gold: 0xffc42e, goldDark: 0xe49a12, goldLight: 0xffe58a,
  straw: 0xd9953c, strawDark: 0xb26e26, kraft: 0xd9a566, kraftDark: 0xb98448, cream: 0xfff4d6,
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
    b.sph(shell, 0.21, [0.02, 0.33, 0.02], [1, 1.25, 1], [0, 0, 0.18], 8, 6);
    if (!gold) b.sph(0xffffff, 0.14, [-0.16, 0.24, -0.1], [1, 1.2, 1], null, 6, 4);
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


// ------------------------------------------------------------ the machine ---
/**
 * The egg packing machine, a chunky toy. Local +X = output side (belt), -X = input intake (faces the camera).
 * Returns a Group with userData: { belt (Mesh, texture scrolls), gear (Mesh, spins), bar (Mesh, scale.x = progress),
 * lamp (Mesh), puffs [Mesh], mouth [x,y,z], spout [x,y,z] } (local coordinates).
 */
export function makePackerMachine({ gold = false } = {}) {
  const body = gold ? 0xf2b83a : 0x4cc9ae, bodyDark = gold ? 0xd9962a : 0x32a98f, trim = gold ? 0xfff0c4 : 0xfff4dc;
  const accent = gold ? 0xe5483c : 0xff7a59;
  const g = new THREE.Group();
  const b = new Parts();
  b.rbox(body, 2.7, 1.0, 2.1, 0.24, [0.0, 0.55, 0]);
  b.rbox(bodyDark, 2.78, 0.22, 2.18, 0.1, [0.0, 0.14, 0]);
  b.rbox(trim, 2.0, 1.05, 1.7, 0.26, [0.25, 1.55, 0]);
  b.rbox(accent, 2.1, 0.18, 1.8, 0.08, [0.25, 2.14, 0]);
  // intake funnel facing the camera side (-X)
  b.cyl(trim, 0.78, 0.4, 0.55, [-1.62, 1.18, 0], [0, 0, Math.PI / 2], 14, null, true);
  b.torus(accent, 0.78, 0.07, [-1.9, 1.18, 0], [0, Math.PI / 2, 0], null, Math.PI * 2, 6, 16);
  b.rbox(0x3a3340, 0.2, 0.6, 0.62, 0.1, [-1.25, 1.18, 0], null, null, 1);
  // egg shapes peeking out of the funnel
  for (let i = 0; i < 3; i++) b.sph(gold ? COLORS.gold : COLORS.egg, 0.15, [-1.78 + i * 0.05, 1.05 + (i % 2) * 0.22, (i - 1) * 0.28], [1, 1.3, 1], null, 6, 5);
  // output spout and belt rails
  b.rbox(bodyDark, 0.5, 0.5, 0.95, 0.12, [1.5, 0.78, 0], null, null, 1);
  b.rbox(0x5a6678, 2.5, 0.16, 1.08, 0.06, [2.65, 0.42, 0], null, null, 1);
  for (const z of [-0.54, 0.54]) b.rbox(0x7c8798, 2.5, 0.2, 0.1, 0.04, [2.65, 0.56, z], null, null, 1);
  for (const x of [1.7, 3.5]) for (const z of [-0.4, 0.4]) b.rbox(0x5a6678, 0.14, 0.4, 0.14, 0.05, [x, 0.2, z], null, null, 1);
  // smokestack and lamp post
  b.cyl(0xb9c2cf, 0.2, 0.24, 0.8, [0.75, 2.6, 0.5], null, 10);
  b.torus(accent, 0.22, 0.05, [0.75, 3.0, 0.5], [Math.PI / 2, 0, 0], null, Math.PI * 2, 5, 12);
  b.cyl(0x7c8798, 0.04, 0.04, 0.5, [-0.4, 2.45, -0.5], null, 6);
  // control panel + window frame on the -Z face
  b.rbox(trim, 1.5, 0.78, 0.1, 0.1, [0.25, 1.5, -0.88], null, null, 1);
  b.rbox(0x3a3340, 0.62, 0.62, 0.06, 0.08, [-0.1, 1.52, -0.95], null, null, 1);
  b.rbox(0x3a3340, 0.9, 0.16, 0.06, 0.06, [0.55, 1.28, -0.95], null, null, 1);
  g.add(meshOf(b.merged({ ao: true })));

  // spinning gear in the window
  const gp = new Parts();
  gp.rcyl(0xffd23f, 0.22, 0.1, 0.03, [0, 0, 0], [Math.PI / 2, 0, 0], 12);
  for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4; gp.rbox(0xffd23f, 0.12, 0.1, 0.14, 0.03, [Math.cos(a) * 0.27, Math.sin(a) * 0.27, 0], [0, 0, a], null, 1); }
  gp.cyl(0xe49a12, 0.07, 0.07, 0.12, [0, 0, 0], [Math.PI / 2, 0, 0], 8);
  const gear = meshOf(gp.merged(), { cast: false });
  gear.position.set(-0.1, 1.52, -1.0);
  g.add(gear);
  // progress bar
  const bar = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.09, 0.04), new THREE.MeshBasicMaterial({ color: 0x66f08a }));
  bar.position.set(0.15, 1.28, -1.0);
  bar.geometry.translate(0.4, 0, 0);
  bar.position.x = 0.15 - 0.4;
  bar.scale.x = 0.001;
  g.add(bar);
  // lamp
  const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.17, 12, 8), new THREE.MeshBasicMaterial({ color: 0x777777 }));
  lamp.position.set(-0.4, 2.65, -0.5);
  g.add(lamp);
  // belt with scrolling stripes
  const tex = new THREE.CanvasTexture((() => {
    const c = document.createElement('canvas'); c.width = 128; c.height = 32;
    const x = c.getContext('2d');
    x.fillStyle = '#4a5466'; x.fillRect(0, 0, 128, 32);
    x.fillStyle = '#6a768a'; for (let i = 0; i < 4; i++) x.fillRect(i * 32, 0, 14, 32);
    return c;
  })());
  tex.colorSpace = THREE.SRGBColorSpace; tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.repeat.set(5, 1);
  const belt = new THREE.Mesh(new THREE.PlaneGeometry(2.45, 0.9), litMaterial({ map: tex }));
  belt.rotation.x = -Math.PI / 2;
  belt.position.set(2.65, 0.51, 0);
  belt.receiveShadow = true;
  g.add(belt);
  // steam puffs
  const puffs = [];
  const pm = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.7, depthWrite: false });
  for (let i = 0; i < 3; i++) { const p = new THREE.Mesh(new THREE.SphereGeometry(0.2, 8, 6), pm.clone()); p.visible = false; g.add(p); puffs.push(p); }
  // roof sign board facing the camera
  g.userData = { belt, gear, bar, lamp, puffs, mouth: [-1.9, 1.2, 0], spout: [1.6, 0.95, 0], chimney: [0.75, 3.05, 0.5] };
  return g;
}

// ------------------------------------------------------------------ trough ---
/** Wooden feed trough along X; returns Group with userData.fill (Mesh: grain, scale.y = level) */
export function makeTroughModel(len = 3.2, depth = 1.0) {
  const g = new THREE.Group();
  const b = new Parts();
  b.rbox(COLORS.woodDark, len, 0.5, depth, 0.1, [0, 0.4, 0], null, null, 1);
  b.rbox(0x5a3a1c, len - 0.3, 0.12, depth - 0.3, 0.05, [0, 0.62, 0], null, null, 1);
  for (const x of [-len / 2 + 0.3, len / 2 - 0.3]) for (const z of [-depth / 2 + 0.12, depth / 2 - 0.12]) b.rbox(0x7a4a22, 0.22, 0.34, 0.22, 0.06, [x, 0.17, z], null, null, 1);
  b.rbox(COLORS.wood, len + 0.12, 0.12, 0.14, 0.05, [0, 0.67, depth / 2], null, null, 1);
  b.rbox(COLORS.wood, len + 0.12, 0.12, 0.14, 0.05, [0, 0.67, -depth / 2], null, null, 1);
  g.add(meshOf(b.merged({ ao: true })));
  const grain = new Parts();
  grain.rbox(0xf3c44a, len - 0.4, 0.3, depth - 0.25, 0.13, [0, 0, 0], null, null, 2);
  const fill = meshOf(grain.merged(), { cast: false });
  fill.position.set(0, 0.55, 0);
  g.add(fill);
  g.userData.fill = fill;
  return g;
}

// ---------------------------------------------------------------- hen house ---
export function makeHenHouse({ gold = false } = {}) {
  const wall = gold ? 0xffe9a8 : 0xe5584a, wallDark = gold ? 0xe8c25a : 0xb8413a, roof = gold ? 0xd9801a : 0x9a5b3a;
  const b = new Parts();
  b.rbox(wall, 3.4, 1.9, 3.0, 0.22, [0, 0.95, 0]);
  b.rbox(wallDark, 3.5, 0.2, 3.1, 0.08, [0, 0.1, 0], null, null, 1);
  // gable roof along X
  for (const s of [-1, 1]) b.rbox(roof, 3.9, 0.2, 1.95, 0.08, [0, 2.45, s * 0.85], [s * 0.62, 0, 0], null, 1);
  b.rbox(0xffffff, 3.2, 0.5, 0.06, 0.04, [0, 2.0, 1.52], null, null, 1);
  b.cone(wall, 1.5, 1.1, [0, 2.1, 1.52], [0, 0, 0], 3, [1.13, 0.9, 0.04]);
  // door with ramp
  b.rbox(0x4a2f1a, 0.8, 1.05, 0.12, 0.2, [-0.7, 0.62, 1.52], null, null, 1);
  b.rbox(COLORS.woodDark, 0.7, 0.1, 1.5, 0.04, [-0.7, 0.3, 2.2], [0.38, 0, 0], null, 1);
  for (let i = 0; i < 4; i++) b.rbox(0x6e4220, 0.7, 0.06, 0.07, 0.02, [-0.7, 0.2 + i * 0.13, 1.8 + i * 0.28], null, null, 1);
  // round window and flower box
  b.torus(0xffffff, 0.34, 0.07, [0.85, 1.2, 1.53], null, null, Math.PI * 2, 6, 16);
  b.cyl(0xbfe9ff, 0.34, 0.34, 0.06, [0.85, 1.2, 1.51], [Math.PI / 2, 0, 0], 16);
  b.rbox(COLORS.woodDark, 1.0, 0.22, 0.3, 0.05, [0.85, 0.6, 1.7], null, null, 1);
  for (let i = 0; i < 5; i++) b.sph([0xff6fa5, 0xffd23f, 0xffffff, 0xff6fa5, 0xffd23f][i], 0.12, [0.5 + i * 0.18, 0.78, 1.72], null, null, 6, 4);
  // chimney-ish ventilator + weather vane egg
  b.sph(gold ? COLORS.gold : COLORS.egg, 0.22, [0, 3.2, 0], [1, 1.3, 1], null, 8, 6);
  b.cyl(0x7a4a22, 0.03, 0.03, 0.6, [0, 2.95, 0], null, 5);
  return b.merged({ ao: true });
}

// -------------------------------------------------------------- vehicles ---
/** Delivery pickup truck (faces +Z); userData.bedAnchor is where the carton load sits. */
export function makeDeliveryTruck() {
  const g = new THREE.Group();
  const m = getModel('car-kit/truck', { receive: true });
  g.add(m);
  const bed = new THREE.Object3D();
  bed.position.set(0, 0.78, -0.95);
  g.add(bed);
  g.userData.bedAnchor = bed;
  g.userData.wheels = [];
  addBlob(g, { rx: 1.0, rz: 2.0, yaw: true });
  return g;
}

// ---------------------------------------------------------------- monument ---
/** The Giant Golden Egg: stepped stone plinth, a big shiny egg with a gloss streak, flowers and a ring of small eggs. */
export function makeMonument() {
  const b = new Parts();
  b.rcyl(0xd8d0c0, 5.4, 0.5, 0.18, [0, 0.25, 0], null, 36);
  b.rcyl(0xece4d2, 4.4, 0.5, 0.18, [0, 0.72, 0], null, 36);
  b.rcyl(0xf6efdf, 3.5, 0.5, 0.16, [0, 1.18, 0], null, 36);
  b.rcyl(0xc9892a, 3.0, 0.3, 0.1, [0, 1.55, 0], null, 36);
  const H = 11, W = 3.2, y0 = 1.7;
  const prof = [];
  for (let i = 0; i <= 24; i++) { const t = i / 24, a = t * Math.PI; const r = Math.sin(a) * (1 - 0.2 * Math.cos(a)) * W; prof.push([Math.max(r, 0.001), y0 + (1 - Math.cos(a)) * 0.5 * H]); }
  b.lathe(COLORS.gold, prof, [0, 0, 0], null, 40);
  // warm shade near the bottom, bright gloss on the camera side (-X, -Z)
  const d = 0.707, rAt = (y) => { const c = 1 - 2 * (y - y0) / H, a = Math.acos(Math.max(-1, Math.min(1, c))); return Math.sin(a) * (1 - 0.2 * c) * W; };
  for (const [y, k, sy, c] of [[y0 + H * 0.62, 0.8, 1.7, 0xffeaa0], [y0 + H * 0.85, 0.4, 0.6, 0xfff6d0]]) {
    const r = rAt(y) + 0.02;
    b.sph(c, 0.7 * k, [-d * r, y, -d * r], [0.45, sy, 0.22], [0, -Math.PI * 0.75, 0], 10, 8);
  }
  b.sph(0xffffff, 0.2, [-d * (rAt(y0 + H * 0.9) + 0.02), y0 + H * 0.9, -d * (rAt(y0 + H * 0.9) + 0.02)], [0.5, 1.4, 0.3], [0, -Math.PI * 0.75, 0], 8, 6);
  for (let i = 0; i < 12; i++) {
    const a = i * Math.PI / 6;
    b.sph(i % 2 ? 0xfff1dc : COLORS.gold, 0.38, [Math.cos(a) * 4.7, 1.2, Math.sin(a) * 4.7], [1, 1.3, 1], null, 8, 6);
  }
  for (let i = 0; i < 12; i++) {
    const a = i * 0.55 + 0.3, r = 5.8 + (i % 2) * 0.4;
    b.sph([0xff6fa5, 0xffd23f, 0xffffff][i % 3], 0.32, [Math.cos(a) * r, 0.35, Math.sin(a) * r], [1, 0.8, 1], null, 7, 5);
    b.sph(0x45b84e, 0.42, [Math.cos(a) * r, 0.2, Math.sin(a) * r], [1, 0.5, 1], null, 7, 5);
  }
  return b.merged({ ao: { ground: 0.18, groundH: 0.6, down: 0.0, noBoxes: true } });
}

/** four-point sparkle star (merged into one mesh that the scene spins) */
export function makeSparkles() {
  const b = new Parts();
  for (const [x, y, z, s] of [[-3.6, 8.5, -2.2, 0.55], [3.4, 11.0, -1.5, 0.45], [-1.8, 12.2, 2.6, 0.5], [2.6, 6.5, 3.2, 0.4]]) {
    b.oct(0xfff3b0, s, [x, y, z], [0.4, 1.6, 0.4]);
    b.oct(0xfff3b0, s, [x, y, z], [1.6, 0.4, 0.4]);
  }
  return b.merged();
}

export function makeGateArch(width = 8) {
  const b = new Parts();
  const GW = width;
  for (const sx of [-1, 1]) {
    b.rbox(COLORS.barn, 0.9, 3.8, 0.9, 0.2, [sx * GW / 2, 1.9, 0]);
    b.rbox(0xfff4dc, 1.2, 0.28, 1.2, 0.1, [sx * GW / 2, 0.14, 0]);
    b.sph(COLORS.gold, 0.36, [sx * GW / 2, 4.25, 0], [1, 1.3, 1], null, 12, 8);
    b.rcyl(0xe07a4a, 0.5, 0.45, 0.08, [sx * (GW / 2 + 1.15), 0.23, 0], null, 18);
    b.sph(0x45b84e, 0.5, [sx * (GW / 2 + 1.15), 0.62, 0], [1, 0.7, 1], null, 10, 7);
    for (let k = 0; k < 5; k++) b.sph([0xffd23f, 0xff6fa5, 0xffffff, 0xffd23f, 0xff6fa5][k], 0.16, [sx * (GW / 2 + 1.15) + Math.cos(k * 1.26) * 0.3, 0.86 + (k % 2) * 0.06, Math.sin(k * 1.26) * 0.3], null, null, 8, 6);
  }
  b.rbox(COLORS.barn, GW + 1.0, 0.7, 0.7, 0.24, [0, 3.65, 0]);
  b.rbox(0xfff4dc, GW + 0.5, 0.14, 0.78, 0.06, [0, 3.25, 0]);
  return b.merged({ ao: { ground: 0.2, groundH: 0.5, down: 0.05, noBoxes: true } });
}
