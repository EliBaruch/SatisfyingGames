// Bloom Rush art kit - animated characters (Kenney "Mini Characters", CC0), drop-in for the old
// code-built ones: same exported names and signatures.
//
//   await preloadCharacters();
//   const hero = makeCharacter(LOOKS.player);       // feet at origin, faces +Z, ~1.65 tall
//   scene.add(hero);
//   animateCharacter(hero, dt, { moving, speed: 1, carrying: false, action: null | 'swing' | 'wave' });
//
// The pack's characters cannot be recoloured (each one has its own painted palette), so variety
// comes from the 20 models (+ the shop employee). `look.model` picks one.
import * as THREE from 'three';
import { preload, getModel, KIT_SCALE } from './assets.js';
import { Parts, meshOf } from './parts.js';
import { isHumanModel, makeHuman, animateHuman } from './human.js';

export const CHARACTER_HEIGHT = 1.65;          // nominal standing height of a standard character (scale 1)
const SCALE = KIT_SCALE['mini-characters'];
/** tuning: minimum wall-clock ms between mixer evaluations of one character (0 = evaluate every call) */
export const ANIM = { minInterval: 10 };

/** short model names accepted in `look.model` ('worker' -> mini-characters/character-worker) */
export const MODELS = [
  'alien', 'female-a', 'female-b', 'female-c', 'female-d', 'female-e', 'female-f', 'knight',
  'male-a', 'male-b', 'male-c', 'male-d', 'male-e', 'male-f', 'male-g', 'raider', 'robot', 'soldier', 'worker', 'zombie',
  'employee',
];

function fullId(m) {
  if (m.includes('/')) return m;
  return m === 'employee' ? 'mini-shop/character-employee' : `mini-characters/character-${m}`;
}

/**
 * Looks. A look is { model, tool, scale }: model = one of MODELS, tool = null | 'scythe' | 'axe' | 'sword' | 'bucket' | 'basket',
 * scale = size multiplier (1 = 1.65 tall). Add your own: LOOKS.farmer = { model: 'male-e', tool: 'bucket' }.
 */
export const LOOKS = {
  player: { model: 'male-b', tool: 'scythe', scale: 1.0 },       // the hero: bearded farmer in blue overalls
  cutter: { model: 'male-a', tool: 'scythe', scale: 1.0 },       // flower cutter worker (glasses, green shirt)
  cashier: { model: 'employee', tool: null, scale: 1.0 },        // shop / checkout staff
  farmer: { model: 'male-e', tool: 'bucket', scale: 1.0 },       // chicken world helper (grey-haired, suspenders)
  collector: { model: 'female-b', tool: 'basket', scale: 1.0 },  // egg collector
  stocker: { model: 'worker', tool: null, scale: 1.0 },          // grocery stocker (hard hat)
  employee: { model: 'employee', tool: null, scale: 1.0 },       // generic shop employee
};

// customers: the ordinary-looking people (no zombie / robot / alien / knight / raider / soldier / pirate / police)
const CUSTOMER_MODELS = ['female-a', 'female-b', 'female-c', 'female-d', 'female-e', 'female-f', 'male-a', 'male-b', 'male-d', 'male-e', 'male-f'];

/** A random shopper / customer look (varied model and a little size variation). */
export function randomCustomerLook() {
  return { model: CUSTOMER_MODELS[(Math.random() * CUSTOMER_MODELS.length) | 0], tool: null, scale: 0.94 + Math.random() * 0.1 };
}

/**
 * Load the character models. With no argument: every model used by LOOKS plus the customer pool.
 * Pass an array of model names to load only those, or 'all' for all 21.
 */
export function preloadCharacters(which) {
  let names;
  if (which === 'all') names = MODELS;
  else if (Array.isArray(which)) names = which;
  else names = [...new Set([...Object.values(LOOKS).map((l) => l.model), ...CUSTOMER_MODELS])];
  return preload(names.map(fullId));
}

