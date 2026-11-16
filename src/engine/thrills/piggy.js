// Piggy bank on the run: a golden pig appears and runs from the player. It drops coins while it
// is chased and tires as time goes on; catching it pays well and gives a star. If it gets away,
// nothing is lost.
import * as THREE from 'three';
import { addBlob } from '../chars.js';
import { mergeGroup } from './util.js';

const LIFE = 24;            // seconds before it escapes
const CATCH = 1.2;
const SCARE = 7.5;          // it runs when the player is this close
const TURN = 7;             // rad / s

function makePig() {
  const g = new THREE.Group();
  const gold = new THREE.MeshLambertMaterial({ color: 0xffc21a });
  const dark = new THREE.MeshLambertMaterial({ color: 0x4a2c00 });
  const pink = new THREE.MeshLambertMaterial({ color: 0xffe9a8 });
  const add = (geo, mat, x, y, z, sx = 1, sy = 1, sz = 1) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.scale.set(sx, sy, sz); m.castShadow = true; g.add(m); return m; };
  const ball = new THREE.SphereGeometry(0.5, 14, 10);
  add(ball, gold, 0, 0.62, 0, 1.15, 1.0, 1.4);                                   // body (faces +z)
  const snout = add(new THREE.CylinderGeometry(0.2, 0.22, 0.2, 12), pink, 0, 0.62, 0.74);
  snout.rotation.x = Math.PI / 2;
  add(ball, dark, -0.07, 0.64, 0.845, 0.07, 0.1, 0.03);
  add(ball, dark, 0.07, 0.64, 0.845, 0.07, 0.1, 0.03);
  add(ball, dark, -0.24, 0.84, 0.56, 0.1, 0.1, 0.06);                            // eyes
  add(ball, dark, 0.24, 0.84, 0.56, 0.1, 0.1, 0.06);
  const ear = new THREE.ConeGeometry(0.15, 0.26, 4);
  add(ear, gold, -0.3, 1.1, 0.34).rotation.z = 0.35;
  add(ear, gold, 0.3, 1.1, 0.34).rotation.z = -0.35;
  const leg = new THREE.CylinderGeometry(0.11, 0.1, 0.3, 8);
  add(leg, gold, -0.3, 0.15, 0.38); add(leg, gold, 0.3, 0.15, 0.38); add(leg, gold, -0.3, 0.15, -0.38); add(leg, gold, 0.3, 0.15, -0.38);
  add(new THREE.BoxGeometry(0.07, 0.03, 0.4), dark, 0, 1.125, 0);                // the coin slot
  const tail = add(new THREE.TorusGeometry(0.1, 0.035, 6, 10), gold, 0, 0.8, -0.72);
  tail.rotation.y = Math.PI / 2;
  // one draw call: the pig is on screen together with a busy farm
  const holder = new THREE.Group();
  holder.add(mergeGroup(g, { emissive: 0x4a2f00 }));
  return holder;
}

