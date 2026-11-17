// Frostpine Camp models, all code-built with the art kit's Parts (rounded toy shapes, vertex colours,
// baked AO) and drawn with the shared lit material: stack items (log bundles, meat, roasts), the
// pines and their stumps, the woolly tuskers, the trading post, the cook fire, the watchtower with
// its crossbow, palisade walls, tents, lanterns, the Great Beacon and the travel gate. Pure builders.
import * as THREE from 'three';
import { Parts, meshOf } from '../../engine/art/parts.js';
import { makeCounter as artCounter } from '../../engine/art/props.js';

export const COLORS = {
  snow: 0xf2f7fd, snowShade: 0xcfe0f2, ice: 0xa9d8ee,
  pine: 0x1f5c3a, pineDark: 0x174a30, pineLight: 0x2d7446,
  bark: 0x8a5a36, barkDark: 0x6b4226, wood: 0xc98a4b, woodLight: 0xe2b072, woodDark: 0x9a6532,
  rope: 0xe9d8a6, hide: 0xd9a066, hideDark: 0xb07a45, cloth: 0xd9503f, clothDark: 0xa83a2e,
  fur: 0x9c6a48, furDark: 0x6f4630, furLight: 0xc49a72, tusk: 0xfff4dc, nose: 0x3a2a26,
  elder: 0x6d7f96, elderDark: 0x4b5a70, elderLight: 0x9fb0c4,
  meat: 0xe2574c, meatDark: 0xb83a34, fat: 0xffe1d6, bone: 0xfff6e6, roast: 0xc7742c, roastDark: 0x96501c, glaze: 0xf2a444,
  stone: 0x8e97a6, stoneDark: 0x6a7382, iron: 0x4a5261, ember: 0xff7a2a, flame: 0xffc233, gold: 0xffc42e,
};

// shared dimensions so models, stacks and stations agree
export const SIZES = {
  log: { len: 0.86, d: 0.46, h: 0.3 }, logStep: 0.27,
  meat: { len: 0.72, d: 0.44, h: 0.26 }, meatStep: 0.23,
  roast: { len: 0.78, d: 0.46, h: 0.3 }, roastStep: 0.27,
  counter: { len: 3.4, depth: 1.2, h: 1.0 },
};

const AO_SMALL = { ground: 0.1, groundH: 0.1, down: 0.05, noBoxes: true };
const AO_BIG = { ground: 0.2, groundH: 0.5, down: 0.05, noBoxes: true };
const Z90 = [0, 0, Math.PI / 2];

// ------------------------------------------------------------------ items ---
/** A tied bundle of three short logs. Origin bottom-centre, long axis X. */
export function makeLogGeometry() {
  const b = new Parts();
  const { len } = SIZES.log;
  for (const [y, z] of [[0.1, -0.11], [0.1, 0.11], [0.26, 0]]) {
    b.cyl(COLORS.bark, 0.1, 0.1, len, [0, y, z], Z90, 8);
    for (const sx of [-1, 1]) b.cyl(COLORS.woodLight, 0.085, 0.085, 0.012, [sx * (len / 2 + 0.002), y, z], Z90, 8);
  }
  for (const x of [-0.24, 0.24]) b.rbox(COLORS.rope, 0.06, 0.34, 0.44, 0.03, [x, 0.17, 0], null, null, 1);
  return b.merged({ ao: AO_SMALL });
}

/** A raw haunch on the bone. */
export function makeMeatGeometry() {
  const b = new Parts();
  const { len, d, h } = SIZES.meat;
  b.sph(COLORS.meat, 0.2, [-0.06, h * 0.52, 0], [1.55, h / 0.4, d / 0.4], null, 9, 7);
  b.sph(COLORS.meatDark, 0.16, [-0.2, h * 0.5, 0], [1.1, h / 0.36, d / 0.36], null, 8, 6);
  b.sph(COLORS.fat, 0.07, [-0.02, h * 0.96, 0.02], [2.2, 0.35, 1.5], null, 6, 4);
  b.cyl(COLORS.bone, 0.045, 0.045, 0.3, [len / 2 - 0.16, h * 0.5, 0], Z90, 7);
  b.sph(COLORS.bone, 0.07, [len / 2 - 0.02, h * 0.5 + 0.03, 0.03], null, null, 6, 5);
  b.sph(COLORS.bone, 0.07, [len / 2 - 0.02, h * 0.5 - 0.02, -0.04], null, null, 6, 5);
  return b.merged({ ao: AO_SMALL });
}

