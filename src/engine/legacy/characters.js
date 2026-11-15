// Legacy code-built characters and tractor (the original Bloom Rush models).
// Do not import this file directly: go through src/engine/chars.js, which is the single
// switch point between this implementation and the art kit's GLB characters.
import * as THREE from 'three';
import { Parts, geo, meshOf } from '../geom.js';

// -------------------------------------------------------------- characters ---
export const LOOKS = {
  player: { skin: 0xffd0a6, shirt: 0x19b9b0, pants: 0x2f5fb0, hair: 0x6b4226, hat: 'straw', apron: false, tool: 'scythe', scale: 1 },
  cutter: { skin: 0xf2b88c, shirt: 0xff8a2a, pants: 0x4a4f7a, hair: 0x3a2a20, hat: 'cap', apron: false, tool: 'scythe', scale: 1 },
  cashier: { skin: 0xffd9b8, shirt: 0xff6fa5, pants: 0x3e4a73, hair: 0xd9812c, hat: null, apron: true, tool: null, scale: 1 },
};

const SKINS = [0xffd9b8, 0xf2b88c, 0xd89a6c, 0xa86f48, 0x7c4a2d, 0xffe0c8];
const SHIRTS = [0xff5d73, 0x5b8cff, 0xffc233, 0x9a6cff, 0x39c96b, 0xff8a2a, 0xe056c8, 0x2ec4ff, 0xf2f2f2];
const PANTS = [0x3a4a8c, 0x5a5160, 0x2f6b5c, 0x7a4b2a, 0x4a3a7a, 0x2c3e5c];
const HAIRS = [0x2b1b12, 0x5a3a22, 0xd9812c, 0xf2d27a, 0x8c2f2f, 0x1c1c26, 0xbfbfc9, 0x5c3a8c];
const pick = (a) => a[(Math.random() * a.length) | 0];

export function randomCustomerLook() {
  const r = Math.random();
  return {
    skin: pick(SKINS), shirt: pick(SHIRTS), pants: pick(PANTS), hair: pick(HAIRS),
    hat: r < 0.2 ? 'cap' : r < 0.32 ? 'straw' : null,
    capColor: pick(SHIRTS),
    apron: false, tool: null, scale: 0.92 + Math.random() * 0.16,
  };
}

function buildScythe() {
  const g = new THREE.Group();
  const b = new Parts();
  // pole runs through the hand along local -Y (the arm direction)
  b.cyl(0xb97a3c, 0.035, 0.035, 1.35, [0, -0.5, 0], null, 6);
  b.sph(0x8a5424, 0.05, [0, 0.19, 0], null, null, 6, 4);
  b.cyl(0x9aa3b2, 0.05, 0.05, 0.07, [0, -1.15, 0], null, 6);
  g.add(meshOf(b.merged()));
  // blade: partial torus in the XY plane, starting at the pole tip, curving away and back
  const R = 0.58;
  const bg = new Parts();
  const tg = geo('scytheBlade', () => new THREE.TorusGeometry(R, 0.075, 4, 10, 1.3));
  bg.add(tg, 0xdfe7f2, [0, -1.18 + R, 0], [0, 0, -Math.PI / 2 - 1.25], [1, 1, 0.5]);
  bg.add(geo('scytheTip', () => new THREE.TorusGeometry(R + 0.06, 0.02, 4, 10, 1.3)), 0xffffff, [0, -1.18 + R, 0.0], [0, 0, -Math.PI / 2 - 1.25], [1.05, 1.05, 0.6]);
  g.add(meshOf(bg.merged()));
  return g;
}