export function createPiggy(K) {
  const { G, T, spots, rnd } = K;
  let pig = null;
  const E = { active: false, state: 0, t: 0, x: 0, z: 0, h: 0, spd: 0, coinT: 0, hop: 0, endT: 0, oinkT: 0, wander: 0 };  // state 1 running, 2 caught, 3 gone
  const spot = { x: 0, z: 0 };
  const P = new THREE.Vector3();
  const SPARK = { colors: [0xffe14d, 0xffffff], count: 2, speed: 1.2, size: 0.11, life: 0.5, gravity: 2, up: 2 };
  const PUFF = { color: 0xffffff, count: 16, speed: 3.5, size: 0.2, life: 0.5, gravity: 2, up: 2 };
  const awayText = { color: '#ffffff', size: 0.6, life: 1.0, maxW: 0.5 };
  const OFFS = [0, 0.7, -0.7, 1.4, -1.4, 2.1, -2.1, Math.PI];

  const free = (x, z) => spots.inBounds(x, z, 1.0) && !spots.blocked(x, z, 0.65);

  function start() {
    if (E.active) return false;
    if (!spots.find(spot, rnd, { half: 0, minD: 5.5, sx: 3.6 })) return false;
    if (!pig) { pig = makePig(); pig.visible = false; G.scene.add(pig); addBlob(pig, 0.7); }
    E.active = true; E.state = 1; E.t = 0; E.x = spot.x; E.z = spot.z;
    E.h = rnd() * Math.PI * 2; E.spd = 0; E.coinT = 0.6; E.hop = 0; E.oinkT = 0.2; E.wander = 0;
    pig.position.set(E.x, 0, E.z);
    pig.rotation.y = E.h;
    pig.scale.setScalar(1);
    pig.visible = true;
    if (G.fx) { G.fx.popIn(pig, { dur: 0.45 }); P.set(E.x, 0.4, E.z); G.fx.burst(P, PUFF); G.fx.ring(P, { color: 0xffe14d, radius: 3, life: 0.5 }); }
    K.toast('CATCH THE PIGGY!');
    K.tip('pig', 'It drops coins while you chase it. Catch it for a jackpot!', 6);
    return true;
  }

  function leave(caught) {
    E.state = caught ? 2 : 3; E.endT = 0.35;
    if (G.fx) { P.set(E.x, 0.5, E.z); G.fx.burst(P, PUFF); }
  }

  function update(dt) {
    if (!E.active) return;
    if (E.state !== 1) {
      E.endT -= dt;
      pig.scale.setScalar(Math.max(0.001, E.endT / 0.35));
      if (E.endT <= 0) { pig.visible = false; E.active = false; E.state = 0; }
      return;
    }
    E.t += dt;
    const pl = G.player;
    if (!pl) return;
    const dx = E.x - pl.pos.x, dz = E.z - pl.pos.z;
    const d = Math.hypot(dx, dz);
    if (d < CATCH) {
      K.pay(K.nice(K.unit() * T.pigPay), { x: E.x, z: E.z }, 'GOTCHA');
      K.addStar(1, E.x, E.z);
      K.toast('GOTCHA!');
      K.play('jackpot');
      K.fever.work(0.12);
      if (G.fx) { P.set(E.x, 0.5, E.z); G.fx.confetti(P, 90); G.fx.shake(0.25, 0.3); }
      leave(true);
      return;
    }
    if (E.t >= LIFE) {
      if (G.fx) { P.set(E.x, 1.6, E.z); G.fx.popText(P, 'Got away!', awayText); }
      leave(false);
      return;
    }
    // where to: away from the player when scared, else a slow wander
    const scared = d < SCARE;
    let want;
    if (scared) want = Math.atan2(dx, dz) + Math.sin(E.t * 2.3) * 0.5;
    else { E.wander += (rnd() - 0.5) * dt * 3; want = E.h + E.wander * dt; }
    // the first free heading near the wanted one (walls, machines, the edge of the world)
    let head = want;
    for (let i = 0; i < OFFS.length; i++) {
      const a = want + OFFS[i];
      if (free(E.x + Math.sin(a) * 1.3, E.z + Math.cos(a) * 1.3)) { head = a; break; }
    }
    let dh = head - E.h;
    while (dh > Math.PI) dh -= Math.PI * 2;
    while (dh < -Math.PI) dh += Math.PI * 2;
    const step = TURN * dt;
    E.h += dh > step ? step : dh < -step ? -step : dh;
    // it tires: from nearly as fast as the player down to an easy catch
    const tired = Math.min(1, E.t / 15);
    const top = scared ? G.stats.speed * (0.9 - 0.34 * tired) : 1.6;
    E.spd += (top - E.spd) * Math.min(1, dt * 6);
    const nx = E.x + Math.sin(E.h) * E.spd * dt, nz = E.z + Math.cos(E.h) * E.spd * dt;
    if (free(nx, nz)) { E.x = nx; E.z = nz; } else E.spd = 0;
    E.hop += dt * (6 + E.spd * 1.6);
    const up = Math.abs(Math.sin(E.hop)) * Math.min(0.32, 0.08 + E.spd * 0.04);
    pig.position.set(E.x, up, E.z);
    pig.rotation.y = E.h;
    pig.rotation.x = Math.sin(E.hop * 2) * 0.08;
    // coins while it is chased
    if (scared && d < 5) {
      E.coinT -= dt;
      if (E.coinT <= 0) {
        E.coinT = 0.85;
        K.pay(Math.max(1, K.nice(K.unit() * 0.06)), { x: E.x, z: E.z }, '', true);
        K.play('tip');
      }
    }
    if (G.fx && E.spd > 2) { P.set(E.x, 0.2, E.z); G.fx.burst(P, SPARK); }
    E.oinkT -= dt;
    if (E.oinkT <= 0) { E.oinkT = 2.2 + rnd() * 1.5; K.play('oink'); }
  }

  return {
    start, update,
    get active() { return E.active; },
    /** where the pig is while it can be caught */
    position(out) { if (!E.active || E.state !== 1) return null; out.x = E.x; out.z = E.z; return out; },
  };
}
