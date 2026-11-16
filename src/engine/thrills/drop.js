// Lucky drop: a crate parachutes in near the player and opens into two prize gates.
// The player runs through the prize they want (gates.js); the other one is lost. Ignored gates
// fade after a while with no penalty.
//
// One gate is money (or a mystery), the other a boost, a star or a mystery. A mystery always
// pays at least a small prize and sometimes a jackpot.
import * as THREE from 'three';
import { fmtMoney } from '../config.js';
import { addBlob } from '../chars.js';
import { mergeGroup } from './util.js';

const FALL_FROM = 15, FALL_TIME = 2.1;
const GREEN = 0x35c46a, PURPLE = 0x9b5cff, ORANGE = 0xff7a1a, BLUE = 0x2e9bff, GOLD = 0xf0b400, VIOLET = 0x7a4bd6;

function makeCrate() {
  const g = new THREE.Group(), body = new THREE.Group();
  const wood = new THREE.MeshLambertMaterial({ color: 0xd49a52 });
  const dark = new THREE.MeshLambertMaterial({ color: 0x9a6a30 });
  const gold = new THREE.MeshLambertMaterial({ color: 0xffc928 });
  const box = new THREE.Mesh(new THREE.BoxGeometry(1.15, 1.0, 1.15), wood);
  box.position.y = 0.5;
  const rim1 = new THREE.Mesh(new THREE.BoxGeometry(1.25, 0.14, 1.25), dark); rim1.position.y = 0.07;
  const rim2 = rim1.clone(); rim2.position.y = 0.93;
  const band1 = new THREE.Mesh(new THREE.BoxGeometry(0.26, 1.04, 1.2), gold); band1.position.y = 0.5;
  const band2 = new THREE.Mesh(new THREE.BoxGeometry(1.2, 1.04, 0.26), gold); band2.position.y = 0.5;
  const knot = new THREE.Mesh(new THREE.SphereGeometry(0.2, 10, 8), gold); knot.position.y = 1.08;
  for (const m of [box, rim1, rim2, band1, band2, knot]) body.add(m);
  g.add(mergeGroup(body, { emissive: 0x241600 }));
  // parachute: a striped canopy and four lines
  const chute = new THREE.Group();
  const canopyGeo = new THREE.SphereGeometry(1.7, 12, 6, 0, Math.PI * 2, 0, Math.PI * 0.5);
  const colors = new Float32Array(canopyGeo.attributes.position.count * 3);
  const pos = canopyGeo.attributes.position;
  const a = new THREE.Color(0xff4d7d), b = new THREE.Color(0xffffff);
  for (let i = 0; i < pos.count; i++) {
    const ang = Math.atan2(pos.getZ(i), pos.getX(i));
    const c = Math.floor(((ang + Math.PI) / (Math.PI * 2)) * 12 + 0.001) % 2 ? a : b;
    colors[i * 3] = c.r; colors[i * 3 + 1] = c.g; colors[i * 3 + 2] = c.b;
  }
  canopyGeo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  const canopy = new THREE.Mesh(canopyGeo.toNonIndexed(), new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide, flatShading: true }));
  canopy.position.y = 2.9;
  canopy.scale.set(1, 0.75, 1);
  chute.add(canopy);
  const lineMat = new THREE.MeshLambertMaterial({ color: 0xffffff });
  for (let i = 0; i < 4; i++) {
    const ang = Math.PI / 4 + i * Math.PI / 2;
    const top = new THREE.Vector3(Math.cos(ang) * 1.55, 2.95, Math.sin(ang) * 1.55);
    const bot = new THREE.Vector3(Math.cos(ang) * 0.5, 1.0, Math.sin(ang) * 0.5);
    const len = top.distanceTo(bot);
    const line = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, len, 4), lineMat);
    line.position.copy(top).add(bot).multiplyScalar(0.5);
    line.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), top.clone().sub(bot).normalize());
    chute.add(line);
  }
  const chuteMesh = mergeGroup(chute, { emissive: 0x2a2a2a, doubleSide: true });
  g.add(chuteMesh);
  g.userData.chute = chuteMesh;
  return g;
}