/** A roast on a wooden board: the cooked, more valuable item. */
export function makeRoastGeometry() {
  const b = new Parts();
  const { len, d, h } = SIZES.roast;
  b.rbox(COLORS.woodLight, len, 0.06, d, 0.03, [0, 0.03, 0], null, null, 1);
  b.sph(COLORS.roast, 0.2, [-0.07, 0.06 + (h - 0.06) * 0.5, 0], [1.45, (h - 0.06) / 0.4, (d - 0.08) / 0.4], null, 9, 7);
  b.sph(COLORS.roastDark, 0.13, [-0.24, 0.17, 0], [1.1, 0.9, 1.3], null, 7, 5);
  b.sph(COLORS.glaze, 0.08, [-0.02, h - 0.01, 0.02], [2.3, 0.3, 1.5], null, 6, 4);
  b.cyl(COLORS.bone, 0.04, 0.04, 0.26, [len / 2 - 0.15, 0.16, 0], Z90, 7);
  b.sph(COLORS.bone, 0.065, [len / 2 - 0.02, 0.17, 0], null, null, 6, 5);
  for (const z of [-0.15, 0.15]) b.sph(0x58b45a, 0.05, [0.12, 0.09, z], [1.3, 0.6, 1], null, 5, 4);
  return b.merged({ ao: AO_SMALL });
}

// ------------------------------------------------------------------ pines ---
export const PINE_HEIGHT = 3.5;
/** A snow-dusted pine (the grove's `plant`). About 250 triangles. */
export function makePineGeometry() {
  const b = new Parts();
  b.cyl(COLORS.bark, 0.16, 0.22, 0.9, [0, 0.45, 0], null, 7);
  const tiers = [[1.15, 1.35, 0.75, COLORS.pineDark], [0.92, 1.25, 1.5, COLORS.pine], [0.66, 1.1, 2.25, COLORS.pineLight]];
  for (const [r, h, y, c] of tiers) {
    b.cone(c, r, h, [0, y + h / 2, 0], null, 8);
    b.cone(COLORS.snow, r * 0.62, h * 0.5, [0, y + h * 0.76, 0], null, 8);     // snow on the upper half of each tier
  }
  b.sph(COLORS.snow, 0.16, [0, PINE_HEIGHT - 0.08, 0], [1, 0.8, 1], null, 6, 4);
  return b.merged({ ao: { ground: 0.25, groundH: 0.8, down: 0.1, noBoxes: true } });
}
/** The stump left behind, with a ring of chips and snow. */
export function makeStumpGeometry() {
  const b = new Parts();
  b.cyl(COLORS.bark, 0.2, 0.25, 0.3, [0, 0.15, 0], null, 8);
  b.cyl(COLORS.woodLight, 0.19, 0.19, 0.02, [0, 0.305, 0], null, 8);
  b.cyl(COLORS.wood, 0.1, 0.1, 0.022, [0, 0.306, 0], null, 8);
  for (let i = 0; i < 4; i++) b.sph(COLORS.snow, 0.13, [Math.cos(i * 1.7) * 0.36, 0.04, Math.sin(i * 1.7) * 0.36], [1.3, 0.5, 1], null, 5, 4);
  return b.merged({ ao: AO_SMALL });
}

// --------------------------------------------------------------- creatures ---
export const TUSKER_HEIGHT = 1.25;
/**
 * A woolly tusker: a round shaggy beast with ivory tusks and snow on its back. Faces +Z, origin on
 * the ground, about 1.6 long. `elder` gives the larger blue-grey mountain kind with a crest.
 */