export function makeCharacter(look = {}) {
  const L = { skin: 0xffd0a6, shirt: 0x3399ff, pants: 0x3a4a8c, hair: 0x5a3a22, hat: null, apron: false, tool: null, scale: 1, ...look };
  const root = new THREE.Group();
  const rig = new THREE.Group();
  root.add(rig);
  const shoe = 0x6b4426;

  // torso
  const t = new Parts();
  t.cyl(L.shirt, 0.25, 0.3, 0.46, [0, 0.93, 0], null, 12, [1, 1, 0.82]);
  t.cyl(L.pants, 0.3, 0.3, 0.24, [0, 0.69, 0], null, 12, [1, 1, 0.82]);
  t.sph(L.shirt, 0.15, [0.35, 1.08, 0], [1, 1, 1], null, 8, 6);
  t.sph(L.shirt, 0.15, [-0.35, 1.08, 0], [1, 1, 1], null, 8, 6);
  t.cyl(L.skin, 0.09, 0.1, 0.1, [0, 1.2, 0], null, 8);
  if (L.apron) {
    t.box(0xffffff, 0.46, 0.5, 0.05, [0, 0.82, 0.235], [0.08, 0, 0]);
    t.box(0xff6fa5, 0.46, 0.06, 0.06, [0, 0.58, 0.245], [0.08, 0, 0]);
    t.box(0xffffff, 0.1, 0.36, 0.05, [0.17, 1.12, 0.2], [0.3, 0, 0]);
    t.box(0xffffff, 0.1, 0.36, 0.05, [-0.17, 1.12, 0.2], [0.3, 0, 0]);
    t.box(0xffe27a, 0.2, 0.14, 0.06, [0, 0.68, 0.27]);
  } else if (L.hat === 'straw') {
    // overalls: bib + straps
    t.box(0x2f5fb0 === L.pants ? L.pants : L.pants, 0.34, 0.3, 0.05, [0, 0.98, 0.215], [0.02, 0, 0]);
    t.box(L.pants, 0.07, 0.4, 0.05, [0.15, 1.1, 0.19], [0.1, 0, 0]);
    t.box(L.pants, 0.07, 0.4, 0.05, [-0.15, 1.1, 0.19], [0.1, 0, 0]);
    t.sph(0xffd23f, 0.035, [0.09, 1.02, 0.245], null, null, 6, 4);
    t.sph(0xffd23f, 0.035, [-0.09, 1.02, 0.245], null, null, 6, 4);
  }
  rig.add(meshOf(t.merged()));

  // head
  const head = new THREE.Group();
  head.position.set(0, 1.4, 0);
  const hp = new Parts();
  hp.sph(L.skin, 0.27, [0, 0, 0], null, null, 16, 12);
  hp.sph(L.skin, 0.05, [0.265, -0.01, 0], [0.5, 1, 1], null, 6, 4);
  hp.sph(L.skin, 0.05, [-0.265, -0.01, 0], [0.5, 1, 1], null, 6, 4);
  // hair cap + back
  if (L.hat !== 'cap') hp.add(geo('hairCap', () => new THREE.SphereGeometry(0.29, 16, 8, 0, Math.PI * 2, 0, Math.PI * 0.4)), L.hair, [0, 0.02, -0.02]);
  hp.sph(L.hair, 0.27, [0, -0.02, -0.07], [1, 0.95, 0.95], null, 12, 8);
  // face
  hp.sph(0x2b2233, 0.04, [0.1, 0.02, 0.235], [1, 1.25, 0.6], null, 8, 6);
  hp.sph(0x2b2233, 0.04, [-0.1, 0.02, 0.235], [1, 1.25, 0.6], null, 8, 6);
  hp.sph(0xffffff, 0.014, [0.11, 0.045, 0.255], null, null, 4, 3);
  hp.sph(0xffffff, 0.014, [-0.09, 0.045, 0.255], null, null, 4, 3);
  hp.sph(0xff8fa0, 0.05, [0.16, -0.06, 0.2], [1, 0.7, 0.4], null, 6, 4);
  hp.sph(0xff8fa0, 0.05, [-0.16, -0.06, 0.2], [1, 0.7, 0.4], null, 6, 4);
  hp.add(geo('smile', () => new THREE.TorusGeometry(0.055, 0.013, 4, 8, Math.PI)), 0x7a3b3b, [0, -0.07, 0.245], [0, 0, Math.PI]);
  if (L.hat === 'straw') {
    hp.cyl(0xf2c75c, 0.5, 0.5, 0.035, [0, 0.2, 0], [0.06, 0, 0], 16);
    hp.cyl(0xf7d878, 0.22, 0.26, 0.17, [0, 0.29, 0], null, 12);
    hp.cyl(0xe2453c, 0.265, 0.265, 0.05, [0, 0.235, 0], null, 12);
  } else if (L.hat === 'cap') {
    const cc = L.capColor ?? (L.shirt === LOOKS.cutter.shirt ? 0xffe14d : L.shirt);
    hp.add(geo('capDome', () => new THREE.SphereGeometry(0.295, 14, 8, 0, Math.PI * 2, 0, Math.PI * 0.5)), cc, [0, 0.07, 0]);
    hp.box(cc, 0.34, 0.035, 0.24, [0, 0.12, 0.3], [0.2, 0, 0]);
    hp.sph(0xffffff, 0.04, [0, 0.35, 0], null, null, 6, 4);
  }
  head.add(meshOf(hp.merged()));
  rig.add(head);

  // arms / legs on pivots
  const mkArm = (sx) => {
    const pv = new THREE.Group();
    pv.position.set(sx * 0.36, 1.08, 0);
    pv.rotation.order = 'YXZ';
    const a = new Parts();
    a.cyl(L.shirt, 0.09, 0.085, 0.3, [0, -0.17, 0], null, 8);
    a.sph(L.skin, 0.105, [0, -0.38, 0], null, null, 10, 8);
    pv.add(meshOf(a.merged()));
    const hand = new THREE.Object3D();
    hand.position.set(0, -0.38, 0);
    pv.add(hand);
    rig.add(pv);
    return { pv, hand };
  };
  const mkLeg = (sx) => {
    const pv = new THREE.Group();
    pv.position.set(sx * 0.15, 0.6, 0);
    const a = new Parts();
    a.cyl(L.pants, 0.11, 0.105, 0.4, [0, -0.2, 0], null, 8);
    a.sph(shoe, 0.13, [0, -0.5, 0.05], [1, 0.72, 1.45], null, 10, 6);
    pv.add(meshOf(a.merged()));
    rig.add(pv);
    return pv;
  };
  const armL = mkArm(1); // +X is the character's left (faces +Z)
  const armR = mkArm(-1);
  const legL = mkLeg(1);
  const legR = mkLeg(-1);

  if (L.tool === 'scythe') {
    const sc = buildScythe();
    armR.hand.add(sc);
    root.userData.tool = sc;
  }

  root.userData.hands = { left: armL.hand, right: armR.hand };
  root.userData.parts = { rig, head, armL: armL.pv, armR: armR.pv, legL, legR };
  root.userData.anim = { phase: Math.random() * 6, run: 0, carry: 0, swing: 0, wave: 0, t: Math.random() * 6, swingPhase: 0 };
  root.userData.hasTool = L.tool === 'scythe';
  root.scale.setScalar(L.scale);
  return root;
}