export function createDrop(K) {
  const { G, T, st, gates, spots, rnd } = K;
  let crate = null, beam = null;
  const E = { active: false, phase: 0, t: 0, x: 0, z: 0, s: 1 };   // phase 1 falling, 2 landed (pop), 3 gates up
  const spot = { x: 0, z: 0 };
  const P = new THREE.Vector3();
  const DUST = { color: 0xf1e3c2, count: 18, speed: 4.5, size: 0.2, life: 0.6, gravity: 5, up: 2.5 };

  function build() {
    if (crate) return;
    crate = makeCrate();
    crate.visible = false;
    G.scene.add(crate);
    addBlob(crate, 0.9);
    const geo = new THREE.CylinderGeometry(1.15, 1.15, 18, 20, 1, true).translate(0, 9, 0);
    beam = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: 0xffe680, transparent: true, opacity: 0.16, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending }));
    beam.visible = false;
    beam.renderOrder = 5;
    G.scene.add(beam);
  }

  // ---- prizes
  const cashGate = (u) => ({ kind: 'cash', amount: u, color: GREEN, title: '+$' + fmtMoney(u), sub: 'CASH NOW', icon: 'cash' });
  const mysteryGate = () => ({ kind: 'mystery', color: PURPLE, title: '?', sub: 'MYSTERY' });
  function rollOptions() {
    const u = K.nice(K.unit() * T.dropCash);
    const left = rnd() < 0.72 ? cashGate(u) : mysteryGate();
    const pool = [];
    if (!K.fever.on) pool.push({ w: 3, o: { kind: 'fever', color: ORANGE, title: 'x2', sub: 'FEVER NOW', icon: 'flame' } });
    pool.push({ w: 2, o: { kind: 'turbo', color: BLUE, title: 'TURBO', sub: `RUN FAST ${T.turboTime}s`, icon: 'bolt' } });
    if (K.hasCrew()) pool.push({ w: 2, o: { kind: 'crew', color: VIOLET, title: 'CREW', sub: `RUSH ${T.crewTime}s`, icon: 'bolt' } });
    pool.push({ w: 3, o: { kind: 'star', color: GOLD, title: '+1', sub: 'STAR', icon: 'star' } });
    if (left.kind === 'cash') pool.push({ w: 2, o: mysteryGate() });
    let total = 0;
    for (const p of pool) total += p.w;
    let r = rnd() * total, right = pool[0].o;
    for (const p of pool) { r -= p.w; if (r <= 0) { right = p.o; break; } }
    return rnd() < 0.5 ? [left, right] : [right, left];
  }

  function give(kind, o, from) {
    const u = K.unit();
    switch (kind) {
      case 'cash': K.pay(o.amount || K.nice(u), from); K.play('tip'); break;
      case 'fever': K.fever.start(); break;
      case 'turbo': K.boost('turbo', T.turboTime); K.toast('TURBO!'); K.play('whoosh'); break;
      case 'crew': K.boost('crew', T.crewTime); K.toast('CREW RUSH!'); K.play('whoosh'); break;
      case 'star': K.addStar(1, from.x, from.z); break;
      case 'mystery': {
        // always a prize; the luck perk raises the jackpot odds
        const r = rnd(), jack = 0.08 * K.totals.luck;
        if (r < jack) {
          st.count.jackpot++;
          K.pay(K.nice(u * T.jackpot), from, 'JACKPOT');
          K.toast('JACKPOT!');
          K.play('jackpot');
          if (G.fx) { P.set(from.x, 0.5, from.z); G.fx.confetti(P, 120); G.fx.shake(0.4, 0.4); }
        } else if (r < jack + 0.27) { K.pay(K.nice(u * 2), from, 'DOUBLE'); K.play('tip'); }
        else if (r < jack + 0.42) K.addStar(1, from.x, from.z);
        else if (r < jack + 0.56 && !K.fever.on) K.fever.start();
        else { K.pay(K.nice(u * 0.7), from); K.play('tip'); }
        break;
      }
    }
  }

  function done() {
    E.active = false; E.phase = 0;
    if (crate) crate.visible = false;
    if (beam) beam.visible = false;
  }

  function start() {
    if (E.active || gates.active) return false;
    E.s = K.gateScale();
    if (!spots.find(spot, rnd, { half: 2.9 * E.s, minD: 5 })) return false;
    build();
    E.active = true; E.phase = 1; E.t = 0; E.x = spot.x; E.z = spot.z;
    crate.position.set(E.x, FALL_FROM, E.z);
    crate.scale.setScalar(E.s);
    crate.rotation.set(0, rnd() * 6.28, 0);
    crate.userData.chute.scale.setScalar(1);
    crate.userData.chute.visible = true;
    crate.visible = true;
    beam.position.set(E.x, 0, E.z);
    beam.scale.set(E.s, 1, E.s);
    beam.material.opacity = 0.16;
    beam.visible = true;
    K.toast('LUCKY DROP!');
    K.tip('drop', 'Run through the gate with the prize you want', 6);
    K.play('thrillDrop');
    return true;
  }

  function update(dt) {
    if (!E.active) return;
    E.t += dt;
    if (E.phase === 1) {
      const u = Math.min(1, E.t / FALL_TIME);
      crate.position.y = FALL_FROM * (1 - u) * (1 - u * 0.25);
      crate.rotation.z = Math.sin(E.t * 3.2) * 0.14 * (1 - u);
      crate.rotation.x = Math.cos(E.t * 2.6) * 0.1 * (1 - u);
      if (u >= 1) {
        E.phase = 2; E.t = 0;
        crate.position.y = 0; crate.rotation.x = crate.rotation.z = 0;
        K.play('crate');
        if (G.fx) { P.set(E.x, 0.1, E.z); G.fx.burst(P, DUST); G.fx.ring(P, { color: 0xffffff, radius: 3, life: 0.45 }); G.fx.shake(0.12, 0.18); }
      }
    } else if (E.phase === 2) {
      // squash, the canopy folds away, then the crate bursts into the gates
      const u = E.t / 0.45;
      const chute = crate.userData.chute;
      chute.scale.setScalar(Math.max(0.001, 1 - u * 1.6));
      const sq = u < 0.35 ? 1 - 0.25 * (u / 0.35) : 0.75 + 0.5 * ((u - 0.35) / 0.65);
      crate.scale.set((2 - sq) * E.s, sq * E.s, (2 - sq) * E.s);
      if (u >= 1) {
        E.phase = 3; E.t = 0;
        crate.visible = false;
        if (G.fx) { P.set(E.x, 0.6, E.z); G.fx.confetti(P, 36); }
        gates.open({
          x: E.x, z: E.z, ttl: T.dropTtl, scale: E.s, options: rollOptions(),
          onPick(i, o) { give(o.kind, o, gates.at(i, spot)); E.t = 0; E.phase = 4; },
          onExpire() { E.t = 0; E.phase = 4; },
        });
      }
    } else if (E.phase === 3) {
      beam.material.opacity = 0.13 + 0.05 * Math.sin(E.t * 5);
    } else if (E.phase === 4) {
      beam.material.opacity = Math.max(0, 0.16 * (1 - E.t / 0.4));
      if (E.t > 0.6 && !gates.active) done();
    }
  }

  return { start, update, get active() { return E.active; } };
}
