// Bloom Rush — the farmer: movement, cutting, selling, cash pickup.
import * as THREE from 'three';
import { FARMS, PLAYER, SHOP, SIZES, WORLD, FLOWERS, fmtMoney } from './config.js';
import { makeCharacter, animateCharacter, LOOKS } from './models.js';
import { createStack } from './stack.js';

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
  const group = makeCharacter(LOOKS.player);
  G.scene.add(group);

  const pos = new THREE.Vector3(S.player ? S.player.x : PLAYER.start.x, 0, S.player ? S.player.z : PLAYER.start.z);
  const vel = new THREE.Vector3();
  let yaw = Math.PI / 4;
  group.position.copy(pos);
  group.rotation.y = yaw;

  const stack = createStack(G, {
    parent: group,
    offset: { x: 0, y: 0.95, z: -0.42 },
    capacity: G.stats.capacity,
    perColumn: PLAYER.perColumn,
  });
  if (Array.isArray(S.carried)) {
    for (let i = 0; i < S.carried.length && i < stack.capacity; i++) stack.push(S.carried[i]);
  }

  const player = {
    pos, vel, speed01: 0, group, stack, update,
    get carrying() { return stack.count + stack.incoming; },
    /** farm index whose sell zone the player stands in, or -1 */
    sellFarm: -1,
  };

  // temporaries / pre-built callbacks (no per-step allocation)
  const tmpA = new THREE.Vector3();
  const tmpB = new THREE.Vector3();
  const textPos = new THREE.Vector3();
  const topFn = (o) => stack.topWorld(o);
  const chestFn = (o) => o.set(pos.x, 1.2, pos.z);
  const onLand = FLOWERS.map((_, t) => () => {
    stack.incoming = Math.max(0, stack.incoming - 1);
    stack.push(t);
    if (G.audio && G.audio.play) G.audio.play('stack');
  });
  const dropFns = FARMS.map((_, f) => (o) => G.shops.get(f).dropTarget(o));
  const depositFns = FARMS.map((_, f) => FLOWERS.map((__, t) => () => {
    const shop = G.shops && G.shops.get(f);
    if (shop) shop.deposit(t, 1);
    if (G.audio && G.audio.play) G.audio.play('drop', { volume: 0.8 });
  }));
  const flyOpts = { kind: 'bouquet', type: 0, from: tmpA, to: topFn, dur: 0.3, arc: 1.4, delay: 0, onDone: null };
  const billOpts = { kind: 'bill', from: tmpA, to: chestFn, dur: 0.3, arc: 1.2, delay: 0, onDone: null };
  const dustOpts = { color: 0xf1e3c2, count: 2, speed: 1.1, size: 0.09, life: 0.38, gravity: 3, up: 1.1 };
  const fullTextOpts = { color: '#ff5a5a', size: 1.1, life: 0.8 };
  const cashTextOpts = { color: '#7dff8a', size: 1.15, life: 1.0 };

  let lastCut = -10;
  const T = { fullCooldown: 0.5, unloadT: 0.5, dustT: 0.5, grabBillT: 0.5 };
  let unloadBatch = 1, wasSelling = false;
  // cash grab
  let grabFarm = -1, grabTotal = 0, grabSum = 0, grabBills = 0, grabBillEvery = 0.05;

  G.events.on('unlock', () => { stack.setCapacity(G.stats.capacity); });

  function move(dt) {
    const inp = G.input || { x: 0, y: 0 };
    let ix = inp.x || 0, iy = inp.y || 0;
    let mag = Math.hypot(ix, iy);
    if (mag > 1) { ix /= mag; iy /= mag; mag = 1; }
    // screen -> world: right = (-1,0,1)/√2, up = (1,0,1)/√2
    const wx = (-ix + iy) * S2;
    const wz = (ix + iy) * S2;
    const sp = G.stats.speed;
    const k = 1 - Math.exp(-ACCEL * dt);
    vel.x += (wx * sp - vel.x) * k;
    vel.z += (wz * sp - vel.z) * k;
    if (mag < 0.01 && vel.x * vel.x + vel.z * vel.z < 0.0004) { vel.x = 0; vel.z = 0; }
    pos.x += vel.x * dt;
    pos.z += vel.z * dt;
    const B = WORLD.bounds;
    if (pos.x < B.minX) pos.x = B.minX; else if (pos.x > B.maxX) pos.x = B.maxX;
    if (pos.z < B.minZ) pos.z = B.minZ; else if (pos.z > B.maxZ) pos.z = B.maxZ;
    // push out of counters
    const r = PLAYER.radius;
    const hx = SIZES.counter.depth / 2 + r, hz = SIZES.counter.len / 2 + r;
    for (let f = 0; f < FARMS.length; f++) {
      if (!G.stats.farms[f]) continue;
      const c = FARMS[f].counter;
      const dx = pos.x - c.x, dz = pos.z - c.z;
      const px = hx - Math.abs(dx), pz = hz - Math.abs(dz);
      if (px > 0 && pz > 0) {
        if (px < pz) { pos.x = c.x + (dx < 0 ? -hx : hx); vel.x = 0; } else { pos.z = c.z + (dz < 0 ? -hz : hz); vel.z = 0; }
      }
    }
    const spd = Math.hypot(vel.x, vel.z);
    player.speed01 = Math.min(1, spd / sp);
    if (mag > 0.05) yaw = angTo(yaw, Math.atan2(wx, wz), TURN * dt);
    group.position.copy(pos);
    group.rotation.y = yaw;
    return spd;
  }

  function cut(dt) {
    const fields = G.fields;
    if (!fields) return;
    const R = PLAYER.cutRadius;
    let inGrown = false;
    for (let f = 0; f < FARMS.length; f++) {
      const field = fields.get(f);
      if (!field || !field.active) continue;
      const b = field.bounds;
      if (pos.x < b.minX - R || pos.x > b.maxX + R || pos.z < b.minZ - R || pos.z > b.maxZ + R) continue;
      if (stack.room <= 0) {
        if (field.hasGrownNear ? field.hasGrownNear(pos.x, pos.z, R) : field.grownCount > 0) inGrown = true;
        continue;
      }
      const cuts = field.cutAt(pos.x, pos.z, R, stack.room);
      if (!cuts || !cuts.length) continue;
      lastCut = G.time;
      const fx = G.fx;
      for (let i = 0; i < cuts.length; i++) {
        const c = cuts[i];
        stack.incoming++;
        tmpA.set(c.x, 0.55, c.z);
        flyOpts.type = field.type;
        flyOpts.from = tmpA;
        flyOpts.to = topFn;
        flyOpts.dur = 0.25 + Math.random() * 0.1;
        flyOpts.arc = 1.3 + Math.random() * 0.3;
        flyOpts.delay = i * 0.02;
        flyOpts.onDone = onLand[field.type];
        if (fx && fx.fly) fx.fly(flyOpts); else onLand[field.type]();
        if (G.audio && G.audio.play) G.audio.play('cut');
      }
      if (G.audio) {
        // vibrate is blocked (and logged as an error) before the first user gesture
        if (G.audio.haptic && (!navigator.userActivation || navigator.userActivation.hasBeenActive)) G.audio.haptic(8);
      }
    }
    T.fullCooldown -= dt;
    if (inGrown && T.fullCooldown <= 0) {
      T.fullCooldown = 1.2;
      stack.topWorld(textPos);
      textPos.y += 0.3;
      if (G.fx && G.fx.popText) G.fx.popText(textPos, 'MAX', fullTextOpts);
      if (G.audio && G.audio.play) G.audio.play('full');
    }
  }

  function sell(dt) {
    player.sellFarm = -1;
    const shops = G.shops;
    if (!shops) return;
    let farmIn = -1;
    for (let f = 0; f < FARMS.length; f++) {
      if (!G.stats.farms[f]) continue;
      const z = FARMS[f].sellZone;
      const dx = pos.x - z.x, dz = pos.z - z.z;
      if (dx * dx + dz * dz <= z.r * z.r) { farmIn = f; break; }
    }
    player.sellFarm = farmIn;
    if (farmIn < 0 || stack.count === 0) { wasSelling = false; T.unloadT = PLAYER.unloadInterval; return; }
    const shop = shops.get(farmIn);
    if (!shop || !shop.active) return;
    if (!wasSelling) {
      wasSelling = true;
      unloadBatch = Math.max(1, Math.ceil(stack.count * PLAYER.unloadInterval / 1.3));
    }
    T.unloadT += dt;
    const fx = G.fx;
    while (T.unloadT >= PLAYER.unloadInterval && stack.count > 0) {
      T.unloadT -= PLAYER.unloadInterval;
      for (let k = 0; k < unloadBatch && stack.count > 0; k++) {
        const t = stack.pop();
        stack.topWorld(tmpA);
        if (fx && fx.fly) {
          flyOpts.type = t;
          flyOpts.from = tmpA;
          flyOpts.to = dropFns[farmIn];
          flyOpts.dur = 0.28 + Math.random() * 0.06;
          flyOpts.arc = 1.5;
          flyOpts.delay = k * 0.012;
          flyOpts.onDone = depositFns[farmIn][t];
          fx.fly(flyOpts);
        } else depositFns[farmIn][t]();
      }
    }
  }

  function endGrab() {
    if (grabFarm >= 0 && grabSum > 0 && G.fx && G.fx.popText) {
      textPos.set(pos.x, 2.4, pos.z);
      G.fx.popText(textPos, '+$' + fmtMoney(grabSum), cashTextOpts);
    }
    grabFarm = -1; grabSum = 0; grabTotal = 0;
  }

  function collect(dt) {
    const shops = G.shops;
    if (!shops) return;
    let near = -1;
    for (let f = 0; f < FARMS.length; f++) {
      if (!G.stats.farms[f]) continue;
      const shop = shops.get(f);
      if (!shop || !shop.active) continue;
      const p = FARMS[f].cashPile;
      const dx = pos.x - p.x, dz = pos.z - p.z;
      const rr = p.r + 0.6;
      if (dx * dx + dz * dz <= rr * rr && (shop.cash > 0 || grabFarm === f)) { near = f; break; }
    }
    if (near !== grabFarm) endGrab();
    if (near < 0) return;
    const shop = shops.get(near);
    if (grabFarm < 0) {
      if (shop.cash <= 0) return;
      grabFarm = near;
      grabTotal = shop.cash;
      grabSum = 0;
      const bv = shop.bundleValue ? shop.bundleValue() : 10;
      grabBills = Math.min(MAX_BILLS_PER_GRAB, Math.max(3, Math.ceil(grabTotal / bv)));
      grabBillEvery = SHOP.collectTime / grabBills;
      T.grabBillT = grabBillEvery;
    }
    if (shop.cash > 0) {
      const want = Math.max(1, Math.ceil(grabTotal * dt / SHOP.collectTime));
      const got = shop.takeCash(want);
      if (got > 0) { G.addMoney(got); grabSum += got; }
      T.grabBillT += dt;
      while (T.grabBillT >= grabBillEvery && grabBills > 0) {
        T.grabBillT -= grabBillEvery;
        grabBills--;
        if (shop.pileTop) shop.pileTop(tmpA); else tmpA.set(FARMS[near].cashPile.x, 0.3, FARMS[near].cashPile.z);
        billOpts.from = tmpA;
        billOpts.dur = 0.26 + Math.random() * 0.08;
        if (G.fx && G.fx.fly) G.fx.fly(billOpts);
        if (G.audio && G.audio.play) G.audio.play('cash');
      }
    } else {
      endGrab();
    }
  }

  function update(dt) {
    const spd = move(dt);
    cut(dt);
    sell(dt);
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
    const swinging = G.time - lastCut < 0.35;
    animateCharacter(group, dt, {
      moving: spd > 0.4,
      speed: Math.max(0.6, spd / PLAYER.speed),
      carrying: stack.count > 0,
      action: swinging ? 'swing' : null,
    });
  }

  return player;
}
