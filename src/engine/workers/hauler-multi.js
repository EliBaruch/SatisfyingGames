// Hauler behaviour for list bindings: `from` and/or `to` given as arrays of station ids.
// Used by the 'hauler' role (hauler.js delegates here when either binding is a list; a
// single-station binding keeps the original behaviour exactly).
//
//   from: ['dock'] | ['nests-a', 'nests-b'] | ['silo']     harvest areas and/or pickup zones
//   to:   ['shelf-milk', 'shelf-bread', 'shelf-fruit']      drop zones
//
// Each trip: pick the source that has something a target with room accepts (most stock,
// nearest), collect only what the targets still have room for, then visit the target
// with the most room that accepts a carried item, unload, and repeat with the rest.
// Options (world.workers.hauler < effect.options): speed, capacity, harvestRadius,
// pickupInterval, unloadInterval, look, action, minRoom (a target counts as needy only
// with at least this much room, default 1: raise it for fuller, rarer trips).
import * as THREE from 'three';
import * as chars from '../chars.js';
import { createStack } from '../stack.js';
import { flyToStack, flyToDrop } from '../transfer.js';
import { turnToward, roleConfig, playAt, soundOpts, pt, num, r3, refill } from './common.js';

const TURN_RATE = 12;
const ARRIVE = 0.15;
const asList = (v) => (Array.isArray(v) ? v : v != null ? [v] : []);

