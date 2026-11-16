// Worker role 'hauler': takes items from station A (harvesting it if A has a harvest
// area, else taking from A's pickup zone), carries them on a stack, and gives them to
// station B's drop zone. Covers flower cutters, egg collectors, feeders, stockers...
//
// hire effect: { type: 'hire', role: 'hauler', from: 'roses', to: 'shop-roses',
//                home?: {x,z}, spot?: {x,z}, options?: { speed, capacity, look, ... } }
// Haulers harvesting the same station split it into bands (one per hauler) so they
// spread out instead of chasing the same plants.
import * as THREE from 'three';
import { registerWorkerRole } from '../registry.js';
import { makeCharacter, animateCharacter, lodCharacter, LOOKS } from '../chars.js';
import { createStack } from '../stack.js';
import { flyToStack, flyToDrop } from '../transfer.js';
import { turnToward, roleConfig, playAt, soundOpts, pt, num, r3, refill } from './common.js';
import { createMultiHauler } from './hauler-multi.js';

const TURN_RATE = 12;            // rad/s
const ARRIVE = 0.15;

function createHauler(G, hire, team, live) {
  // list bindings (from and/or to are arrays): multi-source / multi-target behaviour
  if (Array.isArray(hire.from) || Array.isArray(hire.to)) return createMultiHauler(G, hire, team, live);
  const cfg = roleConfig(G, 'hauler', hire);
  const A = G.stations.get(hire.from);
  const B = G.stations.get(hire.to);
  if (!A || !B || !B.drop) { console.error(`[hauler] needs from (harvest/pickup) and to (drop) stations: ${hire.from} -> ${hire.to}`); return null; }
  const H = A.harvest || null;
  const PK = H ? null : A.pickup || null;
  if (!H && !PK) { console.error(`[hauler] station '${hire.from}' has neither a harvest area nor a pickup zone`); return null; }
  const e = hire.effect || {};
  const home = pt(e.home || A.home || A.pos);
  const spot = pt(e.spot || B.drop.workerSpot || B.drop.zone);
  const face = B.drop.face || B.pos;
  const accepts = B.drop.accepts;

  const look = typeof cfg.look === 'string' ? (LOOKS[cfg.look] || LOOKS.cutter) : cfg.look;
  const group = makeCharacter(look);
  const stack = createStack(G, {
    parent: group, offset: { x: 0, y: 0.55, z: -0.42 }, billboard: true,
    capacity: cfg.capacity, perColumn: 40,
  });
  const k = team.length - 1;
  const w = {
    group, stack, k,
    x: home.x + ((k % 3) - 1) * 0.9,
    z: home.z + ((k / 3) | 0) * 0.9,
    face: 0, dirX: 0, dirZ: 1, spd: 0,
    state: 'seek', wait: 0, tx: 0, tz: 0, stuck: 0, unloadT: 0, pickT: 0, idleT: 0,
    snd: soundOpts(),
    anim: { moving: false, speed: 1, carrying: false, action: null },
    update,
    /** save: carried items (incl. those still flying in) and where it stands */
    serialize() { return { items: stack.snapshot(), x: r3(w.x), z: r3(w.z), face: r3(w.face) }; },
    restore(d) {
      if (!d || typeof d !== 'object') return;
      w.x = num(d.x, w.x); w.z = num(d.z, w.z); w.face = num(d.face, w.face);
      refill(stack, d.items);
      w.state = stack.count > 0 ? 'deliver' : 'seek'; w.wait = 0;
      group.position.set(w.x, 0, w.z);
      group.rotation.y = w.face;
    },
  };
  // initially face the bed / source
  w.face = Math.atan2(A.pos.x - w.x, A.pos.z - w.z);
  group.position.set(w.x, 0, w.z);
  group.rotation.y = w.face;
  G.scene.add(group);
  if (live && G.fx && G.fx.popIn) G.fx.popIn(group);

  const near = { x: 0, z: 0 };
  const near3 = new THREE.Vector3();
  const band = { lo: 0, hi: 0 };
  const harvestCtx = { w };
  const onHarvest = (kind, x, z) => {
    flyToStack(G, stack, kind, x, 0.5, z, 0);
    playAt(G, 'cut', x, z, 0.35, w.snd);
  };

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
  function setTarget(c) { w.tx = c.x; w.tz = c.z; w.stuck = 0; }

  // this hauler's horizontal band of the harvest area
  function bandOf(out) {
    const b = H.bounds;
    const n = Math.max(1, team.length);
    const i = Math.min(team.indexOf(w), n - 1);
    const span = b.maxZ - b.minZ;
    out.lo = b.minZ + (i / n) * span - 0.05;
    out.hi = b.minZ + ((i + 1) / n) * span + 0.05;
    return out;
  }
  const best = { x: 0, z: 0 };
  function pickBand() {
    const b = H.bounds;
    bandOf(band);
    const bz = (band.lo + band.hi) * 0.5;
    const w4 = (b.maxX - b.minX) * 0.25;
    let found = false, bestD = Infinity;
    for (let i = 0; i < 4; i++) {
      const sx = i === 0 ? Math.min(b.maxX, Math.max(b.minX, w.x)) : b.minX + w4 * i;
      if (!H.nearest(sx, bz, near)) continue;
      if (near.z < band.lo || near.z > band.hi) continue;
      const dx = near.x - w.x, dz = near.z - w.z;
      const d = dx * dx + dz * dz;
      if (d < bestD) { bestD = d; best.x = near.x; best.z = near.z; found = true; }
    }
    if (!found) {
      if (!H.nearest(w.x, w.z, best)) return false;
    }
    setTarget(best);
    return true;
  }
  function pickAhead() {
    const sp = H.spacing || 1;
    const ax = w.x + w.dirX * sp, az = w.z + w.dirZ * sp;
    if (H.nearest(ax, az, near)) {
      const dx = near.x - ax, dz = near.z - az;
      if (dx * dx + dz * dz < sp * sp * 1.7) { setTarget(near); return true; }
    }
    return pickBand();
  }

  // ------------------------------------------------------------- harvest mode
  function updateHarvest(dt) {
    let action = null;
    if (w.state === 'seek') {
      if (w.wait > 0) {
        w.wait -= dt;
        // idle at the edge of the area on the drop side, within own band
        const b = H.bounds;
        bandOf(band);
        walk(spot.x > (b.minX + b.maxX) / 2 ? b.maxX + 1.0 : b.minX - 1.0, (band.lo + band.hi) * 0.5, dt);
      } else if (stack.room <= 0) {
        w.state = 'deliver';
      } else if (A.active && pickBand()) {
        w.state = 'work';
      } else if (stack.count + stack.incoming > 0) {
        w.state = 'deliver';
      } else {
        w.wait = 0.3;
      }
    }
    if (w.state === 'work') {
      const rem = walk(w.tx, w.tz, dt);
      action = cfg.action || H.action || 'swing';
      if (stack.room > 0) H.harvestAt(w.x, w.z, cfg.harvestRadius, stack.room, onHarvest, harvestCtx);
      if (stack.room <= 0) {
        w.state = 'deliver';
      } else {
        w.stuck += dt;
        const dx = w.tx - w.x, dz = w.tz - w.z;
        const r = cfg.harvestRadius * 0.9;
        if (rem <= ARRIVE || dx * dx + dz * dz < r * r || w.stuck > 3) {
          if (!(A.active && pickAhead())) {
            w.state = stack.count + stack.incoming > 0 ? 'deliver' : 'seek';
            w.wait = w.state === 'seek' ? 0.3 : 0;
          }
        }
      }
    }
    return action;
  }

  // -------------------------------------------------------------- pickup mode
  function updatePickup(dt) {
    let action = null;
    if (w.state === 'seek') w.state = 'work';
    if (w.state === 'work') {
      const z = PK.zone;
      const ox = ((w.k % 3) - 1) * 0.6, oz = (((w.k / 3) | 0) % 2) * 0.6;
      const rem = walk(z.x + ox, z.z + oz, dt);
      if (rem <= Math.max(ARRIVE, z.r * 0.6)) {
        w.spd = 0;
        w.pickT += dt;
        const every = cfg.pickupInterval;
        let took = false;
        while (w.pickT >= every && stack.room > 0) {
          w.pickT -= every;
          const kind = PK.take(accepts);
          if (kind === null || kind === undefined) break;
          PK.from(near3);
          flyToStack(G, stack, kind, near3.x, near3.y, near3.z, 0);
          took = true;
        }
        if (took) { w.idleT = 0; action = PK.action || 'pickup'; } else w.idleT += dt;
        if (stack.room <= 0 || (stack.count > 0 && w.idleT > 1.0)) { w.state = 'deliver'; w.idleT = 0; }
        if (w.pickT > every) w.pickT = every;
      }
    }
    return action;
  }

  // ---------------------------------------------------------------- delivery
  function updateDeliver(dt) {
    if (w.state === 'deliver') {
      // fan the haulers out a little so they do not stand inside each other
      const rem = walk(spot.x, spot.z + ((w.k % 3) - 1) * 0.8, dt);
      if (rem <= ARRIVE) { w.state = 'unload'; w.unloadT = cfg.unloadInterval; }
    }
    if (w.state === 'unload') {
      w.face = turnToward(w.face, Math.atan2(face.x - w.x, face.z - w.z), TURN_RATE * dt);
      w.unloadT += dt;
      while (w.unloadT >= cfg.unloadInterval && stack.count > 0) {
        w.unloadT -= cfg.unloadInterval;
        if (!B.active || B.drop.room() <= 0) { w.unloadT = 0; break; }
        const kind = stack.popWhere(accepts);
        if (kind === null) { stack.pop(); continue; }   // B no longer wants it: drop it
        flyToDrop(G, stack, B, kind, 0);
      }
      if (stack.count === 0 && stack.incoming === 0) { w.state = 'seek'; w.wait = 0; }
    }
  }

  function update(dt) {
    w.spd = 0;
    let action = null;
    if (w.state === 'seek' || w.state === 'work') action = H ? updateHarvest(dt) : updatePickup(dt);
    if (w.state === 'deliver' || w.state === 'unload') updateDeliver(dt);
    const a = w.anim;
    a.moving = w.spd > 0.1;
    a.speed = 1;
    a.carrying = w.state === 'deliver' || w.state === 'unload';
    a.action = action;
    group.position.set(w.x, 0, w.z);
    lodCharacter(G, group);
    animateCharacter(group, dt, a);
    group.rotation.y = w.face;
    stack.update(dt, Math.min(1, w.spd / cfg.speed));
  }

  return w;
}

registerWorkerRole('hauler', {
  create: createHauler,
  toast: 'WORKER HIRED!',
});
