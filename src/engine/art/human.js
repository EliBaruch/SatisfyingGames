// Bloom Rush art kit - human-proportioned animated characters (Quaternius "Animated Men" /
// "Animated Women", CC0). A second rig next to the Kenney Mini Characters of character.js: the same
// public contract (makeCharacter / animateCharacter / userData anchors), reached through
// character.js, which sends a look whose model is one of these packs here.
//
//   look = { model: 'animatedmen/Male_Casual', scale: 1, colors: { Shirt: 0x2f6fd0, Pants: 0x2f6fd0 }, wide: 1.1, shadow: true }
//
// What is different from the mini characters:
//   * about 7 heads tall, ~1.9 m at scale 1 (HUMAN_HEIGHT), slim. `look.wide` thickens the body a
//     little (x/z only) so it still reads from the game camera;
//   * every model is ONE draw call: its material slots (Skin, Hair, Shirt, Pants, Socks, Eyes,
//     HairBase) are flat colours, baked into a vertex-colour skinned geometry per palette, so
//     `look.colors` recolours any slot (overalls, uniforms) for free;
//   * the carried stack sits in the hands in front (userData.carry tells the engine where), and the
//     carry / wave / work / swing poses are procedural: arm bones are aimed in character space on
//     top of the idle / walk / run clips.
import * as THREE from 'three';
import { getModel } from './assets.js';
import { litMaterial } from './material.js';
import { Parts } from './parts.js';

export const HUMAN_HEIGHT = 1.9;
const KITS = /^(animatedmen|animatedwomen)\//;
/** true if this model id is drawn by the human rig */
export function isHumanModel(id) { return typeof id === 'string' && KITS.test(id); }

let _mat = null;
function humanMaterial() {
  if (!_mat) { _mat = litMaterial({ vertexColors: true }); _mat.name = 'human-vertex-colour'; }
  return _mat;
}

// --------------------------------------------------------------------- hats
// Hats for this rig are baked into the character's own skinned geometry (bound to the head bone),
// so a crew in helmets costs no extra draw calls. Unit scale: sits on a 0.2 m wide head; origin = top of the skull.
const HAT_COLORS = { hardhat: 0xffc928, 'hardhat-white': 0xf4f6f8, 'hardhat-orange': 0xff8a2a, 'hardhat-blue': 0x2f7fe0 };
const hatGeos = new Map();
/** true if `kind` is a hat this rig bakes in */
export function isHumanHat(kind) { return kind in HAT_COLORS; }
function hatGeometry(kind) {
  let g = hatGeos.get(kind);
  if (g) return g;
  const c = HAT_COLORS[kind];
  const b = new Parts();
  b.sph(c, 0.135, [0, -0.045, -0.005], [1, 0.8, 1.12], null, 12, 7);
  b.cyl(c, 0.158, 0.158, 0.02, [0, -0.07, 0.03], [0.1, 0, 0], 12, [1, 1, 1.22]);
  b.box(c, 0.035, 0.03, 0.2, [0, 0.062, -0.005]);
  g = b.merged();
  hatGeos.set(kind, g);
  return g;
}

// ------------------------------------------------------------ merged geometry
const geoCache = new Map();
const _c = new THREE.Color();
function paletteKey(colors) {
  if (!colors) return '';
  return Object.keys(colors).sort().map((k) => k + ':' + colors[k]).join(',');
}
/**
 * One skinned vertex-colour geometry from the model's per-material skinned meshes (shared, cached per palette
 * and hat). `hat` = { geo, bone (index of the head bone), matrix (hat frame -> the mesh's bind space) } or null.
 */