export function createMultiHauler(G, hire, team, live) {
  const cfg = roleConfig(G, 'hauler', hire);
  const A = asList(hire.from).map((id) => G.stations.get(id)).filter((s) => s && (s.harvest || s.pickup));
  const B = asList(hire.to).map((id) => G.stations.get(id)).filter((s) => s && s.drop);
  if (!A.length || !B.length) { console.error(`[hauler] list binding needs harvest/pickup sources and drop targets: ${hire.from} -> ${hire.to}`); return null; }
  const e = hire.effect || {};
  const home = pt(e.home || A[0].home || A[0].pos);
  const minRoom = Math.max(1, cfg.minRoom || 1);
  const look = typeof cfg.look === 'string' ? (chars.LOOKS[cfg.look] || chars.LOOKS.cutter) : cfg.look;
  const group = chars.makeCharacter(look);
  const carry = group.userData.carry;   // rigs / vehicles that carry differently say where (chars.js)
  const stack = createStack(G, {
    parent: group, offset: carry ? carry.offset : { x: 0, y: 0.55, z: -0.42 }, billboard: carry ? !!carry.billboard : true,
    capacity: cfg.capacity, perColumn: (carry && carry.perColumn) || 40, columnGap: (carry && carry.columnGap) || 0, sway: !(carry && carry.sway === false),
    shadow: !(carry && carry.shadow === false),
  });
  const k = team.length - 1;
  const w = {
    group, stack, k,
    x: home.x + ((k % 3) - 1) * 0.9, z: home.z + ((k / 3) | 0) * 0.9,
    face: 0, dirX: 0, dirZ: 1, spd: 0,
    state: 'decide', wait: 0, tx: 0, tz: 0, stuck: 0, unloadT: 0, pickT: 0, idleT: 0,
    src: null, last: null, dst: null,
    delivered: 0, collected: 0,
    snd: soundOpts(),
    anim: { moving: false, speed: 1, carrying: false, action: null },
    update,
    /** save: carried items (incl. those still flying in) and where it stands */
    serialize() { return { items: stack.snapshot(), x: r3(w.x), z: r3(w.z), face: r3(w.face) }; },
    restore(d) {
      if (!d || typeof d !== 'object') return;
      w.x = num(d.x, w.x); w.z = num(d.z, w.z); w.face = num(d.face, w.face);
      refill(stack, d.items);
      w.state = 'decide'; w.src = null; w.dst = null; w.last = null;
      group.position.set(w.x, 0, w.z);
      group.rotation.y = w.face;
    },
  };
  group.position.set(w.x, 0, w.z);
  G.scene.add(group);
  if (live && G.fx && G.fx.popIn) G.fx.popIn(group);

  // ------------------------------------------------------------ wants
  function tripRoom(t) {
    const r = t.drop.room();
    if (r === Infinity) return Infinity;
    return r - stack.countWhere(t.drop.accepts) - stack.incoming;
  }
  /** some active target accepts `kind` and still has room for it (counting what we carry) */
  const wantTake = (kind) => {
    for (let i = 0; i < B.length; i++) {
      const t = B[i];
      if (t.active && t.drop.accepts(kind) && tripRoom(t) > 0) return true;
    }
    return false;
  };
  /** ... and has at least minRoom (worth starting a trip for) */
  const wantNeedy = (kind) => {
    for (let i = 0; i < B.length; i++) {
      const t = B[i];
      if (t.active && t.drop.accepts(kind) && tripRoom(t) >= minRoom) return true;
    }
    return false;
  };
  function harvestWant(kind) {
    let n = 0;
    for (let i = 0; i < B.length; i++) {
      const t = B[i];
      if (!t.active || !t.drop.accepts(kind)) continue;
      const r = tripRoom(t);
      if (r > 0) n += r;
    }
    return n;
  }
  const notWanted = (kind) => {
    for (let i = 0; i < B.length; i++) if (B[i].drop.accepts(kind)) return false;
    return true;
  };

  function pickSource(exclude) {
    let best = null, bs = -1;
    for (let i = 0; i < A.length; i++) {
      const s = A[i];
      if (!s.active || s === exclude) continue;
      let avail = 0;
      if (s.harvest) {
        if (s.harvest.available <= 0 || !wantNeedy(s.harvest.kind)) continue;
        avail = s.harvest.available;
      } else {
        const pk = s.pickup;
        if (!(pk.available > 0)) continue;
        if (pk.has ? !pk.has(wantNeedy) : false) continue;
        avail = Math.min(pk.available, 30);
      }
      const p = s.harvest ? s.pos : s.pickup.zone;
      const score = avail / (Math.hypot(p.x - w.x, p.z - w.z) + 4);
      if (score > bs) { bs = score; best = s; }
    }
    return best;
  }
  function pickTarget() {
    let best = null, br = -1, bd = Infinity;
    for (let i = 0; i < B.length; i++) {
      const t = B[i];
      if (!t.active || !stack.has(t.drop.accepts)) continue;
      const r = t.drop.room();
      if (r <= 0) continue;
      const z = t.drop.zone;
      const d = Math.hypot(z.x - w.x, z.z - w.z);
      if (r > br || (r === br && d < bd)) { br = r; bd = d; best = t; }
    }
    return best;
  }

  // ------------------------------------------------------------ movement
  function walk(tx, tz, dt) {
    const dx = tx - w.x, dz = tz - w.z;
    const d = Math.sqrt(dx * dx + dz * dz);
    if (d <= ARRIVE) { w.spd = 0; return d; }
    const inv = 1 / d;
    w.dirX = dx * inv; w.dirZ = dz * inv;
    w.face = turnToward(w.face, Math.atan2(dx, dz), TURN_RATE * dt);
    const step = Math.min(cfg.speed * (G.stats.workerSpeed || 1) * dt, d);
    w.x += w.dirX * step; w.z += w.dirZ * step;
    w.spd = step / dt;
    return d - step;
  }

  // harvest banding (same idea as the single hauler: one band per team member)
  const near = { x: 0, z: 0 }, best = { x: 0, z: 0 }, band = { lo: 0, hi: 0 };
  const near3 = new THREE.Vector3();
  function bandOf(H, out) {
    const b = H.bounds;
    const n = Math.max(1, team.length);
    const i = Math.max(0, Math.min(team.indexOf(w), n - 1));
    const span = b.maxZ - b.minZ;
    out.lo = b.minZ + (i / n) * span - 0.05;
    out.hi = b.minZ + ((i + 1) / n) * span + 0.05;
    return out;
  }
  function pickCell(H) {
    bandOf(H, band);
    const b = H.bounds;
    const bz = (band.lo + band.hi) * 0.5;
    const w4 = (b.maxX - b.minX) * 0.25;
    let found = false, bd = Infinity;
    // ahead first
    const sp = H.spacing || 1;
    if (H.nearest(w.x + w.dirX * sp, w.z + w.dirZ * sp, near) && near.z >= band.lo && near.z <= band.hi) {
      const dx = near.x - w.x, dz = near.z - w.z;
      if (dx * dx + dz * dz < sp * sp * 2.5) { w.tx = near.x; w.tz = near.z; w.stuck = 0; return true; }
    }
    for (let i = 0; i < 4; i++) {
      const sx = i === 0 ? Math.min(b.maxX, Math.max(b.minX, w.x)) : b.minX + w4 * i;
      if (!H.nearest(sx, bz, near)) continue;
      if (near.z < band.lo || near.z > band.hi) continue;
      const dx = near.x - w.x, dz = near.z - w.z, d = dx * dx + dz * dz;
      if (d < bd) { bd = d; best.x = near.x; best.z = near.z; found = true; }
    }
    if (!found && !H.nearest(w.x, w.z, best)) return false;
    w.tx = best.x; w.tz = best.z; w.stuck = 0;
    return true;
  }
  const onHarvest = (kind, x, z) => {
    flyToStack(G, stack, kind, x, 0.5, z, 0);
    w.collected++;
    playAt(G, 'cut', x, z, 0.35, w.snd);
  };

  // ------------------------------------------------------------ states
  function decide() {
    // carrying things nobody accepts any more: drop them
    while (stack.count > 0 && stack.has(notWanted)) stack.popWhere(notWanted);
    if (stack.count > 0) {
      if (stack.room > 0) {
        const s = pickSource(w.last);
        if (s) { startCollect(s); return; }
      }
      const t = pickTarget();
      if (t) { w.dst = t; w.state = 'deliver'; return; }
      w.state = 'wait'; w.wait = 0.5;
      return;
    }
    if (stack.incoming > 0) { w.state = 'wait'; w.wait = 0.1; return; }
    w.last = null;
    const s = pickSource(null);
    if (s) { startCollect(s); return; }
    w.state = 'wait'; w.wait = 0.5;
  }
  function startCollect(s) {
    w.src = s; w.state = 'collect'; w.pickT = 0; w.idleT = 0; w.stuck = 0;
    if (s.harvest && !pickCell(s.harvest)) { w.last = s; w.state = 'wait'; w.wait = 0.3; }
  }
  function endCollect() { w.last = w.src; w.src = null; w.state = 'decide'; }

  function collectHarvest(dt) {
    const H = w.src.harvest;
    if (!w.src.active || stack.room <= 0) { endCollect(); return null; }
    const want = harvestWant(H.kind);
    if (want <= 0) { endCollect(); return null; }
    const rem = walk(w.tx, w.tz, dt);
    H.harvestAt(w.x, w.z, cfg.harvestRadius, Math.min(stack.room, want), onHarvest, null);
    w.stuck += dt;
    const dx = w.tx - w.x, dz = w.tz - w.z, r = cfg.harvestRadius * 0.9;
    if (rem <= ARRIVE || dx * dx + dz * dz < r * r || w.stuck > 3) {
      if (stack.room <= 0 || H.available <= 0 || !pickCell(H)) endCollect();
    }
    return cfg.action || H.action || 'swing';
  }

  function collectPickup(dt) {
    const s = w.src, PK = s.pickup, z = PK.zone;
    if (!s.active || stack.room <= 0) { endCollect(); return null; }
    const ox = ((w.k % 3) - 1) * 0.6, oz = (((w.k / 3) | 0) % 2) * 0.6;
    const rem = walk(z.x + ox, z.z + oz, dt);
    if (rem > Math.max(ARRIVE, z.r * 0.6)) return null;
    w.spd = 0;
    w.pickT += dt;
    const every = cfg.pickupInterval;
    let took = false;
    while (w.pickT >= every && stack.room > 0) {
      w.pickT -= every;
      const kind = PK.take(wantTake);
      if (kind === null || kind === undefined) break;
      PK.from(near3);
      flyToStack(G, stack, kind, near3.x, near3.y, near3.z, 0);
      w.collected++;
      took = true;
    }
    if (w.pickT > every) w.pickT = every;
    if (took) w.idleT = 0; else w.idleT += dt;
    if (stack.room <= 0 || w.idleT > 0.4) endCollect();
    return took ? (PK.action || 'pickup') : null;
  }

  function deliver(dt) {
    const t = w.dst;
    if (!t.active) { w.state = 'decide'; return; }
    const spot = t.drop.workerSpot || t.drop.zone;
    const rem = walk(spot.x, spot.z + ((w.k % 3) - 1) * 0.7, dt);
    if (rem <= ARRIVE) { w.state = 'unload'; w.unloadT = cfg.unloadInterval; }
  }
  function unload(dt) {
    const t = w.dst;
    const face = t.drop.face || t.pos;
    w.face = turnToward(w.face, Math.atan2(face.x - w.x, face.z - w.z), TURN_RATE * dt);
    w.unloadT += dt;
    while (w.unloadT >= cfg.unloadInterval) {
      w.unloadT -= cfg.unloadInterval;
      if (!t.active || t.drop.room() <= 0) { w.state = 'decide'; return; }
      const kind = stack.popWhere(t.drop.accepts);
      if (kind === null) { w.state = 'decide'; return; }
      flyToDrop(G, stack, t, kind, 0);
      w.delivered++;
    }
  }

  function update(dt) {
    w.spd = 0;
    let action = null;
    if (w.state === 'decide') decide();
    switch (w.state) {
      case 'collect': action = w.src.harvest ? collectHarvest(dt) : collectPickup(dt); break;
      case 'deliver': deliver(dt); break;
      case 'unload': unload(dt); break;
      case 'wait':
        w.wait -= dt;
        if (w.wait <= 0) { w.last = null; w.state = 'decide'; }
        break;
    }
    const a = w.anim;
    a.moving = w.spd > 0.1;
    a.speed = 1;
    a.carrying = stack.count > 0 && w.state !== 'collect';
    a.action = action;
    group.position.set(w.x, 0, w.z);
    group.rotation.y = w.face;
    if (chars.lodCharacter) chars.lodCharacter(G, group);
    chars.animateCharacter(group, dt, a);
    stack.update(dt, Math.min(1, w.spd / cfg.speed));
  }

  return w;
}