// ------------------------------------------------------------------- tools ---
const toolCache = new Map();
function buildTool(kind) {
  if (toolCache.has(kind)) return toolCache.get(kind);
  const g = new THREE.Group();
  const b = new Parts();
  if (kind === 'scythe') {
    // wooden pole with a curved steel blade at one end; grip point at the origin, pole along Y,
    // blade end at -Y curling toward -X (the character's outside for the right hand)
    b.cyl(0xc98d4c, 0.036, 0.036, 1.55, [0, 0.15, 0], null, 10);
    b.sph(0x8a5a2a, 0.06, [0, 0.93, 0], null, null, 10, 8);
    b.cyl(0x8d97a8, 0.06, 0.06, 0.09, [0, -0.6, 0], null, 12);
    g.add(meshOf(b));
    const bl = new Parts();
    const R = 0.62;
    bl.torus(0xeef3fb, R, 0.07, [0, -0.64 + R, 0], [0, 0, -Math.PI / 2 - 1.35], [1, 1, 0.42], 1.4, 6, 18);
    g.add(meshOf(bl));
    // blade tilt: blade end forward-down-inward, handle end back-up-outward
    g.userData.aim = [0.12, -0.55, 0.83];
  } else if (kind === 'axe') {
    // a felling axe: grip at the origin, handle along Y, the head at the -Y end with its edge toward -X
    b.cyl(0xb9793c, 0.04, 0.045, 1.0, [0, -0.12, 0], null, 10);
    b.sph(0x8a5a2a, 0.06, [0, 0.4, 0], null, null, 10, 8);
    b.rbox(0x6f7a8c, 0.2, 0.22, 0.1, 0.03, [-0.02, -0.56, 0]);
    b.rbox(0xe6edf7, 0.2, 0.34, 0.06, 0.025, [-0.17, -0.56, 0]);
    b.rbox(0xffffff, 0.05, 0.38, 0.035, 0.015, [-0.28, -0.56, 0]);
    g.add(meshOf(b));
    g.userData.aim = [0.12, -0.55, 0.83];
  } else if (kind === 'sword') {
    // a knight's sword: grip at the origin, blade along -Y with a gold crossguard
    b.cyl(0x5a3b24, 0.04, 0.04, 0.26, [0, 0.08, 0], null, 8);
    b.sph(0xffc42e, 0.06, [0, 0.24, 0], null, null, 8, 6);
    b.rbox(0xffc42e, 0.34, 0.06, 0.08, 0.025, [0, -0.07, 0]);
    b.rbox(0xdfe6f0, 0.11, 0.86, 0.035, 0.015, [0, -0.52, 0]);
    b.rbox(0xffffff, 0.03, 0.8, 0.04, 0.01, [-0.045, -0.52, 0]);
    b.cone(0xdfe6f0, 0.055, 0.14, [0, -1.02, 0], [Math.PI, 0, 0], 4, [1, 1, 0.35]);
    g.add(meshOf(b));
    g.userData.aim = [0.12, -0.55, 0.83];
  } else if (kind === 'bucket') {
    b.cyl(0xe8eef6, 0.2, 0.15, 0.26, [0, -0.2, 0.0], null, 20);
    b.cyl(0xb9c3d3, 0.205, 0.205, 0.035, [0, -0.07, 0], null, 20);
    b.torus(0x8d97a8, 0.19, 0.016, [0, -0.07, 0], [Math.PI / 2, 0, 0], null, Math.PI, 5, 16);
    g.add(meshOf(b));
  } else if (kind === 'basket') {
    b.cyl(0xe2b46a, 0.24, 0.18, 0.2, [0, -0.2, 0.05], null, 20);
    b.torus(0xc89448, 0.23, 0.02, [0, -0.1, 0.05], [Math.PI / 2, 0, 0], null, Math.PI * 2, 5, 20);
    b.torus(0xc89448, 0.22, 0.02, [0, -0.1, 0.05], [0, Math.PI / 2, 0], null, Math.PI, 5, 16);
    g.add(meshOf(b));
  }
  toolCache.set(kind, g);
  return g;
}

// ---------------------------------------------------------------- creation ---
const _down = new THREE.Vector3(0, -1, 0);
const _aim = new THREE.Vector3();
const BONES = ['root', 'torso', 'head', 'arm-left', 'arm-right', 'leg-left', 'leg-right'];