function mergedGeometry(id, meshes, colors, hatKey, hat) {
  const key = id + '|' + paletteKey(colors) + '|' + (hatKey || '');
  let g = geoCache.get(key);
  if (g) return g;
  let total = 0, idx = 0;
  for (const m of meshes) { total += m.geometry.attributes.position.count; idx += m.geometry.index ? m.geometry.index.count : m.geometry.attributes.position.count; }
  const hatN = hat ? hat.geo.attributes.position.count : 0;
  total += hatN; idx += hatN;
  const pos = new Float32Array(total * 3), nor = new Float32Array(total * 3), col = new Float32Array(total * 3);
  const sI = new Uint16Array(total * 4), sW = new Float32Array(total * 4);
  const index = total > 65535 ? new Uint32Array(idx) : new Uint16Array(idx);
  let v = 0, ii = 0;
  for (const m of meshes) {
    const A = m.geometry.attributes, n = A.position.count;
    // the slot name survives cloning in userData.srcMat (a JSON copy of the pack material); the colour is on the lit material
    const sm = m.userData.srcMat;
    const name = (sm && sm.name) || (m.material && m.material.userData && m.material.userData.source) || '';
    if (colors && colors[name] != null) _c.set(colors[name]);
    else if (m.material && m.material.color) _c.copy(m.material.color);
    else _c.set(0xffffff);
    for (let i = 0; i < n; i++) {
      const o = v + i;
      pos[o * 3] = A.position.getX(i); pos[o * 3 + 1] = A.position.getY(i); pos[o * 3 + 2] = A.position.getZ(i);
      nor[o * 3] = A.normal.getX(i); nor[o * 3 + 1] = A.normal.getY(i); nor[o * 3 + 2] = A.normal.getZ(i);
      col[o * 3] = _c.r; col[o * 3 + 1] = _c.g; col[o * 3 + 2] = _c.b;
      for (let k = 0; k < 4; k++) { sI[o * 4 + k] = A.skinIndex.getComponent(i, k); sW[o * 4 + k] = A.skinWeight.getComponent(i, k); }
    }
    const gi = m.geometry.index;
    if (gi) for (let i = 0; i < gi.count; i++) index[ii++] = gi.getX(i) + v;
    else for (let i = 0; i < n; i++) index[ii++] = v + i;
    v += n;
  }
  if (hat) {
    // the hat: rigid on the head bone
    const A = hat.geo.attributes, nm = new THREE.Matrix3().getNormalMatrix(hat.matrix);
    for (let i = 0; i < hatN; i++) {
      const o = v + i;
      _v.fromBufferAttribute(A.position, i).applyMatrix4(hat.matrix);
      pos[o * 3] = _v.x; pos[o * 3 + 1] = _v.y; pos[o * 3 + 2] = _v.z;
      _v.fromBufferAttribute(A.normal, i).applyMatrix3(nm).normalize();
      nor[o * 3] = _v.x; nor[o * 3 + 1] = _v.y; nor[o * 3 + 2] = _v.z;
      col[o * 3] = A.color.getX(i); col[o * 3 + 1] = A.color.getY(i); col[o * 3 + 2] = A.color.getZ(i);
      sI[o * 4] = hat.bone; sW[o * 4] = 1;
      index[ii++] = o;
    }
    v += hatN;
  }
  g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.setAttribute('skinIndex', new THREE.BufferAttribute(sI, 4));
  g.setAttribute('skinWeight', new THREE.BufferAttribute(sW, 4));
  g.setIndex(new THREE.BufferAttribute(index, 1));
  geoCache.set(key, g);
  return g;
}

// ------------------------------------------------------------------ creation
const _v = new THREE.Vector3(), _v2 = new THREE.Vector3();
const _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion();
const _s = new THREE.Vector3();

/** ancestors of `obj` below `root`, outermost first (their local quaternions give obj's parent frame in root space) */
function ancestors(obj, root) {
  const list = [];
  for (let p = obj.parent; p && p !== root; p = p.parent) list.unshift(p);
  return list;
}
function arm(bones, side, root) {
  const up = bones['UpperArm' + side], lo = bones['LowerArm' + side], palm = bones['Palm' + side];
  if (!up || !lo || !palm) return null;
  return {
    up, lo,
    upAnc: ancestors(up, root), loAnc: ancestors(lo, root),
    upAxis: lo.position.clone().normalize(),      // the bone's pointing direction in its own frame
    loAxis: palm.position.clone().normalize(),
  };
}

