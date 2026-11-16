// Character and vehicle indirection. Every engine module and world gets its people and
// vehicles from here, never from an implementation file directly.
//
// Contract:
//   makeCharacter(look) -> Object3D   feet at the origin, faces +Z, ~1.65 tall. `look` is a LOOKS
//                                     entry, a model name ('female-b') or a plain
//                                     { model, tool, scale } object. Scale it with obj.scale only.
//                                     Gets a blob shadow when the engine has bound one.
//   animateCharacter(char, dt, { moving, speed, carrying, action })
//                                     action: null | 'swing' | 'wave' ('pickup' is ignored).
//                                     Skipped while char.userData.lod is truthy.
//   LOOKS                             named looks: player, hauler (= cutter), cashier, ... (art/character.js)
//   randomCustomerLook() -> look      a random customer look (world.looks.customers narrows the pool)
//   makeTractor(color) -> Object3D    default vehicle for the harvester role: the pack tractor.
//                                     userData: { wheels: [], blade: null, bedAnchor, bob, blobLength, blobOffset }.
//                                     A world may supply its own `workers.harvester.model(color)`.
//   charactersFor(world) -> string[]  character model names the world needs (preload list)
//   applyWorldLooks(world)            merge `world.looks` into LOOKS (main.js calls it at boot)
//   bindBlobs(blobs)                  main.js: characters and vehicles made afterwards get blob shadows
//
// world.looks = { player, hauler, cashier, customers: [look | model, ...], <any name>: look }
// where each look is a LOOKS key, a model name or a { model, tool, scale } object.
import * as THREE from 'three';
import * as art from './art/character.js';
import { getModel } from './art/assets.js';
import { Parts, meshOf } from './art/parts.js';

export const LOOKS = art.LOOKS;
export const animateCharacter = art.animateCharacter;
export const preloadCharacters = art.preloadCharacters;

LOOKS.hauler = LOOKS.cutter;          // the hauler role's default look key (config WORKERS.hauler.look)

const DEFAULT_CUSTOMERS = ['female-a', 'female-b', 'female-c', 'female-d', 'female-e', 'female-f', 'male-a', 'male-b', 'male-d', 'male-e', 'male-f'];
let blobs = null;
let customerPool = null;

export function bindBlobs(b) { blobs = b; }

/** Normalise a look spec (LOOKS key, model name, look object) to a look object. */
export function resolveLook(spec, fallback = 'player') {
  if (spec && typeof spec === 'object') return spec;
  if (typeof spec === 'string') {
    if (LOOKS[spec]) return LOOKS[spec];
    return { model: spec, tool: null, scale: 1 };
  }
  return LOOKS[fallback] || LOOKS.player;
}

/** Merge world.looks into LOOKS and set the customer pool. */
export function applyWorldLooks(world) {
  const l = (world && world.looks) || {};
  for (const k of Object.keys(l)) {
    if (k === 'customers') continue;
    LOOKS[k] = resolveLook(l[k], k);
  }
  if (Array.isArray(l.customers) && l.customers.length) customerPool = l.customers.map((c) => resolveLook(c));
  else customerPool = null;
  // keep the legacy key in step: worlds that say workers.hauler.look = 'cutter' still get their cutter look
  if (l.hauler) LOOKS.cutter = LOOKS.hauler;
}

export function randomCustomerLook() {
  if (!customerPool) return art.randomCustomerLook();
  const base = customerPool[(Math.random() * customerPool.length) | 0];
  return { tool: null, ...base, scale: (base.scale || 1) * (0.94 + Math.random() * 0.1) };
}

