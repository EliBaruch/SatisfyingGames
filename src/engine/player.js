// The player: movement, and a generic loop over the active stations' capabilities
// (harvest areas, pickup zones, drop zones, cash piles). No world-specific code here:
// everything the player can do comes from station capabilities (docs/ENGINE.md).
import * as THREE from 'three';
import { PLAYER, SHOP, fmtMoney } from './config.js';
import { makeCharacter, animateCharacter, LOOKS } from './chars.js';
import { createStack } from './stack.js';
import { flyToStack, flyToDrop, inZone } from './transfer.js';

const S2 = Math.SQRT1_2;
const ACCEL = 38;          // exp rate: ~95% of target speed in 0.08 s
const TURN = 18;           // rad/s
const MAX_BILLS_PER_GRAB = 25;

function angTo(a, b, maxStep) {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  if (d > maxStep) d = maxStep; else if (d < -maxStep) d = -maxStep;
  return a + d;
}

export function createPlayer(G) {
  const S = G.state;
  const P = { ...PLAYER, ...(G.world.player || {}) };
  const look = typeof P.look === 'string' ? (LOOKS[P.look] || LOOKS.player) : P.look;
  const group = makeCharacter(look);
  G.scene.add(group);
  const stations = G.stations.list;
  const bounds = G.world.bounds;

  const pos = new THREE.Vector3(S.player.x, 0, S.player.z);
  const vel = new THREE.Vector3();
  let yaw = Math.PI / 4;
  group.position.copy(pos);
  group.rotation.y = yaw;

  const stack = createStack(G, {
    parent: group,
    offset: { x: 0, y: 0.55, z: -0.42 },
    billboard: true,
    capacity: G.stats.capacity,
    perColumn: P.perColumn,
  });
  for (let i = 0; i < S.carried.length && i < stack.capacity; i++) stack.push(S.carried[i]);
  stack.onLand = () => { if (G.audio && G.audio.play) G.audio.play('stack'); };

  const player = {
    pos, vel, speed01: 0, group, stack, update,
    get carrying() { return stack.count + stack.incoming; },
    /** station whose drop zone the player stands in (null if none) */
    dropStation: null,
    /** station whose pickup zone the player stands in (null if none) */
    pickupStation: null,
    /** re-read G.stats (capacity); called by G.refresh after purchases */
    sync() { stack.setCapacity(G.stats.capacity); },
    /** current harvest/pickup animation action (null when idle) */
    action: null,
  };

  // temporaries / pre-built callbacks (no per-step allocation)
  const tmpA = new THREE.Vector3();
  const tmpB = new THREE.Vector3();
  const textPos = new THREE.Vector3();
  const chestFn = (o) => o.set(pos.x, 1.2, pos.z);
  const billOpts = { kind: 'cash', from: tmpA, to: chestFn, dur: 0.3, arc: 1.2, delay: 0, onDone: null };
  const dustOpts = { color: 0xf1e3c2, count: 2, speed: 1.1, size: 0.09, life: 0.38, gravity: 3, up: 1.1 };
  const fullTextOpts = { color: '#ff5a5a', size: 1.1, life: 0.8 };
  const cashTextOpts = { color: '#7dff8a', size: 1.15, life: 1.0 };
  const harvestCtx = { i: 0, sound: 'cut' };
  const onHarvest = (kind, x, z, ctx) => {
    flyToStack(G, stack, kind, x, 0.55, z, ctx.i * 0.02);
    ctx.i++;
    if (G.audio && G.audio.play) G.audio.play(ctx.sound);
  };

  let lastAction = -10, actionName = null;
  const T = { fullCooldown: 0.5, unloadT: 0.5, pickT: 0, dustT: 0.5, grabBillT: 0.5 };
  let unloadBatch = 1, lastDrop = null;
  // cash grab
  let grabSt = null, grabTotal = 0, grabSum = 0, grabBills = 0, grabBillEvery = 0.05;

  // ------------------------------------------------------------------ move
  function move(dt) {
    const inp = G.input || { x: 0, y: 0 };
    let ix = inp.x || 0, iy = inp.y || 0;
    let mag = Math.hypot(ix, iy);
    if (mag > 1) { ix /= mag; iy /= mag; mag = 1; }
    // screen -> world: right = (-1,0,1)/sqrt2, up = (1,0,1)/sqrt2
    const wx = (-ix + iy) * S2;
    const wz = (ix + iy) * S2;
    const sp = G.stats.speed;
    const k = 1 - Math.exp(-ACCEL * dt);
    vel.x += (wx * sp - vel.x) * k;
    vel.z += (wz * sp - vel.z) * k;
    if (mag < 0.01 && vel.x * vel.x + vel.z * vel.z < 0.0004) { vel.x = 0; vel.z = 0; }
    pos.x += vel.x * dt;
    pos.z += vel.z * dt;
    if (bounds) {
      if (pos.x < bounds.minX) pos.x = bounds.minX; else if (pos.x > bounds.maxX) pos.x = bounds.maxX;
      if (pos.z < bounds.minZ) pos.z = bounds.minZ; else if (pos.z > bounds.maxZ) pos.z = bounds.maxZ;
    }
    // push out of station blockers: boxes {x,z,hx,hz} and circles {x,z,r}
    const r = P.radius;
    for (let s = 0; s < stations.length; s++) {
      const st = stations[s];
      if (!st.active || !st.blockers) continue;
      const bl = st.blockers;
      for (let b = 0; b < bl.length; b++) {
        const o = bl[b];
        const dx = pos.x - o.x, dz = pos.z - o.z;
        if (o.r !== undefined) {
          const rr = o.r + r, d2 = dx * dx + dz * dz;
          if (d2 < rr * rr && d2 > 1e-8) {
            const d = Math.sqrt(d2);
            pos.x = o.x + (dx / d) * rr; pos.z = o.z + (dz / d) * rr;
            const vn = (vel.x * dx + vel.z * dz) / d;
            if (vn < 0) { vel.x -= vn * dx / d; vel.z -= vn * dz / d; }
          }
        } else {
          const hx = o.hx + r, hz = o.hz + r;
          const px = hx - Math.abs(dx), pz = hz - Math.abs(dz);
          if (px > 0 && pz > 0) {
            if (px < pz) { pos.x = o.x + (dx < 0 ? -hx : hx); vel.x = 0; } else { pos.z = o.z + (dz < 0 ? -hz : hz); vel.z = 0; }
          }
        }
      }
    }
    const spd = Math.hypot(vel.x, vel.z);
    player.speed01 = Math.min(1, spd / sp);
    if (mag > 0.05) yaw = angTo(yaw, Math.atan2(wx, wz), TURN * dt);
    group.position.copy(pos);
    group.rotation.y = yaw;
    return spd;
  }

  // --------------------------------------------------------------- harvest
  function harvest(dt) {
    const R = P.harvestRadius;
    let blockedByFull = false;
    for (let s = 0; s < stations.length; s++) {
      const st = stations[s];
      const h = st.harvest;
      if (!h || !st.active) continue;
      const b = h.bounds;
      if (pos.x < b.minX - R || pos.x > b.maxX + R || pos.z < b.minZ - R || pos.z > b.maxZ + R) continue;
      if (stack.room <= 0) {
        if (h.hasNear(pos.x, pos.z, R)) blockedByFull = true;
        continue;
      }
      harvestCtx.i = 0;
      harvestCtx.sound = st.def.sound || 'cut';
      const n = h.harvestAt(pos.x, pos.z, R, stack.room, onHarvest, harvestCtx);
      if (n > 0) {
        lastAction = G.time;
        actionName = h.action || 'swing';
        // vibrate is blocked (and logged as an error) before the first user gesture
        if (G.audio && G.audio.haptic && (!navigator.userActivation || navigator.userActivation.hasBeenActive)) G.audio.haptic(8);
      }
    }
    T.fullCooldown -= dt;
    if (blockedByFull && T.fullCooldown <= 0) {
      T.fullCooldown = 1.2;
      stack.topWorld(textPos);
      textPos.y += 0.3;
      if (G.fx && G.fx.popText) G.fx.popText(textPos, 'MAX', fullTextOpts);
      if (G.audio && G.audio.play) G.audio.play('full');
    }
  }

  // ------------------------------------------------------------------ drop
  function drop(dt) {
    let st = null;
    for (let s = 0; s < stations.length; s++) {
      const c = stations[s];
      if (!c.active || !c.drop) continue;
      if (inZone(c.drop.zone, pos.x, pos.z)) { st = c; break; }
    }
    player.dropStation = st;
    if (!st || stack.count === 0 || !stack.has(st.drop.accepts)) { lastDrop = null; T.unloadT = P.unloadInterval; return; }
    if (lastDrop !== st) {
      lastDrop = st;
      // a full stack empties in about P.unloadTime seconds
      unloadBatch = Math.max(1, Math.ceil(stack.countWhere(st.drop.accepts) * P.unloadInterval / P.unloadTime));
    }
    T.unloadT += dt;
    while (T.unloadT >= P.unloadInterval && stack.count > 0) {
      T.unloadT -= P.unloadInterval;
      for (let k = 0; k < unloadBatch; k++) {
        if (st.drop.room() <= 0) { T.unloadT = 0; return; }
        const kind = stack.popWhere(st.drop.accepts);
        if (kind === null) return;
        flyToDrop(G, stack, st, kind, k * 0.012);
      }
    }
  }

  // ---------------------------------------------------------------- pickup
  function pickup(dt) {
    let st = null;
    for (let s = 0; s < stations.length; s++) {
      const c = stations[s];
      if (!c.active || !c.pickup) continue;
      if (inZone(c.pickup.zone, pos.x, pos.z)) { st = c; break; }
    }
    player.pickupStation = st;
    if (!st || stack.room <= 0) { T.pickT = 0; return; }
    const pk = st.pickup;
    const every = pk.interval || P.pickupInterval;
    T.pickT += dt;
    let guard = 8;
    while (T.pickT >= every && stack.room > 0 && guard-- > 0) {
      T.pickT -= every;
      const kind = pk.take(null);
      if (kind === null || kind === undefined) { T.pickT = 0; break; }
      pk.from(tmpA);
      flyToStack(G, stack, kind, tmpA.x, tmpA.y, tmpA.z, 0);
      lastAction = G.time;
      actionName = pk.action || 'pickup';
    }
  }

  // ------------------------------------------------------------- cash grab
  function endGrab() {
    if (grabSt && grabSum > 0 && G.fx && G.fx.popText) {
      textPos.set(pos.x, 2.4, pos.z);
      G.fx.popText(textPos, '+$' + fmtMoney(grabSum), cashTextOpts);
    }
    grabSt = null; grabSum = 0; grabTotal = 0;
  }

  function collect(dt) {
    let near = null;
    for (let s = 0; s < stations.length; s++) {
      const st = stations[s];
      if (!st.active || !st.cash) continue;
      const c = st.cash;
      if (inZone(c.pile, pos.x, pos.z, 0.6) && (c.amount > 0 || grabSt === st)) { near = st; break; }
    }
    if (near !== grabSt) endGrab();
    if (!near) return;
    const c = near.cash;
    if (!grabSt) {
      if (c.amount <= 0) return;
      grabSt = near;
      grabTotal = c.amount;
      grabSum = 0;
      const bv = c.bundleValue ? c.bundleValue() : 10;
      grabBills = Math.min(MAX_BILLS_PER_GRAB, Math.max(3, Math.ceil(grabTotal / bv)));
      grabBillEvery = SHOP.collectTime / grabBills;
      T.grabBillT = grabBillEvery;
    }
    if (c.amount > 0) {
      const want = Math.max(1, Math.ceil(grabTotal * dt / SHOP.collectTime));
      const got = c.take(want);
      if (got > 0) { G.addMoney(got); grabSum += got; }
      T.grabBillT += dt;
      while (T.grabBillT >= grabBillEvery && grabBills > 0) {
        T.grabBillT -= grabBillEvery;
        grabBills--;
        if (c.top) c.top(tmpA); else tmpA.set(c.pile.x, 0.3, c.pile.z);
        billOpts.dur = 0.26 + Math.random() * 0.08;
        if (G.fx && G.fx.fly) G.fx.fly(billOpts);
        if (G.audio && G.audio.play) G.audio.play('cash');
      }
    } else {
      endGrab();
    }
  }

  // ---------------------------------------------------------------- update
  const anim = { moving: false, speed: 1, carrying: false, action: null };
  function update(dt) {
    const spd = move(dt);
    harvest(dt);
    drop(dt);
    pickup(dt);
    collect(dt);
    stack.update(dt, player.speed01);
    // feet dust
    if (player.speed01 > 0.55) {
      T.dustT -= dt;
      if (T.dustT <= 0) {
        T.dustT = 0.1 + Math.random() * 0.06;
        if (G.fx && G.fx.burst) {
          tmpB.set(pos.x - vel.x * 0.04, 0.02, pos.z - vel.z * 0.04);
          G.fx.burst(tmpB, dustOpts);
        }
      }
    }
    player.action = G.time - lastAction < 0.35 ? actionName : null;
    anim.moving = spd > 0.4;
    anim.speed = Math.max(0.6, spd / P.speed);
    anim.carrying = stack.count > 0;
    anim.action = player.action;
    animateCharacter(group, dt, anim);
  }

  return player;
}