export function makeHuman(look = {}) {
  const L = { model: 'animatedmen/Male_Casual', scale: 1, wide: 1.1, ...look };
  const root = new THREE.Group();
  root.name = 'human:' + L.model;
  const H = HUMAN_HEIGHT * (L.scale || 1);
  const model = getModel(L.model, { height: H, natural: true, receive: false });
  root.add(model);
  const inst = model.userData.instance;
  const ud = root.userData;
  ud.look = L;
  ud.lod = false;
  ud.rig = 'human';
  ud.blobR = 0.4 * (L.scale || 1);
  // the stack is carried in the hands, in front, and turns with the body
  ud.carry = { offset: { x: 0, y: 0.62 * H, z: 0.26 * H }, billboard: false, shadow: L.shadow !== false };
  const mkFree = (x, y, z) => { const o = new THREE.Object3D(); o.position.set(x, y, z); root.add(o); return o; };
  if (!inst) {   // not preloaded: placeholder box, no animation
    ud.hands = { left: mkFree(0.3, 0.9, 0), right: mkFree(-0.3, 0.9, 0) };
    ud.back = mkFree(0, 1.2, -0.25); ud.front = mkFree(0, 1.2, 0.3); ud.head = mkFree(0, H, 0);
    return root;
  }
  const holder = model.children[0];
  if (L.wide && L.wide !== 1) { holder.scale.x *= L.wide; holder.scale.z *= L.wide; holder.position.x *= L.wide; holder.position.z *= L.wide; }

  const meshes = [];
  inst.traverse((o) => { if (o.isSkinnedMesh) meshes.push(o); });
  const bones = {};
  inst.traverse((o) => { if (o.isBone) bones[o.name] = o; });

  // ----- animation
  const mixer = new THREE.AnimationMixer(inst);
  const clips = model.userData.clips || [];
  const find = (re) => clips.find((k) => re.test(k.name));
  const act = {};
  const want = { idle: /_Idle$/i, walk: /_Walk(ing)?$/i, run: /_Run(ning)?$/i };
  for (const n of Object.keys(want)) {
    const c = find(want[n]);
    if (c) { act[n] = mixer.clipAction(c); act[n].play(); act[n].setEffectiveWeight(n === 'idle' ? 1 : 0); }
  }
  mixer.update(Math.random() * 1.5);
  root.updateMatrixWorld(true);

  // ----- anchors: level frames (character axes) at the head top, hands, chest and back, in world units
  const ws = holder.scale.y;
  const anchor = (bone, wx, wy, wz) => {
    const o = new THREE.Object3D();
    if (!bone) { o.position.set(wx, wy, wz); root.add(o); return o; }
    bone.getWorldPosition(_v);
    _v.x += wx; _v.y += wy; _v.z += wz;
    bone.worldToLocal(_v);
    o.position.copy(_v);
    bone.getWorldQuaternion(_q);
    o.quaternion.copy(_q).invert();
    bone.getWorldScale(_s);
    o.scale.set(1 / _s.x, 1 / _s.y, 1 / _s.z);
    bone.add(o);
    return o;
  };
  const k = H / 1.8;
  ud.head = anchor(bones.Head, 0, 0.31 * k, 0.01);
  ud.hands = { left: anchor(bones.PalmL, 0, -0.06 * k, 0), right: anchor(bones.PalmR, 0, -0.06 * k, 0) };
  ud.back = anchor(bones.Torso, 0, 0.12 * k, -0.2 * k);
  ud.front = anchor(bones.Torso, 0, 0.1 * k, 0.24 * k);
  ud.tool = null;

  // one skinned mesh instead of one per material slot, with the hat baked in
  if (meshes.length) {
    const first = meshes[0];
    let hat = null;
    const hatKey = L.hat && isHumanHat(L.hat) && bones.Head ? L.hat + '@' + (L.hatScale || 1) : '';
    if (hatKey && !geoCache.has(L.model + '|' + paletteKey(L.colors || null) + '|' + hatKey)) {
      const sk = first.skeleton, bi = sk.bones.indexOf(bones.Head);
      if (bi >= 0) {
        // hat frame (world units, level, at the top of the skull) -> head bone space -> the mesh's bind space
        ud.head.updateMatrix();
        const m = new THREE.Matrix4().copy(first.bindMatrix).invert()
          .multiply(new THREE.Matrix4().copy(sk.boneInverses[bi]).invert())
          .multiply(ud.head.matrix)
          .multiply(new THREE.Matrix4().makeScale(1.08 * (L.hatScale || 1) * (L.scale || 1), 1.08 * (L.hatScale || 1) * (L.scale || 1), 1.08 * (L.hatScale || 1) * (L.scale || 1)));
        hat = { geo: hatGeometry(L.hat), bone: bi, matrix: m };
      }
    }
    first.geometry = mergedGeometry(L.model, meshes, L.colors || null, hatKey, hat);
    first.material = humanMaterial();
    first.castShadow = L.shadow !== false; first.receiveShadow = false;   // look.shadow: false = blob shadow only (crowds)
    first.frustumCulled = false;
    for (let i = 1; i < meshes.length; i++) if (meshes[i].parent) meshes[i].parent.remove(meshes[i]);
    ud.hatBaked = !!hatKey;
  }

  // which side of the body (in character space, +X or -X) the .L arm is on
  let sx = 1;
  if (bones.UpperArmL) { bones.UpperArmL.getWorldPosition(_v); sx = _v.x >= 0 ? 1 : -1; }
  ud.anim = {
    human: true, mixer, act, bones,
    m: 0, s: 0, carry: 0, swing: 0, wave: 0, work: 0, t: Math.random() * 10,
    acc: 0, last: -1e9,
    armL: arm(bones, 'L', root), armR: arm(bones, 'R', root), sx,
    torso: bones.Torso || null, abdomen: bones.Abdomen || null,
    ws,
  };
  return root;
}

// ----------------------------------------------------------------- animation
/** tuning: minimum wall-clock ms between pose evaluations of one character (0 = every call) */
export const HUMAN_ANIM = { minInterval: 10 };
const _pq = new THREE.Quaternion(), _bw = new THREE.Quaternion(), _dq = new THREE.Quaternion(), _lq = new THREE.Quaternion();
const _cur = new THREE.Vector3(), _dir = new THREE.Vector3();
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const sstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const now = typeof performance !== 'undefined' ? () => performance.now() : () => Date.now();