function findBones(inst) {
  const out = {};
  inst.traverse((o) => { if (o.isBone && BONES.includes(o.name)) out[o.name] = o; });
  return out;
}

const HAND_X = 0.25; // distance of the hand centre from the shoulder pivot, in model units

/**
 * A character. look: { model, tool, scale } (a LOOKS entry, or any object). Returns a Group:
 *   userData.hands = { left, right }   Object3D anchors at the hands (children use WORLD units; the frame is
 *                                      "level": +Y up, +Z forward when the arm hangs in the idle pose)
 *   userData.back / .front / .head     anchors for carried stacks and hats
 *   userData.tool                      the attached tool object (or null)
 *   userData.lod                       set truthy to freeze animation (far-away characters)
 * If the model has not been preloaded you get a placeholder box and animateCharacter does nothing.
 */
export function makeCharacter(look = {}) {
  if (isHumanModel(look.model)) return makeHuman(look);   // human-proportioned rig (art/human.js)
  const L = { model: 'male-a', tool: null, scale: 1, ...look };
  const id = fullId(L.model);
  const root = new THREE.Group();
  root.name = 'character:' + L.model;
  const model = getModel(id, { scale: L.scale, natural: false, receive: true });
  root.add(model);
  const inst = model.userData.instance;
  const ud = root.userData;
  ud.look = L;
  ud.lod = false;
  const ws = model.userData.scale || SCALE; // world scale of the model's units
  const mk = (parent, x, y, z, rotZ = 0) => {
    const o = new THREE.Object3D();
    o.position.set(x, y, z);
    o.rotation.z = rotZ;
    o.scale.setScalar(1 / ws);
    parent.add(o);
    return o;
  };
  if (!inst) { ud.hands = { left: mk(root, 0.3, 0.8, 0), right: mk(root, -0.3, 0.8, 0) }; ud.back = mk(root, 0, 1, -0.3); ud.front = mk(root, 0, 1, 0.3); ud.head = mk(root, 0, 1.5, 0); return root; }

  const bones = findBones(inst);
  const hands = {
    left: mk(bones['arm-left'], HAND_X, 0, 0, Math.PI / 4),
    right: mk(bones['arm-right'], -HAND_X, 0, 0, -Math.PI / 4),
  };
  ud.hands = hands;
  ud.back = mk(bones.torso, 0, 0.05, -0.17);
  ud.front = mk(bones.torso, 0, 0.0, 0.24);
  ud.head = mk(bones.head, 0, 0.14, 0);
  ud.tool = null;
  if (L.tool) {
    const t = buildTool(L.tool).clone();
    // pole tilts forward-down from the hand; blade end near the ground in front
    if (t.userData.aim) t.quaternion.setFromUnitVectors(_down, _aim.fromArray(t.userData.aim).normalize());
    hands.right.add(t);
    ud.tool = t;
  }

  // ----- animation state (everything preallocated; animateCharacter allocates nothing)
  const mixer = new THREE.AnimationMixer(inst);
  const clips = model.userData.clips;
  const act = {};
  for (const n of ['idle', 'walk', 'sprint']) {
    const c = clips.find((k) => k.name === n);
    if (c) { act[n] = mixer.clipAction(c); act[n].play(); act[n].setEffectiveWeight(n === 'idle' ? 1 : 0); }
  }
  const hold = clips.find((k) => k.name === 'holding-both');
  const A = ud.anim = {
    mixer, act, bones,
    m: 0, s: 0, carry: 0, swing: 0, wave: 0, t: Math.random() * 10, swingT: 0,
    acc: 0, last: -1e9,
    holdL: new THREE.Quaternion(), holdR: new THREE.Quaternion(),
  };
  if (hold) {
    for (const tr of hold.tracks) {
      if (tr.name === 'arm-left.quaternion') A.holdL.fromArray(tr.values, 0);
      else if (tr.name === 'arm-right.quaternion') A.holdR.fromArray(tr.values, 0);
    }
  } else { A.holdL.set(0, -0.5, 0, 0.866); A.holdR.set(0, 0.5, 0, 0.866); }
  // random starting phase so crowds do not move in lockstep, and never show the T-pose
  mixer.update(Math.random() * 1.2);
  return root;
}