export function makeTuskerGeometry(elder = false) {
  const fur = elder ? COLORS.elder : COLORS.fur, dark = elder ? COLORS.elderDark : COLORS.furDark, light = elder ? COLORS.elderLight : COLORS.furLight;
  const b = new Parts();
  for (const [x, z] of [[-0.32, -0.38], [0.32, -0.38], [-0.3, 0.36], [0.3, 0.36]]) b.cyl(dark, 0.13, 0.15, 0.4, [x, 0.2, z], null, 7);
  b.sph(fur, 0.5, [0, 0.72, -0.05], [1.12, 0.98, 1.42], null, 10, 8);                    // body
  b.sph(light, 0.36, [0, 0.52, 0.1], [1.15, 0.6, 1.3], null, 8, 5);                       // paler belly
  b.sph(dark, 0.3, [0, 1.08, -0.18], [1.2, 0.55, 1.5], null, 8, 5);                       // mane
  b.sph(COLORS.snow, 0.26, [0, 1.19, -0.2], [1.25, 0.35, 1.6], null, 7, 4);               // snow on the back
  b.sph(fur, 0.34, [0, 0.72, 0.68], [1.05, 1.0, 1.0], null, 9, 7);                        // head
  b.sph(light, 0.2, [0, 0.6, 0.96], [1.1, 0.85, 1], null, 7, 5);                          // snout
  b.sph(COLORS.nose, 0.07, [0, 0.64, 1.14], [1.4, 0.9, 0.6], null, 5, 4);
  for (const sx of [-1, 1]) {
    b.cone(COLORS.tusk, 0.07, 0.42, [sx * 0.19, 0.62, 1.02], [1.0, 0, sx * -0.5], 6);     // tusks, curling up and out
    b.sph(dark, 0.13, [sx * 0.3, 0.98, 0.56], [0.5, 1, 0.9], [0, 0, sx * -0.5], 5, 4);    // ears
    b.sph(0x1d1614, 0.045, [sx * 0.17, 0.84, 0.94], null, null, 5, 4);                    // eyes
    b.sph(0xffffff, 0.018, [sx * 0.185, 0.86, 0.975], null, null, 4, 3);
  }
  b.sph(dark, 0.09, [0, 0.8, -0.78], [0.8, 0.8, 1.2], null, 5, 4);                        // tail tuft
  if (elder) for (let i = 0; i < 3; i++) b.cone(COLORS.ice, 0.1, 0.34, [0, 1.3 - i * 0.02, 0.2 - i * 0.34], [-0.25, 0, 0], 5);   // an icy crest
  return b.merged({ ao: { ground: 0.2, groundH: 0.4, down: 0.12, noBoxes: true } });
}

// ----------------------------------------------------------------- the camp ---
/** The trading post: a wooden counter between two tall posts with a snow-topped beam. Long axis Z, customers on +X. */
export function makeTradingPost() {
  const g = new THREE.Group();
  g.add(artCounter({ ...SIZES.counter, accent: COLORS.cloth, wood: 0xb9793c, top: 0xf3e3c3, register: false }));
  const b = new Parts();
  const L = SIZES.counter.len;
  for (const z of [-L / 2 - 0.2, L / 2 + 0.2]) {
    b.cyl(COLORS.barkDark, 0.11, 0.13, 3.3, [0, 1.65, z], null, 7);
    b.sph(COLORS.snow, 0.17, [0, 3.36, z], [1, 0.7, 1], null, 6, 4);
  }
  b.cyl(COLORS.bark, 0.08, 0.08, L + 0.9, [0, 3.0, 0], [Math.PI / 2, 0, 0], 7);
  b.rbox(COLORS.snow, 0.26, 0.1, L + 0.2, 0.05, [0, 3.1, 0], null, null, 1);
  // hanging hams, a string of pennants and a lantern
  for (const z of [-1.1, 1.1]) { b.cyl(COLORS.rope, 0.015, 0.015, 0.4, [0, 2.78, z], null, 5); b.sph(COLORS.meat, 0.17, [0, 2.44, z], [0.8, 1.3, 0.8], null, 7, 5); }
  for (let i = 0; i < 5; i++) b.cone(i % 2 ? COLORS.cloth : COLORS.gold, 0.13, 0.3, [0, 2.8, -0.6 + i * 0.3], [Math.PI, 0, 0], 4, [0.3, 1, 1]);
  b.cyl(COLORS.iron, 0.02, 0.02, 0.3, [0, 2.84, -1.7], null, 5);
  b.rbox(COLORS.flame, 0.2, 0.26, 0.2, 0.05, [0, 2.58, -1.7], null, null, 1);
  b.rbox(COLORS.iron, 0.26, 0.05, 0.26, 0.02, [0, 2.73, -1.7], null, null, 1);
  g.add(meshOf(b.merged({ ao: AO_BIG })));
  return g;
}

/**
 * The cook fire: a ring of stones, a bed of logs and a spit with a roast turning over it.
 * userData: { spit (Object3D: rotate about X), flames [Mesh], glow (Mesh), mouth [x,y,z], spout [x,y,z] }.
 */
