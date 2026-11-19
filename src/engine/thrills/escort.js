// VIP escort: someone special turns up a little way off and waves. Touch them and they follow;
// lead them to the marked spot (by default the nearest cash desk) before the clock runs out for a
// big tip and a star. Ignored, they simply walk off.
//
// A world may re-dress it: world.thrills.escort = { tag: 'HELP!', toast: 'A SURVIVOR NEEDS YOU!',
// tip: '...', to: 'stationId', done: 'SAVED!' } (the frost camp leads a freezing survivor to the fire).
import * as THREE from 'three';
import { makeCharacter, animateCharacter, randomCustomerLook } from '../chars.js';
import { canvasTex } from '../decals.js';

const TTL = 45;            // seconds in all
const REACH = 1.7;         // the player this close picks the VIP up
const ARRIVE = 2.4;        // the VIP this close to the spot has arrived
const FOLLOW = 1.5;        // how far behind the player the VIP walks

export function createEscort(K) {
  const { G, T, spots, rnd } = K;
  const cfg = (G.world.thrills && G.world.thrills.escort) || {};
  let char = null, tag = null, ring = null, flag = null;
  const E = { active: false, state: 0, t: 0, x: 0, z: 0, yaw: 0, tx: 0, tz: 0, stuck: 0, endT: 0 };  // state 1 waiting, 2 following, 3 leaving
  const anim = { moving: false, speed: 1, carrying: false, action: null };
  const spot = { x: 0, z: 0 };
  const P = new THREE.Vector3();
  const PUFF = { color: 0xffffff, count: 14, speed: 3, size: 0.18, life: 0.5, gravity: 2, up: 2 };

  function build() {
    if (char) return;
    char = makeCharacter(randomCustomerLook());
    char.visible = false;
    G.scene.add(char);
    // a tag floating over the head ("VIP")
    const text = String(cfg.tag || 'VIP');
    const tex = canvasTex(256, 112, (ctx) => {
      ctx.fillStyle = '#ffd23f';
      ctx.strokeStyle = '#7a5200';
      ctx.lineWidth = 8;
      ctx.beginPath();
      const x = 10, y = 8, w = 236, h = 76, r = 34;
      ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
      ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(108, 84); ctx.lineTo(128, 108); ctx.lineTo(148, 84); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#5a3200';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      let size = 54;
      ctx.font = `700 ${size}px "Fredoka", "Arial Rounded MT Bold", system-ui, sans-serif`;
      while (size > 22 && ctx.measureText(text).width > 200) { size -= 2; ctx.font = `700 ${size}px "Fredoka", "Arial Rounded MT Bold", system-ui, sans-serif`; }
      ctx.fillText(text, 128, 48);
    });
    tag = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false, depthWrite: false }));
    tag.scale.set(1.9, 0.83, 1);
    tag.renderOrder = 900;
    tag.visible = false;
    G.scene.add(tag);
    // where to bring them: a pulsing ring and a pennant
    ring = new THREE.Mesh(new THREE.RingGeometry(1.5, 1.9, 40).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xffd23f, transparent: true, opacity: 0.85, depthWrite: false }));
    ring.renderOrder = 3;
    ring.visible = false;
    flag = new THREE.Group();
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 2.6, 6).translate(0, 1.3, 0), new THREE.MeshLambertMaterial({ color: 0xffffff }));
    const pennant = new THREE.Mesh(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 2.6, 0), new THREE.Vector3(0, 1.9, 0), new THREE.Vector3(0.95, 2.25, 0)]), new THREE.MeshBasicMaterial({ color: 0xffd23f, side: THREE.DoubleSide }));
    flag.add(pole, pennant);
    flag.rotation.y = -Math.PI * 0.75;
    flag.visible = false;
    G.scene.add(ring, flag);
  }

  /** where the VIP wants to go: the configured station, else the cash desk nearest the player */
  function destination(out) {
    const l = G.stations.list, pl = G.player.pos;
    if (cfg.to) {
      const s = G.stations.get(cfg.to);
      if (s && s.active) { const z = s.drop ? s.drop.zone : s.pos; out.x = z.x; out.z = z.z; return true; }
    }
    let best = null, bd = Infinity;
    for (let i = 0; i < l.length; i++) {
      const s = l[i];
      if (!s.active || !s.cash) continue;
      const d = Math.hypot(s.cash.pile.x - pl.x, s.cash.pile.z - pl.z);
      if (d < bd) { bd = d; best = s; }
    }
    if (!best) return false;
    out.x = best.cash.pile.x; out.z = best.cash.pile.z;
    return true;
  }

  function start() {
    if (E.active || !G.player) return false;
    if (!destination(spot)) return false;
    const tx = spot.x, tz = spot.z;
    // the VIP appears in view, but not next to where they want to go
    let ok = false;
    for (let i = 0; i < 14 && !ok; i++) ok = spots.find(spot, rnd, { half: 0, minD: 5, sx: 3.6, syMin: -8 }) && Math.hypot(spot.x - tx, spot.z - tz) > 5.5;
    if (!ok) return false;
    build();
    E.active = true; E.state = 1; E.t = 0; E.x = spot.x; E.z = spot.z; E.tx = tx; E.tz = tz; E.stuck = 0;
    E.yaw = Math.atan2(G.player.pos.x - E.x, G.player.pos.z - E.z);
    char.position.set(E.x, 0, E.z);
    char.rotation.y = E.yaw;
    char.scale.setScalar(1);
    char.visible = true; tag.visible = true;
    ring.position.set(tx, 0.07, tz); ring.visible = true;
    flag.position.set(tx, 0, tz); flag.visible = true;
    if (G.fx) { G.fx.popIn(char, { dur: 0.45 }); P.set(E.x, 0.5, E.z); G.fx.burst(P, PUFF); G.fx.ring(P, { color: 0xffd23f, radius: 3, life: 0.5 }); }
    K.toast(cfg.toast || 'A VIP IS HERE!');
    K.tip('escort', cfg.tip || 'Touch the VIP, then lead them to the flag for a big tip', 6);
    K.play('order');
    return true;
  }

  function leave() {
    E.state = 3; E.endT = 0.4;
    tag.visible = false; ring.visible = false; flag.visible = false;
    if (G.fx) { P.set(E.x, 0.6, E.z); G.fx.burst(P, PUFF); }
  }

  function update(dt) {
    if (!E.active) return;
    if (E.state === 3) {
      E.endT -= dt;
      char.scale.setScalar(Math.max(0.001, E.endT / 0.4));
      if (E.endT <= 0) { char.visible = false; E.active = false; E.state = 0; }
      return;
    }
    E.t += dt;
    const pl = G.player;
    const k = (E.t * 1.3) % 1;
    ring.scale.setScalar(0.8 + k * 0.5);
    ring.material.opacity = 0.85 * (1 - k);
    anim.moving = false; anim.action = null;
    if (E.state === 1) {
      // waiting: waves, turns to the player
      E.yaw = Math.atan2(pl.pos.x - E.x, pl.pos.z - E.z);
      anim.action = 'wave';
      if (Math.hypot(pl.pos.x - E.x, pl.pos.z - E.z) < REACH) {
        E.state = 2;
        K.play('star');
        if (G.fx) { P.set(E.x, 0.2, E.z); G.fx.ring(P, { color: 0x7dff8a, radius: 2.4, life: 0.4 }); }
      }
    } else {
      // following: walks to a point behind the player; if a wall gets in the way for long, catches up at once
      const dx = pl.pos.x - E.x, dz = pl.pos.z - E.z, d = Math.hypot(dx, dz);
      if (d > FOLLOW) {
        const sp = Math.min(G.stats.speed * 1.05, (d - FOLLOW) * 6);
        const nx = E.x + (dx / d) * sp * dt, nz = E.z + (dz / d) * sp * dt;
        if (!spots.blocked(nx, nz, 0.4)) { E.x = nx; E.z = nz; E.stuck = 0; } else E.stuck += dt;
        E.yaw = Math.atan2(dx, dz);
        anim.moving = sp > 0.5;
        anim.speed = Math.max(0.6, sp / 6.5);
      }
      if (d > 9 || E.stuck > 1.2) {
        E.x = pl.pos.x - Math.sin(E.yaw) * 1.2; E.z = pl.pos.z - Math.cos(E.yaw) * 1.2; E.stuck = 0;
        if (G.fx) { P.set(E.x, 0.6, E.z); G.fx.burst(P, PUFF); }
      }
      if (Math.hypot(E.tx - E.x, E.tz - E.z) < ARRIVE) {
        K.pay(K.nice(K.unit() * 1.6), { x: E.x, z: E.z }, cfg.done || 'VIP TIP');
        K.addStar(1, E.x, E.z);
        K.won('escort');
        K.toast(cfg.done || 'VIP SERVED!');
        K.play('orderDone');
        K.fever.work(0.1);
        if (G.fx) { P.set(E.x, 0.5, E.z); G.fx.confetti(P, 80); }
        leave();
        return;
      }
    }
    if (E.t >= TTL) { leave(); return; }
    char.position.set(E.x, 0, E.z);
    char.rotation.y = E.yaw;
    animateCharacter(char, dt, anim);
    tag.position.set(E.x, 2.75 + Math.sin(E.t * 4) * 0.08, E.z);
    // the last seconds: the tag blinks
    tag.material.opacity = TTL - E.t < 6 ? 0.55 + 0.45 * Math.sin(E.t * 12) : 1;
  }

  return {
    start, update,
    get active() { return E.active; },
    /** where the player should go next: the VIP, then the flag */
    position(out) {
      if (!E.active || E.state === 3) return null;
      if (E.state === 1) { out.x = E.x; out.z = E.z; } else { out.x = E.tx; out.z = E.tz; }
      return out;
    },
  };
}