// -------------------------------------------------------------- animation ---
const _qa = new THREE.Quaternion();
const _qb = new THREE.Quaternion();
const _ex = new THREE.Euler();
const lerp = (a, b, t) => a + (b - a) * t;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const sstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const now = typeof performance !== 'undefined' ? () => performance.now() : () => Date.now();

/**
 * Drive a character. Call once per fixed simulation step with that step's dt.
 *   moving   walking/running this step
 *   speed    run speed relative to the normal run (1 = normal; < ~0.7 shows the walk cycle)
 *   carrying both arms held out in front (blended)
 *   action   null | 'swing' (looping harvest swing of the right arm) | 'wave'
 * Cheap: pose evaluation is skipped while `char.userData.lod` is truthy, and the (costly)
 * mixer evaluation happens at most about once per rendered frame however many steps ran, using the
 * accumulated dt. No allocation.
 */
export function animateCharacter(char, dt, opts) {
  const ud = char.userData;
  const A = ud.anim;
  if (!A || ud.lod) return;
  if (A.human) { animateHuman(char, dt, opts); return; }
  A.acc += dt;
  const t = now();
  if (t - A.last < ANIM.minInterval && A.acc < 0.25) return;
  A.last = t;
  const d = A.acc;
  A.acc = 0;

  const moving = opts ? !!opts.moving : false;
  const speed = opts && opts.speed != null ? opts.speed : 1;
  const carrying = opts ? !!opts.carrying : false;
  const action = opts ? opts.action : null;

  const k = 1 - Math.exp(-d * 14);
  A.m += ((moving ? 1 : 0) - A.m) * k;
  A.s += (sstep(0.55, 0.9, speed) - A.s) * k;
  A.carry += ((carrying ? 1 : 0) - A.carry) * k;
  A.swing += ((action === 'swing' ? 1 : 0) - A.swing) * k;
  A.wave += ((action === 'wave' ? 1 : 0) - A.wave) * k;
  A.t += d;
  if (A.swing > 0.02) A.swingT += d * (moving ? 9 : 8.5);

  const m = A.m < 0.01 ? 0 : A.m;
  const act = A.act;
  if (act.idle) act.idle.setEffectiveWeight(1 - m);
  if (act.walk) { act.walk.setEffectiveWeight(m * (1 - A.s)); act.walk.setEffectiveTimeScale(clamp(speed / 0.55, 0.7, 1.5)); }
  if (act.sprint) { act.sprint.setEffectiveWeight(m * A.s); act.sprint.setEffectiveTimeScale(clamp(speed, 0.8, 1.6)); }
  A.mixer.update(d);

  const B = A.bones;
  // carrying: both arms forward (the pack's own holding-both pose)
  if (A.carry > 0.01) {
    B['arm-left'].quaternion.slerp(A.holdL, A.carry);
    B['arm-right'].quaternion.slerp(A.holdR, A.carry);
  }
  // swing: right arm sweeps across the front, torso follows
  if (A.swing > 0.01) {
    const w = A.swing;
    const sweep = Math.sin(A.swingT);                  // -1..1
    const yaw = 0.95 + sweep * 0.75;                   // arm yaw: 0.2 (out to the side) .. 1.7 (across the front)
    _qa.setFromEuler(_ex.set(0, yaw, -0.1 + 0.15 * Math.cos(A.swingT), 'YXZ'));
    B['arm-right'].quaternion.slerp(_qa, w);
    _qb.setFromEuler(_ex.set(0, -sweep * 0.32, 0, 'YXZ'));
    B.torso.quaternion.multiply(_qb.slerp(_qa.identity(), 1 - w));
    // left arm counter-swing
    _qa.setFromEuler(_ex.set(0, -0.5 - sweep * 0.3, 0.1, 'YXZ'));
    B['arm-left'].quaternion.slerp(_qa, w * 0.7 * (1 - A.carry));
  }
  // wave: right arm up, hand shaking
  if (A.wave > 0.01) {
    _qa.setFromEuler(_ex.set(0, 0.35, -1.15 + Math.sin(A.t * 11) * 0.3, 'YXZ'));
    B['arm-right'].quaternion.slerp(_qa, A.wave);
  }
}