/** Turn `bone` so that its pointing axis looks along (dx, dy, dz) in character space, blended by `w`. */
function aim(bone, anc, axis, dx, dy, dz, w) {
  _pq.identity();
  for (let i = 0; i < anc.length; i++) _pq.multiply(anc[i].quaternion);
  _bw.copy(_pq).multiply(bone.quaternion);
  _cur.copy(axis).applyQuaternion(_bw).normalize();
  _dir.set(dx, dy, dz).normalize();
  _dq.setFromUnitVectors(_cur, _dir);
  _lq.copy(_pq).invert().multiply(_dq).multiply(_bw);
  bone.quaternion.slerp(_lq, w);
}
function aimArm(a, sign, ux, uy, uz, fx, fy, fz, w) {
  if (!a || w <= 0.01) return;
  aim(a.up, a.upAnc, a.upAxis, sign * ux, uy, uz, w);
  aim(a.lo, a.loAnc, a.loAxis, sign * fx, fy, fz, w);
}

/**
 * Drive a human character: same contract as character.js animateCharacter.
 *   action   null | 'swing' (bent forward, reaching down: sweeping, picking) | 'wave' | 'work' (both hands busy at a bench)
 */
export function animateHuman(char, dt, opts) {
  const ud = char.userData;
  const A = ud.anim;
  if (!A || ud.lod) return;
  A.acc += dt;
  const t = now();
  if (t - A.last < HUMAN_ANIM.minInterval && A.acc < 0.25) return;
  A.last = t;
  const d = A.acc;
  A.acc = 0;

  const moving = opts ? !!opts.moving : false;
  const speed = opts && opts.speed != null ? opts.speed : 1;
  const carrying = opts ? !!opts.carrying : false;
  const action = opts ? opts.action : null;

  const k = 1 - Math.exp(-d * 12);
  A.m += ((moving ? 1 : 0) - A.m) * k;
  A.s += (sstep(0.5, 0.8, speed) - A.s) * k;
  A.carry += ((carrying ? 1 : 0) - A.carry) * k;
  A.swing += ((action === 'swing' ? 1 : 0) - A.swing) * k;
  A.wave += ((action === 'wave' ? 1 : 0) - A.wave) * k;
  A.work += ((action === 'work' ? 1 : 0) - A.work) * k;
  A.t += d;

  const m = A.m < 0.01 ? 0 : A.m;
  const act = A.act;
  if (act.idle) act.idle.setEffectiveWeight(1 - m);
  if (act.walk) { act.walk.setEffectiveWeight(m * (1 - A.s)); act.walk.setEffectiveTimeScale(clamp(speed / 0.45, 0.8, 1.7)); }
  if (act.run) { act.run.setEffectiveWeight(m * A.s); act.run.setEffectiveTimeScale(clamp(speed * 1.05, 0.75, 1.5)); }
  A.mixer.update(d);

  const L = A.armL, R = A.armR, sx = A.sx;
  // bent forward (sweeping up scrap, picking from the ground)
  if (A.swing > 0.01 && A.abdomen) {
    const w = A.swing, ph = Math.sin(A.t * 9);
    _q.setFromAxisAngle(_v.set(1, 0, 0), 0.42 * w);
    A.abdomen.quaternion.multiply(_q);
    aimArm(L, sx, 0.16, -0.72, 0.68, 0.0, -0.75 - ph * 0.2, 0.62, w * (1 - A.carry));
    aimArm(R, -sx, 0.16, -0.72, 0.68, 0.0, -0.75 + ph * 0.2, 0.62, w * (1 - A.carry));
  }
  // both hands busy at a bench or a machine
  if (A.work > 0.01) {
    const w = A.work, ph = Math.sin(A.t * 11);
    aimArm(L, sx, 0.2, -0.82, 0.5, -0.12, -0.05 + ph * 0.45, 1, w);
    aimArm(R, -sx, 0.2, -0.82, 0.5, -0.12, -0.05 - ph * 0.45, 1, w);
  }
  // carrying: forearms level in front, elbows at the sides
  if (A.carry > 0.01) {
    const w = A.carry, bob = m * Math.sin(A.t * 10) * 0.04;
    aimArm(L, sx, 0.2, -0.93, 0.26, -0.1, 0.1 + bob, 1, w);
    aimArm(R, -sx, 0.2, -0.93, 0.26, -0.1, 0.1 - bob, 1, w);
  }
  // wave: right arm up
  if (A.wave > 0.01) aimArm(R, -sx, 0.55, 0.7, 0.2, 0.25 + Math.sin(A.t * 11) * 0.4, 1, 0.1, A.wave);
}