export function makeCookFire() {
  const g = new THREE.Group();
  const b = new Parts();
  b.cyl(0x4a3c36, 1.25, 1.3, 0.08, [0, 0.04, 0], null, 18);
  for (let i = 0; i < 11; i++) {
    const a = (i / 11) * Math.PI * 2;
    b.sph(i % 2 ? COLORS.stone : COLORS.stoneDark, 0.3, [Math.cos(a) * 1.2, 0.16, Math.sin(a) * 1.2], [1, 0.72, 0.8], [0, -a, 0], 6, 5);
  }
  for (let i = 0; i < 5; i++) { const a = i * 1.257; b.cyl(COLORS.barkDark, 0.11, 0.11, 1.4, [Math.cos(a) * 0.12, 0.22 + (i % 2) * 0.12, Math.sin(a) * 0.12], [Math.PI / 2, 0, a], 6); }
  // two forked posts carrying the spit along Z
  for (const z of [-1.5, 1.5]) {
    b.cyl(COLORS.bark, 0.09, 0.12, 1.9, [0, 0.95, z], null, 7);
    for (const sx of [-1, 1]) b.cyl(COLORS.bark, 0.06, 0.07, 0.36, [sx * 0.1, 1.98, z], [0, 0, sx * -0.5], 6);
  }
  g.add(meshOf(b.merged({ ao: AO_BIG })));

  const spit = new THREE.Group();
  spit.position.set(0, 1.86, 0);
  const s = new Parts();
  s.cyl(COLORS.iron, 0.04, 0.04, 3.3, [0, 0, 0], [Math.PI / 2, 0, 0], 6);
  s.sph(COLORS.roast, 0.4, [0, 0, 0], [0.95, 0.85, 1.6], null, 10, 8);
  s.sph(COLORS.roastDark, 0.3, [0, 0, -0.55], [0.8, 0.75, 1], null, 8, 6);
  s.sph(COLORS.glaze, 0.2, [0, 0.27, 0.1], [1.2, 0.35, 2], null, 6, 4);
  s.sph(COLORS.bone, 0.1, [0, 0, 0.92], null, null, 6, 5);
  s.cyl(COLORS.bark, 0.05, 0.05, 0.4, [0.2, 0, 1.75], [0, 0, Math.PI / 2], 6);   // crank
  spit.add(meshOf(s.merged({ ao: false })));
  g.add(spit);

  const flames = [];
  const mats = [new THREE.MeshBasicMaterial({ color: COLORS.ember }), new THREE.MeshBasicMaterial({ color: COLORS.flame }), new THREE.MeshBasicMaterial({ color: 0xfff1a8 })];
  for (let i = 0; i < 5; i++) {
    const f = new THREE.Mesh(new THREE.ConeGeometry(0.34 - (i % 3) * 0.08, 1.0 - (i % 3) * 0.2, 7), mats[i % 3]);
    const a = i * 1.257;
    f.position.set(Math.cos(a) * (i ? 0.32 : 0), 0.75, Math.sin(a) * (i ? 0.32 : 0));
    f.userData.base = f.position.clone(); f.userData.phase = i * 1.9;
    g.add(f); flames.push(f);
  }
  const glow = makeGlow(3.4, 0xffb347, 0.5);
  glow.position.y = 0.05;
  g.add(glow);
  g.userData = { spit, flames, glow, mouth: [0, 2.3, 0], spout: [0, 1.9, 0] };
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

/** A wooden rack on a snowy platform for the meat the towers bring in (sits under the larder pile). */
export function makeLarderGeometry() {
  const b = new Parts();
  b.rbox(COLORS.wood, 2.6, 0.14, 2.0, 0.05, [0, 0.07, 0], null, null, 1);
  for (const x of [-1.0, 0, 1.0]) b.rbox(COLORS.woodDark, 0.16, 0.1, 2.1, 0.04, [x, 0.03, 0], null, null, 1);
  for (const x of [-1.35, 1.35]) b.cyl(COLORS.barkDark, 0.08, 0.1, 2.3, [x, 1.15, -1.05], null, 7);
  b.cyl(COLORS.bark, 0.07, 0.07, 2.9, [0, 2.2, -1.05], Z90, 7);
  for (const x of [-0.8, 0, 0.8]) { b.cyl(COLORS.rope, 0.015, 0.015, 0.4, [x, 1.98, -1.05], null, 5); b.sph(COLORS.meat, 0.17, [x, 1.66, -1.05], [0.8, 1.3, 0.8], null, 7, 5); }
  return b.merged({ ao: AO_BIG });
}

/**
 * A watchtower with a crossbow on top. Returns a Group; userData.head turns to the target and
 * userData.muzzle is where the bolt leaves (in the head's frame). About 4.3 tall.
 */
export function makeWatchtower() {
  const g = new THREE.Group();
  const b = new Parts();
  const H = 3.1;
  for (const [x, z] of [[-0.75, -0.75], [0.75, -0.75], [-0.75, 0.75], [0.75, 0.75]]) b.cyl(COLORS.bark, 0.12, 0.16, H, [x * 1.05, H / 2, z * 1.05], [z * 0.05, 0, -x * 0.05], 7);
  for (const y of [1.0, 2.1]) {
    b.rbox(COLORS.woodDark, 1.8, 0.12, 0.1, 0.03, [0, y, -0.8], null, null, 1);
    b.rbox(COLORS.woodDark, 1.8, 0.12, 0.1, 0.03, [0, y, 0.8], null, null, 1);
    b.rbox(COLORS.woodDark, 0.1, 0.12, 1.8, 0.03, [-0.8, y, 0], null, null, 1);
    b.rbox(COLORS.woodDark, 0.1, 0.12, 1.8, 0.03, [0.8, y, 0], null, null, 1);
  }
  b.rbox(COLORS.wood, 2.3, 0.18, 2.3, 0.06, [0, H, 0], null, null, 1);
  for (const [x, z, w, d] of [[0, -1.08, 2.3, 0.12], [0, 1.08, 2.3, 0.12], [-1.08, 0, 0.12, 2.3], [1.08, 0, 0.12, 2.3]]) b.rbox(COLORS.woodLight, w, 0.5, d, 0.04, [x, H + 0.3, z], null, null, 1);
  for (const [x, z] of [[-1.08, -1.08], [1.08, -1.08], [-1.08, 1.08], [1.08, 1.08]]) { b.cyl(COLORS.barkDark, 0.09, 0.09, 0.8, [x, H + 0.45, z], null, 6); b.sph(COLORS.snow, 0.15, [x, H + 0.9, z], [1, 0.7, 1], null, 6, 4); }
  b.rbox(COLORS.snow, 2.5, 0.1, 0.34, 0.05, [0, H + 0.58, -1.08], null, null, 1);
  b.rbox(COLORS.snow, 0.34, 0.1, 2.5, 0.05, [-1.08, H + 0.58, 0], null, null, 1);
  // a ladder on the camp side
  for (const x of [-0.25, 0.25]) b.cyl(COLORS.wood, 0.04, 0.04, H, [x, H / 2, 1.2], [0.13, 0, 0], 5);
  for (let i = 0; i < 6; i++) b.cyl(COLORS.wood, 0.03, 0.03, 0.5, [0, 0.4 + i * 0.45, 1.39 - i * 0.06], Z90, 5);
  g.add(meshOf(b.merged({ ao: AO_BIG })));

  const head = new THREE.Group();
  head.position.set(0, H + 0.75, 0);
  const c = new Parts();
  c.cyl(COLORS.iron, 0.12, 0.16, 0.5, [0, -0.3, 0], null, 8);                                  // pivot
  c.rbox(COLORS.woodDark, 0.26, 0.2, 1.7, 0.06, [0, 0.05, 0.1], null, null, 1);                // stock
  c.rbox(COLORS.iron, 0.3, 0.08, 0.5, 0.03, [0, 0.17, 0.75], null, null, 1);
  for (const sx of [-1, 1]) c.rbox(COLORS.wood, 1.0, 0.1, 0.14, 0.04, [sx * 0.48, 0.1, 0.72], [0, sx * 0.42, 0], null, 1);   // bow arms, swept back
  c.cyl(COLORS.rope, 0.012, 0.012, 1.75, [0, 0.12, 0.34], Z90, 4);                             // string
  c.cyl(COLORS.tusk, 0.03, 0.03, 0.9, [0, 0.2, 0.6], [Math.PI / 2, 0, 0], 5);                  // the loaded bolt
  c.cone(COLORS.iron, 0.06, 0.16, [0, 0.2, 1.12], [Math.PI / 2, 0, 0], 5);
  head.add(meshOf(c.merged({ ao: false })));
  g.add(head);
  g.userData.head = head;
  g.userData.muzzle = { x: 0, y: 0.2, z: 1.2 };
  return g;
}

/**
 * A run of palisade stakes along +X from x = 0 to `len` (pointed logs, snow on the tips). One geometry.
 * Kept below head height: the camera looks over the near walls, so tall ones would hide the yard.
 */
export function makePalisadeGeometry(len, seed = 1) {
  const b = new Parts();
  const n = Math.max(1, Math.round(len / 0.56));
  const step = len / n;
  let s = seed * 9301 + 49297;
  const rnd = () => { s = (s * 233280 + 49297) % 2147483647; return (s % 1000) / 1000; };
  for (let i = 0; i < n; i++) {
    const h = 1.3 + rnd() * 0.35, x = (i + 0.5) * step;
    const c = i % 3 === 0 ? COLORS.woodDark : i % 3 === 1 ? COLORS.bark : 0x9c6a40;
    b.cyl(c, 0.24, 0.27, h, [x, h / 2, 0], null, 6);
    b.cone(c, 0.24, 0.42, [x, h + 0.21, 0], null, 6);
    if (i % 2 === 0) b.sph(COLORS.snow, 0.15, [x, h + 0.34, 0], [1, 0.7, 1], null, 5, 3);
  }
  b.rbox(COLORS.barkDark, len, 0.14, 0.12, 0.04, [len / 2, 0.9, -0.27], null, null, 1);
  b.rbox(COLORS.snow, len, 0.14, 0.5, 0.07, [len / 2, 0.05, 0.36], null, null, 1);     // drift along the foot
  return b.merged({ ao: AO_BIG });
}

/** A gate post with a lantern (stands at each side of an opening in the palisade). */
export function makeGatePostGeometry() {
  const b = new Parts();
  b.cyl(COLORS.barkDark, 0.32, 0.36, 2.9, [0, 1.45, 0], null, 8);
  b.cone(COLORS.barkDark, 0.32, 0.5, [0, 3.15, 0], null, 8);
  b.sph(COLORS.snow, 0.22, [0, 3.3, 0], [1, 0.7, 1], null, 6, 4);
  b.rbox(COLORS.iron, 0.08, 0.08, 0.6, 0.02, [0, 2.5, -0.5], null, null, 1);
  b.rbox(COLORS.flame, 0.24, 0.3, 0.24, 0.06, [0, 2.2, -0.72], null, null, 1);
  b.rbox(COLORS.iron, 0.3, 0.06, 0.3, 0.02, [0, 2.38, -0.72], null, null, 1);
  b.rbox(COLORS.iron, 0.3, 0.06, 0.3, 0.02, [0, 2.03, -0.72], null, null, 1);
  return b.merged({ ao: AO_BIG });
}

/** A hide tent with a snow cap and a dark door flap facing -Z. */
export function makeTentGeometry(color = COLORS.hide, r = 1.5) {
  const b = new Parts();
  const h = r * 1.45;
  b.cone(color, r, h, [0, h / 2, 0], null, 9);
  b.cone(COLORS.snow, r * 0.5, h * 0.38, [0, h * 0.83, 0], null, 9);
  b.rbox(0x4a3428, r * 0.5, h * 0.48, 0.1, 0.05, [0, h * 0.22, -r * 0.8], [0.52, 0, 0], null, 1);
  for (let i = 0; i < 3; i++) b.cyl(COLORS.barkDark, 0.03, 0.03, 0.5, [(i - 1) * 0.1, h + 0.12, 0], [0, 0, (i - 1) * 0.35], 5);
  for (let i = 0; i < 6; i++) { const a = i * 1.05; b.sph(COLORS.snow, 0.24, [Math.cos(a) * r * 1.02, 0.06, Math.sin(a) * r * 1.02], [1.4, 0.45, 1], null, 5, 4); }
  return b.merged({ ao: AO_BIG });
}

/** A stack of firewood under a little snow, for dressing the yard. */
export function makeWoodpileGeometry() {
  const b = new Parts();
  for (let r = 0; r < 3; r++) for (let i = 0; i < 4 - r; i++) {
    const x = (i - (3 - r) / 2) * 0.34, y = 0.16 + r * 0.29;
    b.cyl(r % 2 ? COLORS.bark : COLORS.barkDark, 0.16, 0.16, 1.3, [x, y, 0], [Math.PI / 2, 0, 0], 7);
    b.cyl(COLORS.woodLight, 0.14, 0.14, 0.012, [x, y, -0.652], [Math.PI / 2, 0, 0], 7);
  }
  b.sph(COLORS.snow, 0.3, [0, 0.95, 0], [1.4, 0.35, 2.0], null, 6, 4);
  return b.merged({ ao: AO_BIG });
}

/** A snow drift: a few soft mounds. */
export function makeDriftGeometry(r = 1.2) {
  const b = new Parts();
  b.sph(COLORS.snow, r, [0, 0, 0], [1.25, 0.34, 1], null, 9, 5);
  b.sph(COLORS.snow, r * 0.6, [r * 0.8, 0, r * 0.3], [1.2, 0.36, 1], null, 7, 4);
  b.sph(COLORS.snowShade, r * 0.45, [-r * 0.75, 0, -r * 0.4], [1.2, 0.3, 1], null, 6, 4);
  return b.merged({ ao: false });
}

/** A boulder wearing a cap of snow. */
export function makeSnowRockGeometry(r = 0.8) {
  const b = new Parts();
  b.ico(COLORS.stone, r, [0, r * 0.55, 0], [1.15, 0.8, 1]);
  b.ico(COLORS.stoneDark, r * 0.6, [r * 0.75, r * 0.32, r * 0.2], [1, 0.8, 1], [0, 0.6, 0]);
  b.sph(COLORS.snow, r * 0.75, [0, r * 0.95, 0], [1.2, 0.34, 1.05], null, 7, 4);
  return b.merged({ ao: AO_BIG });
}

/** One of the axes that circle the player after the WHIRLING AXES upgrade. Lies flat, head outward (+X). */
export function makeWhirlAxeGeometry() {
  const b = new Parts();
  b.cyl(0xb9793c, 0.045, 0.045, 0.95, [-0.1, 0, 0], Z90, 6);
  b.rbox(0x6f7a8c, 0.22, 0.1, 0.2, 0.03, [0.34, 0, 0.02], null, null, 1);
  b.rbox(0xe6edf7, 0.36, 0.06, 0.24, 0.025, [0.36, 0, 0.19], null, null, 1);
  b.rbox(0xffffff, 0.42, 0.035, 0.06, 0.015, [0.36, 0, 0.32], null, null, 1);
  return b.merged({ ao: false });
}

// ---------------------------------------------------------------- the finale ---
/**
 * The Great Beacon: a stone tower with a timber crown and a brazier on top. About 12 tall.
 * Returns a Group with userData { flames [Mesh], glow (Mesh), top (y of the fire) }.
 */
export function makeBeacon() {
  const g = new THREE.Group();
  const b = new Parts();
  b.rcyl(0xdfe7f0, 5.2, 0.5, 0.18, [0, 0.25, 0], null, 32);
  b.rcyl(COLORS.stone, 4.2, 0.6, 0.18, [0, 0.8, 0], null, 32);
  const prof = [[3.3, 1.1], [3.0, 2.2], [2.5, 5.2], [2.3, 7.6], [2.7, 8.0], [2.7, 8.5], [2.2, 8.7]];
  b.lathe(0xa2abb9, prof, [0, 0, 0], null, 22);
  // courses of darker stone, a door and slit windows facing the camera (-X, -Z)
  for (const y of [2.6, 4.2, 5.8]) b.torus(COLORS.stoneDark, 2.95 - (y - 2.6) * 0.17, 0.1, [0, y, 0], [Math.PI / 2, 0, 0], null, Math.PI * 2, 5, 22);
  const d = Math.SQRT1_2;
  b.rbox(0x5a3b24, 1.3, 2.2, 0.3, 0.12, [-d * 3.05, 2.1, -d * 3.05], [0, Math.PI / 4, 0]);
  b.rbox(COLORS.gold, 0.16, 0.16, 0.34, 0.05, [-d * 3.1 - 0.25, 2.0, -d * 3.1 + 0.25], [0, Math.PI / 4, 0], null, 1);
  for (const y of [4.6, 6.4]) b.rbox(0x2b3340, 0.4, 0.9, 0.3, 0.08, [-d * (2.7 - (y - 4.6) * 0.12), y, -d * (2.7 - (y - 4.6) * 0.12)], [0, Math.PI / 4, 0], null, 1);
  // timber crown with snow, and the brazier
  for (let i = 0; i < 10; i++) { const a = (i / 10) * Math.PI * 2; b.cyl(COLORS.barkDark, 0.16, 0.16, 1.3, [Math.cos(a) * 2.55, 9.1, Math.sin(a) * 2.55], null, 6); b.sph(COLORS.snow, 0.22, [Math.cos(a) * 2.55, 9.8, Math.sin(a) * 2.55], [1, 0.6, 1], null, 5, 3); }
  b.torus(COLORS.wood, 2.55, 0.14, [0, 9.45, 0], [Math.PI / 2, 0, 0], null, Math.PI * 2, 5, 24);
  b.rcyl(COLORS.wood, 2.6, 0.24, 0.08, [0, 8.75, 0], null, 24);
  b.cyl(COLORS.iron, 1.5, 0.9, 0.9, [0, 9.4, 0], null, 14);
  b.torus(COLORS.gold, 1.5, 0.1, [0, 9.85, 0], [Math.PI / 2, 0, 0], null, Math.PI * 2, 5, 18);
  for (let i = 0; i < 10; i++) { const a = i * 0.63 + 0.2, r = 5.6 + (i % 2) * 0.5; b.sph(COLORS.snow, 0.7, [Math.cos(a) * r, 0.05, Math.sin(a) * r], [1.3, 0.4, 1], null, 6, 4); }
  g.add(meshOf(b.merged({ ao: { ground: 0.18, groundH: 0.6, down: 0, noBoxes: true } })));

  const flames = [];
  const mats = [new THREE.MeshBasicMaterial({ color: COLORS.ember }), new THREE.MeshBasicMaterial({ color: COLORS.flame }), new THREE.MeshBasicMaterial({ color: 0xfff1a8 })];
  for (let i = 0; i < 7; i++) {
    const f = new THREE.Mesh(new THREE.ConeGeometry(0.95 - (i % 3) * 0.2, 3.0 - (i % 3) * 0.6, 8), mats[i % 3]);
    const a = i * 0.9;
    f.position.set(Math.cos(a) * (i ? 0.7 : 0), 11.0, Math.sin(a) * (i ? 0.7 : 0));
    f.userData.base = f.position.clone(); f.userData.phase = i * 1.3;
    g.add(f); flames.push(f);
  }
  const glow = makeGlow(11, 0xffb347, 0.55);
  glow.position.y = 0.06;
  g.add(glow);
  g.userData = { flames, glow, top: 11 };
  return g;
}

/** The travel gate: two carved posts with a snowy beam, hung with lanterns. */
export function makeGateArch(width = 7) {
  const b = new Parts();
  const GW = width;
  for (const sx of [-1, 1]) {
    b.cyl(COLORS.barkDark, 0.42, 0.5, 4.0, [sx * GW / 2, 2.0, 0], null, 9);
    b.rcyl(COLORS.stone, 0.75, 0.3, 0.08, [sx * GW / 2, 0.15, 0], null, 14);
    b.cone(COLORS.barkDark, 0.42, 0.6, [sx * GW / 2, 4.3, 0], null, 9);
    b.sph(COLORS.snow, 0.3, [sx * GW / 2, 4.5, 0], [1, 0.7, 1], null, 6, 4);
    b.rbox(COLORS.flame, 0.3, 0.38, 0.3, 0.07, [sx * (GW / 2 - 0.9), 2.75, 0], null, null, 1);
    b.cyl(COLORS.iron, 0.02, 0.02, 0.5, [sx * (GW / 2 - 0.9), 3.15, 0], null, 5);
  }
  b.rbox(COLORS.bark, GW + 1.4, 0.6, 0.6, 0.2, [0, 3.7, 0]);
  b.rbox(COLORS.snow, GW + 1.0, 0.22, 0.7, 0.1, [0, 4.05, 0]);
  b.rbox(COLORS.cloth, 1.6, 0.9, 0.12, 0.05, [0, 3.0, 0], null, null, 1);
  b.sph(COLORS.gold, 0.26, [0, 3.0, -0.08], [1, 1, 0.4], null, 8, 6);
  return b.merged({ ao: AO_BIG });
}