// optional hats (look.hat): code-built, sit on the head anchor
const hatCache = new Map();
function buildHat(kind) {
  if (hatCache.has(kind)) return hatCache.get(kind);
  const b = new Parts();
  if (kind === 'straw') {
    b.rcyl(0xf0c25a, 0.36, 0.045, 0.02, [0, 0.02, 0], [0.04, 0, 0], 24);
    b.rcyl(0xf8d97c, 0.21, 0.2, 0.07, [0, 0.13, 0], null, 20);
    b.rcyl(0xe2453c, 0.215, 0.06, 0.02, [0, 0.06, 0], null, 20);
  } else if (kind === 'cap') {
    b.sph(0xffd23f, 0.26, [0, 0.0, 0], [1, 0.75, 1], null, 16, 8);
    b.rcyl(0xffb21a, 0.15, 0.04, 0.015, [0, 0.0, 0.2], [0.2, 0, 0], 16, [1, 1, 0.8]);
  } else if (kind === 'hardhat' || kind === 'hardhat-white' || kind === 'hardhat-orange') {
    // safety helmet sized for the human rig (unit scale: sits on a 0.2 m wide head); origin = top of the skull
    const c = kind === 'hardhat-white' ? 0xf4f6f8 : kind === 'hardhat-orange' ? 0xff8a2a : 0xffc928;
    b.sph(c, 0.135, [0, -0.045, -0.005], [1, 0.8, 1.12], null, 18, 10);
    b.rcyl(c, 0.158, 0.02, 0.008, [0, -0.07, 0.03], [0.1, 0, 0], 20, [1, 1, 1.22]);
    b.rbox(c, 0.035, 0.03, 0.2, 0.012, [0, 0.062, -0.005]);
  }
  const m = meshOf(b.merged());
  hatCache.set(kind, m);
  return m;
}

export function makeCharacter(look) {
  const L = resolveLook(look);
  const c = art.makeCharacter(L);
  if (L.hat && c.userData.head) {
    const hat = buildHat(L.hat).clone();
    const human = c.userData.rig === 'human';   // human rig: the head anchor is the top of the skull, in world units
    hat.position.y = L.hatY ?? (human ? 0 : L.hat === 'cap' ? 0.4 : 0.42);
    hat.scale.setScalar(L.hatScale ?? (human ? (L.scale || 1) * 1.08 : L.hat === "cap" ? 1.4 : 1.5));
    c.userData.head.add(hat);
  }
  if (blobs) blobs.attach(c, c.userData.blobR || 0.42 * (c.userData.look.scale || 1));
  return c;
}

/** The character model names a world uses (player, workers, cashier, customers, any extra look). */
export function charactersFor(world) {
  const names = new Set();
  const add = (spec, fb) => { const l = resolveLook(spec, fb); if (l && l.model) names.add(l.model); };
  const P = (world.player && world.player.look) || 'player';
  add(P, 'player');
  const W = world.workers || {};
  add(W.hauler && W.hauler.look, 'hauler');
  add(W.cashier && W.cashier.look, 'cashier');
  const looks = world.looks || {};
  for (const k of Object.keys(looks)) if (k !== 'customers') add(looks[k], k);
  for (const p of world.pads || []) {
    const o = p.effect && p.effect.options;
    if (o && o.look) add(o.look);
  }
  const cust = looks.customers && looks.customers.length ? looks.customers : null;
  if (cust) for (const c of cust) add(c); else for (const m of DEFAULT_CUSTOMERS) names.add(m);
  return [...names];
}

// ------------------------------------------------------------------ tractor ---
/** The pack tractor. `color` is ignored (the pack model has its own paint). */
export function makeTractor() {
  const g = new THREE.Group();
  const body = getModel('car-kit/tractor', { receive: true });
  g.add(body);
  const bed = new THREE.Object3D();
  bed.position.set(0, 1.35, -0.95);       // on the engine deck / behind the seat
  g.add(bed);
  g.userData.wheels = [];
  g.userData.blade = null;
  g.userData.bedAnchor = bed;
  g.userData.bob = 0.04;
  g.userData.blobLength = 1.6;     // blob shadow (harvester.js attaches it)
  g.userData.blobOffset = 0;
  return g;
}

/** Attach a blob shadow to something a world builds itself (a vehicle, an animal). */
export function addBlob(obj, opts = 0.5) { if (blobs) blobs.attach(obj, opts); return obj; }

/**
 * Character level of detail: characters outside the camera's view are hidden and their animation
 * is skipped (skinned meshes are never frustum-culled by three). Call once per step from a worker's update.
 */
export function lodCharacter(G, char) {
  const p = char.position;
  const far = !onScreen(G, p.x, 0.9, p.z);
  char.visible = !far;
  char.userData.lod = far;
}

const _v = new THREE.Vector3();
/** Is the point (x, y, z) inside the camera's view (plus a margin in NDC units: 1 = the screen edge)? */
export function onScreen(G, x, y, z, margin = 1.3) {
  const cam = G.camera;
  _v.set(x, y, z).applyMatrix4(cam.matrixWorldInverse).applyMatrix4(cam.projectionMatrix);
  return Math.abs(_v.x) < margin && Math.abs(_v.y) < margin;
}