const lerp = (a, b, t) => a + (b - a) * t;

export function animateCharacter(char, dt, opts = {}) {
  const { moving = false, speed = 1, carrying = false, action = null } = opts;
  const P = char.userData.parts;
  const A = char.userData.anim;
  if (!P || !A) return;
  const k = 1 - Math.exp(-dt * 12);
  A.run += ((moving ? 1 : 0) - A.run) * k;
  A.carry += ((carrying ? 1 : 0) - A.carry) * k;
  A.swing += ((action === 'swing' ? 1 : 0) - A.swing) * k;
  A.wave += ((action === 'wave' ? 1 : 0) - A.wave) * k;
  A.t += dt;
  const sp = Math.min(Math.max(speed, 0.4), 2.2);
  if (A.run > 0.02) A.phase += dt * (9 + 3.5 * sp);
  A.swingPhase += dt * (A.swing > 0.05 ? 12 : 0);

  const run = A.run;
  const sinP = Math.sin(A.phase);
  const cosP = Math.cos(A.phase);
  const breathe = Math.sin(A.t * 2.4);
  const hasTool = char.userData.hasTool;

  // legs
  P.legL.rotation.x = sinP * 0.9 * run;
  P.legR.rotation.x = -sinP * 0.9 * run;
  P.legL.rotation.z = 0.02;
  P.legR.rotation.z = -0.02;

  // arms: left
  let lx = lerp(0.04 * breathe, -sinP * 0.8, run);
  let lz = lerp(0.08 + 0.02 * breathe, 0.12, run);
  let ly = 0;
  // right (tool arm if any)
  let rx = lerp(0.04 * breathe, sinP * 0.8, run);
  let rz = lerp(-0.08 - 0.02 * breathe, -0.12, run);
  let ry = 0;
  if (hasTool) {
    rx = lerp(-0.55 + 0.04 * breathe, -0.55 + sinP * 0.22, run);
    rz = -0.1;
    // swing: sweep the scythe forward and side to side
    rx = lerp(rx, -1.25, A.swing);
    ry = Math.sin(A.swingPhase) * 0.95 * A.swing;
    rz = lerp(rz, -0.05, A.swing);
  }
  // carrying: both arms held back and a little out
  const c = A.carry;
  lx = lerp(lx, 1.05, c); lz = lerp(lz, 0.3, c);
  if (!hasTool) { rx = lerp(rx, 1.05, c); rz = lerp(rz, -0.3, c); } else { rx = lerp(rx, 0.9, c * (1 - A.swing)); rz = lerp(rz, -0.3, c * (1 - A.swing)); }
  // wave
  const w = A.wave;
  if (w > 0.01) {
    rx = lerp(rx, 0.0, w);
    rz = lerp(rz, -2.5 + Math.sin(A.t * 9) * 0.35, w);
    ry = lerp(ry, 0, w);
  }
  P.armL.rotation.set(lx, ly, lz);
  P.armR.rotation.set(rx, ry, rz);

  // body: bob, lean, breathing, little twist
  const bob = Math.abs(cosP) * 0.085 * run;
  P.rig.position.y = bob;
  P.rig.rotation.x = 0.13 * run + 0.03 * Math.sin(A.t * 1.2) * (1 - run);
  P.rig.rotation.y = sinP * 0.1 * run - Math.sin(A.swingPhase) * 0.22 * A.swing;
  P.rig.rotation.z = cosP * 0.04 * run;
  P.rig.scale.y = 1 + 0.018 * breathe * (1 - run);
  P.head.rotation.x = -0.05 * run + 0.02 * breathe;
  P.head.rotation.z = -cosP * 0.05 * run;
}

// ----------------------------------------------------------------- tractor ---
function makeWheel(r, w, hub, lugs) {
  const pv = new THREE.Group();
  const p = new Parts();
  p.cyl(0x2d2d38, r, r, w, [0, 0, 0], [0, 0, Math.PI / 2], 14);
  p.cyl(hub, r * 0.55, r * 0.55, w + 0.05, [0, 0, 0], [0, 0, Math.PI / 2], 10);
  p.cyl(0xffffff, r * 0.18, r * 0.18, w + 0.09, [0, 0, 0], [0, 0, Math.PI / 2], 6);
  for (let i = 0; i < lugs; i++) {
    const a = (i / lugs) * Math.PI * 2;
    p.box(0x1c1c24, w + 0.02, r * 0.22, r * 0.28, [0, Math.sin(a) * r, Math.cos(a) * r], [-a + Math.PI / 2 * 0 + 0, 0, 0]);
  }
  const m = meshOf(p.merged());
  pv.add(m);
  return pv;
}

export function makeTractor(color = 0xe8452c) {
  const g = new THREE.Group();
  const dark = new THREE.Color(color).multiplyScalar(0.75).getHex();
  const b = new Parts();
  // chassis
  b.box(0x3a3f4d, 1.2, 0.22, 2.0, [0, 0.46, 0.4]);
  // engine hood
  b.box(color, 1.0, 0.72, 0.95, [0, 0.98, 0.9]);
  b.box(dark, 1.04, 0.1, 0.99, [0, 0.64, 0.9]);
  b.box(0xffffff, 0.6, 0.06, 0.7, [0, 1.37, 0.9]);
  // grille + headlights
  b.box(0x2d3140, 0.7, 0.45, 0.05, [0, 0.98, 1.39]);
  for (const sx of [-1, 1]) b.sph(0xfff2a0, 0.12, [sx * 0.36, 1.08, 1.4], [1, 1, 0.6], null, 8, 6);
  // exhaust
  b.cyl(0x3a3f4d, 0.07, 0.07, 0.8, [0.34, 1.78, 0.75], null, 8);
  b.cyl(0x22252e, 0.1, 0.07, 0.1, [0.34, 2.2, 0.75], null, 8);
  // fenders over big wheels
  for (const sx of [-1, 1]) b.box(dark, 0.5, 0.08, 1.4, [sx * 0.8, 1.46, 0.1]);
  // cabin: seat, posts and roof
  b.box(0x2e3550, 0.6, 0.12, 0.5, [0, 0.9, -0.2]);
  b.box(0x2e3550, 0.6, 0.55, 0.12, [0, 1.15, -0.42]);
  b.box(0x3a3f4d, 0.07, 0.07, 0.07, [0, 1.3, 0.35]);
  b.box(0x3a3f4d, 0.04, 0.55, 0.04, [0, 1.55, 0.3], [0.35, 0, 0]);
  for (const sx of [-1, 1]) for (const sz of [-0.55, 0.45]) b.box(0xffffff, 0.08, 1.1, 0.08, [sx * 0.52, 1.55, sz]);
  b.box(0xffffff, 1.3, 0.1, 1.3, [0, 2.12, -0.05]);
  b.box(color, 1.38, 0.06, 1.38, [0, 2.2, -0.05]);
  // bed (open cargo, low walls)
  b.box(0x9a6a3a, 1.6, 0.1, 1.1, [0, 0.52, -1.3]);
  b.box(0xb98048, 0.1, 0.34, 1.2, [-0.8, 0.74, -1.3]);
  b.box(0xb98048, 0.1, 0.34, 1.2, [0.8, 0.74, -1.3]);
  b.box(0xb98048, 1.7, 0.34, 0.1, [0, 0.74, -1.88]);
  b.box(0xb98048, 1.7, 0.34, 0.1, [0, 0.74, -0.72]);
  // blade arms
  for (const sx of [-1, 1]) b.box(0x3a3f4d, 0.12, 0.12, 0.8, [sx * 0.62, 0.46, 1.4]);
  g.add(meshOf(b.merged(), { receive: false }));

  // wheels
  const wheels = [];
  const wr = 0.68;
  for (const sx of [-1, 1]) {
    const w = makeWheel(wr, 0.38, 0xffd23f, 10);
    w.position.set(sx * 0.78, wr, 0.0);
    g.add(w); wheels.push(w);
    const f = makeWheel(0.38, 0.28, 0xffd23f, 8);
    f.position.set(sx * 0.68, 0.38, 1.05);
    g.add(f); wheels.push(f);
  }

  // cutter reel
  const blade = new THREE.Group();
  blade.position.set(0, 0.6, 1.8);
  const rp = new Parts();
  rp.cyl(0x9aa3b2, 0.08, 0.08, 3.4, [0, 0, 0], [0, 0, Math.PI / 2], 8);
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    const rad = 0.4;
    rp.box(i % 2 ? 0xffb21a : 0xff3d2e, 3.1, 0.07, 0.34, [0, Math.sin(a) * rad, Math.cos(a) * rad], [-a + Math.PI / 2, 0, 0]);
  }
  for (const sx of [-1, 1]) rp.cyl(0xb02a24, 0.7, 0.7, 0.08, [sx * 1.68, 0, 0], [0, 0, Math.PI / 2], 12);
  for (const sx of [-1, 1]) rp.cyl(0xffd23f, 0.16, 0.16, 0.14, [sx * 1.7, 0, 0], [0, 0, Math.PI / 2], 8);
  blade.add(meshOf(rp.merged()));
  g.add(blade);
  { const cb = new Parts(); cb.box(0xc9d2de, 3.4, 0.1, 0.35, [0, 0.12, 2.15]); cb.box(0x4a5060, 3.5, 0.18, 0.1, [0, 0.3, 2.3]); g.add(meshOf(cb.merged())); }

  const bedAnchor = new THREE.Object3D();
  bedAnchor.position.set(0, 0.57, -1.3);
  g.add(bedAnchor);
  g.userData.wheels = wheels;
  g.userData.blade = blade;
  g.userData.bedAnchor = bedAnchor;
  return g;
}
